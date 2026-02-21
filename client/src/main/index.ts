import { app, BrowserWindow, shell, ipcMain, safeStorage, desktopCapturer, net, systemPreferences, Notification as ElectronNotification } from 'electron';
import { join } from 'path';
import fs from 'fs';
import { API_URL } from '../../../shared/constants';

const SERVER_URL_PATH = join(app.getPath('userData'), 'server-url.json');

function getStoredServerUrl(): string {
  try {
    const data = JSON.parse(fs.readFileSync(SERVER_URL_PATH, 'utf-8'));
    return data.url || API_URL;
  } catch {
    return API_URL;
  }
}

const isDev = !app.isPackaged;

// Register custom protocol for desktop auth deep links
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('echo', process.execPath, [process.argv[1]]);
  }
} else {
  app.setAsDefaultProtocolClient('echo');
}

// Ensure single instance so deep links route to existing window
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

const TOKEN_PATH = join(app.getPath('userData'), 'secure-token.json');

let pendingScreenSourceId: string | null = null;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#313338',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only allow http/https URLs to be opened externally
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {}
    return { action: 'deny' };
  });

  // Enable DevTools toggle (F12 or Ctrl+Shift+I)
  {
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      if (
        input.key === 'F12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i')
      ) {
        mainWindow.webContents.toggleDevTools();
      }
    });
  }

  // Enable getDisplayMedia() for screen sharing with system audio
  mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    console.log('[SCREEN] Display media requested, audioRequested:', request.audioRequested, 'videoRequested:', request.videoRequested);
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      const sourceId = pendingScreenSourceId;
      pendingScreenSourceId = null;
      const selected = sourceId ? sources.find((s) => s.id === sourceId) : sources[0];
      if (selected) {
        callback({ video: selected, audio: request.audioRequested ? 'loopback' : undefined });
      } else {
        callback(null);
      }
    }).catch(() => {
      pendingScreenSourceId = null;
      callback(null);
    });
  });

  // Set CSP programmatically — more reliable than meta tag across platforms
  // In dev mode, Vite injects inline scripts for React Fast Refresh that strict CSP blocks
  if (!isDev) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:; script-src-elem 'self' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; connect-src 'self' ws: wss: http: https:; media-src 'self' blob: data:;",
          ],
        },
      });
    });
  }

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// Window control IPC handlers
ipcMain.on('window:minimize', () => {
  BrowserWindow.getFocusedWindow()?.minimize();
});

ipcMain.on('window:maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.isMaximized() ? win.unmaximize() : win.maximize();
  }
});

ipcMain.on('window:close', () => {
  BrowserWindow.getFocusedWindow()?.close();
});

// Secure token storage IPC handlers
ipcMain.handle('secure-storage:set', (_event, token: string) => {
  if (!safeStorage.isEncryptionAvailable()) {
    return false;
  }
  const encrypted = safeStorage.encryptString(token);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify({ token: encrypted.toString('base64') }));
  return true;
});

ipcMain.handle('secure-storage:get', () => {
  if (!safeStorage.isEncryptionAvailable()) {
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    const buffer = Buffer.from(data.token, 'base64');
    return safeStorage.decryptString(buffer);
  } catch {
    return null;
  }
});

ipcMain.handle('shell:open-external', (_event, url: string) => {
  shell.openExternal(url);
});

ipcMain.handle('screen:get-sources', async () => {
  // On macOS, check Screen Recording permission before enumerating sources
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('screen');
    if (status !== 'granted') {
      return { error: 'screen-permission-denied' };
    }
  }
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 300, height: 200 },
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnailDataUrl: s.thumbnail.toDataURL(),
    displayId: s.display_id,
  }));
});

ipcMain.handle('screen:select-source', (_event, sourceId: string) => {
  pendingScreenSourceId = sourceId;
});

ipcMain.handle('notification:show', (_event, data: { title: string; body: string }) => {
  if (!ElectronNotification.isSupported()) return;
  const notif = new ElectronNotification({ title: data.title, body: data.body });
  notif.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  notif.show();
});

ipcMain.handle('secure-storage:delete', () => {
  try {
    fs.unlinkSync(TOKEN_PATH);
  } catch {}
  return true;
});

ipcMain.handle('server-url:get', () => {
  return getStoredServerUrl();
});

ipcMain.handle('server-url:set', (_event, url: string) => {
  const normalized = url.replace(/\/+$/, '');
  fs.writeFileSync(SERVER_URL_PATH, JSON.stringify({ url: normalized }));
  return true;
});

function handleDeepLink(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'echo:') return;

    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;

    if (parsed.hostname === 'auth') {
      const code = parsed.searchParams.get('code');
      if (code) {
        win.webContents.send('auth:deep-link', code);
        win.focus();
      }
    } else if (parsed.hostname === 'invite') {
      // echo://invite/{code} — extract invite code from pathname
      const inviteCode = parsed.pathname.replace(/^\//, '');
      if (inviteCode) {
        win.webContents.send('invite:deep-link', inviteCode);
        win.focus();
      }
    }
  } catch {
    // ignore malformed URLs
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function checkForUpdate() {
  const url = `${getStoredServerUrl()}/api/version`;
  const request = net.request(url);
  request.on('response', (response) => {
    let body = '';
    response.on('data', (chunk) => { body += chunk.toString(); });
    response.on('end', () => {
      try {
        const { data } = JSON.parse(body);
        const remoteVersion = data.version as string;
        const localVersion = app.getVersion();
        if (compareVersions(remoteVersion, localVersion) > 0) {
          const win = BrowserWindow.getAllWindows()[0];
          if (win) {
            win.webContents.send('update:available', {
              version: remoteVersion,
              downloadUrl: data.downloadUrl,
              releaseNotes: data.releaseNotes,
            });
          }
        }
      } catch {}
    });
  });
  request.on('error', () => {});
  request.end();
}

app.whenReady().then(() => {
  createWindow();

  // Check for updates 10s after launch, then every hour
  setTimeout(checkForUpdate, 10_000);
  setInterval(checkForUpdate, 60 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// macOS: handle deep link when app is already running
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Windows/Linux: handle deep link via second-instance
app.on('second-instance', (_event, argv) => {
  const url = argv.find((arg) => arg.startsWith('echo://'));
  if (url) handleDeepLink(url);

  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
