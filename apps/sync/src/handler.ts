import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { isAuthorized } from './auth';
import type { ServerConfig } from './config';
import { StateLimitError } from './limits';
import {
  HttpError,
  PREFLIGHT_HEADERS,
  STATUS,
  corsHeaders,
  parseJsonBody,
  readBody,
  sendJson,
  stateLimitHttpError,
} from './http';
import type { Logger, RequestLog } from './logger';
import type { SyncService } from './service';
import { validateSyncRequest } from './validate';

export interface HandlerDeps {
  config: Pick<ServerConfig, 'token' | 'allowOrigins' | 'maxBodyBytes'>;
  service: SyncService;
  logger: Logger;
}

interface Outcome {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Answer to a CORS preflight; policy headers are added only for allowed origins. */
  preflight?: boolean;
  recordsIn?: number;
  recordsOut?: number;
  clamped?: number;
  resync?: boolean;
}

const countRecords = (changes: Partial<Record<string, unknown[]>>): number =>
  Object.values(changes).reduce((total, list) => total + (list?.length ?? 0), 0);

async function handleSync(req: IncomingMessage, deps: HandlerDeps): Promise<Outcome> {
  if (!isAuthorized(req.headers.authorization, deps.config.token)) {
    throw new HttpError(STATUS.unauthorized, 'unauthorized', 'Missing or invalid bearer token', {
      'WWW-Authenticate': 'Bearer',
    });
  }
  const body = await readBody(req, deps.config.maxBodyBytes);
  const parsed = validateSyncRequest(parseJsonBody(body, req.headers['content-type']));
  if (!parsed.ok) throw new HttpError(STATUS.badRequest, 'invalid_request', parsed.error);

  const { response, clamped } = await deps.service.sync(parsed.value);
  return {
    status: STATUS.ok,
    body: response,
    recordsIn: countRecords(parsed.value.changes),
    recordsOut: countRecords(response.changes),
    clamped,
    resync: response.resync,
  };
}

type Route = (req: IncomingMessage, deps: HandlerDeps) => Promise<Outcome>;

const ROUTES: Record<string, Partial<Record<string, Route>>> = {
  '/health': { GET: async (_req, deps) => ({ status: STATUS.ok, body: { status: 'ok', serverId: deps.service.serverId } }) },
  '/sync': { POST: handleSync },
};

function pathnameOf(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname;
  } catch {
    throw new HttpError(STATUS.badRequest, 'invalid_url', 'Malformed request URL');
  }
}

async function dispatch(req: IncomingMessage, pathname: string, deps: HandlerDeps): Promise<Outcome> {
  const methods = ROUTES[pathname];
  if (!methods) throw new HttpError(STATUS.notFound, 'not_found', 'No such route');
  if (req.method === 'OPTIONS') return { status: STATUS.noContent, preflight: true };
  const route = methods[req.method ?? ''];
  if (!route) {
    const allow = [...Object.keys(methods), 'OPTIONS'].join(', ');
    throw new HttpError(STATUS.methodNotAllowed, 'method_not_allowed', 'Method not allowed', { Allow: allow });
  }
  return route(req, deps);
}

function toOutcome(error: unknown): Outcome & { errorCode: string } {
  const httpError = error instanceof StateLimitError ? stateLimitHttpError(error) : error;
  if (httpError instanceof HttpError) {
    return {
      status: httpError.status,
      body: httpError.body,
      headers: httpError.headers,
      errorCode: httpError.code,
    };
  }
  // Anything else is a bug or an I/O failure: tell the client nothing specific.
  return {
    status: STATUS.internal,
    body: { error: { code: 'internal', message: 'Internal server error' } },
    errorCode: error instanceof Error ? `internal:${error.name}` : 'internal',
  };
}

/** Build the request listener. It has no side effects until a request arrives, so tests can drive it directly. */
export function createHandler(deps: HandlerDeps): RequestListener {
  return (req: IncomingMessage, res: ServerResponse) => {
    const started = performance.now();
    let pathname = '/';
    let outcome: Outcome & { errorCode?: string };

    const run = async () => {
      try {
        pathname = pathnameOf(req);
        outcome = await dispatch(req, pathname, deps);
      } catch (error) {
        outcome = toOutcome(error);
      }
      const cors = corsHeaders(req.headers.origin, deps.config.allowOrigins);
      const preflight = outcome.preflight && cors['Access-Control-Allow-Origin'] ? PREFLIGHT_HEADERS : {};
      const headers: Record<string, string> = { ...cors, ...preflight, ...outcome.headers };
      if (outcome.status === STATUS.payloadTooLarge) {
        // Stop the client from sending the rest of an oversized body.
        headers.Connection = 'close';
        res.once('finish', () => req.destroy());
      }
      sendJson(res, outcome.status, outcome.body, headers);
      const entry: RequestLog = {
        time: new Date().toISOString(),
        method: req.method ?? '',
        path: pathname,
        status: outcome.status,
        durationMs: Math.round(performance.now() - started),
        remote: req.socket.remoteAddress,
        recordsIn: outcome.recordsIn,
        recordsOut: outcome.recordsOut,
        clamped: outcome.clamped || undefined,
        resync: outcome.resync || undefined,
        error: outcome.errorCode,
      };
      deps.logger(entry);
    };
    run().catch(() => res.destroy());
  };
}
