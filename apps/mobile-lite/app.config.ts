/**
 * Expo app config for the "lite" WebView variant.
 *
 * Same `APP_VARIANT` pattern as `apps/mobile/app.config.ts` (see that file for
 * the full rationale), but this app ships no dev-client native modules at all
 * — every dependency here (react-native-webview, @react-native-community/netinfo,
 * expo-splash-screen, expo-status-bar, expo-constants) is part of Expo Go's
 * sanctioned module set, so `expo start` against plain Expo Go is enough; there
 * is no `build:dev` dev-client profile to rebuild after a dependency change.
 *
 * The Android package id is deliberately distinct from `apps/mobile`'s
 * (`in.kdmc.payandpark` vs `in.kdmc.payandpark.lite`) so both variants can be
 * installed side-by-side on the same device.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppVariant = 'development' | 'preview' | 'production';

const variant = (process.env.APP_VARIANT ?? 'development') as AppVariant;

const VARIANTS: Record<AppVariant, { name: string; packageSuffix: string }> = {
  development: { name: 'Pay & Park Lite (Dev)', packageSuffix: '.dev' },
  preview: { name: 'Pay & Park Lite (Preview)', packageSuffix: '.preview' },
  production: { name: 'Pay & Park Lite', packageSuffix: '' },
};

const BASE_PACKAGE = 'in.kdmc.payandpark.lite';

export default ({ config }: ConfigContext): ExpoConfig => {
  const { name, packageSuffix } = VARIANTS[variant];

  return {
    ...config,
    name,
    slug: 'pay-and-park-lite',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'payandparklite',
    userInterfaceStyle: 'automatic',

    android: {
      package: `${BASE_PACKAGE}${packageSuffix}`,
      versionCode: 1,
      adaptiveIcon: {
        backgroundColor: '#0B5FA5',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      /**
       * CAMERA permission for the `<input type="file" capture>` payment-
       * screenshot upload inside the WebView (UTR flow,
       * `_/prompts/16-utr-screenshot-upload.md`). Declared via Expo's core
       * `android.permissions` config field — no extra plugin/dependency
       * needed, unlike `apps/mobile`'s `expo-image-picker` plugin, which this
       * app doesn't use. Android's system permission dialog text itself isn't
       * customizable without a native module; the closest this app gets to
       * "Pay & Park Lite needs access to your camera to take a photo of your
       * payment screenshot" (matching apps/mobile's wording) is this comment
       * plus the Play Store listing description.
       */
      permissions: ['android.permission.CAMERA'],
    },

    ios: {
      bundleIdentifier: `${BASE_PACKAGE}${packageSuffix}`,
      supportsTablet: false,
    },

    plugins: [
      [
        'expo-splash-screen',
        {
          backgroundColor: '#0B5FA5',
          image: './assets/images/splash-icon.png',
          imageWidth: 96,
        },
      ],
    ],

    extra: {
      eas: {
        projectId: process.env.EAS_PROJECT_ID ?? undefined,
      },
      appVariant: variant,
    },
  };
};
