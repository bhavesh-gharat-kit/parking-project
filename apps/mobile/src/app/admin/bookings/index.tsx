/**
 * Admin booking queue (context.txt §21, §388-393, Phase 07).
 *
 * The filter chips are exactly `BookingStatus` values, not a bespoke "queue
 * type" concept: `PAYMENT_VERIFICATION` only ever holds UPI bookings and
 * `PENDING_APPROVAL` only ever holds cash ones (§14's state machine), so
 * filtering on status already gives the two queues context.txt §12 asks the
 * admin to be able to tell apart. `search` matches booking number, vehicle
 * number, or customer name/email — the same three the spec names.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  PAYMENT_METHOD_LABELS,
  formatInr,
  formatIstDateTime,
  type AdminBooking,
  type BookingStatus,
  type Paginated,
} from '@parking/shared';

import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { CardShadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';

type QueueFilter = 'ALL' | BookingStatus;

const FILTERS: { value: QueueFilter; label: string }[] = [
  { value: 'PAYMENT_VERIFICATION', label: 'UPI verification' },
  { value: 'PENDING_APPROVAL', label: 'Cash approval' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

export default function AdminBookingsScreen() {
  const theme = useTheme();
  const [filter, setFilter] = useState<QueueFilter>('PAYMENT_VERIFICATION');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (filter !== 'ALL') params.set('status', filter);
      if (search) params.set('search', search);
      params.set('pageSize', '50');

      const page = await apiRequest<Paginated<AdminBooking>>(
        `/api/admin/bookings?${params.toString()}`,
      );
      setBookings(page.items);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load bookings.');
    }
  }, [filter, search]);

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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <TextInput
        value={searchInput}
        onChangeText={setSearchInput}
        onSubmitEditing={() => setSearch(searchInput.trim())}
        placeholder="Search booking #, vehicle, customer"
        placeholderTextColor={theme.textSecondary}
        returnKeyType="search"
        style={[
          styles.search,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}
      />

      <View style={styles.chipRow}>
        {FILTERS.map((item) => {
          const selected = filter === item.value;
          return (
            <Pressable
              key={item.value}
              onPress={() => setFilter(item.value)}
              style={[
                styles.chip,
                { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement },
              ]}
            >
              <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
                {item.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {bookings === null && !loadError ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.text} />
        </View>
      ) : (
        <FlatList
          data={bookings ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.text} />
          }
          ListEmptyComponent={
            bookings === null ? null : (
              <ThemedText themeColor="textSecondary">Nothing here right now.</ThemedText>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/admin/bookings/${item.id}`)}
              style={[styles.card, { backgroundColor: theme.backgroundElement }]}
            >
              <View style={styles.cardHeader}>
                <ThemedText type="smallBold">{item.bookingNumber}</ThemedText>
                <ThemedText type="smallBold" themeColor="primary">
                  {formatInr(item.amountInPaise)}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {item.customer.name ?? item.customer.email} · {item.vehicleNumber}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatIstDateTime(item.startTime)}
              </ThemedText>
              <View style={styles.statusRow}>
                <StatusBadge status={item.status} />
                {item.paymentMethod ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {PAYMENT_METHOD_LABELS[item.paymentMethod]}
                  </ThemedText>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}

      {loadError ? (
        <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
          <ThemedText type="small" themeColor="danger">
            {loadError}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  search: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { gap: Spacing.two },
  card: {
    ...CardShadow,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  banner: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
});
