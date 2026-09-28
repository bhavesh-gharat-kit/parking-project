import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  /**
   * `@parking/shared` ships raw TypeScript (no build step — see the README's
   * "Shared typing strategy"), so Next has to compile it rather than treat it as
   * a prebuilt dependency.
   */
  transpilePackages: ['@parking/shared'],

  /**
   * In a workspace the files this app needs live above its own directory. Point
   * Next's file tracing at the repo root so `next build` (and the standalone
   * output used by PM2 in Phase 11) picks up `packages/shared` and the hoisted
   * `node_modules`.
   */
  outputFileTracingRoot: path.join(__dirname, '../../'),

  /**
   * Prisma's generated client and the MariaDB driver are Node-only and must not
   * be bundled into the server chunks.
   */
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-mariadb', 'mariadb'],
};

export default nextConfig;
