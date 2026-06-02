#!/usr/bin/env node
// Computes the OAuth redirect URIs to register on the Squarelet OIDC client,
// one per browser. Both are derived from the (pinned) extension ID in
// static/manifest.json, so they're stable across reloads, profiles, and
// machines. Run: `node scripts/redirect-uris.mjs`.
//
// Chrome:  https://<id>.chromiumapp.org/        where <id> is the key's hash
// Firefox: https://<id>.extensions.allizom.org/ where <id> is SHA-1(gecko.id)
//
// These must match what the service worker logs from
// chrome.identity.getRedirectURL() on boot (see README).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MANIFEST = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "static",
  "manifest.json",
);

// Chrome derives the extension ID by taking the first 16 bytes of the SHA-256
// of the public key (the DER-decoded `key` field) and mapping each hex nibble
// 0-f onto the letters a-p ("mpdecimal").
function chromeRedirectUri(key) {
  const der = Buffer.from(key, "base64");
  const digest = createHash("sha256").update(der).digest("hex").slice(0, 32);
  const id = [...digest]
    .map((nibble) => String.fromCharCode(97 + parseInt(nibble, 16)))
    .join("");
  return `https://${id}.chromiumapp.org/`;
}

// Firefox uses SHA-1 of the add-on ID (gecko.id) in hex as the subdomain.
// Verified against Firefox source (toolkit/.../child/ext-identity.js:
// `computeHash(extension.id)` with CryptoHash("sha1")). The domain comes from
// the extensions.webextensions.identity.redirectDomain pref (default below).
function firefoxRedirectUri(geckoId, domain = "extensions.allizom.org") {
  const hash = createHash("sha1").update(geckoId, "utf8").digest("hex");
  return `https://${hash}.${domain}/`;
}

function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const geckoId = manifest.browser_specific_settings?.gecko?.id;

  if (!manifest.key) {
    throw new Error(`No "key" in ${MANIFEST} — Chrome ID is not pinned.`);
  }
  if (!geckoId) {
    throw new Error(
      `No browser_specific_settings.gecko.id in ${MANIFEST} — Firefox URI is not stable.`,
    );
  }

  console.log("Register these on the Squarelet OIDC client (one per line):\n");
  console.log("Chrome: ", chromeRedirectUri(manifest.key));
  console.log("Firefox:", firefoxRedirectUri(geckoId));
}

main();
