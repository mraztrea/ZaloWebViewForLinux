/**
 * Webview Preload Script (Isolated Sandbox)
 * contextIsolation: true, nodeIntegration: false, sandbox: true
 */
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('__zaloview_bridge__', {
  version: '0.1.0'
});

console.log('[ZaloWebView Preload] Sandbox bridge loaded');
