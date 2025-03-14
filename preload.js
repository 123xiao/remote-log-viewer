const { contextBridge, ipcRenderer } = require('electron');
const NodeSSH = require('node-ssh');

process.once('loaded', () => {
  global.process = process;
  global.Buffer = Buffer;
});

contextBridge.exposeInMainWorld('electronAPI', {
  saveServerConfig: (config) => ipcRenderer.invoke('saveServerConfig', config),
  getServerConfigs: () => ipcRenderer.invoke('getServerConfigs'),
  deleteServerConfig: (id) => ipcRenderer.invoke('deleteServerConfig', id),
  updateServerConfig: (config) => ipcRenderer.invoke('updateServerConfig', config),
  connectSSH: (server) => ipcRenderer.invoke('connectSSH', server),
  disconnectSSH: () => ipcRenderer.invoke('disconnectSSH'),
  sendSSHData: (data) => ipcRenderer.invoke('sendSSHData', data),
  onSSHData: (callback) => ipcRenderer.on('ssh-data', (event, data) => callback(data)),
  onSSHClosed: (callback) => ipcRenderer.on('ssh-closed', () => callback())
});

contextBridge.exposeInMainWorld('process', {
  platform: process.platform,
  env: {
    NODE_ENV: process.env.NODE_ENV
  }
});