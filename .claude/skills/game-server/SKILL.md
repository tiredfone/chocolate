---
name: game-server
description: Chocolate's game server - server/main.js, worker threads, game.js, replication, join tickets and redeem, private and reserved servers, presence, the social endpoint, purchases and receipts, and how to restart it safely. Use when the owner says "game server", "servers", "server list", "private server", "reserved server", "restart the server", "presence", "tickets", "social endpoint", "badges", "receipts", "replication" or "kick".
---

# Game server

One Node process (`node server/main.js`) on port 4201 (loopback `/status`). It holds the websocket for players and Studio, and runs each place instance in a worker thread. Config and secrets come from `config.php` + `config.local.php` through `server/config.js`; never print them.

## File map

- `server/main.js`: HTTP endpoints, websocket, `startInstance`, `chooseInstance`, `redeem(ticket)`, `sendPresence`, `statusJson`, `shutdown`, `restartSelf`, idle stop (`IDLE_MS` 90 s), ws ping every 25 s (`solarAlive`, terminate if no pong).
- `server/worker.js`: thread wrapper; creates `Game`, queues messages until `game.start()` resolves, handles `join`, `msg`, `leave`, `dbg`, `run`, `stop`.
- `server/game.js`: the place: `join` (builds Player, Backpack, PlayerGui, `SolarPerks`), message switch (`mkt`, `pfin`, `report`, remotes), `processReceipts`, `preloadAnims`, `spawnPoint`.
- `server/replicator.js`: `Replicator` sends created/changed/destroyed ops to each client for `REPLICATED_SERVICES`; `LOCAL_ONLY` props and `Archivable` never replicate.
- `server/social.js`: `social(action, data)` and `report(data)` post to the host with `X-Chocolate-Key`.
- `server/teamcreate.js`: Team Create sessions. `server/persistence.js`: 2012 Data Persistence. `server/assets.js`: asset fetch.
- Host side (site root): `router/api/chocolate/ticket.php`, `redeem.php`, `social.php`, `presence.php`, `report.php`, `servers-lib.php`, `server-create.php`, `server-delete.php`.

## HTTP endpoints (main.js)

- `GET /status`: open; live servers and players (`statusJson`). Use it to check for players.
- `POST /kick`, `/shutdown` (`job` or `placeId`), `/run` (Lua source on a `job`, returns output after `wait` ms), `/restart`: need `X-Chocolate-Key` (`keyedJson`, timing-safe compare).

## How joining works

1. Page asks `POST /api/chocolate/ticket` (checks private game, chosen server) -> ticket stored hashed.
2. Client opens the websocket with `?ticket=` (64 hex chars). `redeem(ticket)` calls the host `redeem` endpoint; the answer carries userId, name, `placeId`, `serverKey`, `maxPlayers`, `allowGear`, `clientVersion`, `avatarType`, `scale`, `perks`, `dev`. Studio tickets answer `mode: studio`.
3. `chooseInstance`: `priv:N` or `res:N` keys find or start a private or reserved server; `job:<id>` joins that job (or an allowed test instance); otherwise the busiest public server with room of the same era, else a new one. Different eras never mix.
4. The worker `join`s: kicks a duplicate session, enforces `MaxPlayers` (1-50), creates the Player.

## Host rules (from the site)

- Private servers: up to 3 per game per player; owner, owner's friends, staff and invite-link holders join. Reserved servers: admins create, join by link or staff. Private games: owner and staff only. Settings in `ChocolatePlaceSettings` (`MaxPlayers`, `AllowGear`, `TeamCreate`, `ClientVersion`, `AvatarType`).
- Presence: `sendPresence` posts everyone playing or in Team Create to `/api/chocolate/presence`; this keeps `Users.Playing` and `ChocolatePresence`.
- Social endpoint (`POST /api/chocolate/social`, shared key, loopback): `award`, `hasBadge`, `statuses`, `request`, `revoke`, `friendsOnline`, plus store actions `purchase`, `ownsAsset`, `productInfo`, `balance`, `pendingReceipts`, `grantReceipt`. `award` and `purchase` require `Users.Playing` to be that place.
- Reports: `report` action -> `/api/chocolate/report` -> `ChocolateReports` and the Discord webhook.

## Marketplace and receipts

Client `mkt` requests (`client/world.js` `market`) reach `case 'mkt'` in `game.js`, which calls the social actions. `pfin` finishes a purchase; the server only fires the finished event if that client really bought that ID. `Game.processReceipts` fetches `pendingReceipts`, runs the place's `ProcessReceipt`, and calls `grantReceipt` only on success; it runs after each product purchase and 8 s after joining (2018), retrying every 30 s on failure.

## Restarting safely

Restart is allowed any time, but it kicks everyone, so look first.

1. `curl -s http://127.0.0.1:4201/status` and check players.
2. PID: `ps -eo pid,args | awk '$2=="node" && $3 ~ /html\/chocolate\/server\/main.js$/ {print $1}'`. Never `pgrep -f` (it matches your own shell).
3. Stop it, then start as `fone`: `su fone -s /bin/sh -c 'cd /var/www/html/chocolate && setsid nohup sh server/start.sh > /tmp/chocolate-server.log 2>&1 < /dev/null &'`.
4. Check `/status` again and `/tmp/chocolate-server.log`.

Alternative: the developer Servers tab of `/admin` (`restart-chocolate`) uses `/restart`. Changes under `server/` and `shared/` need a restart; `client/` does not.

## Pitfalls

- Lua on the server is 5.1: no `string.split`; do not yield across `pcall`.
- A character update farther than `WalkSpeed` allows is rejected; teleports go through server Scripts.
- Do not send server output to clients unless `redeem` said `dev`.
- Place scripts run before the first player joins; `Game.start` waits for pending `LoadAsset` (max 15 s).

## Verify

`node tools/server2018.mjs <placeId> [2012|2018]`, `node tools/e2e2018.mjs <placeId>` (server+client in one process), as `fone`. Only make read-only requests to the host.
