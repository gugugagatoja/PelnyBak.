// Gives the page read-only access to CPU and memory usage (Windows program only).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', { metrics: () => ipcRenderer.invoke('metrics') });
