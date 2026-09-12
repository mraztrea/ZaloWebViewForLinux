import { describe, expect, it } from 'vitest';
import {
  isValidXPathErrorPayload,
  isValidXPathTestResultPayload
} from '../src/main/xpath-ipc';

describe('XPath IPC payload validation', () => {
  it('accepts a valid error payload and rejects malformed values', () => {
    expect(isValidXPathErrorPayload({
      type: 'invalid_selector',
      message: 'Cú pháp XPath không hợp lệ.',
      selector: '//['
    })).toBe(true);
    expect(isValidXPathErrorPayload(null)).toBe(false);
    expect(isValidXPathErrorPayload({ type: 'error', message: '', selector: '//div' })).toBe(false);
    expect(isValidXPathErrorPayload({
      type: 'error',
      message: 'x',
      selector: 'x'.repeat(1001)
    })).toBe(false);
  });

  it('validates test results before they cross into main state', () => {
    expect(isValidXPathTestResultPayload({
      requestId: 'request-1',
      success: true,
      result: {
        status: 'match',
        selector: '//div',
        mode: 'existence',
        hasElement: true,
        count: 1,
        textPreview: 'Có tin mới',
        executionTimeMs: 2
      }
    })).toBe(true);
    expect(isValidXPathTestResultPayload({
      requestId: 'request-1',
      success: true,
      result: {
        status: 'match',
        selector: '//div',
        mode: 'existence',
        hasElement: true,
        count: -1,
        textPreview: '',
        executionTimeMs: 2
      }
    })).toBe(false);
    expect(isValidXPathTestResultPayload({
      requestId: 'request-1',
      success: false,
      error: 'TIMEOUT: hết thời gian'
    })).toBe(true);
    expect(isValidXPathTestResultPayload({
      requestId: 'request-1',
      success: true,
      result: {
        status: 'match',
        selector: '//div',
        mode: 'existence',
        hasElement: true,
        count: 1,
        textPreview: 'x'.repeat(501),
        executionTimeMs: 2
      }
    })).toBe(false);
  });
});
