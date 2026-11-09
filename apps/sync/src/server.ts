import { closeServerWithin, createServer, listen } from './app';
import { ConfigError, loadConfig } from './config';

const logEvent = (event: Record<string, unknown>) =>
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...event })}\n`);

/** Process entry point: `npm run start -w @sc/sync`. */
async function main(): Promise<void> {
  const config = loadConfig();
  const server = await createServer(config);
  const port = await listen(server, config.port, config.host);
  logEvent({ event: 'listening', host: config.host, port, dataDir: config.dataDir });

  const shutdown = (signal: string) => {
    logEvent({ event: 'shutdown', signal });
    // Hard stop in case a connection or write hangs past the graceful window.
    setTimeout(() => process.exit(1), config.shutdownTimeoutMs * 2).unref();
    closeServerWithin(server, config.shutdownTimeoutMs).then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  // Configuration and lock problems are operator errors; print the message only.
  const message = error instanceof ConfigError || error instanceof Error ? error.message : String(error);
  process.stderr.write(`sync server failed to start: ${message}\n`);
  process.exit(1);
});
