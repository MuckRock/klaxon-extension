# DC JWT exchange — extension auth

## What and why

Squarelet [PR #675](https://github.com/MuckRock/squarelet/pull/675) (merged, live on `dev.squarelet.com`) added one endpoint:

```
POST /api/jwt/   body: { oidc_token }   →   { access_token, refresh_token }
```

It validates the OIDC access token against `django-oidc-provider`'s `Token` table and mints a `rest_framework_simplejwt` pair with `aud` including `documentcloud` — i.e. a credential the DocumentCloud API will accept directly.

That changes the model. The OIDC access token is no longer the bearer for DC API calls; it's an *intermediate* credential, useful only for `/openid/userinfo` and for minting JWTs. We now hold two token pairs that refresh independently:

| Pair | Issued by | Used for | Refreshed via |
|---|---|---|---|
| OIDC | `POST /openid/token` | `userinfo`, `/api/jwt/` | `POST /openid/token` w/ `grant_type=refresh_token` |
| DC JWT | `POST /api/jwt/` | DC API (`Authorization: Bearer`) | `POST /api/refresh/` w/ `{ refresh }` |

Access JWT lifetime is 300s; expiry lives in the `exp` claim, not an `expires_in` envelope. End-to-end harness already exists at [scratch/test-jwt-flow.sh](../scratch/test-jwt-flow.sh).

## Progress

In flight on `9-list-alerts`.

**Step 1 (types) — done.**
- `AuthTokenResponse` renamed to `OidcTokenResponse` at every import.
- `JwtTokenResponse` added.
- `StoredAuth` reshaped to `{ oidc, userinfo, jwt }`. **Decision (2026-05-12):** key is `oidc`, not `auth` — matches the endpoint name and disambiguates from the DC JWT once the second tier lands.
- `UserInfoResponse` no longer `extends` the token type; residual `token_type: "bearer"` stripped.

**Step 2 (oidc.ts helpers) — done, TDD.**
- Reverted speculative trailing slashes on `authorize`/`token`/`userinfo`/`endSession` (django-oidc-provider defines them without slashes; `APPEND_SLASH` would redirect-and-drop POST bodies). Kept slashes on `/api/jwt/` and `/api/refresh/`.
- Dropped the dead `refresh` key (replaced by `jwtRefresh`).
- Added `exchangeOidcForJwt(url, oidcAccessToken)`.
- Renamed `refreshUserInfoToken` → `refreshJwt` and normalized its return to `{ access_token, refresh_token, issued_at }`.
- Added `hasJwtExpired(token, bufferSeconds = 30)`.
- New tests in [extension/src/lib/tests/oidc.test.ts](../extension/src/lib/tests/oidc.test.ts): full coverage of `endpoints` shape, both fetcher helpers (body + normalization + error path), and `hasJwtExpired` (fresh / past / buffer-cutoff / custom buffer / missing `exp` / malformed). All 22 tests green.
- Bridge edit in [extension/src/background.ts](../extension/src/background.ts): three mechanical updates (`refreshUserInfoToken` → `refreshJwt`, `ep.refresh` → `ep.jwtRefresh`, `userInfoTokens.access` → `userInfoTokens.access_token`) so the file keeps compiling. Tier-1 refresh is still broken in the same way it was before — step 3's job.

**Step 3 (service worker) — done.**
- Removed the local `interface StoredAuth` from [extension/src/background.ts](../extension/src/background.ts); the type is now imported from [extension/src/lib/types.d.ts](../extension/src/lib/types.d.ts) (which had to be `export`ed).
- Added `isValidStoredAuth(value): value is StoredAuth` to [extension/src/lib/oidc.ts](../extension/src/lib/oidc.ts) — pure type guard, TDD'd with 11 new tests covering the valid shape, every flavor of partial/falsy/wrong-type input, and the legacy `{auth, userinfo}` shape.
- `readStored` uses the guard and `clearStored()`s anything that doesn't match — implicit migration for legacy records.
- `signIn`: after OIDC token exchange + ID-token checks, fans out `getUserInfo` and `exchangeOidcForJwt` in parallel against the same OIDC access token; stores `{ oidc, jwt, userinfo }`.
- `refreshTokens`: tier 1 = `refreshJwt(ep.jwtRefresh, stored.jwt.refresh_token)`; tier 2 (on tier-1 failure) = refresh OIDC then re-mint JWT + re-fetch userinfo in parallel; both failing → `clearStored()` + return null.
- `accessToken` returns `stored.jwt.access_token`, gated by `hasJwtExpired`.
- `signOut` reads `id_token` from `stored.oidc.id_token`.
- Dropped the verbose `TOKEN RESPONSE` / `USERINFO RESPONSE` / stored/fresh console dumps — they were leaking tokens to console. Boot-time `[klaxon] OAuth redirect URI` log kept.

**Step 6 (CLAUDE.md) — done.**

**Verification (2026-05-12):**
- `oidc.test.ts`: 33/33 green (11 endpoints + helpers + JWT decode/expiry + 11 shape-guard).
- Full vitest: 70 pass, 18 fail. The 18 failures pre-date this work — `chrome is not defined` in [extension/src/lib/tests/api.test.ts](../extension/src/lib/tests/api.test.ts) under happy-dom. Out of scope for this refactor.
- `svelte-check`: [extension/src/background.ts](../extension/src/background.ts) is clean (was 6 errors). Two errors remain at [extension/src/lib/auth.svelte.ts:71](../extension/src/lib/auth.svelte.ts#L71) — exactly what step 4 fixes.

**Still to do:**
- Step 4 — [extension/src/lib/auth.svelte.ts](../extension/src/lib/auth.svelte.ts): `applyStored` reads `expiresAt` from `stored.oidc` instead of `stored.userinfo`. 5-line change; svelte-check then goes green.
- Step 5 — no SW-level tests today; oidc.ts tests cover the helper layer. End-to-end verification continues via [scratch/test-jwt-flow.sh](../scratch/test-jwt-flow.sh).

## What changes in this repo

The current branch (`9-list-alerts`, commit `e872ad2`) started toward a two-tier model but was written before the JWT endpoint existed, so the token slots are mis-assigned. The refactor is shaped by what needs to be true after, not by enumerating each existing bug:

1. Storage holds three records, one per endpoint shape: `{ oidc, jwt, userinfo }`.
2. The DC API bearer is `stored.jwt.access_token`.
3. Refresh has two correctly-named tiers: first the DC JWT, then a full OIDC refresh + re-mint.
4. JWT expiry is read from the `exp` claim; OIDC expiry continues to use the `expires_in` envelope.
5. `UserInfoResponse` is a pure profile shape — no token fields, no `extends`.

## Implementation steps

### 1. Reshape types — [extension/src/lib/types.d.ts](../extension/src/lib/types.d.ts)

- Rename `AuthTokenResponse` → `OidcTokenResponse` (keep all current fields: `access_token`, `refresh_token`, `id_token`, `token_type`, `expires_in`, `issued_at`).
- Add `JwtTokenResponse` with `access_token`, `refresh_token`, `issued_at`. No `expires_in`.
- Strip the `extends AuthTokenResponse` and the `token_type` field from `UserInfoResponse`; it's profile only.
- Reshape `StoredAuth`:

```ts
interface StoredAuth {
  oidc: OidcTokenResponse;
  jwt: JwtTokenResponse;
  userinfo: UserInfoResponse;
}
```

### 2. Helpers — [extension/src/lib/oidc.ts](../extension/src/lib/oidc.ts)

- In `endpoints()`, add `jwt: \`${base}/api/jwt/\`` and rename the existing `refresh` key to `jwtRefresh`, fixing the missing trailing slash at the same time (`/api/refresh/`).
- Add `exchangeOidcForJwt(url, oidcAccessToken)`: POST `{ oidc_token }`, return `JwtTokenResponse` with `issued_at: Date.now()`.
- Rename `refreshUserInfoToken` → `refreshJwt`. Normalize the response: simplejwt's `TokenRefreshView` returns `{ access, refresh }` (short names) — translate to `{ access_token, refresh_token, issued_at }` so callers don't need to know about the naming mismatch.
- Add `hasJwtExpired(token, bufferSeconds = 30)`: decode the payload, compare `exp * 1000` to `Date.now() + buffer*1000`. Return `true` on missing/malformed `exp`. Keep `hasTokenExpired(tokenObj)` for the OIDC envelope; just stop applying it to JWTs.

### 3. Service worker — [extension/src/background.ts](../extension/src/background.ts)

Three of four entry points change.

**`signIn`** — after the existing OIDC token exchange and ID-token validation, fan out userinfo and JWT exchange in parallel:

```ts
const [userinfo, jwt] = await Promise.all([
  getUserInfo(ep.userinfo, oidc.access_token),
  exchangeOidcForJwt(ep.jwt, oidc.access_token),
]);
const stored: StoredAuth = { oidc, jwt, userinfo };
```

**`refreshTokens`** — two tiers, correctly named:

- Tier 1: `refreshJwt(ep.jwtRefresh, stored.jwt.refresh_token)`; on success, merge into stored and return.
- Tier 2 (on tier-1 failure): refresh the OIDC token, then re-fetch userinfo and re-mint the JWT in parallel.
- Both tiers failing → `clearStored()`, return `null`. Single-flight `dedupedRefresh` wrapper stays.

**`accessToken`** — returns `stored.jwt.access_token`, gated by `hasJwtExpired`:

```ts
if (!stored?.jwt?.access_token) return null;
if (!hasJwtExpired(stored.jwt.access_token)) return stored.jwt.access_token;
const fresh = await dedupedRefresh({ host, clientId });
return fresh?.jwt.access_token ?? null;
```

**`signOut`** — read `id_token` from `stored.oidc.id_token` (was `stored.auth.id_token`). Otherwise unchanged.

**`readStored`** — tighten so the new code never sees a partial record. If any of `oidc`/`jwt`/`userinfo` is missing, `clearStored()` and return `null`. This handles migration implicitly — legacy `{auth, userinfo}` records get dropped and the user signs in once.

### 4. Sidebar — [extension/src/lib/auth.svelte.ts](../extension/src/lib/auth.svelte.ts)

`applyStored` reads `user` from `stored.userinfo` and computes `expiresAt` from `stored.oidc.issued_at + stored.oidc.expires_in * 1000` — the long-lived credential is what the session-indicator UI should track. The 5-minute JWT is internal plumbing.

`authState.user`'s type narrows to `UserInfoResponse | null` once the `extends` is removed in step 1; the existing call sites (`authState.user?.name` etc.) keep working.

### 5. Tests — [extension/src/lib/tests/oidc.test.ts](../extension/src/lib/tests/oidc.test.ts)

Add cases for the three new helpers:

- `exchangeOidcForJwt`: posts the expected JSON body; stamps `issued_at`; throws with response text on non-2xx.
- `refreshJwt`: translates `{access, refresh}` → `{access_token, refresh_token}`.
- `hasJwtExpired`: true for a JWT whose `exp` is in the past; false for a fresh one; true when `bufferSeconds` pushes the cutoff past now; true on malformed input (graceful failure).

No SW-level integration tests (no harness today). End-to-end verification continues via [scratch/test-jwt-flow.sh](../scratch/test-jwt-flow.sh).

### 6. Docs — [extension/CLAUDE.md](../extension/CLAUDE.md)

The "Auth" section still describes `static/background.js` and `static/lib/oidc.js`. The service worker is now TS at [extension/src/background.ts](../extension/src/background.ts) and OIDC helpers at [extension/src/lib/oidc.ts](../extension/src/lib/oidc.ts). Update the section while it's open, and add a sentence on the two token tiers.

## Out of scope

- No proactive refresh timer (`chrome.alarms`). Lazy refresh on next `getAccessToken()` ships first; revisit if QA reports the 5-minute lifetime adds user-visible latency.
- [extension/src/lib/api.ts](../extension/src/lib/api.ts) is untouched: it already calls `getAccessToken()`. The token that comes back is now a JWT instead of an OIDC token, but call sites don't need to care.
- No Squarelet-side changes. The naming asymmetry between `/api/jwt/` (`access_token`/`refresh_token`) and `/api/refresh/` (`access`/`refresh`) is ugly but harmless; could be normalized in a follow-up PR, not blocking.

## Confirm before shipping

- **`ROTATE_REFRESH_TOKENS` is `True`** on dev and prod Squarelet. simplejwt rotates refresh tokens iff this is set. Our `refreshJwt` handler assumes rotation and replaces `stored.jwt.refresh_token` with whatever the response returns — if rotation is off, the response's `refresh` may be empty/undefined and we'd be throwing away a still-valid token. Quick grep of Squarelet settings or a question to the team.
- **JWT endpoint is on the Squarelet you point at.** If `MUCKROCK_ACCOUNTS_HOST` ever targets an older deployment, `/api/jwt/` will 404 and sign-in will fail outright. Worth a one-line check on first use.

## Rollout

1. Land as a single PR on `9-list-alerts` (or successor).
2. Manual QA against dev Squarelet:
   - Fresh sign-in writes `{oidc, jwt, userinfo}`.
   - Legacy `{auth, userinfo}` shape on disk → cleared on next read, user signs in once.
   - Tier-1 refresh succeeds when the JWT refresh is valid.
   - Tier-2 refresh succeeds when tier-1 fails (e.g. tamper with `stored.jwt.refresh_token`).
   - Both failing forces re-login.
   - Sign-out clears storage and ends the OIDC session.
3. Chrome + Firefox builds.
4. Ship.
