# Session and hunting API

Base URL: `http://127.0.0.1:3000`. Authenticated routes require `Authorization: Bearer <token>`. Guest tokens are random bearer secrets, returned once, stored only as SHA-256 hashes, and expire after configured guest TTL. Never put token in URL or logs. Session identity comes only from token. Hunt creation snapshots equipment from `player_equipment`; client cannot supply player, level, population, inventory, balance, price, or catch result.

All errors are JSON `{ "error": "code" }`. Requests are limited by Fastify body limit and strict schemas. Browser origin is restricted by `ALLOWED_ORIGIN`.

## `POST /api/sessions/guest`
No auth. Empty JSON body (or no body).

`201`: `{ token, player: { id, mode: "online_guest" }, session: { id, createdAt, expiresAt } }`. Token is secret; response includes `Cache-Control: no-store`.

## `GET /api/sessions/me`
Auth required. `200`: `{ player: { id, mode }, session: { id, expiresAt } }`.

## `DELETE /api/sessions/current`
Auth required. Revokes current session; `204`. Repeating after revoke returns `401` because bearer is no longer valid.

## `POST /api/hunts`
Auth required. Body `{ "habitatId": "coral" }`. Server validates habitat and reads equipment level. `201`: `{ id, habitatId, equipmentLevel, issuedAt, expiresAt, maxShots, minShotIntervalMs, species: [{id, minEquipmentLevel}] }`.

## `GET /api/hunts/:id`
Auth required; owner-only. `200`: `{ id, habitatId, equipmentLevel, shotsUsed, maxShots, issuedAt, expiresAt, minShotIntervalMs, revoked, active }`. Other players receive `404 hunt_not_found`.

## `POST /api/hunts/:id/shots`
Auth required. Body `{ "shotId": "client-generated-unique-id", "speciesId": "clownfish" }`. `shotId` is an idempotency/replay key scoped to hunt, not a proof of shot. Server validates ownership, expiry, active species/habitat, cooldown, shot budget, and available population. It creates server receipt and updates population, inventory, and event in one DB transaction.

`201`: `{ receipt: { id, nonce, playerId, huntId, habitatId, speciesId, shotId, equipmentLevel, trustTier, status, createdAt, expiresAt }, serverTime, mint }`. Trust tier is `client_simulated_validated`; it is not cheat-proof. A replay does not repeat the catch; it returns `409 duplicate_shot` (same `shotId`, new idempotency key) or `409 idempotency_replay` (same idempotency key), including after cooldown.

## Error codes / status
- `400`: `invalid_request`, `invalid_body`, `invalid_habitat`, `invalid_shot_id`, `invalid_species`, `invalid_idempotency_key`
- `401`: `authentication_required`
- `404`: `habitat_not_found`, `hunt_not_found`, `player_not_found`, `species_unavailable`
- `409`: `species_unavailable`, `duplicate_shot`, `idempotency_replay`, `population_depleted`
- `410`: `hunt_expired`
- `429`: `shot_rate_limited`, `shot_limit_reached`
- `500`: `internal_error`

Each shot request is its own transaction. Same `shotId` replays fail with no additional effects. Different IDs racing for final fish serialize on population row; at most one succeeds. Failed DB writes roll back receipt, population decrement, inventory, event, nonce, and budget increment. Client simulation telemetry is not authoritative hit verification.
