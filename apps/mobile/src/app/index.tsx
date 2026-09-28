/**
 * Placeholder entry screen.
 *
 * Phase 02 replaces this with the real sign-in screen plus a role-based redirect.
 * For now it does two jobs: it proves the app boots, and it gives a reviewer a
 * way into both navigation stacks.
 *
 * Note what it does NOT do: it is not a role picker that grants privileges.
 * `devSetSession` only fills the client store so the admin *screens* can be
 * opened; no API call trusts it, and every admin endpoint from Phase 02 onward
 * authorises off the JWT's `role` claim (context.txt §4).
 */
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { config } from '@/lib/config';
import { useAuthStore } from '@/stores/auth-store';

export default function IndexScreen() {
  const theme = useTheme();
  const devSetSession = useAuthStore((state) => state.devSetSession);
  const user = useAuthStore((state) => state.user);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Pay &amp; Park</ThemedText>
        <ThemedText themeColor="textSecondary">
          Phase 01 skeleton — the repo builds, the API answers, and both navigation stacks
          exist. No authentication or booking logic yet.
        </ThemedText>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">API base URL</ThemedText>
          <ThemedText type="code" themeColor="textSecondary">
            {config.apiBaseUrl}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Signed in as: {user ? `${user.email} (${user.role})` : 'nobody'}
          </ThemedText>
        </View>

        <ThemedText type="smallBold">Open a stack (placeholder, Phase 02 does this properly)</ThemedText>

        <Link href="/customer" asChild>
          <Pressable
            style={[styles.button, { backgroundColor: theme.backgroundSelected }]}
            onPress={() =>
              devSetSession({
                id: 'dev-customer',
                email: 'customer@example.test',
                name: 'Dev Customer',
                role: 'USER',
              })
            }
          >
            <ThemedText type="smallBold">Customer stack</ThemedText>
          </Pressable>
        </Link>

        <Link href="/admin" asChild>
          <Pressable
            style={[styles.button, { backgroundColor: theme.backgroundSelected }]}
            onPress={() =>
              devSetSession({
                id: 'dev-admin',
                email: 'admin@example.test',
                name: 'Dev Admin',
                role: 'ADMIN',
              })
            }
          >
            <ThemedText type="smallBold">Admin stack</ThemedText>
          </Pressable>
        </Link>

        <Link href="/demo-form" asChild>
          <Pressable style={[styles.button, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold">Form wiring check (RHF + Zod)</ThemedText>
          </Pressable>
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  button: {
    borderRadius: 12,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
});
