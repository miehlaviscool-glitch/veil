const { contextBridge, ipcRenderer } = require('electron');

// Only expose the desktop bridge to our own pages: bundled local files and the loopback dashboard.
const trusted = location.protocol === 'file:' || location.hostname === '127.0.0.1';

if (trusted) {
  const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
  contextBridge.exposeInMainWorld('desktop', {
    isDesktop: true,
    platform: process.platform,
    version: () => invoke('app:version'),
    getStatus: () => invoke('bot:status'),
    onStatus: (cb) => {
      const fn = (_e, s) => cb(s);
      ipcRenderer.on('bot:status', fn);
      return () => ipcRenderer.removeListener('bot:status', fn);
    },
    startBot: () => invoke('bot:start'),
    stopBot: () => invoke('bot:stop'),
    restartBot: () => invoke('bot:restart'),
    getSettings: () => invoke('settings:get'),
    validateToken: (token) => invoke('settings:validateToken', token),
    saveSettings: (payload) => invoke('settings:save', payload),
    openSettings: () => invoke('app:openSettings'),
    openFolder: (which) => invoke('app:openFolder', which),
    quit: () => invoke('app:quit'),
    closeWindow: () => invoke('app:closeWindow'),
  });
}
