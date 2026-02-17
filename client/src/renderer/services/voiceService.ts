import { Device } from 'mediasoup-client';
import type { Transport, Producer, Consumer } from 'mediasoup-client/lib/types';
import { socketService } from './socketService';
import { useAudioSettingsStore } from '../stores/audioSettingsStore';
import type { ProducerMediaType } from '../../../../shared/types';
import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseWasmSimdPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

export type ScreenShareQuality = 'sd' | 'hd';

class VoiceService {
  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;
  private producers = new Map<string, Producer>(); // mediaType -> Producer
  private consumers = new Map<string, Consumer>(); // producerId -> Consumer
  private consumerMediaTypes = new Map<string, ProducerMediaType>(); // producerId -> mediaType
  private localStream: MediaStream | null = null;
  private localVideoStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private speakingInterval: ReturnType<typeof setInterval> | null = null;

  // RNNoise state
  private rnnoiseNode: RnnoiseWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private rnnoiseReady = false;
  private static rnnoiseWasmBinary: ArrayBuffer | null = null;

  // Audio element storage (prevents garbage collection)
  // keyed by "userId" for mic audio or "userId:screen-audio" for screen audio
  private audioElements = new Map<string, HTMLAudioElement>();

  // Mute/deafen state
  private _isMuted = false;
  private _isDeafened = false;
  private _wasMutedBeforeDeafen = false;

  private onSpeakingChange: ((userId: string, speaking: boolean) => void) | null = null;
  private onRemoteStream: ((userId: string, stream: MediaStream, mediaType: ProducerMediaType) => void) | null = null;
  private onRemoteStreamRemoved: ((userId: string, mediaType: ProducerMediaType) => void) | null = null;
  private onRemoteVideoStream: ((userId: string, stream: MediaStream, mediaType: ProducerMediaType) => void) | null = null;
  private onRemoteVideoStreamRemoved: ((userId: string, mediaType: ProducerMediaType) => void) | null = null;
  private onScreenShareStopped: (() => void) | null = null;

  // Store handler references for proper cleanup
  private socketHandlers: { event: string; handler: (...args: any[]) => void }[] = [];

  setCallbacks(callbacks: {
    onSpeakingChange?: (userId: string, speaking: boolean) => void;
    onRemoteStream?: (userId: string, stream: MediaStream, mediaType: ProducerMediaType) => void;
    onRemoteStreamRemoved?: (userId: string, mediaType: ProducerMediaType) => void;
    onRemoteVideoStream?: (userId: string, stream: MediaStream, mediaType: ProducerMediaType) => void;
    onRemoteVideoStreamRemoved?: (userId: string, mediaType: ProducerMediaType) => void;
    onScreenShareStopped?: () => void;
  }) {
    this.onSpeakingChange = callbacks.onSpeakingChange || null;
    this.onRemoteStream = callbacks.onRemoteStream || null;
    this.onRemoteStreamRemoved = callbacks.onRemoteStreamRemoved || null;
    this.onRemoteVideoStream = callbacks.onRemoteVideoStream || null;
    this.onRemoteVideoStreamRemoved = callbacks.onRemoteVideoStreamRemoved || null;
    this.onScreenShareStopped = callbacks.onScreenShareStopped || null;
  }

  async join(channelId: string): Promise<void> {
    console.log('[VOICE] join() called, channelId:', channelId);
    // Clean up any stale state from previous session
    await this.leave();

    const socket = socketService.getSocket();
    console.log('[VOICE] Socket connected:', socket?.connected, 'socketId:', socket?.id);
    if (!socket?.connected) throw new Error('Socket not connected');

    // Reset mute/deafen state
    this._isMuted = false;
    this._isDeafened = false;
    this._wasMutedBeforeDeafen = false;

    // 1. Join voice channel and get router RTP capabilities + existing producers
    console.log('[VOICE] Step 1: Emitting voice:join...');
    const joinResult = await this.emitWithTimeout<{ rtpCapabilities: any; existingProducers?: { producerId: string; userId: string; mediaType: ProducerMediaType }[] }>(
      socket, 'voice:join', { channelId },
    );
    if (joinResult.error) {
      console.error('[VOICE] voice:join returned error:', joinResult.error);
      throw new Error(joinResult.error);
    }
    console.log('[VOICE] Step 1 done: Got RTP capabilities, existingProducers:', joinResult.existingProducers?.length ?? 0);

    // 2. Create and load Device
    console.log('[VOICE] Step 2: Creating mediasoup Device...');
    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: joinResult.rtpCapabilities });
    console.log('[VOICE] Step 2 done: Device loaded, canProduce audio:', this.device.canProduce('audio'), 'video:', this.device.canProduce('video'));

    // 3. Create send transport
    console.log('[VOICE] Step 3: Creating send transport...');
    await this.createSendTransport(socket);
    console.log('[VOICE] Step 3 done: Send transport created, id:', this.sendTransport?.id);

    // 4. Create recv transport
    console.log('[VOICE] Step 4: Creating recv transport...');
    await this.createRecvTransport(socket);
    console.log('[VOICE] Step 4 done: Recv transport created, id:', this.recvTransport?.id);

    // 5. Get mic and produce
    console.log('[VOICE] Step 5: Producing mic...');
    await this.produceMic();
    console.log('[VOICE] Step 5 done: Mic produced, producer id:', this.producers.get('audio')?.id);

    // 6. Listen for new producers from others
    this.registerSocketHandler(socket, 'voice:new-producer', async (data: { producerId: string; userId: string; mediaType: ProducerMediaType }) => {
      console.log('[VOICE] Received voice:new-producer:', data);
      await this.consumeProducer(data.producerId, data.userId, data.mediaType);
    });

    // 7. Listen for producer closed events
    this.registerSocketHandler(socket, 'voice:producer-closed', (data: { producerId: string; userId: string; mediaType: ProducerMediaType }) => {
      console.log('[VOICE] Received voice:producer-closed:', data);
      // Close the consumer for this producer
      const consumer = this.consumers.get(data.producerId);
      if (consumer) {
        consumer.close();
        this.consumers.delete(data.producerId);
        this.consumerMediaTypes.delete(data.producerId);
      }

      if (data.mediaType === 'audio' || data.mediaType === 'screen-audio') {
        this.removeRemoteStream(data.userId, data.mediaType);
        this.onRemoteStreamRemoved?.(data.userId, data.mediaType);
      } else {
        this.onRemoteVideoStreamRemoved?.(data.userId, data.mediaType);
      }
    });

    // 8. Listen for users leaving
    this.registerSocketHandler(socket, 'voice:user-left', (data: { userId: string }) => {
      console.log('[VOICE] Received voice:user-left:', data);
      this.removeRemoteStream(data.userId);
      this.onRemoteStreamRemoved?.(data.userId, 'audio');
      // Also remove any video/screen streams for this user
      this.onRemoteVideoStreamRemoved?.(data.userId, 'video');
      this.onRemoteVideoStreamRemoved?.(data.userId, 'screen');
    });

    // 9. Listen for speaking events from others
    this.registerSocketHandler(socket, 'voice:speaking', (data: { userId: string; speaking: boolean }) => {
      this.onSpeakingChange?.(data.userId, data.speaking);
    });

    // 10. Consume existing producers from users already in the channel
    if (joinResult.existingProducers?.length) {
      console.log('[VOICE] Step 10: Consuming', joinResult.existingProducers.length, 'existing producers...');
      for (const { producerId, userId, mediaType } of joinResult.existingProducers) {
        console.log('[VOICE] Consuming existing producer:', { producerId, userId, mediaType });
        await this.consumeProducer(producerId, userId, mediaType);
      }
      console.log('[VOICE] Step 10 done');
    }
    console.log('[VOICE] join() complete! Consumers:', this.consumers.size, 'Producers:', this.producers.size);
  }

  private registerSocketHandler(socket: any, event: string, handler: (...args: any[]) => void) {
    socket.on(event, handler);
    this.socketHandlers.push({ event, handler });
  }

  private emitWithTimeout<T>(socket: any, event: string, data: any, timeout = 10000): Promise<T & { error?: string }> {
    return new Promise((resolve, reject) => {
      console.log('[VOICE] emitWithTimeout:', event, data);
      const timer = setTimeout(() => {
        console.error('[VOICE] TIMEOUT waiting for:', event);
        reject(new Error(`Timeout waiting for ${event}`));
      }, timeout);
      socket.emit(event, data, (response: any) => {
        clearTimeout(timer);
        console.log('[VOICE] Response for', event, ':', response?.error ? `ERROR: ${response.error}` : 'OK');
        resolve(response);
      });
    });
  }

  private async createSendTransport(socket: any): Promise<void> {
    const transportData = await this.emitWithTimeout(socket, 'voice:create-transport', { direction: 'send' });
    if (transportData.error) throw new Error(transportData.error);

    this.sendTransport = this.device!.createSendTransport(transportData);
    console.log('[VOICE] Send transport created, id:', this.sendTransport.id, 'connectionState:', this.sendTransport.connectionState);

    this.sendTransport.on('connect', ({ dtlsParameters }, callback) => {
      console.log('[VOICE] Send transport "connect" event fired');
      socket.emit('voice:connect-transport', { transportId: this.sendTransport!.id, dtlsParameters }, (resp: any) => {
        console.log('[VOICE] Send transport connect response:', resp?.error ? `ERROR: ${resp.error}` : 'OK');
        callback();
      });
    });

    this.sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback) => {
      const mediaType = (appData?.mediaType as ProducerMediaType) || 'audio';
      console.log('[VOICE] Send transport "produce" event fired, kind:', kind, 'mediaType:', mediaType);
      socket.emit('voice:produce', { transportId: this.sendTransport!.id, kind, rtpParameters, mediaType }, (resp: any) => {
        console.log('[VOICE] Produce response:', resp);
        callback(resp);
      });
    });

    this.sendTransport.on('connectionstatechange', (state: string) => {
      console.log('[VOICE] Send transport connectionState changed:', state);
    });
  }

  private async createRecvTransport(socket: any): Promise<void> {
    const transportData = await this.emitWithTimeout(socket, 'voice:create-transport', { direction: 'recv' });
    if (transportData.error) throw new Error(transportData.error);

    this.recvTransport = this.device!.createRecvTransport(transportData);
    console.log('[VOICE] Recv transport created, id:', this.recvTransport.id);

    this.recvTransport.on('connect', ({ dtlsParameters }, callback) => {
      console.log('[VOICE] Recv transport "connect" event fired');
      socket.emit('voice:connect-transport', { transportId: this.recvTransport!.id, dtlsParameters }, (resp: any) => {
        console.log('[VOICE] Recv transport connect response:', resp?.error ? `ERROR: ${resp.error}` : 'OK');
        callback();
      });
    });

    this.recvTransport.on('connectionstatechange', (state: string) => {
      console.log('[VOICE] Recv transport connectionState changed:', state);
    });
  }

  /** Load RNNoise WASM binary (cached) and register worklet module on the AudioContext */
  private async initRnnoise(audioContext: AudioContext): Promise<void> {
    // Load WASM binary once (auto-detects SIMD support)
    if (!VoiceService.rnnoiseWasmBinary) {
      VoiceService.rnnoiseWasmBinary = await loadRnnoise({
        url: rnnoiseWasmPath,
        simdUrl: rnnoiseWasmSimdPath,
      });
    }
    // Register worklet processor on this AudioContext
    await audioContext.audioWorklet.addModule(rnnoiseWorkletPath);
    this.rnnoiseReady = true;
  }

  /** Build the audio pipeline with optional RNNoise noise suppression */
  private async buildAudioPipeline(
    audioContext: AudioContext,
    localStream: MediaStream,
    inputGain: number,
    noiseSuppressionEnabled: boolean,
  ): Promise<MediaStreamAudioDestinationNode> {
    this.sourceNode = audioContext.createMediaStreamSource(localStream);
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = inputGain;
    this.destinationNode = audioContext.createMediaStreamDestination();
    this.analyserNode = audioContext.createAnalyser();
    this.analyserNode.fftSize = 512;

    if (noiseSuppressionEnabled) {
      try {
        if (!this.rnnoiseReady) {
          await this.initRnnoise(audioContext);
        }
        this.rnnoiseNode = new RnnoiseWorkletNode(audioContext, {
          wasmBinary: VoiceService.rnnoiseWasmBinary!,
          maxChannels: 1,
        });
        // source -> rnnoise -> gain -> destination + analyser
        this.sourceNode.connect(this.rnnoiseNode);
        this.rnnoiseNode.connect(this.gainNode);
      } catch (err) {
        console.warn('RNNoise init failed, falling back to direct pipeline:', err);
        this.destroyRnnoiseNode();
        // Fallback: source -> gain
        this.sourceNode.connect(this.gainNode);
      }
    } else {
      // source -> gain -> destination + analyser
      this.sourceNode.connect(this.gainNode);
    }

    this.gainNode.connect(this.destinationNode);
    this.gainNode.connect(this.analyserNode);

    return this.destinationNode;
  }

  private destroyRnnoiseNode(): void {
    if (this.rnnoiseNode) {
      try {
        this.rnnoiseNode.disconnect();
        this.rnnoiseNode.destroy();
      } catch {
        // already destroyed
      }
      this.rnnoiseNode = null;
    }
  }

  private async produceMic(): Promise<void> {
    const { inputDeviceId, inputGain, noiseSuppression } = useAudioSettingsStore.getState();
    console.log('[VOICE] produceMic() inputDeviceId:', inputDeviceId, 'inputGain:', inputGain, 'noiseSuppression:', noiseSuppression);
    const constraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (inputDeviceId) {
      constraints.deviceId = { exact: inputDeviceId };
    }

    console.log('[VOICE] Requesting getUserMedia with constraints:', JSON.stringify(constraints));
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
    const audioTrack = this.localStream.getAudioTracks()[0];
    console.log('[VOICE] Got local mic stream, track:', audioTrack?.label, 'enabled:', audioTrack?.enabled, 'readyState:', audioTrack?.readyState);

    // RNNoise requires 48kHz sample rate
    this.audioContext = new AudioContext({ sampleRate: 48000 });
    console.log('[VOICE] AudioContext created, state:', this.audioContext.state, 'sampleRate:', this.audioContext.sampleRate);
    // AudioContext may start suspended (autoplay policy); must resume for audio to flow
    if (this.audioContext.state === 'suspended') {
      console.log('[VOICE] AudioContext was suspended, resuming...');
      await this.audioContext.resume();
      console.log('[VOICE] AudioContext resumed, state:', this.audioContext.state);
    }

    const destination = await this.buildAudioPipeline(this.audioContext, this.localStream, inputGain, noiseSuppression);
    console.log('[VOICE] Audio pipeline built');

    // Set up speaking detection on the gained signal
    this.setupSpeakingDetection();

    // Produce the gain-processed track
    const processedTrack = destination.stream.getAudioTracks()[0];
    console.log('[VOICE] Producing audio track, enabled:', processedTrack?.enabled, 'readyState:', processedTrack?.readyState);
    const producer = await this.sendTransport!.produce({ track: processedTrack, appData: { mediaType: 'audio' } });
    console.log('[VOICE] Audio producer created, id:', producer.id, 'paused:', producer.paused, 'closed:', producer.closed);
    this.producers.set('audio', producer);
  }

  async produceVideo(): Promise<void> {
    if (!this.sendTransport) throw new Error('No send transport');

    const { videoDeviceId } = useAudioSettingsStore.getState();
    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    };
    if (videoDeviceId) {
      videoConstraints.deviceId = { exact: videoDeviceId };
    }

    this.localVideoStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
    });

    const videoTrack = this.localVideoStream.getVideoTracks()[0];
    const producer = await this.sendTransport.produce({ track: videoTrack, appData: { mediaType: 'video' } });
    this.producers.set('video', producer);
  }

  /** Switch video device: get new camera stream and replace the producer track */
  async switchVideoDevice(deviceId: string | null): Promise<void> {
    const videoProducer = this.producers.get('video');
    if (!videoProducer) return;

    // Stop old video tracks
    this.localVideoStream?.getTracks().forEach((t) => t.stop());

    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    };
    if (deviceId) {
      videoConstraints.deviceId = { exact: deviceId };
    }

    this.localVideoStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
    });

    const newTrack = this.localVideoStream.getVideoTracks()[0];
    await videoProducer.replaceTrack({ track: newTrack });
  }

  stopVideo(): void {
    const producer = this.producers.get('video');
    if (producer) {
      producer.close();
      this.producers.delete('video');
    }

    if (this.localVideoStream) {
      this.localVideoStream.getTracks().forEach((t) => t.stop());
      this.localVideoStream = null;
    }

    const socket = socketService.getSocket();
    socket?.emit('voice:close-producer', { mediaType: 'video' });
  }

  async produceScreenShare(quality: ScreenShareQuality = 'hd', audio = true): Promise<void> {
    if (!this.sendTransport) throw new Error('No send transport');

    const isSD = quality === 'sd';
    const width = isSD ? 1280 : 1920;
    const height = isSD ? 720 : 1080;
    const frameRate = 60;
    const maxBitrate = isSD ? 2_500_000 : 6_000_000;

    this.localScreenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: frameRate } },
      audio,
    });

    const screenTrack = this.localScreenStream.getVideoTracks()[0];

    // Listen for the user stopping screen share via the browser/OS UI
    screenTrack.onended = () => {
      this.stopScreenShare();
      this.onScreenShareStopped?.();
    };

    const producer = await this.sendTransport.produce({
      track: screenTrack,
      appData: { mediaType: 'screen' },
      encodings: [{ maxBitrate }],
    });
    this.producers.set('screen', producer);

    // Produce system audio track if available
    const audioTracks = this.localScreenStream.getAudioTracks();
    console.log('[VOICE] Screen share audio tracks:', audioTracks.length, audioTracks.map(t => ({ label: t.label, enabled: t.enabled, readyState: t.readyState })));
    if (audioTracks.length > 0) {
      const audioProducer = await this.sendTransport.produce({
        track: audioTracks[0],
        appData: { mediaType: 'screen-audio' },
      });
      this.producers.set('screen-audio', audioProducer);
      console.log('[VOICE] Screen audio producer created, id:', audioProducer.id);
    } else {
      console.warn('[VOICE] No audio track from getDisplayMedia — system audio capture may not be supported on this platform');
    }
  }

  stopScreenShare(): void {
    const producer = this.producers.get('screen');
    if (producer) {
      producer.close();
      this.producers.delete('screen');
    }

    const audioProducer = this.producers.get('screen-audio');
    if (audioProducer) {
      audioProducer.close();
      this.producers.delete('screen-audio');
    }

    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach((t) => t.stop());
      this.localScreenStream = null;
    }

    const socket = socketService.getSocket();
    socket?.emit('voice:close-producer', { mediaType: 'screen' });
    if (audioProducer) {
      socket?.emit('voice:close-producer', { mediaType: 'screen-audio' });
    }
  }

  getLocalVideoStream(): MediaStream | null {
    return this.localVideoStream;
  }

  getLocalScreenStream(): MediaStream | null {
    return this.localScreenStream;
  }

  private setupSpeakingDetection() {
    if (!this.analyserNode) return;

    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    let wasSpeaking = false;

    this.speakingInterval = setInterval(() => {
      if (!this.analyserNode) return;

      // Suppress speaking indicator when muted
      if (this._isMuted) {
        if (wasSpeaking) {
          wasSpeaking = false;
          const socket = socketService.getSocket();
          socket?.emit('voice:speaking', { speaking: false });
          this.onSpeakingChange?.('local', false);
        }
        return;
      }

      this.analyserNode.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const isSpeaking = average > 15;

      if (isSpeaking !== wasSpeaking) {
        wasSpeaking = isSpeaking;
        const socket = socketService.getSocket();
        socket?.emit('voice:speaking', { speaking: isSpeaking });
        this.onSpeakingChange?.('local', isSpeaking);
      }
    }, 100);
  }

  private audioElementKey(userId: string, mediaType: ProducerMediaType = 'audio'): string {
    return mediaType === 'audio' ? userId : `${userId}:${mediaType}`;
  }

  // Store a remote audio stream so it doesn't get garbage collected
  playRemoteStream(userId: string, stream: MediaStream, mediaType: ProducerMediaType = 'audio'): void {
    console.log('[VOICE] playRemoteStream() userId:', userId, 'mediaType:', mediaType, 'tracks:', stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState, label: t.label })));
    const key = this.audioElementKey(userId, mediaType);
    // Clean up existing audio element for this key if any
    this.removeRemoteStreamByKey(key);

    const { outputDeviceId, outputVolume } = useAudioSettingsStore.getState();
    const audio = new Audio();
    audio.srcObject = stream;
    // If currently deafened, mute the audio element
    audio.muted = this._isDeafened;
    audio.volume = outputVolume;
    console.log('[VOICE] Audio element created for', key, '- muted:', audio.muted, 'volume:', audio.volume, 'outputDeviceId:', outputDeviceId);

    // Set output device if supported and selected
    if (outputDeviceId && typeof (audio as any).setSinkId === 'function') {
      (audio as any).setSinkId(outputDeviceId).catch(console.error);
    }

    audio.play().then(() => {
      console.log('[VOICE] Audio element playing for', key, '- paused:', audio.paused, 'currentTime:', audio.currentTime);
    }).catch((err) => {
      console.error('[VOICE] Audio element play() FAILED for', key, err);
    });

    this.audioElements.set(key, audio);
  }

  private removeRemoteStreamByKey(key: string): void {
    const audio = this.audioElements.get(key);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      this.audioElements.delete(key);
    }
  }

  // Remove and clean up a remote audio stream for a specific media type
  removeRemoteStream(userId: string, mediaType?: ProducerMediaType): void {
    if (mediaType) {
      this.removeRemoteStreamByKey(this.audioElementKey(userId, mediaType));
    } else {
      // Remove all audio elements for this user
      for (const key of [...this.audioElements.keys()]) {
        if (key === userId || key.startsWith(`${userId}:`)) {
          this.removeRemoteStreamByKey(key);
        }
      }
    }
  }

  /** Mute or unmute screen-audio for a specific user */
  setScreenAudioMuted(userId: string, muted: boolean): void {
    const key = this.audioElementKey(userId, 'screen-audio');
    const audio = this.audioElements.get(key);
    if (audio) {
      audio.muted = muted;
    }
  }

  async consumeProducer(producerId: string, userId: string, mediaType: ProducerMediaType = 'audio'): Promise<void> {
    console.log('[VOICE] consumeProducer() producerId:', producerId, 'userId:', userId, 'mediaType:', mediaType);
    const socket = socketService.getSocket();
    if (!socket || !this.device || !this.recvTransport) {
      console.error('[VOICE] consumeProducer() aborted - socket:', !!socket, 'device:', !!this.device, 'recvTransport:', !!this.recvTransport);
      return;
    }

    const consumerData = await this.emitWithTimeout(socket, 'voice:consume', {
      producerId, rtpCapabilities: this.device!.rtpCapabilities,
    });
    if (consumerData.error) {
      console.error('[VOICE] Failed to consume producer:', consumerData.error);
      return;
    }
    console.log('[VOICE] Got consumer data, consumerId:', consumerData.consumerId, 'kind:', consumerData.kind);

    const consumer = await this.recvTransport.consume({
      id: consumerData.consumerId,
      producerId: consumerData.producerId,
      kind: consumerData.kind,
      rtpParameters: consumerData.rtpParameters,
    });
    console.log('[VOICE] Consumer created, id:', consumer.id, 'paused:', consumer.paused, 'track readyState:', consumer.track.readyState);

    this.consumers.set(producerId, consumer);
    this.consumerMediaTypes.set(producerId, mediaType);

    // Resume the consumer on the server side
    console.log('[VOICE] Resuming consumer on server...');
    await this.emitWithTimeout(socket, 'voice:resume-consumer', { consumerId: consumer.id });
    console.log('[VOICE] Consumer resumed, paused:', consumer.paused);

    // If currently deafened, pause the new consumer immediately
    if (this._isDeafened) {
      console.log('[VOICE] Currently deafened, pausing consumer');
      consumer.pause();
    }

    // Create MediaStream from consumer track
    const stream = new MediaStream([consumer.track]);
    console.log('[VOICE] Created MediaStream from consumer track, tracks:', stream.getTracks().length);

    if (mediaType === 'audio' || mediaType === 'screen-audio') {
      console.log('[VOICE] Calling onRemoteStream for user', userId, 'mediaType:', mediaType);
      this.onRemoteStream?.(userId, stream, mediaType);
    } else {
      console.log('[VOICE] Calling onRemoteVideoStream for user', userId, 'mediaType:', mediaType);
      this.onRemoteVideoStream?.(userId, stream, mediaType);
    }
  }

  async leave(): Promise<void> {
    console.log('[VOICE] leave() called, was connected:', this.device !== null);
    const socket = socketService.getSocket();
    socket?.emit('voice:leave');

    // Remove only our own socket handlers (not those from useSocket)
    for (const { event, handler } of this.socketHandlers) {
      socket?.off(event, handler);
    }
    this.socketHandlers = [];

    if (this.speakingInterval) {
      clearInterval(this.speakingInterval);
      this.speakingInterval = null;
    }

    // Clean up RNNoise
    this.destroyRnnoiseNode();
    this.rnnoiseReady = false;
    this.sourceNode = null;
    this.destinationNode = null;

    this.audioContext?.close();
    this.audioContext = null;
    this.analyserNode = null;
    this.gainNode = null;

    // Close all producers
    for (const producer of this.producers.values()) {
      producer.close();
    }
    this.producers.clear();

    for (const consumer of this.consumers.values()) {
      consumer.close();
    }
    this.consumers.clear();
    this.consumerMediaTypes.clear();

    // Clean up all audio elements
    for (const [userId] of this.audioElements) {
      this.removeRemoteStream(userId);
    }
    this.audioElements.clear();

    this.sendTransport?.close();
    this.sendTransport = null;
    this.recvTransport?.close();
    this.recvTransport = null;

    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;

    this.localVideoStream?.getTracks().forEach((t) => t.stop());
    this.localVideoStream = null;

    this.localScreenStream?.getTracks().forEach((t) => t.stop());
    this.localScreenStream = null;

    this.device = null;

    // Reset mute/deafen state
    this._isMuted = false;
    this._isDeafened = false;
    this._wasMutedBeforeDeafen = false;
  }

  toggleMute(): { muted: boolean; deafened: boolean } {
    if (this._isDeafened) {
      // Clicking mute while deafened: un-deafen but stay muted
      this._isDeafened = false;
      this._isMuted = true;
      this.applyDeafenState();
      // Producer stays paused (muted)
      return { muted: this._isMuted, deafened: this._isDeafened };
    }

    this._isMuted = !this._isMuted;
    this.applyMuteState();
    return { muted: this._isMuted, deafened: this._isDeafened };
  }

  toggleDeafen(): { muted: boolean; deafened: boolean } {
    if (this._isDeafened) {
      // Un-deafen: restore previous mute state
      this._isDeafened = false;
      this._isMuted = this._wasMutedBeforeDeafen;
      this.applyDeafenState();
      this.applyMuteState();
    } else {
      // Deafen: save mute state, force mute
      this._wasMutedBeforeDeafen = this._isMuted;
      this._isDeafened = true;
      this._isMuted = true;
      this.applyDeafenState();
      this.applyMuteState();
    }
    return { muted: this._isMuted, deafened: this._isDeafened };
  }

  private applyMuteState(): void {
    const audioProducer = this.producers.get('audio');
    if (!audioProducer) return;
    if (this._isMuted) {
      audioProducer.pause();
    } else {
      audioProducer.resume();
    }
  }

  private applyDeafenState(): void {
    // Pause/resume all consumers
    for (const consumer of this.consumers.values()) {
      if (this._isDeafened) {
        consumer.pause();
      } else {
        consumer.resume();
      }
    }
    // Mute/unmute all audio elements
    for (const audio of this.audioElements.values()) {
      audio.muted = this._isDeafened;
    }
  }

  /** Update output device on all existing audio elements */
  setOutputDevice(deviceId: string | null): void {
    for (const audio of this.audioElements.values()) {
      if (deviceId && typeof (audio as any).setSinkId === 'function') {
        (audio as any).setSinkId(deviceId).catch(console.error);
      }
    }
  }

  /** Update volume on all existing audio elements */
  setOutputVolume(volume: number): void {
    for (const audio of this.audioElements.values()) {
      audio.volume = volume;
    }
  }

  /** Switch input device: re-acquire mic, rebuild gain pipeline, replace producer track */
  async switchInputDevice(deviceId: string | null): Promise<void> {
    const audioProducer = this.producers.get('audio');
    if (!audioProducer || !this.sendTransport) return;

    const { inputGain, noiseSuppression } = useAudioSettingsStore.getState();
    const constraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (deviceId) {
      constraints.deviceId = { exact: deviceId };
    }

    // Stop old tracks
    this.localStream?.getTracks().forEach((t) => t.stop());

    // Clean up old audio pipeline
    if (this.speakingInterval) {
      clearInterval(this.speakingInterval);
      this.speakingInterval = null;
    }
    this.destroyRnnoiseNode();
    this.rnnoiseReady = false;
    this.sourceNode = null;
    this.destinationNode = null;
    this.audioContext?.close();
    this.audioContext = null;
    this.analyserNode = null;
    this.gainNode = null;

    // Get new stream and rebuild pipeline
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: constraints });

    this.audioContext = new AudioContext({ sampleRate: 48000 });
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    const destination = await this.buildAudioPipeline(this.audioContext, this.localStream, inputGain, noiseSuppression);

    const processedTrack = destination.stream.getAudioTracks()[0];
    await audioProducer.replaceTrack({ track: processedTrack });

    // Re-apply mute state
    this.applyMuteState();

    // Re-setup speaking detection
    this.setupSpeakingDetection();
  }

  /** Update mic input gain in real-time */
  setInputGain(gain: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = gain;
    }
  }

  /** Toggle RNNoise noise suppression on/off in real-time */
  async setNoiseSuppression(enabled: boolean): Promise<void> {
    if (!this.audioContext || !this.sourceNode || !this.gainNode) return;

    if (enabled) {
      // Insert RNNoise between source and gain
      try {
        if (!this.rnnoiseReady) {
          await this.initRnnoise(this.audioContext);
        }
        this.rnnoiseNode = new RnnoiseWorkletNode(this.audioContext, {
          wasmBinary: VoiceService.rnnoiseWasmBinary!,
          maxChannels: 1,
        });
        // Disconnect source from gain, rewire through rnnoise
        this.sourceNode.disconnect(this.gainNode);
        this.sourceNode.connect(this.rnnoiseNode);
        this.rnnoiseNode.connect(this.gainNode);
      } catch (err) {
        console.warn('RNNoise toggle-on failed:', err);
        this.destroyRnnoiseNode();
        // Make sure source is still connected to gain
        try {
          this.sourceNode.connect(this.gainNode);
        } catch {
          // already connected
        }
      }
    } else {
      // Remove RNNoise: source -> gain directly
      if (this.rnnoiseNode) {
        try {
          this.sourceNode.disconnect(this.rnnoiseNode);
        } catch {
          // not connected
        }
        this.destroyRnnoiseNode();
        // Reconnect source directly to gain
        this.sourceNode.connect(this.gainNode);
      }
    }
  }

  /** Get a raw mic stream for testing (caller is responsible for stopping) */
  async getTestMicStream(deviceId?: string | null): Promise<MediaStream> {
    const constraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (deviceId) {
      constraints.deviceId = { exact: deviceId };
    }
    return navigator.mediaDevices.getUserMedia({ audio: constraints });
  }

  /** Restore mute/deafen state (e.g. after switching channels) */
  setMuteDeafenState(muted: boolean, deafened: boolean): void {
    this._isDeafened = deafened;
    this._isMuted = muted;
    this._wasMutedBeforeDeafen = false;
    this.applyMuteState();
    this.applyDeafenState();
  }

  isConnected(): boolean {
    return this.device !== null;
  }
}

export const voiceService = new VoiceService();
