/**
 * Admin reports (context.txt §26-27, Phase 10).
 *
 * A date-range filter over the same per-location shape the dashboard uses
 * (§23 — nothing here assumes a single branch, it just only ever renders one
 * section today). Loads with no filter (all-time) first, then re-fetches
 * whichever range the admin types in. PDF/Excel export is explicitly out of
 * scope for launch (`_/prompts/10-admin-dashboard-reports.md`) — these are
 * on-screen numbers only.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  formatInr,
  type AdminReport,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { CardShadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

export default function AdminReportsScreen() {
  const theme = useTheme();
  const [dateFromInput, setDateFromInput] = useState('');
  const [dateToInput, setDateToInput] = useState('');
  // What was last applied — separate from the inputs above so typing a new
  // range doesn't refetch until "Apply" is tapped.
  const [appliedRange, setAppliedRange] = useState({ dateFrom: '', dateTo: '' });
  const [report, setReport] = useState<AdminReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (appliedRange.dateFrom) params.set('dateFrom', appliedRange.dateFrom);
      if (appliedRange.dateTo) params.set('dateTo', appliedRange.dateTo);

      const data = await apiRequest<AdminReport>(`/api/admin/reports?${params.toString()}`);
      setReport(data);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load the report.');
    } finally {
      setLoading(false);
    }
  }, [appliedRange]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <KeyboardAwareScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      bottomOffset={Spacing.four}
    >
      <ThemedText type="subtitle">Reports</ThemedText>

      <View style={styles.filterRow}>
        <TextInput
          value={dateFromInput}
          onChangeText={setDateFromInput}
          placeholder="From (YYYY-MM-DD)"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          style={[
            styles.dateInput,
            { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}
        />
        <TextInput
          value={dateToInput}
          onChangeText={setDateToInput}
          placeholder="To (YYYY-MM-DD)"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          style={[
            styles.dateInput,
            { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Leave both blank for all time.
      </ThemedText>

      <View style={styles.filterActions}>
        <AppButton
          label="Apply"
          loading={loading}
          onPress={() =>
            setAppliedRange({ dateFrom: dateFromInput.trim(), dateTo: dateToInput.trim() })
          }
        />
        <AppButton
          label="Clear"
          variant="secondary"
          onPress={() => {
            setDateFromInput('');
            setDateToInput('');
            setAppliedRange({ dateFrom: '', dateTo: '' });
          }}
        />
      </View>

      {report === null && !loadError ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.text} />
        </View>
      ) : (
        report?.locations.map((location) => (
          <View key={location.locationId} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            {report.locations.length > 1 ? (
              <ThemedText type="smallBold">{location.locationName}</ThemedText>
            ) : null}

            <StatRow label="Total bookings" value={String(location.totalBookings)} />
            <StatRow label="Confirmed" value={String(location.confirmedBookings)} />
            <StatRow label="Rejected" value={String(location.rejectedBookings)} />
            <StatRow label="Cancelled" value={String(location.cancelledBookings)} />

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <StatRow label="Total revenue" value={formatInr(location.totalRevenueInPaise)} />
            {PAYMENT_METHODS.map((method) => (
              <StatRow
                key={method}
                label={PAYMENT_METHOD_LABELS[method]}
                value={formatInr(location.revenueByMethod[method])}
              />
            ))}

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {VEHICLE_TYPES.map((vehicleType) => (
              <StatRow
                key={vehicleType}
                label={VEHICLE_TYPE_LABELS[vehicleType]}
                value={formatInr(location.revenueByVehicleType[vehicleType])}
              />
            ))}
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
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  filterRow: { flexDirection: 'row', gap: Spacing.two },
  dateInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  filterActions: { flexDirection: 'row', gap: Spacing.two },
  loading: { paddingVertical: Spacing.five, alignItems: 'center' },
  card: {
    ...CardShadow,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  divider: { height: StyleSheet.hairlineWidth },
  banner: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
});
