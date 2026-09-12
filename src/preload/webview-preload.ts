/**
 * Webview Preload Script (Isolated Sandbox)
 * contextIsolation: true, nodeIntegration: false, sandbox: true
 */
import { contextBridge, ipcRenderer } from 'electron';
import { XPathObserverRuntime } from './xpath-evaluator';
import { XPathConfig, XPathObservationMode } from '../shared/types';

contextBridge.exposeInMainWorld('__zaloview_bridge__', {
  version: '0.1.0'
});

const runtime = new XPathObserverRuntime(document, {
  send: (channel: string, payload: unknown) => {
    ipcRenderer.send(channel, payload);
  }
});

// 1. Receive monitoring configuration from Main process
ipcRenderer.on('xpath:init', (_event, payload: { config: XPathConfig }) => {
  if (payload && payload.config) {
    runtime.init(payload.config);
  }
});

// 2. Receive manual test request from Main process (via runner socket)
ipcRenderer.on(
  'xpath:test',
  (_event, payload: { requestId: string; selector: string; mode: XPathObservationMode }) => {
    const { requestId, selector, mode } = payload;
    try {
      const result = runtime.testXPath(selector, mode);
      const isSuccess = result.status === 'match' || result.status === 'no_match';
      ipcRenderer.send('xpath:test-result', {
        requestId,
        success: isSuccess,
        result: {
          status: result.status,
          selector: result.selector,
          mode: result.mode,
          hasElement: result.hasElement,
          count: result.count,
          textPreview: result.textPreview,
          error: result.error,
          executionTimeMs: result.executionTimeMs
        },
        error: isSuccess ? undefined : result.error
      });
    } catch (err: unknown) {
      ipcRenderer.send('xpath:test-result', {
        requestId,
        success: false,
        error: (err as Error).message
      });
    }
  }
);

// 3. Document visibility change (re-scan immediately when document becomes visible/resumes)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    runtime.evaluateAndDispatch();
  }
});

// 4. Cleanup on document unload or page navigation
window.addEventListener('pagehide', () => {
  runtime.cleanup();
});

window.addEventListener('beforeunload', () => {
  runtime.cleanup();
});

console.log('[ZaloWebView Preload] Sandbox bridge and XPath Observer loaded');
