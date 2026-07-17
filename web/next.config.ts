import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silences "Next.js inferred your workspace root" — this repo has a
  // second lockfile above web/ (the monorepo root's), which Turbopack/Next
  // would otherwise guess at. web/ is the actual root for this app.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
