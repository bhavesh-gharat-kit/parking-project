'use client';

import { useEffect, useRef, useState } from 'react';

import { initPwaInstall, isIosSafari, promptPwaInstall } from '../_lib/pwa-install';
import { usePwaInstall } from '../_lib/use-pwa-install';

/** Persisted across sessions — a customer who dismissed this once should not
 *  see it again on every later visit. Session-scoped state (the auto-prompt
 *  guard below) is separate on purpose: dismissing the dialog once should not
 *  stop it ever offering again. */
const DISMISSED_KEY = 'pwa-install-dismissed';
/** Session-scoped: avoids firing the native prompt a second time if this
 *  component re-renders, without permanently ruling out a later visit. */
const AUTO_PROMPT_KEY = 'pwa-install-auto-prompted';

function readFlag(storage: Storage, key: string): boolean {
  try {
    return storage.getItem(key) === '1';
  } catch {
    // Private browsing / blocked storage — treat as "not dismissed yet".
    return false;
  }
}

function writeFlag(storage: Storage, key: string): void {
  try {
    storage.setItem(key, '1');
  } catch {
    // Nothing useful to do if storage is blocked; the banner just reappears.
  }
}

/**
 * Global install UI for the /web PWA (mounted once in `app/web/layout.tsx`,
 * so it is available from sign-in onward, not only inside the signed-in
 * shells). Three states it can be in:
 *
 *  - Chrome/Edge/Android, not installed: captures `beforeinstallprompt`,
 *    fires the native prompt automatically the first time it becomes
 *    available this session, and leaves a banner with its own "Install"
 *    button up in case that prompt is dismissed or never arrives in time.
 *  - iOS Safari: never gets `beforeinstallprompt` at all, so there is no
 *    programmatic install — just a one-time instruction banner for the
 *    manual Share → Add to Home Screen flow.
 *  - Already installed (standalone display mode): renders nothing.
 */
export function InstallBanner() {
  const { installable, installed } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const autoPrompted = useRef(false);

  useEffect(() => {
    initPwaInstall();
    // `localStorage` and `navigator.userAgent` do not exist during SSR, so
    // this genuinely can only be known after mount — not state derivable
    // from props/earlier state the way the lint rule's guidance assumes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(readFlag(window.localStorage, DISMISSED_KEY));
    setShowIosHint(isIosSafari());
  }, []);

  useEffect(() => {
    if (!installable || installed || autoPrompted.current) return;
    if (readFlag(window.sessionStorage, AUTO_PROMPT_KEY)) return;

    autoPrompted.current = true;
    writeFlag(window.sessionStorage, AUTO_PROMPT_KEY);
    void promptPwaInstall();
  }, [installable, installed]);

  const dismiss = () => {
    setDismissed(true);
    writeFlag(window.localStorage, DISMISSED_KEY);
  };

  if (installed || dismissed) return null;

  if (installable) {
    return (
      <div className="install-banner">
        <span className="text-small">Install Pay &amp; Park for quicker access next time.</span>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={() => void promptPwaInstall()}>
            Install
          </button>
          <button type="button" className="btn btn-ghost" onClick={dismiss}>
            Not now
          </button>
        </div>
      </div>
    );
  }

  // iOS Safari: `beforeinstallprompt` never fires, so `installable` is never
  // true there — this is the only path that ever offers iOS the option.
  if (showIosHint) {
    return (
      <div className="install-banner">
        <span className="text-small">
          Install Pay &amp; Park: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
        </span>
        <button type="button" className="btn btn-ghost" onClick={dismiss}>
          Got it
        </button>
      </div>
    );
  }

  return null;
}
