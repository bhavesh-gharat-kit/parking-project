/**
 * Expo app config.
 *
 * A `.ts` config rather than `app.json` so the values that differ between a
 * local dev build and the sideloaded launch APK (app name, Android package,
 * scheme) come from one place instead of being hand-edited before each build.
 *
 * `APP_VARIANT` is set per EAS build profile in `eas.json`, which lets the
 * development build sit on the same phone as the launch build — useful during
 * launch week when you need to reproduce something on the real APK without
 * uninstalling your dev client.
 *
 * ── Why a dev client at all (Phase 01 deliverable 4) ────────────────────────
 * Expo Go only contains the native modules Expo chose to bundle. This app needs
 * Google Sign-In (decisions.md D3), expo-secure-store for the session JWT, and
 * expo-notifications for status pushes (D4) — none of which Expo Go can load.
 * So development happens against a custom dev client built by the
 * `eas.json` `development` profile, installed once on the test phone; after
 * that `npm start` reloads JS into it exactly like Expo Go would.
 *
 * `eas.json`'s `preview` profile is what actually ships on Thursday:
 * decisions.md D1 targets a sideloaded APK, not a Play Store submission, so it
 * builds an installable .apk with production JS rather than an .aab.
 * (`eas.json` itself can't carry this comment — its JSON schema no longer
 * tolerates a `"//"` key.)
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppVariant = 'development' | 'preview' | 'production';

const variant = (process.env.APP_VARIANT ?? 'development') as AppVariant;

const VARIANTS: Record<AppVariant, { name: string; packageSuffix: string }> = {
  development: { name: 'Pay & Park (Dev)', packageSuffix: '.dev' },
  preview: { name: 'Pay & Park (Preview)', packageSuffix: '.preview' },
  production: { name: 'Pay & Park', packageSuffix: '' },
};

const BASE_PACKAGE = 'in.kdmc.payandpark';

export default ({ config }: ConfigContext): ExpoConfig => {
  const { name, packageSuffix } = VARIANTS[variant];

  return {
    ...config,
    name,
    slug: 'pay-and-park',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    /**
     * Deep-link scheme. Phase 09 needs it to open a booking from a tapped push
     * notification (decisions.md D4), and Google Sign-In needs a stable scheme
     * for its redirect.
     */
    scheme: 'payandpark',
    userInterfaceStyle: 'automatic',

    android: {
      package: `${BASE_PACKAGE}${packageSuffix}`,
      /** Bumped per Play Store submission; irrelevant to a sideloaded APK (D1). */
      versionCode: 1,
      adaptiveIcon: {
        backgroundColor: '#0B5FA5',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },

    ios: {
      bundleIdentifier: `${BASE_PACKAGE}${packageSuffix}`,
      supportsTablet: false,
    },

    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },

    plugins: [
      'expo-router',
      'expo-secure-store',
      /**
       * Native Google Sign-In (decisions.md D3). Adding this changes the native
       * project, so the dev client has to be rebuilt once — `npm run build:dev`.
       *
       * No props: `webClientId` is passed at runtime in
       * `src/lib/google-auth.ts` from `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, which
       * keeps it out of the committed config and lets the dev and launch builds
       * point at different Google projects. Android needs no `google-services.json`
       * for sign-in alone — only the OAuth clients in Google Cloud Console, whose
       * Android entry must carry this build's package name and signing SHA-1.
       */
      '@react-native-google-signin/google-signin',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#0B5FA5',
          image: './assets/images/splash-icon.png',
          imageWidth: 96,
        },
      ],
      /**
       * Expo push notifications (Phase 09, decisions.md D4). No icon/color/sound
       * props: the launch APK uses Android's default notification look, which is
       * fine for the minimal "booking confirmed/rejected/expired" pushes this
       * phase sends. Adding this plugin changes the native project, so the dev
       * client needs one rebuild — `npm run build:dev`.
       */
      'expo-notifications',
      /**
       * UPI payment-screenshot attachment (Phase 15). Camera and photo-library
       * permission strings shown on Android's runtime permission dialog. Adding
       * this plugin changes the native project, so the dev client needs one
       * rebuild — `npm run build:dev`.
       */
      [
        'expo-image-picker',
        {
          photosPermission: 'Pay & Park needs access to your photos to attach a payment screenshot.',
          cameraPermission: 'Pay & Park needs access to your camera to take a photo of your payment screenshot.',
        },
      ],
    ],

    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },

    extra: {
      /**
       * Filled in by `eas init` on first build. Required by EAS Build and by
       * `expo-notifications` to obtain an Expo push token (Phase 09).
       */
      eas: {
        projectId: process.env.EAS_PROJECT_ID ?? undefined,
      },
      appVariant: variant,
    },
  };
};
