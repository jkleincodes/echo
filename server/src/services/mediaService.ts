import mediasoup from 'mediasoup';
import type { types as mediasoupTypes } from 'mediasoup';
import { logger } from '../lib/logger.js';
import type { ProducerMediaType } from '../../../shared/types.js';

const MEDIASOUP_WORKER_SETTINGS: mediasoupTypes.WorkerSettings = {
  logLevel: 'debug',
  rtcMinPort: parseInt(process.env.RTC_MIN_PORT || '10000', 10),
  rtcMaxPort: parseInt(process.env.RTC_MAX_PORT || '10100', 10),
};

const MEDIASOUP_ROUTER_MEDIA_CODECS: mediasoupTypes.RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
  },
];

const WEBRTC_TRANSPORT_OPTIONS: mediasoupTypes.WebRtcTransportOptions = {
  listenInfos: [{ protocol: 'udp', ip: '0.0.0.0', announcedAddress: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1' }],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
};

class MediaService {
  private worker: mediasoupTypes.Worker | null = null;
  private routers = new Map<string, mediasoupTypes.Router>(); // channelId -> Router
  private transports = new Map<string, mediasoupTypes.WebRtcTransport>(); // transportId -> Transport
  private producers = new Map<string, mediasoupTypes.Producer>(); // producerId -> Producer
  private consumers = new Map<string, mediasoupTypes.Consumer>(); // consumerId -> Consumer

  // Track which user has which producers in which channel
  // channelId -> (userId -> { audio?: producerId, video?: producerId, screen?: producerId })
  private channelProducers = new Map<string, Map<string, Partial<Record<ProducerMediaType, string>>>>();
  private userTransports = new Map<string, Set<string>>(); // userId -> Set<transportId>

  async init() {
    this.worker = await mediasoup.createWorker(MEDIASOUP_WORKER_SETTINGS);
    this.worker.on('died', () => {
      logger.error('mediasoup Worker died, exiting...');
      process.exit(1);
    });
    logger.info('mediasoup Worker created');
  }

  async getOrCreateRouter(channelId: string): Promise<mediasoupTypes.Router> {
    let router = this.routers.get(channelId);
    if (!router) {
      if (!this.worker) throw new Error('Worker not initialized');
      router = await this.worker.createRouter({ mediaCodecs: MEDIASOUP_ROUTER_MEDIA_CODECS });
      this.routers.set(channelId, router);
      this.channelProducers.set(channelId, new Map());
      logger.info({ channelId }, 'Created router for channel');
    }
    return router;
  }

  async createWebRtcTransport(channelId: string, userId: string) {
    const router = await this.getOrCreateRouter(channelId);
    logger.info({ channelId, userId, listenInfos: WEBRTC_TRANSPORT_OPTIONS.listenInfos }, '[VOICE] Creating WebRTC transport');
    const transport = await router.createWebRtcTransport(WEBRTC_TRANSPORT_OPTIONS);

    this.transports.set(transport.id, transport);
    if (!this.userTransports.has(userId)) {
      this.userTransports.set(userId, new Set());
    }
    this.userTransports.get(userId)!.add(transport.id);

    transport.on('dtlsstatechange', (dtlsState: string) => {
      logger.info({ transportId: transport.id, userId, dtlsState }, '[VOICE] Transport DTLS state changed');
    });

    transport.on('icestatechange', (iceState: string) => {
      logger.info({ transportId: transport.id, userId, iceState }, '[VOICE] Transport ICE state changed');
    });

    logger.info({ transportId: transport.id, userId, iceCandidatesCount: transport.iceCandidates.length }, '[VOICE] WebRTC transport created');

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(transportId: string, dtlsParameters: mediasoupTypes.DtlsParameters) {
    const transport = this.transports.get(transportId);
    if (!transport) {
      logger.error({ transportId }, '[VOICE] connectTransport: Transport not found');
      throw new Error('Transport not found');
    }
    logger.info({ transportId }, '[VOICE] Connecting transport...');
    await transport.connect({ dtlsParameters });
    logger.info({ transportId, dtlsState: transport.dtlsState }, '[VOICE] Transport connected');
  }

  async produce(transportId: string, kind: mediasoupTypes.MediaKind, rtpParameters: mediasoupTypes.RtpParameters, channelId: string, userId: string, mediaType: ProducerMediaType) {
    const transport = this.transports.get(transportId);
    if (!transport) {
      logger.error({ transportId, userId }, '[VOICE] produce: Transport not found');
      throw new Error('Transport not found');
    }

    logger.info({ transportId, userId, kind, mediaType }, '[VOICE] Producing...');
    const producer = await transport.produce({ kind, rtpParameters, appData: { mediaType, userId } });
    this.producers.set(producer.id, producer);
    logger.info({ producerId: producer.id, userId, kind, mediaType, paused: producer.paused }, '[VOICE] Producer created');

    const userProducers = this.channelProducers.get(channelId);
    if (userProducers) {
      const existing = userProducers.get(userId) || {};
      existing[mediaType] = producer.id;
      userProducers.set(userId, existing);
    }

    producer.on('transportclose', () => {
      logger.info({ producerId: producer.id, userId, mediaType }, '[VOICE] Producer transport closed');
      this.producers.delete(producer.id);
      const up = this.channelProducers.get(channelId)?.get(userId);
      if (up && up[mediaType] === producer.id) {
        delete up[mediaType];
      }
    });

    return producer.id;
  }

  closeProducer(channelId: string, userId: string, mediaType: ProducerMediaType): string | null {
    const userProducers = this.channelProducers.get(channelId)?.get(userId);
    if (!userProducers) return null;

    const producerId = userProducers[mediaType];
    if (!producerId) return null;

    const producer = this.producers.get(producerId);
    if (producer) {
      producer.close();
      this.producers.delete(producerId);
    }

    delete userProducers[mediaType];
    return producerId;
  }

  async consume(transportId: string, producerId: string, rtpCapabilities: mediasoupTypes.RtpCapabilities, channelId: string) {
    const router = this.routers.get(channelId);
    if (!router) {
      logger.error({ channelId }, '[VOICE] consume: Router not found');
      throw new Error('Router not found');
    }

    const canConsume = router.canConsume({ producerId, rtpCapabilities });
    logger.info({ transportId, producerId, channelId, canConsume }, '[VOICE] Consuming...');
    if (!canConsume) {
      logger.error({ producerId, channelId }, '[VOICE] Cannot consume - incompatible RTP capabilities');
      throw new Error('Cannot consume');
    }

    const transport = this.transports.get(transportId);
    if (!transport) {
      logger.error({ transportId }, '[VOICE] consume: Transport not found');
      throw new Error('Transport not found');
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true, // Start paused, client resumes after setup
    });

    this.consumers.set(consumer.id, consumer);
    logger.info({ consumerId: consumer.id, producerId, kind: consumer.kind, paused: consumer.paused }, '[VOICE] Consumer created (paused, awaiting resume)');

    consumer.on('transportclose', () => {
      logger.info({ consumerId: consumer.id }, '[VOICE] Consumer transport closed');
      this.consumers.delete(consumer.id);
    });

    return {
      consumerId: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  async resumeConsumer(consumerId: string) {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) {
      logger.error({ consumerId }, '[VOICE] resumeConsumer: Consumer not found');
      throw new Error('Consumer not found');
    }
    logger.info({ consumerId, kind: consumer.kind, producerId: consumer.producerId }, '[VOICE] Resuming consumer...');
    await consumer.resume();
    logger.info({ consumerId, paused: consumer.paused }, '[VOICE] Consumer resumed');
  }

  getChannelProducers(channelId: string): Map<string, Partial<Record<ProducerMediaType, string>>> {
    return this.channelProducers.get(channelId) || new Map();
  }

  cleanupUser(userId: string) {
    // Close all transports for this user (which closes associated producers/consumers)
    const transportIds = this.userTransports.get(userId);
    if (transportIds) {
      for (const id of transportIds) {
        const transport = this.transports.get(id);
        if (transport) {
          transport.close();
          this.transports.delete(id);
        }
      }
      this.userTransports.delete(userId);
    }

    // Remove from channel producers
    for (const [, userProducers] of this.channelProducers) {
      userProducers.delete(userId);
    }
  }

  cleanupRouter(channelId: string) {
    const router = this.routers.get(channelId);
    if (router) {
      router.close();
      this.routers.delete(channelId);
      this.channelProducers.delete(channelId);
    }
  }
}

export const mediaService = new MediaService();
