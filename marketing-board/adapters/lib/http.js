import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;
const LOG_PATH = path.resolve('marketing-board', '.tokens', 'publish.log');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printable(value) {
  if (value == null) return '';
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}

export async function requestJson(url, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = 500,
    expectedStatuses,
    ...fetchOptions
  } = options;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
      const text = await response.text();
      const body = text ? safeJson(text) : null;
      const statusOk = expectedStatuses?.length ? expectedStatuses.includes(response.status) : response.ok;

      if (statusOk) {
        return { response, body, text };
      }

      const message = body?.error?.message || body?.error_description || body?.error || text || response.statusText;
      lastError = new Error(`HTTP ${response.status} ${message}`);
      lastError.status = response.status;
      lastError.body = body;

      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
      if (error.name !== 'AbortError' && attempt === retries) break;
    } finally {
      clearTimeout(timer);
    }

    if (attempt < retries) await wait(retryDelayMs * (attempt + 1));
  }

  throw lastError;
}

export async function requestRaw(url, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = 500,
    expectedStatuses,
    ...fetchOptions
  } = options;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
      const statusOk = expectedStatuses?.length ? expectedStatuses.includes(response.status) : response.ok;
      if (statusOk) return response;

      const text = await response.text().catch(() => '');
      lastError = new Error(`HTTP ${response.status} ${text || response.statusText}`);
      lastError.status = response.status;
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
      if (error.name !== 'AbortError' && attempt === retries) break;
    } finally {
      clearTimeout(timer);
    }

    if (attempt < retries) await wait(retryDelayMs * (attempt + 1));
  }

  throw lastError;
}

export async function logPublish(cardId, platform, status, permalinkOrError = '') {
  await mkdir(path.dirname(LOG_PATH), { recursive: true });
  const line = `${new Date().toISOString()} ${printable(cardId)} ${printable(platform)} ${printable(status)} ${printable(permalinkOrError)}\n`;
  await appendFile(LOG_PATH, line, 'utf8');
}

export function safeJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function asErrorMessage(error) {
  return error?.message || String(error);
}
