import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  onAuthCallback: (callback: (code: string) => void) => {
    const handler = (_event: unknown, code: string) => callback(code);
    ipcRenderer.on('auth:deep-link', handler);
    return () => {
      ipcRenderer.removeListener('auth:deep-link', handler);
    };
  },
  onInviteCallback: (callback: (code: string) => void) => {
    const handler = (_event: unknown, code: string) => callback(code);
    ipcRenderer.on('invite:deep-link', handler);
    return () => {
      ipcRenderer.removeListener('invite:deep-link', handler);
    };
  },
  onUpdateAvailable: (callback: (data: { version: string; downloadUrl: string; releaseNotes: string }) => void) => {
    const handler = (_event: unknown, data: { version: string; downloadUrl: string; releaseNotes: string }) => callback(data);
    ipcRenderer.on('update:available', handler);
    return () => {
      ipcRenderer.removeListener('update:available', handler);
    };
  },
  getScreenSources: () => ipcRenderer.invoke('screen:get-sources') as Promise<{ id: string; name: string; thumbnailDataUrl: string; displayId: string }[]>,
  selectScreenSource: (sourceId: string) => ipcRenderer.invoke('screen:select-source', sourceId),
  showNotification: (data: { title: string; body: string }) => ipcRenderer.invoke('notification:show', data),
  getServerUrl: (): Promise<string> => ipcRenderer.invoke('server-url:get'),
  setServerUrl: (url: string): Promise<boolean> => ipcRenderer.invoke('server-url:set', url),
});

contextBridge.exposeInMainWorld('secureStorage', {
  set: (token: string): Promise<boolean> => ipcRenderer.invoke('secure-storage:set', token),
  get: (): Promise<string | null> => ipcRenderer.invoke('secure-storage:get'),
  delete: (): Promise<boolean> => ipcRenderer.invoke('secure-storage:delete'),
});
