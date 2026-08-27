import path from "node:path";
import type { NextConfig } from "next";

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
};

export default nextConfig;
