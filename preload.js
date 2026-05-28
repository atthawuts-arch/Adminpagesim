// Preload script — no APIs exposed yet (renderer talks to Ollama via fetch directly).
// This file exists so the BrowserWindow webPreferences.preload doesn't error,
// and to keep the door open for future IPC (e.g. settings persistence, native dialogs).

// const { contextBridge, ipcRenderer } = require('electron');
//
// contextBridge.exposeInMainWorld('adminSim', {
//   // future: openExternal, saveScreenshot, etc.
// });
