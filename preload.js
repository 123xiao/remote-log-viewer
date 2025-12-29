const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Configs
  getServerConfigs: () => ipcRenderer.invoke('getServerConfigs'),
  saveServerConfig: (config) => ipcRenderer.invoke('saveServerConfig', config),
  updateServerConfig: (config) => ipcRenderer.invoke('updateServerConfig', config),
  deleteServerConfig: (id) => ipcRenderer.invoke('deleteServerConfig', id),

  // SSH Actions
  connectSSH: (server) => ipcRenderer.invoke('connectSSH', server),
  disconnectSSH: () => ipcRenderer.invoke('disconnectSSH'),
  
  // Data Transport
  // 发送数据使用 send (异步无阻塞)，不使用 invoke
  sendSSHData: (data) => ipcRenderer.send('ssh-data', data),
  
  // [新增] 调整终端大小
  resizeSSH: (geometry) => ipcRenderer.send('ssh-resize', geometry),

  // Listeners
  onSSHData: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('ssh-data', subscription);
    return () => ipcRenderer.removeListener('ssh-data', subscription);
  },
  onSSHClosed: (callback) => {
    const subscription = (event) => callback();
    ipcRenderer.on('ssh-closed', subscription);
    return () => ipcRenderer.removeListener('ssh-closed', subscription);
  },
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});