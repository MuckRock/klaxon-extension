// Klaxon Cloud service worker.
//
// Two responsibilities:
//   1. Inject the content script when the action button is clicked.
//   2. Handle OIDC auth messages from the content script (PKCE flow against
//      Squarelet). All network + storage work lives here because
//      chrome.identity.launchWebAuthFlow is not available to content scripts.
import type { AuthTokenResponse, UserInfoResponse } from "./lib/types";
import {
  buildAuthorizeUrl,
  decodeJwtPayload,
  endpoints,
  pkceChallenge,
  randomBase64Url,
  getAuthToken,
  getUserInfo,
  refreshUserInfoToken,
  hasTokenExpired,
} from "./lib/oidc.ts";

// Log the OAuth redirect URI on every SW boot — register this exact string
// with the Squarelet client. Remove once the URI is stable across environments.
console.log("[klaxon] OAuth redirect URI:", chrome.identity.getRedirectURL());

// Inject the content script when the extension is activated
chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    files: ["content.js"],
  });
});

// Save auth data to local storage
const STORAGE_KEY = "muckrock_auth";

interface StoredAuth {
  auth: AuthTokenResponse; // the response from `/openid/token`
  userinfo: UserInfoResponse; // the response from `/openid/userinfo`
}

async function readStored(): Promise<StoredAuth | null> {
  const r = await chrome.storage.local.get(STORAGE_KEY);
  return (r[STORAGE_KEY] as StoredAuth) ?? null;
}

async function writeStored(data: StoredAuth): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

async function clearStored(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

interface AuthConfig {
  host: string;
  clientId: string;
  scopes: string;
}

async function signIn({
  host,
  clientId,
  scopes,
}: AuthConfig): Promise<StoredAuth> {
  // The first step of signing in is to send users to MuckRock Accounts.
  // This is where they enter their username and password.
  const ep = endpoints(host);
  const verifier = randomBase64Url(64);
  const challenge = await pkceChallenge(verifier);
  const state = randomBase64Url(32);
  const nonce = randomBase64Url(16);
  const redirectUri = chrome.identity.getRedirectURL();

  const authorizeUrl = buildAuthorizeUrl({
    host,
    clientId,
    scopes,
    redirectUri,
    state,
    nonce,
    codeChallenge: challenge,
  });

  const finalUrl = await chrome.identity.launchWebAuthFlow({
    url: authorizeUrl,
    interactive: true,
  });
  if (!finalUrl) throw new Error("Authorization cancelled");

  // Now that we've completed authorization, we have a redirect URI with
  // a `code` parameter. We use this code for a token exchange.
  const cb = new URL(finalUrl);
  const err = cb.searchParams.get("error");
  if (err) throw new Error(`Authorization error: ${err}`);
  if (cb.searchParams.get("state") !== state) throw new Error("State mismatch");
  const code = cb.searchParams.get("code");
  if (!code) throw new Error("No authorization code");

  const auth = await getAuthToken(
    ep.token,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }),
  );
  // Check that everything is on the up-and-up
  const idPayload = decodeJwtPayload(auth.id_token);
  if (idPayload.nonce !== nonce) throw new Error("ID token nonce mismatch");
  if (idPayload.aud !== clientId) throw new Error("ID token audience mismatch");
  console.log("TOKEN RESPONSE\n\n", JSON.stringify(auth, null, 2));

  // Now we have an OIDC access_token, which we use
  // to get user data with our *actual* access token
  const userinfo = await getUserInfo(ep.userinfo, auth.access_token);
  console.log("USERINFO RESPONSE\n\n", JSON.stringify(userinfo, null, 2));

  // Now that we have all our data, let's store it.
  const stored: StoredAuth = {
    auth,
    userinfo,
  };
  await writeStored(stored);
  return stored;
}

async function refreshTokens({
  host,
  clientId,
}: Omit<AuthConfig, "scopes">): Promise<StoredAuth | null> {
  // I know that this is a bit of a ratking of logic, but not sure the best way to structure it.
  // Refresh token logic is two layers deep, conditional upon errors:
  // First, try refreshing `userinfo.access_token` with `userinfo.refresh_token`.
  // If that errors, try refreshing `token.access_token` with `token.refresh_token`.
  //     - If that succeeds, get fresh info from `/openid/userinfo`.
  //     - If that errors, we gotta wipe all our data to log out the user.
  const ep = endpoints(host);
  const stored = await readStored();
  let userinfo: UserInfoResponse | undefined = undefined;
  let auth: AuthTokenResponse | undefined = undefined;
  try {
    if (!stored?.userinfo.refresh_token)
      throw new Error("No refresh token for userinfo.");
    // Get fresh tokens for userinfo, from `/api/refresh`
    const userInfoTokens = await refreshUserInfoToken(
      ep.refresh,
      stored.userinfo.refresh_token,
    );
    // With fresh tokens, we can now refresh data from userinfo
    userinfo = await getUserInfo(ep.userinfo, userInfoTokens.access);
  } catch (error) {
    console.warn(error);
    // Ok, we failed to get fresh tokens. So let's get fresh user data!
    try {
      // First, we try refreshing our Squarelet access_token
      if (!stored?.auth.refresh_token) {
        throw new Error("No refresh token for Squarelet.");
      }
      // Get fresh access_token from Squarelet
      auth = await getAuthToken(
        ep.token,
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: stored.auth.refresh_token,
          client_id: clientId,
        }),
      );
      // With fresh token, we can now refresh data from userinfo
      userinfo = await getUserInfo(ep.userinfo, auth.access_token);
    } catch (error) {
      console.warn(error);
      // We failed to get an updated access token. The user must log back in.
      // Clear any saved auth state we have.
      await clearStored();
      return null;
    }
  }
  // Now that we've refreshed data, update our store
  const fresh: StoredAuth = {
    auth: auth ?? stored.auth,
    userinfo: userinfo ?? stored.userinfo,
  };
  await writeStored(fresh);
  return fresh;
}

// Dedupe concurrent refresh calls so multiple callers share one network round-trip.
let refreshPromise: Promise<StoredAuth | null> | null = null;
function dedupedRefresh(
  args: Omit<AuthConfig, "scopes">,
): Promise<StoredAuth | null> {
  if (!refreshPromise) {
    refreshPromise = refreshTokens(args).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function accessToken({
  host,
  clientId,
}: Omit<AuthConfig, "scopes">): Promise<string | null> {
  // First try getting any saved access tokens from storage
  const stored = await readStored();
  console.log(JSON.stringify(stored, null, 2));
  if (!stored?.userinfo.access_token) return null;
  // If access token is still good, let's return it
  if (!hasTokenExpired(stored.userinfo)) return stored.userinfo.access_token;
  // If not, we need to refresh our token
  // If we can't refresh our token, we consider ourselves signed out
  const fresh = await dedupedRefresh({ host, clientId });
  console.log(JSON.stringify(fresh, null, 2));
  return fresh?.userinfo.access_token ?? null;
}

async function signOut({ host }: Pick<AuthConfig, "host">): Promise<void> {
  // When signing out, we want to do two things:
  // 1. Clear any stored credentials
  // 2. Notify Squarelet we're signing out
  // 3. Redirect to the client's post-signout URI
  const ep = endpoints(host);
  const stored = await readStored();
  await clearStored();
  if (!stored?.auth.id_token) return;
  const url = new URL(ep.endSession);
  url.search = new URLSearchParams({
    id_token_hint: stored?.auth.id_token,
    post_logout_redirect_uri: chrome.identity.getRedirectURL(),
  }).toString();
  try {
    await chrome.identity.launchWebAuthFlow({
      url: url.toString(),
      interactive: true,
    });
  } catch {
    // launchWebAuthFlow throws on close — tokens are already cleared locally.
  }
}

interface AuthMessage {
  type: string;
  config: AuthConfig;
}

function isAuthMessage(t: AuthMessage | FetchMessage): t is AuthMessage {
  return t.type.startsWith("auth/");
}

interface FetchMessage {
  type: "api/fetch";
  url: string;
  options: RequestInit;
}

function isFetchMessage(t: AuthMessage | FetchMessage): t is FetchMessage {
  return t.type === "api/fetch";
}

chrome.runtime.onMessage.addListener(
  (msg: AuthMessage | FetchMessage, _sender, sendResponse) => {
    if (!msg?.type) return false;

    if (isFetchMessage(msg)) {
      (async () => {
        try {
          const resp = await fetch(msg.url, msg.options);
          const body = resp.headers
            .get("content-type")
            ?.includes("application/json")
            ? await resp.json()
            : await resp.text();
          sendResponse({
            ok: true,
            data: { status: resp.status, statusText: resp.statusText, body },
          });
        } catch (e) {
          sendResponse({
            ok: false,
            error: (e as Error)?.message ?? String(e),
          });
        }
      })();
      return true;
    }

    if (!isAuthMessage(msg)) return false;
    (async () => {
      try {
        switch (msg.type) {
          case "auth/login":
            sendResponse({ ok: true, data: await signIn(msg.config) });
            break;
          case "auth/logout":
            await signOut(msg.config);
            sendResponse({ ok: true });
            break;
          case "auth/token":
            sendResponse({ ok: true, data: await accessToken(msg.config) });
            break;
          case "auth/state":
            sendResponse({ ok: true, data: await readStored() });
            break;
          default:
            sendResponse({ ok: false, error: `unknown message: ${msg.type}` });
        }
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return true;
  },
);
