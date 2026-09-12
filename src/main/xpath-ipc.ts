import {
  MAX_XPATH_SELECTOR_LENGTH,
  MAX_XPATH_TEXT_PREVIEW_LENGTH,
  XPathEvaluationResult,
  XPathEvaluationStatus,
  XPathObservationMode
} from '../shared/types';

const MODES: readonly XPathObservationMode[] = ['existence', 'badge_count', 'text_content'];
const STATUSES: readonly XPathEvaluationStatus[] = [
  'match',
  'no_match',
  'invalid_selector',
  'invalid_data',
  'error'
];
const MAX_IPC_ERROR_LENGTH = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMode(value: unknown): value is XPathObservationMode {
  return typeof value === 'string' && MODES.includes(value as XPathObservationMode);
}

export interface XPathErrorPayload {
  type: string;
  message: string;
  selector: string;
}

export function isValidXPathErrorPayload(value: unknown): value is XPathErrorPayload {
  if (!isRecord(value)) return false;
  return typeof value.type === 'string'
    && value.type.length > 0
    && value.type.length <= 64
    && typeof value.message === 'string'
    && value.message.length > 0
    && value.message.length <= MAX_IPC_ERROR_LENGTH
    && typeof value.selector === 'string'
    && value.selector.length <= MAX_XPATH_SELECTOR_LENGTH;
}

export function isValidXPathEvaluationResult(value: unknown): value is XPathEvaluationResult {
  if (!isRecord(value)) return false;
  if (typeof value.status !== 'string' || !STATUSES.includes(value.status as XPathEvaluationStatus)) return false;
  if (typeof value.selector !== 'string' || value.selector.length > MAX_XPATH_SELECTOR_LENGTH) return false;
  if (!isMode(value.mode)) return false;
  if (typeof value.hasElement !== 'boolean') return false;
  if (!Number.isSafeInteger(value.count) || (value.count as number) < 0) return false;
  if (typeof value.textPreview !== 'string' || value.textPreview.length > MAX_XPATH_TEXT_PREVIEW_LENGTH) return false;
  if (typeof value.executionTimeMs !== 'number' || !Number.isFinite(value.executionTimeMs) || value.executionTimeMs < 0) {
    return false;
  }
  if (value.error !== undefined && (typeof value.error !== 'string' || value.error.length > MAX_IPC_ERROR_LENGTH)) {
    return false;
  }
  return true;
}

export interface XPathTestResultPayload {
  requestId: string;
  success: boolean;
  result?: XPathEvaluationResult;
  error?: string;
}

export function isValidXPathTestResultPayload(value: unknown): value is XPathTestResultPayload {
  if (!isRecord(value)) return false;
  if (typeof value.requestId !== 'string' || value.requestId.length === 0 || value.requestId.length > 128) return false;
  if (typeof value.success !== 'boolean') return false;
  if (value.result !== undefined && !isValidXPathEvaluationResult(value.result)) return false;
  if (value.error !== undefined && (typeof value.error !== 'string' || value.error.length > MAX_IPC_ERROR_LENGTH)) {
    return false;
  }

  if (value.success) {
    return isRecord(value.result) && (value.result.status === 'match' || value.result.status === 'no_match');
  }

  return value.result !== undefined || (typeof value.error === 'string' && value.error.length > 0);
}
