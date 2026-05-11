# JWT exchange refactor — extension auth

## Goal

Integrate Squarelet [PR #675](https://github.com/MuckRock/squarelet/pull/675) (new `POST /api/jwt/` endpoint) into the Klaxon Cloud extension so DocumentCloud API calls are authenticated with a DocumentCloud-signed JWT instead of the OIDC access token. Restructure the in-storage auth record to cleanly model the three distinct response shapes involved (OIDC tokens, DC JWT pair, user profile).

Does not change the user-facing sign-in flow.

## Status

**Pending.** Squarelet PR #675 is approved and running on `dev.squarelet.com`. End-to-end verification of the new endpoints is complete via [scratch/test-jwt-flow.sh](../scratch/test-jwt-flow.sh).

The current branch `9-list-alerts` contains commit `e872ad2` ("Refactor auth and OIDC logic to reflect documentation and multi-step flow") which started moving in this direction but was authored before PR #675 existed. It needs to be revised — see "Bugs in current code" below.

## Background

### What PR #675 adds

`POST /api/jwt/` (Squarelet): takes `{oidc_token: <OIDC access_token>}`, validates against `django-oidc-provider`'s `Token` table, returns a `rest_framework_simplejwt` token pair:

```json
{ "access_token": "<JWT>", "refresh_token": "<JWT>" }
```

`POST /api/refresh/` (Squarelet, already exists): stock `TokenRefreshView`. Takes `{refresh: <refresh JWT>}`, returns `{access, refresh}` (short-name keys — `rest_framework_simplejwt` convention).

### Two token systems, two responsibilities

| Token pair | Issued by | Used for | Refreshed via |
|---|---|---|---|
| OIDC | `POST /openid/token` | `GET /openid/userinfo`, `POST /api/jwt/` | `POST /openid/token` with `grant_type=refresh_token` |
| DC JWT | `POST /api/jwt/` (PR #675) | DocumentCloud API (`Authorization: Bearer <jwt>`) | `POST /api/refresh/` with `{refresh}` |

The OIDC token never reaches DocumentCloud. It's an intermediate credential used to mint the DC JWT.

### JWT shape (decoded payload)

```json
{
  "token_type": "access",
  "exp": 1778520817,
  "iat": 1778520517,
  "jti": "0a8a61b796904d508834bd98b8352065",
  "user_id": "3297a459-83a7-451e-9b03-4c4928ae5de5",
  "aud": ["squarelet", "muckrock", "documentcloud"],
  "iss": "squarelet"
}
```

- Access JWT lifetime: **300 seconds** (5 min). `exp - iat`.
- Refresh JWT lifetime: 86400 seconds (24 hr).
- `aud` includes `documentcloud`, so the DC API accepts it directly.
- The `exp` claim is the authoritative expiry — neither `/api/jwt/` nor `/api/refresh/` returns an `expires_in` envelope field.

## Bugs in current code (motivation)

These all live on the `9-list-alerts` branch in commit `e872ad2`. They're functionally hidden today because the JWT exchange step doesn't exist yet (so the broken paths are never exercised against a real backend), but the refactor needs to fix them.

### 1. `UserInfoResponse extends AuthTokenResponse` is a fiction

[extension/src/lib/types.d.ts:53](../extension/src/lib/types.d.ts#L53):

```ts
export interface UserInfoResponse extends AuthTokenResponse {
  token_type: 'bearer';
  sub: string;
  // ...profile fields
}
```

The `/openid/userinfo` endpoint returns profile data only (sub, uuid, name, email, organizations, …). It does **not** return `access_token`, `refresh_token`, `id_token`, `expires_in`, or `token_type`. The `extends AuthTokenResponse` clause asserts fields that don't exist on the wire.

`getUserInfo()` in [oidc.ts:108-125](../extension/src/lib/oidc.ts#L108-L125) launders this past the compiler by casting to `Omit<UserInfoResponse, "issued_at">` and adding `issued_at: Date.now()`. At runtime the token fields are simply absent.

### 2. The "userinfo refresh token" tier doesn't exist

[background.ts:127-185](../extension/src/background.ts#L127-L185) implements a two-layer refresh:

1. First try `/api/refresh/` with `stored.userinfo.refresh_token`.
2. Fall back to refreshing `stored.auth` via `/openid/token`.

There is no `stored.userinfo.refresh_token` — userinfo doesn't issue tokens. The first tier always throws and falls through to the second. The mental model was on the right track (a separate refresh tier for the DC-side tokens) but assigned the tokens to the wrong slot.

### 3. The OIDC access token is wrongly used as the DC bearer

[background.ts:200-213](../extension/src/background.ts#L200-L213) returns `stored.userinfo.access_token` (undefined → `null` → no token sent) when API code calls `getAccessToken()`. The intent was clearly "the access token used for API calls," but that should be a DC JWT obtained via PR #675, not the OIDC token in either slot.

### 4. `hasTokenExpired()` assumes `expires_in`

[oidc.ts:151-155](../extension/src/lib/oidc.ts#L151-L155):

```ts
export function hasTokenExpired(tokenObj: AuthTokenResponse): boolean {
  const expiresAt = tokenObj.issued_at + (tokenObj.expires_in - 300) * 1000;
  return Date.now() >= expiresAt;
}
```

Two problems for the new JWT response:
- Neither `/api/jwt/` nor `/api/refresh/` returns `expires_in` — so `expires_in` is undefined and `expiresAt` is `NaN`, making this always return `false`.
- Even if the field were present, the 300-second buffer matches the entire 300-second JWT lifetime, so the token would be considered expired the moment it's issued.

The fix is to decode the JWT's `exp` claim instead.

### 5. Optional chaining stops one level too shallow

Several spots use `stored?.userinfo.X` and `stored?.auth.X`, which still throws if `stored` exists but the nested key is absent (e.g. legacy storage from before the refactor). This was the source of the `Cannot read properties of undefined (reading 'issued_at')` error during initial testing. Fix is to deepen the chains and add a one-time storage cleanup on read.

## New shape

### `StoredAuth`

```ts
interface StoredAuth {
  oidc: OidcTokenResponse;       // POST /openid/token
  jwt: JwtTokenResponse;         // POST /api/jwt/  (and POST /api/refresh/)
  userinfo: UserInfoResponse;    // GET /openid/userinfo (profile only)
}

interface OidcTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;            // present on this response, used by Squarelet
  issued_at: number;             // stamped client-side
}

interface JwtTokenResponse {
  access_token: string;
  refresh_token: string;
  issued_at: number;             // stamped client-side; expiry comes from JWT exp claim
}

interface UserInfoResponse {     // no extends
  sub: string;
  uuid: string;
  name: string;
  nickname: string;
  preferred_username: string;
  email: string;
  email_verified: boolean;
  picture: string;
  bio: string;
  updated_at: string;
  use_autologin: boolean;
  organizations: UserInfoOrganization[];
}
```

Names chosen to mirror what each endpoint actually returns. `oidc` and `jwt` are the storage keys — short enough for ergonomics, distinct enough to make access-site reads unambiguous.

### Endpoints

[oidc.ts:43-52](../extension/src/lib/oidc.ts#L43-L52):

```ts
export function endpoints(host: string): OidcEndpoints {
  const base = host.replace(/\/$/, "");
  return {
    authorize:  `${base}/openid/authorize`,
    token:      `${base}/openid/token`,
    userinfo:   `${base}/openid/userinfo`,
    endSession: `${base}/openid/end-session`,
    jwt:        `${base}/api/jwt/`,        // new
    jwtRefresh: `${base}/api/refresh/`,    // renamed from `refresh`
  };
}
```

The current `refresh` key is renamed to `jwtRefresh` for clarity; `refreshUserInfoToken()` becomes `refreshJwt()`.

## New helpers

### `oidc.ts`

```ts
// PR #675 endpoint: exchange OIDC access token for DC JWT pair.
export async function exchangeOidcForJwt(
  url: string,
  oidcAccessToken: string,
): Promise<JwtTokenResponse> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oidc_token: oidcAccessToken }),
  });
  if (!resp.ok) {
    throw new Error(`JWT exchange failed: ${resp.status} ${await resp.text()}`);
  }
  return {
    ...((await resp.json()) as Omit<JwtTokenResponse, "issued_at">),
    issued_at: Date.now(),
  };
}

// /api/refresh/ — stock TokenRefreshView. Returns short-name fields.
export async function refreshJwt(
  url: string,
  refreshToken: string,
): Promise<JwtTokenResponse> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: refreshToken }),
  });
  if (!resp.ok) {
    throw new Error(`JWT refresh failed: ${resp.status} ${await resp.text()}`);
  }
  const { access, refresh } = (await resp.json()) as { access: string; refresh: string };
  return { access_token: access, refresh_token: refresh, issued_at: Date.now() };
}
```

Normalization in `refreshJwt` translates the short-name response into our internal `JwtTokenResponse` shape so call sites don't have to know about the wire-level naming mismatch.

### `hasTokenExpired` rewrite

Decode the JWT's `exp` claim. `decodeJwtPayload()` already exists.

```ts
// True if the JWT expires within `bufferSeconds` (default 30).
export function hasJwtExpired(token: string, bufferSeconds = 30): boolean {
  try {
    const { exp } = decodeJwtPayload(token) as { exp: number };
    if (typeof exp !== "number") return true;
    return Date.now() >= (exp - bufferSeconds) * 1000;
  } catch {
    return true;
  }
}
```

Buffer is 30s (not 300s) so it doesn't consume the entire 5-minute JWT lifetime. For the OIDC token (which does carry `expires_in`), keep the existing `hasTokenExpired(tokenObj)` and apply it only to `stored.oidc`.

## Service-worker changes

### `signIn()`

After the existing OIDC token exchange and userinfo fetch, exchange for a JWT before persisting.

[background.ts:60-125](../extension/src/background.ts#L60-L125):

```ts
const oidc = await getAuthToken(ep.token, new URLSearchParams({
  grant_type: "authorization_code",
  code,
  redirect_uri: redirectUri,
  client_id: clientId,
  code_verifier: verifier,
}));

const idPayload = decodeJwtPayload(oidc.id_token);
if (idPayload.nonce !== nonce) throw new Error("ID token nonce mismatch");
if (idPayload.aud !== clientId) throw new Error("ID token audience mismatch");

const [userinfo, jwt] = await Promise.all([
  getUserInfo(ep.userinfo, oidc.access_token),
  exchangeOidcForJwt(ep.jwt, oidc.access_token),
]);

const stored: StoredAuth = { oidc, jwt, userinfo };
await writeStored(stored);
return stored;
```

Userinfo and JWT exchange are independent and can run in parallel against the freshly-issued OIDC access token.

### `refreshTokens()`

Two-tier, but now the tiers are correctly named.

```ts
async function refreshTokens({ host, clientId }): Promise<StoredAuth | null> {
  const ep = endpoints(host);
  const stored = await readStored();
  if (!stored) return null;

  // Tier 1: refresh the DC JWT directly via /api/refresh/.
  try {
    if (!stored.jwt?.refresh_token) throw new Error("No JWT refresh token");
    const jwt = await refreshJwt(ep.jwtRefresh, stored.jwt.refresh_token);
    const fresh: StoredAuth = { ...stored, jwt };
    await writeStored(fresh);
    return fresh;
  } catch (e1) {
    console.warn("[klaxon] JWT refresh failed:", e1);
  }

  // Tier 2: refresh the OIDC token, then re-exchange for a new JWT.
  // Also opportunistically re-fetch userinfo.
  try {
    if (!stored.oidc?.refresh_token) throw new Error("No OIDC refresh token");
    const oidc = await getAuthToken(ep.token, new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: stored.oidc.refresh_token,
      client_id: clientId,
    }));
    const [userinfo, jwt] = await Promise.all([
      getUserInfo(ep.userinfo, oidc.access_token),
      exchangeOidcForJwt(ep.jwt, oidc.access_token),
    ]);
    const fresh: StoredAuth = { oidc, jwt, userinfo };
    await writeStored(fresh);
    return fresh;
  } catch (e2) {
    console.warn("[klaxon] OIDC refresh failed:", e2);
    await clearStored();
    return null;
  }
}
```

Single-flight dedupe via `dedupedRefresh()` stays as-is.

### `accessToken()`

Returns the DC JWT, not the OIDC token.

```ts
async function accessToken({ host, clientId }): Promise<string | null> {
  const stored = await readStored();
  if (!stored?.jwt?.access_token) return null;
  if (!hasJwtExpired(stored.jwt.access_token)) return stored.jwt.access_token;
  const fresh = await dedupedRefresh({ host, clientId });
  return fresh?.jwt.access_token ?? null;
}
```

### `signOut()`

Reads the ID token from `stored.oidc.id_token` (was `stored.auth.id_token`). Otherwise unchanged.

### `readStored()` cleanup

Guard against legacy or partial data so a stale storage object doesn't poison the new code path:

```ts
async function readStored(): Promise<StoredAuth | null> {
  const r = await chrome.storage.local.get(STORAGE_KEY);
  const v = r[STORAGE_KEY];
  if (!v || !v.oidc || !v.jwt || !v.userinfo) {
    if (v) await clearStored();  // drop the stale shape
    return null;
  }
  return v as StoredAuth;
}
```

This also obviates the `stored?.X.Y` optional-chaining hazard — once `readStored` returns, the shape is guaranteed.

## Sidebar changes

[auth.svelte.ts:60-73](../extension/src/lib/auth.svelte.ts#L60-L73):

```ts
function applyStored(stored: StoredAuth | null) {
  if (!stored) {
    authState.status = "idle";
    authState.user = null;
    authState.expiresAt = null;
    authState.error = null;
    return;
  }
  authState.status = "authenticated";
  authState.user = stored.userinfo;
  // Use the OIDC token's lifetime for the UI's "session expires" indicator —
  // it's the long-lived credential. The DC JWT is internal plumbing.
  authState.expiresAt = stored.oidc.issued_at + stored.oidc.expires_in * 1000;
  authState.error = null;
}
```

`authState.user` is typed as `UserInfoResponse | null` (no token fields).

## Tests

Add to [src/lib/tests/oidc.test.ts](../extension/src/lib/tests/oidc.test.ts):

- `exchangeOidcForJwt` posts the expected body and unwraps a successful response.
- `exchangeOidcForJwt` throws with the response body on non-2xx.
- `refreshJwt` translates `{access, refresh}` → `{access_token, refresh_token}` correctly.
- `hasJwtExpired` returns true for an expired JWT (e.g. one with `exp` in the past).
- `hasJwtExpired` returns false for a fresh JWT, true with a buffer that pushes the cutoff into the past.
- `hasJwtExpired` returns true on malformed input (graceful failure).

No SW-level integration tests today (background.ts has no test harness). End-to-end verification continues to use [scratch/test-jwt-flow.sh](../scratch/test-jwt-flow.sh) until we add one.

## Migration

No formal migration needed for users:

- The `readStored()` shape guard above drops anything missing the new keys. Affected users get signed out once; sign-in writes the new shape.
- No code references the legacy flat structure or the post-`e872ad2` `{auth, userinfo}` structure outside the SW.

If we want a softer migration (preserve a session by re-issuing a JWT from an existing OIDC refresh token), we can detect the `{auth, userinfo}` shape specifically and run a one-shot upgrade path. Not worth the complexity for a single-author branch that hasn't shipped — drop the storage and have the user sign in once.

## Files touched

- [extension/src/lib/types.d.ts](../extension/src/lib/types.d.ts) — split `UserInfoResponse` from `AuthTokenResponse`; rename `AuthTokenResponse` → `OidcTokenResponse`; add `JwtTokenResponse`; reshape `StoredAuth`.
- [extension/src/lib/oidc.ts](../extension/src/lib/oidc.ts) — add `jwt` + `jwtRefresh` to `endpoints()`; add `exchangeOidcForJwt`; rename `refreshUserInfoToken` → `refreshJwt` and normalize its response; replace `hasTokenExpired` with two functions (`hasTokenExpired` for OIDC envelope tokens, `hasJwtExpired` for JWTs).
- [extension/src/background.ts](../extension/src/background.ts) — update `StoredAuth` import; rework `signIn`, `refreshTokens`, `accessToken`, `signOut`; tighten `readStored`.
- [extension/src/lib/auth.svelte.ts](../extension/src/lib/auth.svelte.ts) — `applyStored` reads from `stored.oidc` + `stored.userinfo`.
- [extension/src/lib/tests/oidc.test.ts](../extension/src/lib/tests/oidc.test.ts) — new cases for the helpers above.

`extension/src/lib/api.ts` is unchanged: it already calls `getAccessToken()`; what comes back is now a DC JWT instead of an OIDC token, but the call sites don't care.

## Open questions

- **Proactive refresh in the SW.** With a 5-minute JWT lifetime, lazy refresh on the next `getAccessToken()` is more likely to add user-visible latency than the 1-hour OIDC token used to. Consider scheduling a `chrome.alarms` wakeup ~30s before `exp` to refresh in the background. Defer until we see real UX impact.
- **What does `/api/jwt/` cost on the server?** Every sign-in adds one extra round trip to Squarelet, and every full refresh fallback adds two. Probably fine — both endpoints are cheap — but worth confirming with the Squarelet team before shipping if there's any concern about traffic.
- **Should `/api/refresh/` return `access_token`/`refresh_token` long-name fields** to match `/api/jwt/`? Currently it returns `access`/`refresh` (stock simplejwt). The mismatch is harmless but ugly. Could be addressed in a follow-up Squarelet PR by overriding `TokenRefreshView`. Not blocking.
- **Refresh-token rotation invariants on `/api/refresh/`.** simplejwt rotates refresh tokens iff `ROTATE_REFRESH_TOKENS=True` in Django settings. Our handler assumes rotation (we replace `stored.jwt.refresh_token` with the response's `refresh`). Worth confirming the setting on dev and production Squarelet so we don't accidentally throw away a still-valid refresh token.

## Rollout

1. Verify Squarelet PR #675 is merged and deployed to dev and production. ([scratch/test-jwt-flow.sh](../scratch/test-jwt-flow.sh) is the verification harness.)
2. Land this refactor on the `9-list-alerts` branch (or a successor) — single PR, all the files above.
3. Manual QA: fresh sign-in writes the new shape; legacy shape gets cleared on next read; refresh tier 1 succeeds; refresh tier 2 succeeds when JWT refresh fails; both tiers failing forces re-login; sign-out clears storage and ends OIDC session.
4. Test in Chrome and Firefox builds against dev Squarelet.
5. Ship.
