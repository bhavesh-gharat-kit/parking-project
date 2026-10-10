/**
 * Pay & Park Lite — a single-screen WebView shell around apps/api's `/web`
 * frontend. No native screens, no navigation stack, no state management: the
 * web app owns the UI and all business logic, exactly as decisions.md's
 * Phase-2-website intent assumes. See the new decisions.md entry for why this
 * variant exists alongside, not instead of, the primary `apps/mobile` app.
 */
import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { WebView, type WebViewNavigation, type WebViewProps } from 'react-native-webview';

import { config } from './src/config';

const BRAND_BLUE = '#0B5FA5';

// Shown until the WebView's first page finishes loading (see `onLoadEnd`
// below) — a JS freeze or a slow backend would otherwise leave a blank
// native splash forever, so this never throws.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

type Status = 'loading' | 'error' | 'ready';

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);
  const splashHiddenRef = useRef(false);
  // Set by onError/onHttpError, cleared only on Retry — onLoadEnd fires right
  // after either of those on some platforms, with a navigation-shaped (not
  // error-shaped) event, so it can't tell success from failure on its own.
  const loadFailedRef = useRef(false);

  const [status, setStatus] = useState<Status>('loading');
  const [isConnected, setIsConnected] = useState(true);

  const hideSplash = useCallback(() => {
    if (splashHiddenRef.current) return;
    splashHiddenRef.current = true;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  // Network connectivity, independent of the WebView's own load state — a
  // dropped connection mid-session should surface the retry screen even if
  // the page itself never fires onError.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected !== false;
      setIsConnected(connected);
      if (!connected) {
        setStatus('error');
        hideSplash();
      }
    });
    return unsubscribe;
  }, [hideSplash]);

  // Hardware back button: step back through WebView history first, only let
  // the OS default (exit) happen once there's nowhere left to go back to.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBackRef.current) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, []);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    canGoBackRef.current = navState.canGoBack;
  }, []);

  const handleLoadEnd = useCallback(() => {
    hideSplash();
    if (isConnected && !loadFailedRef.current) {
      setStatus('ready');
    }
  }, [hideSplash, isConnected]);

  const handleError = useCallback(() => {
    loadFailedRef.current = true;
    setStatus('error');
    hideSplash();
  }, [hideSplash]);

  const handleHttpError = useCallback(() => {
    loadFailedRef.current = true;
    setStatus('error');
    hideSplash();
  }, [hideSplash]);

  const handleShouldStartLoadWithRequest: WebViewProps['onShouldStartLoadWithRequest'] = useCallback((request) => {
    let requestOrigin: string | null = null;
    try {
      requestOrigin = new URL(request.url).origin;
    } catch {
      requestOrigin = null;
    }

    if (requestOrigin === config.webOrigin) {
      return true;
    }

    // tel:, mailto:, upi:// payment intents, and any other external link —
    // hand off to the OS instead of letting the WebView try to render it.
    void Linking.openURL(request.url).catch(() => undefined);
    return false;
  }, []);

  const handleRetry = useCallback(() => {
    loadFailedRef.current = false;
    setStatus('loading');
    NetInfo.fetch()
      .then((state) => {
        setIsConnected(state.isConnected !== false);
      })
      .catch(() => undefined);
    webViewRef.current?.reload();
  }, []);

  return (
    <View style={styles.fill}>
      <StatusBar style="light" />

      <WebView
        ref={webViewRef}
        source={{ uri: config.webEntryUrl }}
        style={styles.fill}
        onNavigationStateChange={handleNavigationStateChange}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onHttpError={handleHttpError}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowsBackForwardNavigationGestures
        sharedCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        startInLoadingState={false}
      />

      {status !== 'ready' ? (
        <View style={styles.overlay}>
          {status === 'error' ? (
            <View style={styles.center}>
              <Text style={styles.title}>
                {isConnected ? "Couldn't load Pay & Park" : 'No internet connection'}
              </Text>
              <Text style={styles.subtitle}>
                {isConnected
                  ? 'The server could not be reached. Check your connection and try again.'
                  : 'Reconnect to the internet, then try again.'}
              </Text>
              <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={styles.title}>Pay &amp; Park</Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.85,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: BRAND_BLUE,
    fontSize: 16,
    fontWeight: '600',
  },
});
