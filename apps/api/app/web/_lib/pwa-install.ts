/**
 * Captures Chrome's `beforeinstallprompt` event and registers the /web
 * service worker, in one module-scoped place rather than per-component state
 * — the event fires once per page load and the browser invalidates it after
 * a single `.prompt()` call, so every piece of UI that can trigger an install
 * (the auto-prompt, the dismissible banner, a future nav button) has to share
 * the same captured instance rather than each listening for their own.
 *
 * `useSyncExternalStore` (see `use-pwa-install.ts`) is what lets React
 * components subscribe to this module-level state without lifting it into
 * context — the same pattern apps/mobile/src/lib/api.ts uses for the auth
 * token provider, for the same reason: this module must not depend on React.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export type PwaInstallState = {
  /** A captured, not-yet-used install prompt is available right now. */
  installable: boolean;
  /** Running as an installed/standalone app already — nothing left to offer. */
  installed: boolean;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let initialised = false;

/**
 * `useSyncExternalStore` compares snapshots with `Object.is` and re-renders
 * whenever the reference changes — a fresh `{ ... }` literal on every call
 * would therefore look "changed" on every render and loop forever. This is
 * recomputed (and the reference only replaced) inside `notify()`, i.e.
 * exactly when `deferredPrompt`/`installed` actually change.
 */
let snapshot: PwaInstallState = { installable: false, installed: false };

const listeners = new Set<() => void>();

function notify(): void {
  snapshot = { installable: deferredPrompt !== null, installed };
  for (const listener of listeners) listener();
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari has no `display-mode` media query support; it exposes this
  // non-standard property instead (absent from lib.dom.d.ts, hence the cast).
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return window.matchMedia?.('(display-mode: standalone)').matches || iosStandalone;
}

/** Idempotent — safe to call from every component that wants this state. */
export function initPwaInstall(): void {
  if (initialised || typeof window === 'undefined') return;
  initialised = true;

  installed = detectStandalone();
  notify();

  window.addEventListener('beforeinstallprompt', (event) => {
    // Without this, Chrome shows its own mini-infobar/omnibox icon
    // immediately; capturing it is what lets this app decide when and how
    // to ask instead.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });

  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.register('/web-sw.js', { scope: '/web/' }).catch((error: unknown) => {
      console.warn('[pwa] service worker registration failed:', error);
    });
  }
}

export function subscribePwaInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPwaInstallSnapshot(): PwaInstallState {
  return snapshot;
}

/**
 * Shows the native install prompt. Resolves `'unavailable'` with nothing
 * shown if no prompt has been captured — nothing to do on iOS Safari, which
 * never fires `beforeinstallprompt` at all (`InstallBanner` falls back to a
 * manual Share → Add to Home Screen hint there instead, via `isIosSafari`).
 *
 * The captured event is consumed on first use either way: Chrome invalidates
 * it after one `.prompt()` call, accepted or not, so this clears it from the
 * module state immediately rather than leaving a dead reference other UI
 * might try to reuse.
 */
export async function promptPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const prompt = deferredPrompt;
  if (!prompt) return 'unavailable';

  deferredPrompt = null;
  notify();

  try {
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    return outcome;
  } catch (error) {
    console.warn('[pwa] install prompt failed:', error);
    return 'unavailable';
  }
}

/** True on an iPhone/iPad's own Safari — the one major browser with no
 *  `beforeinstallprompt` support at all, where "install" is manual. */
export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && isSafari;
}
