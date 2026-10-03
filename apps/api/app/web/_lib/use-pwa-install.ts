'use client';

import { useSyncExternalStore } from 'react';

import { getPwaInstallSnapshot, subscribePwaInstall, type PwaInstallState } from './pwa-install';

const SERVER_SNAPSHOT: PwaInstallState = { installable: false, installed: false };

export function usePwaInstall(): PwaInstallState {
  return useSyncExternalStore(subscribePwaInstall, getPwaInstallSnapshot, () => SERVER_SNAPSHOT);
}
