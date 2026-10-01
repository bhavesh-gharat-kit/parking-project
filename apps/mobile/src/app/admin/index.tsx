/**
 * Admin dashboard (context.txt §19-20, Phase 10).
 *
 * A snapshot, not a report: there is no date picker here — that lives on
 * `/admin/reports` (§26). Numbers arrive grouped by `ParkingLocation` on the
 * wire (`AdminDashboardSummary.locations`, §23) even though there is exactly
 * one active branch today, so a location heading only appears once there is
 * more than one to tell apart.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { formatInr, type AdminDashboardSummary } from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { CardShadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

function StatTile({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="subtitle">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

export default function AdminHomeScreen() {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiRequest<AdminDashboardSummary>('/api/admin/dashboard');
      setSummary(data);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load the dashboard.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.text} />
      }
    >
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">Welcome back{user?.name ? `, ${user.name}` : ''}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {user?.email}
        </ThemedText>
      </View>

      {summary === null && !loadError ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.text} />
        </View>
      ) : (
        summary?.locations.map((location) => (
          <View key={location.locationId} style={styles.section}>
            {summary.locations.length > 1 ? (
              <ThemedText type="smallBold">{location.locationName}</ThemedText>
            ) : null}
            <View style={styles.grid}>
              <StatTile label="Today's bookings" value={String(location.todayBookingsCount)} />
              <StatTile label="Confirmed today" value={String(location.confirmedBookingsCount)} />
              <StatTile label="UPI verification" value={String(location.pendingUpiVerificationCount)} />
              <StatTile label="Cash approval" value={String(location.pendingCashApprovalCount)} />
            </View>
            <View style={[styles.revenueCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary">
                Today&apos;s revenue
              </ThemedText>
              <ThemedText type="subtitle" themeColor="primary">
                {formatInr(location.todayRevenueInPaise)}
              </ThemedText>
            </View>
          </View>
        ))
      )}

      {loadError ? (
        <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
          <ThemedText type="small" themeColor="danger">
            {loadError}
          </ThemedText>
        </View>
      ) : null}

      <AppButton
        label="Booking approvals"
        icon={<Ionicons name="checkmark-done-outline" size={20} color={theme.onPrimary} />}
        onPress={() => router.push('/admin/bookings')}
      />
      <AppButton
        label="Reports"
        icon={<Ionicons name="bar-chart-outline" size={20} color={theme.onPrimary} />}
        onPress={() => router.push('/admin/reports')}
      />
      <AppButton
        label="Users"
        icon={<Ionicons name="people-outline" size={20} color={theme.onPrimary} />}
        onPress={() => router.push('/admin/users')}
      />
      <AppButton
        label="Locations & rates"
        variant="secondary"
        icon={<Ionicons name="business-outline" size={20} color={theme.text} />}
        onPress={() => router.push('/admin/locations')}
      />
      <AppButton
        label="My profile"
        variant="secondary"
        icon={<Ionicons name="person-outline" size={20} color={theme.text} />}
        onPress={() => router.push('/admin/profile')}
      />

      <AppButton label="Sign out" variant="secondary" onPress={() => void signOut()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    ...CardShadow,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  loading: { paddingVertical: Spacing.five, alignItems: 'center' },
  section: { gap: Spacing.two },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  tile: {
    ...CardShadow,
    flexBasis: '47%',
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  revenueCard: {
    ...CardShadow,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  banner: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
});
