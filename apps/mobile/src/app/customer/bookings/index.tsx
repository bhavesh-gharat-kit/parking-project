/**
 * The customer's bookings (context.txt §16).
 *
 * Phase 05 needs this for a practical reason: a booking created in the flow has
 * a summary screen, and once the customer navigates away from it there has to be
 * a way back to it — a booking with a live 10-minute window (§15) that can only
 * be seen in the seconds after it is made is not a working flow.
 *
 * So this is deliberately the plain version: one page of bookings, newest first,
 * tapping through to the summary, with Phase 08's receipt link on any row that
 * has one. §16's full history — filters, paging — is still out of scope.
 *
 * Both statuses are on the row. They move independently (§14, §32): a UPI
 * booking reads "Payment Verification · Verification Pending" and a cash one
 * "Pending Approval · Pending", and collapsing them into one line would lose
 * exactly the distinction a customer is waiting on.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import {
  PAYMENT_STATUS_LABELS,
  formatInr,
  formatIstDateTime,
  isReceiptEligible,
  type Booking,
  type Paginated,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { Card } from '@/components/card';
import { ScreenContainer } from '@/components/screen-container';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';

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
    <ScreenContainer>
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
              <View style={styles.empty}>
                <Ionicons name="receipt-outline" size={32} color={theme.textSecondary} />
                <ThemedText themeColor="textSecondary">
                  No bookings yet. Book parking and it will show up here.
                </ThemedText>
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/customer/bookings/${item.id}`)}>
              <Card>
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
                <View style={styles.statusRow}>
                  <StatusBadge status={item.status} />
                  {item.payment ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      Payment: {PAYMENT_STATUS_LABELS[item.payment.status]}
                    </ThemedText>
                  ) : null}
                </View>
                {isReceiptEligible(item.status) ? (
                  <Pressable
                    onPress={() => router.push(`/customer/bookings/${item.id}/receipt`)}
                    hitSlop={8}
                  >
                    <ThemedText type="small" themeColor="primary">
                      View receipt
                    </ThemedText>
                  </Pressable>
                ) : null}
              </Card>
            </Pressable>
          )}
        />
      )}

      {loadError ? (
        <View
          style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}
        >
          <Ionicons name="alert-circle" size={18} color={theme.danger} />
          <ThemedText type="small" themeColor="danger" style={styles.bannerText}>
            {loadError}
          </ThemedText>
        </View>
      ) : null}

      <AppButton label="Book parking" onPress={() => router.push('/customer/book')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { gap: Spacing.two },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.control,
    borderWidth: 1,
    padding: Spacing.three,
  },
  bannerText: { flex: 1 },
});
