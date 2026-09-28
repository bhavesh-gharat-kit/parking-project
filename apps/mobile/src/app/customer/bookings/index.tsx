/**
 * The customer's bookings (context.txt §16).
 *
 * Phase 05 needs this for a practical reason: a booking created in the flow has
 * a summary screen, and once the customer navigates away from it there has to be
 * a way back to it — a booking with a live 10-minute window (§15) that can only
 * be seen in the seconds after it is made is not a working flow.
 *
 * So this is deliberately the plain version: one page of bookings, newest first,
 * tapping through to the summary. §16's full history — filters, the receipt link
 * (§17), paging — belongs to Phase 08, which is where the receipt it should link
 * to gets built.
 *
 * Both statuses are on the row. They move independently (§14, §32): a UPI
 * booking reads "Payment Verification · Verification Pending" and a cash one
 * "Pending Approval · Pending", and collapsing them into one line would lose
 * exactly the distinction a customer is waiting on.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import {
  BOOKING_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  formatInr,
  formatIstDateTime,
  type Booking,
  type BookingStatus,
  type Paginated,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';

function statusColor(status: BookingStatus): ThemeColor {
  if (status === 'CONFIRMED' || status === 'COMPLETED') return 'primary';
  if (status === 'REJECTED' || status === 'EXPIRED' || status === 'CANCELLED') return 'danger';
  return 'textSecondary';
}

export default function BookingsScreen() {
  const theme = useTheme();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const page = await apiRequest<Paginated<Booking>>('/api/bookings');
      setBookings(page.items);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load your bookings.');
    }
  }, []);

  // A booking's status changes server-side while this screen sits in the stack —
  // the §15 sweep, a Phase 07 approval — so it re-reads on focus as well as on
  // pull-to-refresh.
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
              <ThemedText themeColor="textSecondary">
                No bookings yet. Book parking and it will show up here.
              </ThemedText>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/customer/bookings/${item.id}`)}
              style={[styles.card, { backgroundColor: theme.backgroundElement }]}
            >
              <View style={styles.cardHeader}>
                <ThemedText type="smallBold">{item.bookingNumber}</ThemedText>
                <ThemedText type="smallBold" themeColor="primary">
                  {formatInr(item.amountInPaise)}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {item.location.name} · {item.vehicleNumber} · {item.rateLabel}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatIstDateTime(item.startTime)}
              </ThemedText>
              <ThemedText type="small" themeColor={statusColor(item.status)}>
                {BOOKING_STATUS_LABELS[item.status]}
                {item.payment ? ` · Payment: ${PAYMENT_STATUS_LABELS[item.payment.status]}` : ''}
              </ThemedText>
            </Pressable>
          )}
        />
      )}

      {loadError ? (
        <View
          style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}
        >
          <ThemedText type="small" themeColor="danger">
            {loadError}
          </ThemedText>
        </View>
      ) : null}

      <AppButton label="Book parking" onPress={() => router.push('/customer/book')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { gap: Spacing.two },
  card: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  banner: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
});
