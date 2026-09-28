/**
 * Placeholder admin dashboard (context.txt §19-20).
 *
 * Phases 04, 07 and 10 fill this stack in. For Phase 02 it carries the identity,
 * a way out, and one live call to an admin-only endpoint — so that "role
 * enforcement works" is something you can see on the device rather than only in a
 * curl transcript. Signed in as a `USER`, the same call answers 403; that is the
 * whole point of `requireRole` on the server.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Paginated } from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

export default function AdminHomeScreen() {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  const [probe, setProbe] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const checkAdminApi = async () => {
    setBusy(true);
    setProbe(null);
    try {
      const page = await apiRequest<Paginated<unknown>>('/api/admin/users?pageSize=1');
      setProbe({ ok: true, message: `GET /api/admin/users → 200, ${page.total} user(s) registered.` });
    } catch (error) {
      setProbe({
        ok: false,
        message:
          error instanceof ApiError
            ? `GET /api/admin/users → ${error.status} ${error.code}: ${error.message}`
            : 'Request failed.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedText type="subtitle">Admin</ThemedText>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">{user?.name ?? 'Signed in'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {user?.email}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Role: {user?.role}
        </ThemedText>
      </View>

      <ThemedText themeColor="textSecondary">
        Phases 07 and 10 fill in the rest: booking approval queue, UPI verification, cash
        approval, revenue and reports.
      </ThemedText>

      <AppButton
        label="Locations & rates"
        onPress={() => router.push('/admin/locations')}
      />

      <AppButton
        label="Check admin-only API"
        variant="secondary"
        onPress={() => void checkAdminApi()}
        loading={busy}
        disabled={busy}
      />

      {probe ? (
        <ThemedText type="small" themeColor={probe.ok ? 'textSecondary' : 'danger'}>
          {probe.message}
        </ThemedText>
      ) : null}

      <View style={styles.spacer} />

      <AppButton label="Sign out" variant="secondary" onPress={() => void signOut()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  spacer: { flex: 1 },
});
