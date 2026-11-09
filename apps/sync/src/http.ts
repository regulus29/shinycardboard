import type { IncomingMessage, ServerResponse } from 'node:http';
import { StateLimitError } from './limits';

/** An error that maps to a specific HTTP response. Messages are safe to show clients. */
export class HttpError extends Error {
  /** Response body. Defaults to the standard `{error:{code,message}}` shape. */
  readonly body: unknown;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
    body?: unknown,
  ) {
    super(message);
    this.body = body ?? { error: { code, message } };
  }
}

/** A state cap violation answers 413 with its own flat body shape. */
export function stateLimitHttpError(error: StateLimitError): HttpError {
  const body = { error: 'state_limit', message: error.message };
  return new HttpError(STATUS.payloadTooLarge, 'state_limit', error.message, {}, body);
}

export const STATUS = {
  ok: 200,
  noContent: 204,
  badRequest: 400,
  unauthorized: 401,
  notFound: 404,
  methodNotAllowed: 405,
  payloadTooLarge: 413,
  unsupportedMediaType: 415,
  internal: 500,
} as const;

const JSON_CONTENT_TYPE = /^application\/json\s*(;|$)/i;

/** Collect the request body, refusing anything over `limit` bytes without buffering it. */
export function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const tooLarge = () => new HttpError(STATUS.payloadTooLarge, 'payload_too_large', `Body exceeds ${limit} bytes`);
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) return Promise.reject(tooLarge());

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        settled = true;
        chunks.length = 0;
        reject(tooLarge());
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (!settled) resolve(Buffer.concat(chunks));
    });
    req.on('error', (error) => {
      if (!settled) reject(error);
    });
  });
}

export function parseJsonBody(body: Buffer, contentType: string | undefined): unknown {
  if (!contentType || !JSON_CONTENT_TYPE.test(contentType)) {
    throw new HttpError(STATUS.unsupportedMediaType, 'unsupported_media_type', 'Content-Type must be application/json');
  }
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new HttpError(STATUS.badRequest, 'invalid_json', 'Body is not valid JSON');
  }
}

/**
 * CORS headers. Only listed origins (or '*') get Access-Control-Allow-Origin. With a list in force,
 * Vary: Origin is always sent so caches never serve one origin's answer to another.
 */
export function corsHeaders(origin: string | undefined, allowOrigins: readonly string[]): Record<string, string> {
  if (allowOrigins.includes('*')) return { 'Access-Control-Allow-Origin': '*' };
  if (allowOrigins.length === 0) return {};
  if (origin && allowOrigins.includes(origin)) return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  return { Vary: 'Origin' };
}

export const PREFLIGHT_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '600',
} as const;

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const payload = status === STATUS.noContent ? '' : JSON.stringify(body);
  res.writeHead(status, {
    ...BASE_HEADERS,
    ...headers,
    ...(payload ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) } : {}),
  });
  res.end(payload);
}
