/**
 * Metro config for a workspace checkout.
 *
 * This app has no cross-package source to watch (unlike apps/mobile, which
 * watches `@parking/shared`) — it only needs `nodeModulesPaths`, since npm
 * hoists most dependencies to the repo root.
 *
 * https://docs.expo.dev/guides/monorepos/
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
