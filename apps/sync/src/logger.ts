/** One structured log line per request. Fields are metadata only: never tokens, headers or record bodies. */
export interface RequestLog {
  time: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  /** Client address, when known. */
  remote?: string;
  /** Record counts for sync calls. */
  recordsIn?: number;
  recordsOut?: number;
  /** Pushed records whose timestamps were clamped to server time. */
  clamped?: number;
  /** True when the client was told to resync. */
  resync?: boolean;
  /** Short machine readable reason for a failure. */
  error?: string;
}

export type Logger = (entry: RequestLog) => void;

export const jsonLineLogger: Logger = (entry) => {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
};

export const silentLogger: Logger = () => undefined;

/** Lifecycle events such as a regenerated server id. Never carries tokens or record contents. */
export interface ServerEvent {
  time: string;
  event: string;
  serverId?: string;
}

export type EventLogger = (event: ServerEvent) => void;

export const jsonEventLogger: EventLogger = (event) => {
  process.stdout.write(`${JSON.stringify(event)}\n`);
};
