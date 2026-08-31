import path from "node:path";
import type { NextConfig } from "next";

// No nonce-based CSP here deliberately — nonces require every page to be
// dynamically rendered (see Next's content-security-policy guide), which
// would kill the static prerendering this app relies on for its CDN-cached
// pages. This is the "without nonces" tier the guide recommends instead:
// still blocks arbitrary third-party script/frame/object injection, at the
// cost of allowing same-origin inline scripts/styles (Next's own bootstrap
// scripts and Tailwind's inline style props need that either way).
//
// connect-src's googleapis.com/firebaseapp.com wildcards are deliberately
// broad rather than enumerating identitytoolkit/securetoken/firestore
// individually — the Firebase Auth/Firestore Web SDKs talk to several
// Google-owned hosts and getting even one wrong here would silently break
// login (Google/Apple sign-in in particular — see project memory on that
// feature). Worth narrowing once specifically verified against a live
// authenticated session.
const isDev = process.env.NODE_ENV === "development";
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://apis.google.com${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  font-src 'self';
  connect-src 'self' https://*.googleapis.com https://api.cloudinary.com https://api-432175584982.us-central1.run.app https://hit-organization.onrender.com${isDev ? " http://localhost:* ws://localhost:*" : ""};
  frame-src https://*.firebaseapp.com https://accounts.google.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, " ").trim();

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspHeader },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Silences "Next.js inferred your workspace root" — this repo has a
  // second lockfile above web/ (the monorepo root's), which Turbopack/Next
  // would otherwise guess at. web/ is the actual root for this app.
  outputFileTracingRoot: path.join(__dirname),
  // Firebase Hosting's Next.js framework integration couldn't reliably wrap
  // this app as a Cloud Function (times out on backend discovery — a
  // firebase-frameworks/firebase-functions compatibility gap, not something
  // fixable from this repo). Deployed as a standalone Cloud Run container
  // instead, same pattern as server/ — this trims the image to just the
  // files next start actually needs.
  output: "standalone",
  async headers() {
    return [
      {
        // Every route in this app is a page (no app/api/** here — the real
        // API is the separate server/ Cloud Run service), so one blanket
        // rule is enough; Next.js's own immutable Cache-Control on
        // content-hashed /_next/static files can't be overridden anyway
        // (see the headers() docs), so this Cache-Control override only
        // actually affects page/document responses.
        //
        // Why override it at all: Next.js defaults statically-generated
        // pages to `s-maxage=31536000` (1 year), assuming the hosting
        // platform invalidates that on deploy. Firebase Hosting's rewrite
        // to this Cloud Run service doesn't — a `gcloud run deploy` here
        // never tells the Hosting CDN to drop its cached HTML, so a stale
        // cached page can keep referencing a previous build's chunk hashes
        // after the container serving them is gone (observed live
        // 2026-08-31: two JS chunks 404ing on every load). A short
        // `s-maxage` with `stale-while-revalidate` lets the CDN keep
        // serving fast cached responses normally, but re-checks the origin
        // often enough that a stale reference can't survive for long.
        source: "/(.*)",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=120, stale-while-revalidate=600" },
        ],
      },
    ];
  },
};

export default nextConfig;
