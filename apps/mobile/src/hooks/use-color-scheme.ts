/**
 * The device's light/dark preference.
 *
 * The Expo template shipped a `.web.ts` variant that returned 'light' until
 * hydration, to avoid a static-render mismatch. It is gone because this app
 * targets Android (context.txt §1) and the Phase 2 website is a Next.js app on
 * the same backend (§28), not an Expo-web export — so the only thing that
 * variant did here was trip the react-hooks lint rule.
 */
export { useColorScheme } from 'react-native';
