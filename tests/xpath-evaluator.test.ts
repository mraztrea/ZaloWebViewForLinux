import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseBadgeCount,
  evaluateXPath,
  compareWithBaseline,
  highlightElement,
  HIGHLIGHT_OVERLAY_CLASS,
  XPathObserverRuntime
} from '../src/preload/xpath-evaluator';
import {
  XPathBaselineRecord,
  XPathEvaluationResult,
  DEFAULT_ZALO_UNREAD_BADGE_XPATH
} from '../src/shared/types';

// Mock standard XPathResult if not in browser environment
const XPathResultMock = {
  ANY_TYPE: 0,
  NUMBER_TYPE: 1,
  STRING_TYPE: 2,
  BOOLEAN_TYPE: 3,
  UNORDERED_NODE_ITERATOR_TYPE: 4,
  ORDERED_NODE_ITERATOR_TYPE: 5,
  UNORDERED_NODE_SNAPSHOT_TYPE: 6,
  ORDERED_NODE_SNAPSHOT_TYPE: 7,
  ANY_UNORDERED_NODE_TYPE: 8,
  FIRST_ORDERED_NODE_TYPE: 9
};

(globalThis as unknown as { XPathResult: typeof XPathResultMock }).XPathResult = XPathResultMock;

describe('parseBadgeCount', () => {
  it('parses valid non-negative integers correctly', () => {
    expect(parseBadgeCount('3')).toEqual({ count: 3, isValid: true });
    expect(parseBadgeCount('0')).toEqual({ count: 0, isValid: true });
    expect(parseBadgeCount('100')).toEqual({ count: 100, isValid: true });
    expect(parseBadgeCount('  42  ')).toEqual({ count: 42, isValid: true });
  });

  it('parses integer with plus suffix (e.g. 99+ -> 99)', () => {
    expect(parseBadgeCount('99+')).toEqual({ count: 99, isValid: true });
    expect(parseBadgeCount('10+')).toEqual({ count: 10, isValid: true });
    expect(parseBadgeCount('  5+ ')).toEqual({ count: 5, isValid: true });
  });

  it('rejects invalid text and decimals without guessing 1', () => {
    expect(parseBadgeCount('abc')).toEqual({ count: 0, isValid: false });
    expect(parseBadgeCount('-1')).toEqual({ count: 0, isValid: false });
    expect(parseBadgeCount('1.5')).toEqual({ count: 0, isValid: false });
    expect(parseBadgeCount('')).toEqual({ count: 0, isValid: false });
    expect(parseBadgeCount('   ')).toEqual({ count: 0, isValid: false });
    expect(parseBadgeCount('99++')).toEqual({ count: 0, isValid: false });
    expect(parseBadgeCount('+5')).toEqual({ count: 0, isValid: false });
  });

  it('rejects numbers exceeding MAX_SAFE_INTEGER', () => {
    const tooLarge = '999999999999999999999999999999';
    expect(parseBadgeCount(tooLarge)).toEqual({ count: 0, isValid: false });
  });
});

describe('evaluateXPath', () => {
  function createMockDocument(evaluateFn: (selector: string) => unknown): Document {
    return {
      evaluate: evaluateFn
    } as unknown as Document;
  }

  it('handles empty or whitespace-only selector by disabling observation', () => {
    const doc = createMockDocument(() => {
      throw new Error('Should not be called for empty selector');
    });

    const result = evaluateXPath(doc, '', 'badge_count');
    expect(result.status).toBe('no_match');
    expect(result.hasElement).toBe(false);
    expect(result.count).toBe(0);

    const resultSpace = evaluateXPath(doc, '   ', 'existence');
    expect(resultSpace.status).toBe('no_match');
  });

  it('catches XPath syntax errors as invalid_selector', () => {
    const doc = createMockDocument(() => {
      throw new Error('SyntaxError: The expression is not a legal expression.');
    });

    const result = evaluateXPath(doc, '//[invalid', 'badge_count');
    expect(result.status).toBe('invalid_selector');
    expect(result.hasElement).toBe(false);
    expect(result.error).toContain('INVALID_SELECTOR');
  });

  it('rejects scalar result types as invalid_selector', () => {
    const doc = createMockDocument(() => ({
      resultType: XPathResultMock.NUMBER_TYPE,
      singleNodeValue: null
    }));

    const result = evaluateXPath(doc, 'count(//div)', 'badge_count');
    expect(result.status).toBe('invalid_selector');
    expect(result.error).toContain('kết quả vô hướng (scalar)');
  });

  it('returns no_match when node is null', () => {
    const doc = createMockDocument(() => ({
      resultType: XPathResultMock.FIRST_ORDERED_NODE_TYPE,
      singleNodeValue: null
    }));

    const result = evaluateXPath(doc, '//div[@id="missing"]', 'badge_count');
    expect(result.status).toBe('no_match');
    expect(result.hasElement).toBe(false);
    expect(result.count).toBe(0);
  });

  it('evaluates existence mode correctly', () => {
    const mockNode = { textContent: 'Tab content' };
    const doc = createMockDocument(() => ({
      resultType: XPathResultMock.FIRST_ORDERED_NODE_TYPE,
      singleNodeValue: mockNode
    }));

    const result = evaluateXPath(doc, '//div[@class="active"]', 'existence');
    expect(result.status).toBe('match');
    expect(result.hasElement).toBe(true);
    expect(result.count).toBe(1);
    expect(result.textPreview).toBe('Tab content');
  });

  it('matches the Zalo unread badge with an existence XPath', () => {
    let requestedSelector = '';
    const doc = createMockDocument((selector) => {
      requestedSelector = selector;
      return {
        resultType: XPathResultMock.FIRST_ORDERED_NODE_TYPE,
        singleNodeValue: { textContent: '' }
      };
    });

    const result = evaluateXPath(doc, DEFAULT_ZALO_UNREAD_BADGE_XPATH, 'existence');

    expect(requestedSelector).toContain('leftbar-unread-badge');
    expect(result.status).toBe('match');
    expect(result.hasElement).toBe(true);
    expect(result.count).toBe(1);
  });

  it('evaluates badge_count mode correctly for valid numbers', () => {
    const mockNode = { textContent: ' 99+ ' };
    const doc = createMockDocument(() => ({
      resultType: XPathResultMock.FIRST_ORDERED_NODE_TYPE,
      singleNodeValue: mockNode
    }));

    const result = evaluateXPath(doc, '//span[@class="badge"]', 'badge_count');
    expect(result.status).toBe('match');
    expect(result.hasElement).toBe(true);
    expect(result.count).toBe(99);
    expect(result.textPreview).toBe('99+');
  });

  it('evaluates badge_count mode as invalid_data for non-numeric content', () => {
    const mockNode = { textContent: 'New messages' };
    const doc = createMockDocument(() => ({
      resultType: XPathResultMock.FIRST_ORDERED_NODE_TYPE,
      singleNodeValue: mockNode
    }));

    const result = evaluateXPath(doc, '//span[@class="badge"]', 'badge_count');
    expect(result.status).toBe('invalid_data');
    expect(result.hasElement).toBe(true);
    expect(result.count).toBe(0);
    expect(result.error).toContain('INVALID_DATA');
  });

  it('evaluates text_content mode and trims preview', () => {
    const mockNode = { textContent: '  User typed a message   ' };
    const doc = createMockDocument(() => ({
      resultType: XPathResultMock.FIRST_ORDERED_NODE_TYPE,
      singleNodeValue: mockNode
    }));

    const result = evaluateXPath(doc, '//div[@class="last-msg"]', 'text_content');
    expect(result.status).toBe('match');
    expect(result.hasElement).toBe(true);
    expect(result.textPreview).toBe('User typed a message');
  });
});

describe('compareWithBaseline', () => {
  const initialEmptyBaseline: XPathBaselineRecord = {
    hasElement: false,
    count: 0,
    fullText: '',
    updatedAt: 0
  };

  describe('existence mode', () => {
    it('triggers alert on false -> true transition', () => {
      const matchResult: XPathEvaluationResult = {
        status: 'match',
        selector: '//div',
        mode: 'existence',
        hasElement: true,
        count: 1,
        textPreview: 'Initial text',
        executionTimeMs: 1
      };

      const { state, newBaseline } = compareWithBaseline(matchResult, initialEmptyBaseline);
      expect(state.changedForAlert).toBe(true);
      expect(newBaseline.hasElement).toBe(true);
      expect(newBaseline.count).toBe(1);
    });

    it('does NOT trigger alert when text changes while node remains present', () => {
      const existingBaseline: XPathBaselineRecord = {
        hasElement: true,
        count: 1,
        fullText: 'Old text',
        updatedAt: 1000
      };

      const matchResult: XPathEvaluationResult = {
        status: 'match',
        selector: '//div',
        mode: 'existence',
        hasElement: true,
        count: 1,
        textPreview: 'New text',
        executionTimeMs: 1
      };

      const { state, newBaseline } = compareWithBaseline(matchResult, existingBaseline);
      expect(state.changedForAlert).toBe(false);
      expect(newBaseline.hasElement).toBe(true);
    });

    it('updates baseline without alert when node disappears', () => {
      const existingBaseline: XPathBaselineRecord = {
        hasElement: true,
        count: 1,
        fullText: 'Old text',
        updatedAt: 1000
      };

      const noMatchResult: XPathEvaluationResult = {
        status: 'no_match',
        selector: '//div',
        mode: 'existence',
        hasElement: false,
        count: 0,
        textPreview: '',
        executionTimeMs: 1
      };

      const { state, newBaseline } = compareWithBaseline(noMatchResult, existingBaseline);
      expect(state.changedForAlert).toBe(false);
      expect(newBaseline.hasElement).toBe(false);
      expect(newBaseline.count).toBe(0);
    });
  });

  describe('badge_count mode: sequence 5 -> 3 -> 4', () => {
    it('accurately tracks count sequence 5 -> 3 -> 4, only alerting on increase', () => {
      // Step 1: Initial alert on count = 5
      const res5: XPathEvaluationResult = {
        status: 'match',
        selector: '//badge',
        mode: 'badge_count',
        hasElement: true,
        count: 5,
        textPreview: '5',
        executionTimeMs: 1
      };
      const step1 = compareWithBaseline(res5, initialEmptyBaseline);
      expect(step1.state.changedForAlert).toBe(true);
      expect(step1.newBaseline.count).toBe(5);

      // Step 2: User reads messages, count decreases to 3
      const res3: XPathEvaluationResult = {
        status: 'match',
        selector: '//badge',
        mode: 'badge_count',
        hasElement: true,
        count: 3,
        textPreview: '3',
        executionTimeMs: 1
      };
      const step2 = compareWithBaseline(res3, step1.newBaseline);
      expect(step2.state.changedForAlert).toBe(false); // NO alert on decrease!
      expect(step2.newBaseline.count).toBe(3); // Baseline updated to 3!

      // Step 3: New message arrives, count increases to 4
      const res4: XPathEvaluationResult = {
        status: 'match',
        selector: '//badge',
        mode: 'badge_count',
        hasElement: true,
        count: 4,
        textPreview: '4',
        executionTimeMs: 1
      };
      const step3 = compareWithBaseline(res4, step2.newBaseline);
      expect(step3.state.changedForAlert).toBe(true); // Alert triggered for 3 -> 4!
      expect(step3.newBaseline.count).toBe(4);
    });

    it('handles count drop to zero/no_match and updates baseline', () => {
      const baselineAt4: XPathBaselineRecord = {
        hasElement: true,
        count: 4,
        fullText: '4',
        updatedAt: 1000
      };

      const noMatch: XPathEvaluationResult = {
        status: 'no_match',
        selector: '//badge',
        mode: 'badge_count',
        hasElement: false,
        count: 0,
        textPreview: '',
        executionTimeMs: 1
      };

      const { state, newBaseline } = compareWithBaseline(noMatch, baselineAt4);
      expect(state.changedForAlert).toBe(false);
      expect(newBaseline.count).toBe(0);
      expect(newBaseline.hasElement).toBe(false);
    });

    it('does not alter baseline on evaluation errors', () => {
      const baselineAt5: XPathBaselineRecord = {
        hasElement: true,
        count: 5,
        fullText: '5',
        updatedAt: 1000
      };

      const invalidDataResult: XPathEvaluationResult = {
        status: 'invalid_data',
        selector: '//badge',
        mode: 'badge_count',
        hasElement: true,
        count: 0,
        textPreview: 'invalid',
        error: 'INVALID_DATA',
        executionTimeMs: 1
      };

      const { state, newBaseline } = compareWithBaseline(invalidDataResult, baselineAt5);
      expect(state.changedForAlert).toBe(false);
      expect(newBaseline.count).toBe(5); // Preserved!
    });
  });

  describe('text_content mode', () => {
    it('alerts when text changes and is not empty', () => {
      const resA: XPathEvaluationResult = {
        status: 'match',
        selector: '//div',
        mode: 'text_content',
        hasElement: true,
        count: 0,
        textPreview: 'Hello',
        executionTimeMs: 1
      };

      const step1 = compareWithBaseline(resA, initialEmptyBaseline);
      expect(step1.state.changedForAlert).toBe(true);
      expect(step1.newBaseline.fullText).toBe('Hello');

      const resB: XPathEvaluationResult = {
        status: 'match',
        selector: '//div',
        mode: 'text_content',
        hasElement: true,
        count: 0,
        textPreview: 'World',
        executionTimeMs: 1
      };

      const step2 = compareWithBaseline(resB, step1.newBaseline);
      expect(step2.state.changedForAlert).toBe(true);
      expect(step2.newBaseline.fullText).toBe('World');
    });

    it('does not alert when text is empty string', () => {
      const resEmpty: XPathEvaluationResult = {
        status: 'match',
        selector: '//div',
        mode: 'text_content',
        hasElement: true,
        count: 0,
        textPreview: '   ',
        executionTimeMs: 1
      };

      const step = compareWithBaseline(resEmpty, initialEmptyBaseline);
      expect(step.state.changedForAlert).toBe(false);
    });

    it('compares full text beyond 500 characters', () => {
      const prefix = 'a'.repeat(500);
      const text1 = prefix + 'X';
      const text2 = prefix + 'Y';

      const baseline1: XPathBaselineRecord = {
        hasElement: true,
        count: 0,
        fullText: text1,
        updatedAt: 1000
      };

      // Both text1 and text2 have the exact same 500-char preview
      const preview = prefix;
      const res2 = {
        status: 'match' as const,
        selector: '//div',
        mode: 'text_content' as const,
        hasElement: true,
        count: 0,
        textPreview: preview,
        rawFullText: text2,
        executionTimeMs: 1
      };

      const { state, newBaseline } = compareWithBaseline(res2, baseline1);
      expect(state.changedForAlert).toBe(true);
      expect(newBaseline.fullText).toBe(text2);
    });
  });
});

describe('highlightElement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('creates and appends overlay element with HIGHLIGHT_OVERLAY_CLASS', () => {
    const appendedElements: unknown[] = [];
    const mockElement = {
      getBoundingClientRect: () => ({ top: 10, left: 20, width: 100, height: 40 })
    } as unknown as Element;

    const mockDoc = {
      body: {
        appendChild: (el: unknown) => {
          appendedElements.push(el);
        }
      },
      createElement: () => {
        const div: Record<string, unknown> = {
          style: {},
          remove: vi.fn()
        };
        return div;
      }
    } as unknown as Document;

    highlightElement(mockDoc, mockElement, 1500);
    expect(appendedElements.length).toBe(1);
    const overlay = appendedElements[0] as Record<string, unknown>;
    expect(overlay.className).toBe(HIGHLIGHT_OVERLAY_CLASS);
  });
});

describe('XPathObserverRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function createMockDocumentWithNode(textContent: string): Document {
    const mockNode = { textContent, nodeType: 1 };
    return {
      documentElement: {},
      body: { appendChild: vi.fn() },
      evaluate: () => ({
        resultType: XPathResultMock.FIRST_ORDERED_NODE_TYPE,
        singleNodeValue: mockNode
      })
    } as unknown as Document;
  }

  it('initializes and dispatches initial sample via IPC', () => {
    const doc = createMockDocumentWithNode('5');
    const sentEvents: Array<{ channel: string; payload: unknown }> = [];
    const ipcSender = {
      send: (channel: string, payload: unknown) => {
        sentEvents.push({ channel, payload });
      }
    };

    const runtime = new XPathObserverRuntime(doc, ipcSender);
    runtime.init({
      selector: '//span[@class="count"]',
      mode: 'badge_count',
      pollIntervalMs: 3000
    });

    expect(sentEvents.length).toBe(1);
    expect(sentEvents[0].channel).toBe('xpath:state');
    const state = sentEvents[0].payload as { count: number; changedForAlert: boolean };
    expect(state.count).toBe(5);
    expect(state.changedForAlert).toBe(true);

    runtime.cleanup();
  });

  it('disables observer and timers when selector is empty', () => {
    const doc = createMockDocumentWithNode('5');
    const sentEvents: Array<{ channel: string; payload: unknown }> = [];
    const ipcSender = {
      send: (channel: string, payload: unknown) => {
        sentEvents.push({ channel, payload });
      }
    };

    const runtime = new XPathObserverRuntime(doc, ipcSender);
    runtime.init({
      selector: '',
      mode: 'badge_count',
      pollIntervalMs: 3000
    });

    expect(sentEvents.length).toBe(0);
    expect(runtime.getConfig()?.selector).toBe('');
  });

  it('debounces rapid evaluations to 300 ms', () => {
    let currentText = '1';
    const doc = {
      documentElement: {},
      body: { appendChild: vi.fn() },
      evaluate: () => ({
        resultType: XPathResultMock.FIRST_ORDERED_NODE_TYPE,
        singleNodeValue: { textContent: currentText, nodeType: 1 }
      })
    } as unknown as Document;

    const sentEvents: Array<{ channel: string; payload: unknown }> = [];
    const ipcSender = {
      send: (channel: string, payload: unknown) => {
        sentEvents.push({ channel, payload });
      }
    };

    const runtime = new XPathObserverRuntime(doc, ipcSender);
    runtime.init({
      selector: '//badge',
      mode: 'badge_count',
      pollIntervalMs: 10000
    });

    // 1 initial event
    expect(sentEvents.length).toBe(1);

    // Rapid schedule calls
    currentText = '2';
    runtime.scheduleDebouncedEvaluation(300);
    vi.advanceTimersByTime(100);

    currentText = '3';
    runtime.scheduleDebouncedEvaluation(300);
    vi.advanceTimersByTime(100);

    currentText = '4';
    runtime.scheduleDebouncedEvaluation(300);
    vi.advanceTimersByTime(299);

    // Still not fired
    expect(sentEvents.length).toBe(1);

    // Advance remaining 1ms
    vi.advanceTimersByTime(1);
    expect(sentEvents.length).toBe(2);
    const lastState = sentEvents[1].payload as { count: number };
    expect(lastState.count).toBe(4);

    runtime.cleanup();
  });

  it('testXPath does not alter active baseline', () => {
    const doc = createMockDocumentWithNode('10');
    const sentEvents: Array<{ channel: string; payload: unknown }> = [];
    const ipcSender = {
      send: (channel: string, payload: unknown) => {
        sentEvents.push({ channel, payload });
      }
    };

    const runtime = new XPathObserverRuntime(doc, ipcSender);
    runtime.init({
      selector: '//count',
      mode: 'badge_count',
      pollIntervalMs: 5000
    });

    const baselineBefore = runtime.getBaseline();
    expect(baselineBefore.count).toBe(10);

    // Test a different selector manually
    const testResult = runtime.testXPath('//test', 'existence');
    expect(testResult.status).toBe('match');

    // Baseline remains 10!
    const baselineAfter = runtime.getBaseline();
    expect(baselineAfter.count).toBe(10);

    runtime.cleanup();
  });
});
