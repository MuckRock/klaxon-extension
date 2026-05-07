// Pure OIDC/PKCE/OAuth helpers
import { AuthTokenResponse, UserInfoResponse } from "./types";

export function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function randomBase64Url(length: number): string {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

export async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return new Uint8Array(digest);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return base64UrlEncode(await sha256(verifier));
}

export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const [, payload] = jwt.split(".");
  const b64 = payload.replaceAll("-", "+").replaceAll("_", "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

export interface OidcEndpoints {
  authorize: string;
  token: string;
  userinfo: string;
  endSession: string;
  refresh: string;
}

export function endpoints(host: string): OidcEndpoints {
  const base = host.replace(/\/$/, "");
  return {
    authorize: `${base}/openid/authorize`,
    token: `${base}/openid/token`,
    userinfo: `${base}/openid/userinfo`,
    endSession: `${base}/openid/end-session`,
    refresh: `${base}/api/refresh`
  };
}

interface AuthorizeUrlParams {
  host: string;
  clientId: string;
  scopes: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}

export function buildAuthorizeUrl({
  host,
  clientId,
  scopes,
  redirectUri,
  state,
  nonce,
  codeChallenge,
}: AuthorizeUrlParams): string {
  const url = new URL(endpoints(host).authorize);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export async function getAuthToken(url: string, params: URLSearchParams): Promise<AuthTokenResponse> {
  const tokenResp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  if (!tokenResp.ok) {
    throw new Error(
      `Token exchange failed: ${tokenResp.status} ${await tokenResp.text()}`,
    );
  }
  const tokenData: AuthTokenResponse = {
    ...await tokenResp.json() as Omit<AuthTokenResponse, "issued_at">,
    issued_at: Date.now()
  };
  return tokenData as AuthTokenResponse;
}

export async function getUserInfo(url: string, token: string): Promise<UserInfoResponse> {
  const userResp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!userResp.ok) {
    throw new Error(
      `Failed to fetch user data: ${userResp.status} ${await userResp.text()}`
    )
  }
  const user = {
    ...await userResp.json() as Omit<UserInfoResponse, "issued_at">,
    issued_at: Date.now()
  }
  return user;
}

export interface RefreshUserInfoTokenResponse {
  refresh: string;                // The new refresh token
  access: string;                 // The new access token
}

export async function refreshUserInfoToken(url: string, token: string): Promise<RefreshUserInfoTokenResponse> {
  const refreshResp = await fetch(url, {
    method: 'POST',
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ refresh: token }),
  });
  if (!refreshResp.ok) {
    throw new Error(
      `Failed to refresh userinfo access_token: ${refreshResp.status} ${await refreshResp.text()}`
    )
  }
  return refreshResp.json();
}

export function hasTokenExpired(tokenObj: AuthTokenResponse): boolean {
  // issuedAt is in milliseconds, expiresIn is in seconds, so normalize to milliseconds
  // apply a 300 second buffer so that we're agressive about refreshing our tokens
  const expiresAt = tokenObj.issued_at + ((tokenObj.expires_in - 300) * 1000);
  return Date.now() >= expiresAt;
}
