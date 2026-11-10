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

- `SYNC_MAX_RECORDS_PER_COLLECTION` (default `200000`, the `RECORD_LIMITS.maxRecordsPerCollection` value from `@sc/core`): most records one collection may hold. A push that adds records past this is refused with `413`. Updates to existing ids are always allowed.
- `SYNC_MAX_STATE_BYTES` (default `67108864`, 64 MiB): largest serialized state. A push that grows the state past this is refused with `413` and nothing is written.
- `SYNC_REGENERATE_SERVER_ID` (default `0`, set `1` to enable): issue a fresh `serverId` at startup. See Backup and restore.
- `SYNC_LOCK_GRACE_MS` (default `2000`): only used when the filesystem has no hard links. An empty or unreadable `server.lock` younger than this counts as held.

Invalid numeric values, and flags other than `1` or `0`, stop startup with an explanation instead of silently falling back.

## HTTP API

- `GET /health`: no auth. Returns `{"status":"ok","serverId":"..."}`.
- `POST /sync`: bearer auth, `Content-Type: application/json`. Body is a `SyncRequest` (`since` plus `changes` per collection: `owned`, `taggings`, `decks`, `savedSearches`). Returns a `SyncResponse` (`changes`, `serverTime`, `serverId`, `resync`).
- `OPTIONS` on either path: CORS preflight, always answered with `204`. The `Access-Control-Allow-*` policy headers are included only when the request origin is allowed.

Status codes: `400` invalid JSON, request shape, out of range values or hostile nesting, `401` bad or missing token, `404` unknown path, `405` wrong method (with `Allow`), `413` body too large or a state cap reached, `415` not JSON, `500` unexpected failure (logged by error name only, never sent to the client).

Error bodies look like `{"error":{"code":"invalid_request","message":"..."}}`. A state cap refusal is the exception: `413` with `{"error":"state_limit","message":"..."}`. The request is rejected as a whole and the server keeps its previous state, so the client can retry later or after the operator raises the cap.

When `SYNC_ALLOW_ORIGIN` lists specific origins, every response carries `Vary: Origin`, and `Access-Control-Allow-Origin` is echoed only for listed origins. With `*` the header is `*` and no `Vary` is sent. With CORS off no CORS headers are sent.

## Protocol for clients

- `serverId`: random id created with the data set and persisted in `state.json`. Store `{url, serverId}`. If a response carries a different `serverId` than the one stored (new empty server, switched URL), reset: use `since = 0` and push every local record, so nothing silently diverges. A restored backup keeps the `serverId` it was saved with; clients whose cursor is ahead of the restored clock get `resync: true` instead.
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
- A device with a fast clock would win every conflict. The server limits that: any record stamped more than `SYNC_MAX_CLOCK_SKEW_MS` ahead of server time is clamped to server time, and the corrected copy is returned. A record stamped within that window is kept as sent, so a fast clock wins conflicts for up to that window. A clamped record is not idempotent: each request re-clamps a still-future stamp to that request's server time, so replaying it later stores a different `updatedAt`. Timestamps below 0, not finite, or past year 2100 are rejected with `400`.
- Tombstones are kept for `SYNC_TOMBSTONE_DAYS` counted from server receipt, never from the record's own `updatedAt`, and never pruned in the request that stored them. A device that was offline for months can therefore still deliver a delete. Pruning raises a watermark; clients with an older cursor receive `resync: true`.

## Persistence and concurrency

State is written to a temp file, flushed, renamed over `state.json`, and the directory is flushed where the platform allows. A crash never leaves a half written file; stale `state.json.*.tmp` files are removed at startup and failed writes clean up after themselves. Requests are processed one at a time and a write is acknowledged only after it is on disk. If `state.json` is corrupt the server refuses to start rather than overwrite it.

A `server.lock` file holding the process id stops two instances from sharing one data directory. The pid is written to a private temp file first and then hard linked to `server.lock`, so a competing starter never sees an empty lock. A lock left by a dead process is taken over automatically: the server removes it and retries once, and refuses to start if another process won that retry. Where hard links are unavailable (`EPERM`, `ENOSYS`, `EXDEV`), the lock is created exclusively instead, and an empty or unreadable lock younger than `SYNC_LOCK_GRACE_MS` counts as held. The check is by process id only, so on a shared network filesystem run exactly one instance.

## State caps

Each push is checked against `SYNC_MAX_RECORDS_PER_COLLECTION` and `SYNC_MAX_STATE_BYTES` before anything is written. Only growth is refused: a push that updates existing ids, or deletes, still succeeds at the cap. A refused push answers `413` with the `state_limit` body and leaves `state.json` byte for byte unchanged.

## Backup and restore

Back up the whole data directory, `state.json` included. To restore an old `state.json`, stop the server, put the file back, and start once with `SYNC_REGENERATE_SERVER_ID=1`. The server then issues a new `serverId`, saves it, and logs a `server_id_regenerated` event. Every device sees a different `serverId` and resyncs by pushing its full local state. Records the restored server had deleted after the backup can therefore reappear from a device that still holds them. Start without the flag afterwards: the new id is kept across restarts.

## Homelab with Tailscale

The web app is served over HTTPS from GitHub Pages, and browsers block plain HTTP requests from an HTTPS page, so the server needs an HTTPS URL. Tailscale Serve provides one with a real certificate and keeps the server off the public internet. Every device that syncs needs the Tailscale app signed in to the same tailnet.

1. On the homelab host, create `apps/sync/.env` with `SYNC_TOKEN=<output of openssl rand -hex 24>`. The `SYNC_ALLOW_ORIGIN` default is the Pages origin `https://regulus29.github.io`.
2. Start it from the repo root: `docker compose -f apps/sync/compose.yaml up -d --build`. Data lives in the `sync-data` volume, so include it in your backups.
3. Publish it on the tailnet: `tailscale serve --bg 8787`. Enable HTTPS certificates in the Tailscale admin console first if prompted.
4. Check `https://<host>.<tailnet>.ts.net/health` from your phone, then enter that URL and the token under Settings, Sync in the app.

Use `tailscale serve`, not `tailscale funnel`, so only your own devices can reach it.

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
