/**
 * Metro config for a workspace checkout.
 *
 * Metro does not follow Node's module resolution, so in a monorepo it has to be
 * told two things explicitly:
 *
 *  1. `watchFolders` — `@parking/shared` lives outside this app's directory and
 *     ships raw TypeScript, so Metro must watch and transpile it. Without this,
 *     editing a shared Zod schema does not trigger a reload.
 *  2. `nodeModulesPaths` — npm hoists most dependencies to the repo root, so
 *     Metro has to look there as well as in `apps/mobile/node_modules`.
 *
 * https://docs.expo.dev/guides/monorepos/
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// `resolver.disableHierarchicalLookup` is deliberately NOT set: older monorepo
// guides recommend `true`, but SDK 57's resolver handles a workspace layout on
// its own and `expo-doctor` flags the override as a Metro config mismatch.

module.exports = config;
