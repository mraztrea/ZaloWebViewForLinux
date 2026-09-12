/**
 * XPath Evaluator and State Engine for ZaloWebView Preload
 * Context: Isolated Preload / Webview DOM Environment
 */

import {
  XPathConfig,
  XPathObservationMode,
  XPathEvaluationResult,
  XPathObservationState,
  XPathBaselineRecord,
  MAX_XPATH_TEXT_PREVIEW_LENGTH
} from '../shared/types';

export const HIGHLIGHT_OVERLAY_CLASS = '__zaloview_highlight_overlay__';

export interface ParseBadgeCountResult {
  count: number;
  isValid: boolean;
}

/**
 * Parses badge count from string.
 * Strictly adheres to regex: /^(\d+)(\+)?$/
 * Allows non-negative integer with optional '+' suffix (e.g., '99+' -> 99).
 * Returns isValid: false for 'abc', '-1', '1.5', empty string, or unsafe integers.
 */
export function parseBadgeCount(rawText: string): ParseBadgeCountResult {
  const trimmed = rawText.trim();
  if (trimmed === '') {
    return { count: 0, isValid: false };
  }

  const match = trimmed.match(/^(\d+)(\+)?$/);
  if (!match) {
    return { count: 0, isValid: false };
  }

  const count = Number(match[1]);
  if (!Number.isSafeInteger(count) || count < 0) {
    return { count: 0, isValid: false };
  }

  return { count, isValid: true };
}

/**
 * Evaluates XPath selector on the given document for the specified observation mode.
 * Returns structured XPathEvaluationResult distinguishing match, no_match, invalid_selector, invalid_data.
 */
export function evaluateXPath(
  doc: Document,
  selector: string,
  mode: XPathObservationMode
): XPathEvaluationResult & { rawFullText?: string } {
  const startTime = performance.now();

  const trimmedSelector = selector.trim();
  if (trimmedSelector === '') {
    return {
      status: 'no_match',
      selector,
      mode,
      hasElement: false,
      count: 0,
      textPreview: '',
      executionTimeMs: Math.round(performance.now() - startTime)
    };
  }

  let evalResult: XPathResult;
  try {
    evalResult = doc.evaluate(
      trimmedSelector,
      doc,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
  } catch (err: unknown) {
    return {
      status: 'invalid_selector',
      selector,
      mode,
      hasElement: false,
      count: 0,
      textPreview: '',
      error: `INVALID_SELECTOR: ${(err as Error).message || 'Cú pháp XPath không hợp lệ.'}`,
      executionTimeMs: Math.round(performance.now() - startTime)
    };
  }

  if (evalResult.resultType !== XPathResult.FIRST_ORDERED_NODE_TYPE) {
    return {
      status: 'invalid_selector',
      selector,
      mode,
      hasElement: false,
      count: 0,
      textPreview: '',
      error: 'INVALID_SELECTOR: Biểu thức XPath trả về kết quả vô hướng (scalar) thay vì Node.',
      executionTimeMs: Math.round(performance.now() - startTime)
    };
  }

  const node = evalResult.singleNodeValue;
  if (!node) {
    return {
      status: 'no_match',
      selector,
      mode,
      hasElement: false,
      count: 0,
      textPreview: '',
      executionTimeMs: Math.round(performance.now() - startTime)
    };
  }

  const rawFullText = node.textContent || '';
  const textPreview = rawFullText.trim().slice(0, MAX_XPATH_TEXT_PREVIEW_LENGTH);

  if (mode === 'existence') {
    return {
      status: 'match',
      selector,
      mode,
      hasElement: true,
      count: 1,
      textPreview,
      rawFullText,
      executionTimeMs: Math.round(performance.now() - startTime)
    };
  }

  if (mode === 'text_content') {
    return {
      status: 'match',
      selector,
      mode,
      hasElement: true,
      count: 0,
      textPreview,
      rawFullText,
      executionTimeMs: Math.round(performance.now() - startTime)
    };
  }

  if (mode === 'badge_count') {
    const parsed = parseBadgeCount(rawFullText);
    if (!parsed.isValid) {
      return {
        status: 'invalid_data',
        selector,
        mode,
        hasElement: true,
        count: 0,
        textPreview,
        rawFullText,
        error: `INVALID_DATA: Nội dung '${rawFullText.trim()}' không phải là số nguyên đếm thông báo hợp lệ.`,
        executionTimeMs: Math.round(performance.now() - startTime)
      };
    }

    return {
      status: 'match',
      selector,
      mode,
      hasElement: true,
      count: parsed.count,
      textPreview,
      rawFullText,
      executionTimeMs: Math.round(performance.now() - startTime)
    };
  }

  return {
    status: 'error',
    selector,
    mode,
    hasElement: false,
    count: 0,
    textPreview: '',
    error: `Chế độ quan sát không xác định: ${String(mode)}`,
    executionTimeMs: Math.round(performance.now() - startTime)
  };
}

/**
 * Compares current evaluation result with baseline record.
 * Determines changedForAlert and calculates new baseline.
 */
export function compareWithBaseline(
  currentResult: XPathEvaluationResult & { rawFullText?: string },
  baseline: XPathBaselineRecord
): {
  state: XPathObservationState;
  newBaseline: XPathBaselineRecord;
} {
  const rawText = currentResult.rawFullText !== undefined
    ? currentResult.rawFullText
    : currentResult.textPreview;

  let changedForAlert = false;
  let newBaseline: XPathBaselineRecord = { ...baseline };

  if (
    currentResult.status === 'invalid_selector' ||
    currentResult.status === 'invalid_data' ||
    currentResult.status === 'error'
  ) {
    // Errors do NOT change baseline and do NOT trigger alerts
    changedForAlert = false;
  } else if (currentResult.mode === 'existence') {
    // Alert only when transitioning from false -> true. Text changes do NOT trigger alert.
    changedForAlert = !baseline.hasElement && currentResult.hasElement;
    newBaseline = {
      hasElement: currentResult.hasElement,
      count: currentResult.hasElement ? 1 : 0,
      fullText: rawText,
      updatedAt: Date.now()
    };
  } else if (currentResult.mode === 'badge_count') {
    if (currentResult.status === 'match') {
      // Alert when count increases compared to previous baseline
      changedForAlert = currentResult.count > baseline.count;
      newBaseline = {
        hasElement: currentResult.hasElement,
        count: currentResult.count,
        fullText: rawText,
        updatedAt: Date.now()
      };
    } else {
      // no_match: count is 0, no alert, update baseline
      changedForAlert = false;
      newBaseline = {
        hasElement: false,
        count: 0,
        fullText: '',
        updatedAt: Date.now()
      };
    }
  } else if (currentResult.mode === 'text_content') {
    if (currentResult.status === 'match') {
      const trimmedFullText = rawText.trim();
      // Alert when trimmed text is not empty and differs from baseline full text
      changedForAlert = trimmedFullText !== '' && trimmedFullText !== baseline.fullText;
      newBaseline = {
        hasElement: currentResult.hasElement,
        count: 0,
        fullText: trimmedFullText,
        updatedAt: Date.now()
      };
    } else {
      // no_match: empty text, no alert, update baseline
      changedForAlert = false;
      newBaseline = {
        hasElement: false,
        count: 0,
        fullText: '',
        updatedAt: Date.now()
      };
    }
  }

  const state: XPathObservationState = {
    mode: currentResult.mode,
    hasElement: currentResult.hasElement,
    count: currentResult.count,
    text: currentResult.textPreview,
    changedForAlert,
    timestamp: Date.now()
  };

  return { state, newBaseline };
}

/**
 * Creates a visual highlight overlay on the target element for durationMs (default 1500 ms).
 * Marked with HIGHLIGHT_OVERLAY_CLASS to allow MutationObserver to ignore it.
 */
export function highlightElement(doc: Document, element: Element, durationMs = 1500): void {
  if (!element || typeof element.getBoundingClientRect !== 'function' || !doc.body) {
    return;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return;
  }

  const overlay = doc.createElement('div');
  overlay.className = HIGHLIGHT_OVERLAY_CLASS;
  overlay.style.position = 'fixed';
  overlay.style.top = `${Math.max(0, rect.top)}px`;
  overlay.style.left = `${Math.max(0, rect.left)}px`;
  overlay.style.width = `${Math.max(10, rect.width)}px`;
  overlay.style.height = `${Math.max(10, rect.height)}px`;
  overlay.style.border = '2px solid #2563eb';
  overlay.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '2147483647';
  overlay.style.borderRadius = '4px';
  overlay.style.transition = 'opacity 0.3s ease-out';

  try {
    doc.body.appendChild(overlay);
    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        try {
          overlay.remove();
        } catch {
          // ignore cleanup errors
        }
      }, 300);
    }, durationMs);
  } catch {
    // ignore DOM append errors
  }
}

export interface IPCSender {
  send(channel: string, payload: unknown): void;
}

/**
 * Runtime controller managing MutationObserver, debouncing, polling fallback,
 * baseline updates, and IPC dispatch.
 */
export class XPathObserverRuntime {
  private doc: Document;
  private ipcSender: IPCSender;
  private config: XPathConfig | null = null;
  private observer: MutationObserver | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pollIntervalTimer: NodeJS.Timeout | null = null;
  private baseline: XPathBaselineRecord = {
    hasElement: false,
    count: 0,
    fullText: '',
    updatedAt: 0
  };
  private lastStateSignature = '';
  private lastErrorSignature = '';

  constructor(doc: Document, ipcSender: IPCSender) {
    this.doc = doc;
    this.ipcSender = ipcSender;
  }

  public getBaseline(): XPathBaselineRecord {
    return { ...this.baseline };
  }

  public getConfig(): XPathConfig | null {
    return this.config ? { ...this.config } : null;
  }

  /**
   * Initializes or reconfigures the observer.
   * Cleans up any existing observer and timers, resets baseline,
   * and runs initial evaluation if selector is non-empty.
   */
  public init(newConfig: XPathConfig): void {
    this.cleanup();
    this.config = { ...newConfig };
    this.baseline = {
      hasElement: false,
      count: 0,
      fullText: '',
      updatedAt: 0
    };
    this.lastStateSignature = '';
    this.lastErrorSignature = '';

    const selector = (this.config.selector || '').trim();
    if (!selector) {
      return;
    }

    // Setup MutationObserver if available
    if (typeof MutationObserver !== 'undefined' && this.doc?.documentElement) {
      try {
        this.observer = new MutationObserver((mutations) => {
          // Check if all mutations are from highlight overlay
          const allHighlight = mutations.every((m) => {
            const target = m.target as HTMLElement;
            return (
              target?.classList?.contains(HIGHLIGHT_OVERLAY_CLASS) ||
              (m.addedNodes.length > 0 &&
                Array.from(m.addedNodes).every((n) =>
                  (n as HTMLElement)?.classList?.contains(HIGHLIGHT_OVERLAY_CLASS)
                ))
            );
          });

          if (allHighlight) {
            return;
          }

          this.scheduleDebouncedEvaluation(300);
        });

        this.observer.observe(this.doc.documentElement, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true
        });
      } catch (err: unknown) {
        console.warn('[ZaloWebView Preload] Lỗi khởi tạo MutationObserver:', err);
      }
    }

    // Setup Fallback Polling interval (1000..60000 ms, default 3000 ms)
    const intervalMs = Math.max(1000, Math.min(60000, this.config.pollIntervalMs || 3000));
    this.pollIntervalTimer = setInterval(() => {
      this.evaluateAndDispatch();
    }, intervalMs);

    // Initial evaluation sample
    this.evaluateAndDispatch();
  }

  /**
   * Schedules a debounced evaluation (300 ms default).
   */
  public scheduleDebouncedEvaluation(delayMs = 300): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.evaluateAndDispatch();
    }, delayMs);
  }

  /**
   * Evaluates current DOM with XPath and dispatches state or error via IPC.
   * State is sent only when changed (or on initial sample).
   */
  public evaluateAndDispatch(): void {
    if (!this.config) {
      return;
    }

    const selector = (this.config.selector || '').trim();
    if (!selector) {
      return;
    }

    const evalResult = evaluateXPath(this.doc, selector, this.config.mode);

    if (
      evalResult.status === 'invalid_selector' ||
      evalResult.status === 'invalid_data' ||
      evalResult.status === 'error'
    ) {
      const errorSig = `${evalResult.status}:${evalResult.error || ''}`;
      if (errorSig !== this.lastErrorSignature) {
        this.lastErrorSignature = errorSig;
        this.ipcSender.send('xpath:error', {
          type: evalResult.status,
          message: evalResult.error || '',
          selector,
          timestamp: Date.now()
        });
      }
      return;
    }

    // Valid evaluation (match or no_match)
    const { state, newBaseline } = compareWithBaseline(evalResult, this.baseline);
    this.baseline = newBaseline;

    const stateSig = `${state.mode}:${state.hasElement}:${state.count}:${state.text}:${state.changedForAlert}`;
    if (stateSig !== this.lastStateSignature) {
      this.lastStateSignature = stateSig;
      this.ipcSender.send('xpath:state', state);
    }
  }

  /**
   * Tests an XPath selector manually without altering active observer config or baseline.
   */
  public testXPath(selector: string, mode: XPathObservationMode): XPathEvaluationResult {
    const evalResult = evaluateXPath(this.doc, selector, mode);
    if (evalResult.hasElement && typeof (this.doc as unknown as { evaluate?: unknown }).evaluate === 'function') {
      try {
        const FIRST_ORDERED_NODE_TYPE = typeof XPathResult !== 'undefined'
          ? XPathResult.FIRST_ORDERED_NODE_TYPE
          : 9;
        const nodeRes = this.doc.evaluate(selector.trim(), this.doc, null, FIRST_ORDERED_NODE_TYPE, null);
        const node = nodeRes?.singleNodeValue as Element;
        if (node && node.nodeType === 1) { // ELEMENT_NODE
          highlightElement(this.doc, node, 1500);
        }
      } catch {
        // ignore highlight errors
      }
    }
    return evalResult;
  }

  /**
   * Cleans up observer and all pending timers.
   */
  public cleanup(): void {
    if (this.observer) {
      try {
        this.observer.disconnect();
      } catch {
        // ignore
      }
      this.observer = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.pollIntervalTimer) {
      clearInterval(this.pollIntervalTimer);
      this.pollIntervalTimer = null;
    }
  }
}
