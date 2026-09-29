/**
 * Booking summary (context.txt §248-258, Phase 05) — the last step of the
 * booking flow and the screen a customer comes back to afterwards.
 *
 * Shows every field §9 asks for: location, vehicle, vehicle type,
 * duration/package, start time, end time, amount, payment method and booking
 * status — plus the payment status beside it, because those are two separate
 * things (§14, §32) and a customer waiting on a UPI verification needs to see
 * both.
 *
 * ── Everything here comes from the server ──────────────────────────────────
 * Nothing is carried over from the draft store. The amount in particular is
 * `booking.amountInPaise` as the backend computed it from the `ParkingRate`
 * (§32), so what this screen shows is by construction what the business will
 * charge — not what the app thought the price was one screen ago.
 *
 * ── Why it refetches on focus and counts down locally ──────────────────────
 * Both statuses move without the customer doing anything: the §15 sweep expires
 * an unpaid booking, and a Phase 07 admin confirms or rejects one. So the screen
 * re-reads on every focus and offers pull-to-refresh, and the countdown ticks
 * from `expiresAt` purely as a display of how long is left — reaching 0:00
 * changes nothing on its own, because only the server may decide a booking
 * expired (the next sweep will say so, and the following refresh will show it).
 */
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import {
  BOOKING_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  formatCountdown,
  formatInr,
  formatIstDateTime,
  isCustomerCancellable,
  isTerminalBookingStatus,
  type Booking,
  type BookingStatus,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';

/** Which theme colour a status reads in. Confirmed is the only good news. */
function statusColor(status: BookingStatus): ThemeColor {
  if (status === 'CONFIRMED' || status === 'COMPLETED') return 'primary';
  if (status === 'REJECTED' || status === 'EXPIRED' || status === 'CANCELLED') return 'danger';
  return 'textSecondary';
}

type SummaryRow = { label: string; value: string };

/**
 * The divider is drawn on the TOP of every row but the first, rather than under
 * every row, so the card never ends on a stray hairline — which matters here
 * because several rows are conditional and "the last one" is not a fixed row.
 */
function SummaryRowView({ row, first }: { row: SummaryRow; first: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        first ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
      ]}
    >
      <ThemedText type="small" themeColor="textSecondary" style={styles.rowLabel}>
        {row.label}
      </ThemedText>
      <ThemedText type="small" style={styles.rowValue}>
        {row.value}
      </ThemedText>
    </View>
  );
}

export default function BookingSummaryScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setBooking(await apiRequest<Booking>(`/api/bookings/${id}`));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load this booking.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const expiresAt = booking?.expiresAt ? new Date(booking.expiresAt).getTime() : null;
  const countdownRunning = expiresAt !== null && !isTerminalBookingStatus(booking?.status ?? 'PENDING');
  const pastDeadline = expiresAt !== null && now >= expiresAt;

  /**
   * Before the deadline: tick the clock. After it: re-read instead.
   *
   * Only the server may decide a booking expired, and the sweep runs on the
   * minute (§15), so once the local clock runs out there is nothing more it can
   * usefully say — polling is what turns "will expire shortly" into the real
   * status without the customer having to pull to refresh. `pastDeadline` is a
   * boolean, so the one-second `setNow` re-renders do not restart the interval;
   * it is replaced once, when the deadline passes, and torn down when the status
   * lands somewhere terminal.
   */
  useEffect(() => {
    if (!countdownRunning) return;

    const timer = setInterval(
      () => {
        if (pastDeadline) void load();
        else setNow(Date.now());
      },
      pastDeadline ? 15_000 : 1000,
    );

    return () => clearInterval(timer);
  }, [countdownRunning, pastDeadline, load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const confirmCancel = () => {
    Alert.alert('Cancel booking', 'Cancel this parking booking?', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel booking', style: 'destructive', onPress: () => void cancelBooking() },
    ]);
  };

  const cancelBooking = async () => {
    setCancelling(true);
    try {
      setBooking(await apiRequest<Booking>(`/api/bookings/${id}/cancel`, { method: 'POST', body: {} }));
    } catch (error) {
      // INVALID_STATE_TRANSITION lands here when the booking moved on while the
      // screen was open — the message asks for a refresh rather than reporting
      // a failure, which is what actually happened.
      Alert.alert(
        'Could not cancel',
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
      void load();
    } finally {
      setCancelling(false);
    }
  };

  if (booking === null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Booking' }} />
        <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
          {loadError ? (
            <>
              <ThemedText themeColor="danger">{loadError}</ThemedText>
              <AppButton label="Try again" variant="secondary" onPress={() => void load()} />
            </>
          ) : (
            <ActivityIndicator color={theme.text} />
          )}
        </View>
      </>
    );
  }

  const remaining = expiresAt === null ? null : expiresAt - now;

  // context.txt §248-258, in the order that section lists them. Assembled as
  // data rather than JSX so the optional rows are a filter instead of four
  // nested ternaries in the middle of the layout.
  const rows: SummaryRow[] = [
    { label: 'Location', value: `${booking.location.name}, ${booking.location.city}` },
    { label: 'Address', value: booking.location.addressLine },
    { label: 'Vehicle', value: booking.vehicleNumber },
    { label: 'Vehicle type', value: VEHICLE_TYPE_LABELS[booking.vehicleType] },
    { label: 'Package', value: booking.rateLabel },
    { label: 'Starts', value: formatIstDateTime(booking.startTime) },
    { label: 'Ends', value: formatIstDateTime(booking.endTime) },
    { label: 'Amount', value: formatInr(booking.amountInPaise) },
    {
      label: 'Payment method',
      value: booking.paymentMethod
        ? PAYMENT_METHOD_LABELS[booking.paymentMethod]
        : 'Not chosen yet',
    },
    // §14/§32 — its own row beside the booking status, never merged into it.
    {
      label: 'Payment status',
      value: booking.payment ? PAYMENT_STATUS_LABELS[booking.payment.status] : 'Not started',
    },
    ...(booking.payment?.upiUtr
      ? [{ label: 'UPI reference', value: booking.payment.upiUtr }]
      : []),
    ...(booking.reviewNote ? [{ label: 'Note from parking', value: booking.reviewNote }] : []),
  ];

  return (
    <>
      <Stack.Screen options={{ title: 'Booking Summary' }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.text} />
        }
      >
        <View style={[styles.header, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Booking number
          </ThemedText>
          <ThemedText type="subtitle">{booking.bookingNumber}</ThemedText>
          <ThemedText type="smallBold" themeColor={statusColor(booking.status)}>
            {BOOKING_STATUS_LABELS[booking.status]}
          </ThemedText>
        </View>

        {countdownRunning && remaining !== null ? (
          <View style={[styles.notice, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText type="small" themeColor="textSecondary">
              {remaining > 0
                ? `Complete this booking within ${formatCountdown(remaining)} or it will expire.`
                : 'This booking has passed its time limit and will expire shortly.'}
            </ThemedText>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          {rows.map((row, index) => (
            <SummaryRowView key={row.label} row={row} first={index === 0} />
          ))}
        </View>

        {booking.status === 'PENDING' ? (
          <AppButton
            label="Choose payment method"
            onPress={() => router.push(`/customer/bookings/${booking.id}/payment`)}
          />
        ) : null}

        {booking.status === 'PENDING_PAYMENT' ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Scan the QR, pay the amount, then submit your UPI reference (UTR) so
              we can verify it.
            </ThemedText>
            <AppButton
              label="Pay via UPI"
              onPress={() => router.push(`/customer/bookings/${booking.id}/upi`)}
            />
          </>
        ) : null}

        {booking.status === 'PAYMENT_VERIFICATION' ? (
          <ThemedText type="small" themeColor="textSecondary">
            We&apos;ve received your UPI reference and are checking it against our
            bank statement. This is not yet confirmed — pull to refresh for
            updates.
          </ThemedText>
        ) : null}

        {booking.status === 'PENDING_APPROVAL' ? (
          <ThemedText type="small" themeColor="textSecondary">
            Pay the amount in cash at the parking location. An admin will confirm
            your booking once payment is received.
          </ThemedText>
        ) : null}

        {isCustomerCancellable(booking.status) ? (
          <AppButton
            label="Cancel booking"
            variant="secondary"
            loading={cancelling}
            onPress={confirmCancel}
          />
        ) : null}

        <AppButton
          label="My bookings"
          variant="ghost"
          onPress={() => router.replace('/customer/bookings')}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  header: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  notice: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  card: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowLabel: { flexShrink: 0 },
  rowValue: { flex: 1, textAlign: 'right' },
});
