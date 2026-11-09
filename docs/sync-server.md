## Sync server operator notes

`@sc/sync` is a small dependency free Node HTTP server (node:http, node:fs/promises) that keeps one JSON snapshot of a single user's synced records. It merges with the shared logic in `@sc/core` (last write wins per record, tombstones for deletes).

## Run it

    export SYNC_TOKEN="$(openssl rand -hex 24)"
    npm run start -w @sc/sync

The server refuses to start without `SYNC_TOKEN` (and refuses tokens shorter than 16 characters). Node 20 or newer is required.

## Environment variables

- `SYNC_TOKEN` (required): shared secret. Clients send `Authorization: Bearer <token>`. It is compared in constant time and never logged.
- `PORT` (default `8787`): listen port.
- `HOST` (default `127.0.0.1`): bind address. Use `0.0.0.0` only inside a container or when a firewall protects the port.
- `SYNC_DATA_DIR` (default `./data/sync`): directory for `state.json` and `server.lock`. Created if missing. Back this directory up.
- `SYNC_ALLOW_ORIGIN` (default empty, CORS off): comma separated list of allowed browser origins, for example `https://cards.example.com`, or `*` for any origin.
- `SYNC_MAX_BODY_BYTES` (default `5242880`): maximum request body. Larger bodies get `413`.
- `SYNC_TOMBSTONE_DAYS` (default `90`): how long delete markers are kept, counted from the moment the server received them.
- `SYNC_MAX_CLOCK_SKEW_MS` (default `300000`): records stamped further than this ahead of server time are clamped to server time.
- `SYNC_REQUEST_TIMEOUT_MS` (default `30000`): per request timeout.
- `SYNC_SHUTDOWN_TIMEOUT_MS` (default `10000`): on SIGINT or SIGTERM the server stops accepting work and waits this long for in-flight requests, then cuts connections. The process always exits within twice this value.

Invalid numeric values stop startup with an explanation instead of silently falling back.

## HTTP API

- `GET /health`: no auth. Returns `{"status":"ok","serverId":"..."}`.
- `POST /sync`: bearer auth, `Content-Type: application/json`. Body is a `SyncRequest` (`since` plus `changes` per collection: `owned`, `taggings`, `decks`, `savedSearches`). Returns a `SyncResponse` (`changes`, `serverTime`, `serverId`, `resync`).
- `OPTIONS` on either path: CORS preflight, always answered with `204`. The `Access-Control-Allow-*` policy headers are included only when the request origin is allowed.

Status codes: `400` invalid JSON, request shape, out of range values or hostile nesting, `401` bad or missing token, `404` unknown path, `405` wrong method (with `Allow`), `413` body too large, `415` not JSON, `500` unexpected failure (logged by error name only, never sent to the client).

Error bodies look like `{"error":{"code":"invalid_request","message":"..."}}`.

When `SYNC_ALLOW_ORIGIN` lists specific origins, every response carries `Vary: Origin`, and `Access-Control-Allow-Origin` is echoed only for listed origins. With `*` the header is `*` and no `Vary` is sent. With CORS off no CORS headers are sent.

## Protocol for clients

- `serverId`: random id created with the data set and persisted in `state.json`. Store `{url, serverId}`. If a response carries a different `serverId` than the one stored (new empty server, restored backup, switched URL), reset: use `since = 0` and push every local record, so nothing silently diverges.
- `serverTime`: store it from each successful response and send it as `since` next time. Use `0` for the first sync. It strictly increases with every request, even if the server clock stalls or steps back, so two devices syncing in the same millisecond never hide each other's changes.
- `resync: true`: the server pruned delete markers newer than your `since`, so you may still hold rows that were deleted on another device. The response carries the server's full state. Merge it, then set `since = 0` and push your full local state on the next sync so no offline edits are lost. The trade-off: a row deleted elsewhere more than the retention period ago can reappear. Clients that sync at least once per retention period (default 90 days) never see this.
- Pushed records the server changed come back in the response: a record that lost to a newer server copy, or whose `updatedAt` was clamped (see below). Treat a returned record for an id you just pushed as the server's decision and keep it, unless you edited that record again since the request started.
- A response that never arrived is harmless: resend with the old `since`.
- Use `nextUpdatedAt(now, previousUpdatedAt)` from `@sc/core` for every local edit. It returns `max(now, previous + 1)`, so an edit always stamps later than the version it replaces even when the device clock is slow.
- The server validates record shapes per collection with the same validators as backup import (`validateCollectionRecord`, also exported from `@sc/core`) and stores unknown extra fields as they are. Clients should run the same validators on records they pull.

## Sync semantics

- Last write wins per record, not per field. If the same owned row's quantity is edited on two devices, the edit with the later `updatedAt` replaces the whole record and the other quantity is dropped. Nothing is summed.
- Ties on `updatedAt` resolve to a tombstone, then to the greater canonical JSON text of the record. That last rule is arbitrary but deterministic: every device and the server pick the same winner, so they converge regardless of sync order.
- A device with a slow clock stamps edits older than other devices' versions, so its edits can lose even though they happened later. Using `nextUpdatedAt` prevents a device from losing to a version it already saw, but cannot fix a clock that is behind another device's real time. Fix such clocks.
- A device with a fast clock would win every conflict. The server limits that: any record stamped more than `SYNC_MAX_CLOCK_SKEW_MS` ahead of server time is clamped to server time, and the corrected copy is returned. Timestamps below 0, not finite, or past year 2100 are rejected with `400`.
- Tombstones are kept for `SYNC_TOMBSTONE_DAYS` counted from server receipt, never from the record's own `updatedAt`, and never pruned in the request that stored them. A device that was offline for months can therefore still deliver a delete. Pruning raises a watermark; clients with an older cursor receive `resync: true`.

## Persistence and concurrency

State is written to a temp file, flushed, renamed over `state.json`, and the directory is flushed where the platform allows. A crash never leaves a half written file; stale `state.json.*.tmp` files are removed at startup and failed writes clean up after themselves. Requests are processed one at a time and a write is acknowledged only after it is on disk. If `state.json` is corrupt the server refuses to start rather than overwrite it.

A `server.lock` file holding the process id stops two instances from sharing one data directory. A lock left by a dead process is taken over automatically. The check is by process id only, so on a shared network filesystem run exactly one instance.

## Deploy behind HTTPS

The server speaks plain HTTP and the bearer token travels in a header, so always put it behind a TLS terminating reverse proxy. Keep `HOST=127.0.0.1` and let the proxy reach it locally.

Caddy:

    sync.example.com {
        reverse_proxy 127.0.0.1:8787
    }

nginx:

    server {
        listen 443 ssl;
        server_name sync.example.com;
        # ssl_certificate and ssl_certificate_key lines go here
        client_max_body_size 5m;
        location / {
            proxy_pass http://127.0.0.1:8787;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For $remote_addr;
        }
    }

Also consider rate limiting failed auth attempts at the proxy, and set `SYNC_ALLOW_ORIGIN` to the exact origin that serves the web app.

## Logging

One JSON line per request on stdout: time, method, path (no query string), status, duration, remote address, record counts for sync calls, `clamped` and `resync` markers when they happen, and a short error code on failures. Tokens, headers and record contents are never logged. Startup and shutdown are logged as `event` lines.

## Tests

    cd apps/sync && npx vitest run

The tests start the server on an ephemeral port with a temporary data directory.
