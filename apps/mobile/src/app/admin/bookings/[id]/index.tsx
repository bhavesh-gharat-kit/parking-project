/**
 * Admin booking detail (context.txt §21, §601-602, §341-349, Phase 07).
 *
 * The one screen that turns a queue row into a decision: everything the
 * customer's own booking summary shows, plus who it belongs to, and — for a
 * UPI booking — the payment evidence in its own callout, because checking
 * that against the bank statement is the entire reason this screen exists.
 *
 * Phase 15 made the screenshot the required evidence and the UTR optional, so
 * the callout below renders on either one being present and shows whichever
 * pieces actually exist — it must not gate the screenshot on `upiUtr` being
 * set, since a booking can now have a screenshot with no typed UTR at all.
 *
 * ── Why the reject reason is an inline field, not `Alert.prompt` ───────────
 * `Alert.prompt` only exists on iOS; this is an Android-first app (context.txt
 * §1). Tapping "Reject" reveals a plain text input and its own confirm button
 * instead — which doubles as the "confirmation step before rejecting" the spec
 * asks for (context.txt, Phase 07 deliverables): a customer's booking is never
 * one accidental tap away from being rejected.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  formatInr,
  formatIstDateTime,
  type AdminBooking,
  type BookingStatus,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { CardShadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';

/** Whether an admin decision is even possible right now (§14's table agrees). */
function isActionable(status: BookingStatus): boolean {
  return status === 'PAYMENT_VERIFICATION' || status === 'PENDING_APPROVAL';
}

type SummaryRow = { label: string; value: string };

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

export default function AdminBookingDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<AdminBooking | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState('');
  const [screenshotViewerOpen, setScreenshotViewerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setBooking(await apiRequest<AdminBooking>(`/api/admin/bookings/${id}`));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load this booking.');
    }
  }, [id]);

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

  const confirmApprove = () => {
    Alert.alert(
      'Approve booking',
      booking?.paymentMethod === 'UPI'
        ? 'Confirm you have checked the UTR against the bank statement, then approve.'
        : 'Confirm the cash has been received, then approve.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => void approve() },
      ],
    );
  };

  const approve = async () => {
    setApproving(true);
    try {
      setBooking(
        await apiRequest<AdminBooking>(`/api/admin/bookings/${id}/approve`, {
          method: 'POST',
          body: {},
        }),
      );
    } catch (error) {
      Alert.alert(
        'Could not approve',
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
      void load();
    } finally {
      setApproving(false);
    }
  };

  const reject = async () => {
    setRejecting(true);
    try {
      setBooking(
        await apiRequest<AdminBooking>(`/api/admin/bookings/${id}/reject`, {
          method: 'POST',
          body: { reason: reason.trim() || undefined },
        }),
      );
      setRejectMode(false);
      setReason('');
    } catch (error) {
      Alert.alert(
        'Could not reject',
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
      void load();
    } finally {
      setRejecting(false);
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

  const rows: SummaryRow[] = [
    { label: 'Customer', value: booking.customer.name ?? '(no name on file)' },
    { label: 'Email', value: booking.customer.email },
    ...(booking.customer.phone ? [{ label: 'Phone', value: booking.customer.phone }] : []),
    { label: 'Location', value: booking.location.name },
    { label: 'Vehicle', value: booking.vehicleNumber },
    { label: 'Vehicle type', value: VEHICLE_TYPE_LABELS[booking.vehicleType] },
    { label: 'Package', value: booking.rateLabel },
    { label: 'Starts', value: formatIstDateTime(booking.startTime) },
    { label: 'Ends', value: formatIstDateTime(booking.endTime) },
    { label: 'Amount', value: formatInr(booking.amountInPaise) },
    {
      label: 'Payment method',
      value: booking.paymentMethod ? PAYMENT_METHOD_LABELS[booking.paymentMethod] : 'Not chosen yet',
    },
    {
      label: 'Payment status',
      value: booking.payment ? PAYMENT_STATUS_LABELS[booking.payment.status] : 'Not started',
    },
    ...(booking.reviewNote ? [{ label: 'Review note', value: booking.reviewNote }] : []),
  ];

  return (
    <>
      <Stack.Screen options={{ title: booking.bookingNumber }} />
      <KeyboardAwareScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.container}
        bottomOffset={Spacing.four}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.text} />
        }
      >
        <View style={[styles.header, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Booking number
          </ThemedText>
          <ThemedText type="subtitle">{booking.bookingNumber}</ThemedText>
          <StatusBadge status={booking.status} size="large" />
        </View>

        {booking.payment?.upiUtr || booking.payment?.utrScreenshotUrl ? (
          <View style={[styles.utrCallout, { backgroundColor: theme.backgroundSelected, borderColor: theme.primary }]}>
            <ThemedText type="small" themeColor="textSecondary">
              Payment evidence — check this against the bank statement
            </ThemedText>

            {booking.payment.upiUtr ? (
              <ThemedText type="title" style={styles.utrValue}>
                {booking.payment.upiUtr}
              </ThemedText>
            ) : null}

            {booking.payment.utrScreenshotUrl ? (
              <Pressable onPress={() => setScreenshotViewerOpen(true)} style={styles.screenshotThumbWrap}>
                <Image
                  source={{ uri: booking.payment.utrScreenshotUrl }}
                  style={styles.screenshotThumb}
                  contentFit="cover"
                />
                <ThemedText type="small" themeColor="textSecondary">
                  Tap to view full size
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {booking.payment?.utrScreenshotUrl ? (
          <Modal
            visible={screenshotViewerOpen}
            animationType="fade"
            onRequestClose={() => setScreenshotViewerOpen(false)}
          >
            <View style={styles.viewerBackdrop}>
              <Pressable
                onPress={() => setScreenshotViewerOpen(false)}
                style={[styles.viewerClose, { top: Spacing.three + insets.top }]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={28} color="#fff" />
              </Pressable>
              <Image
                source={{ uri: booking.payment.utrScreenshotUrl }}
                style={styles.viewerImage}
                contentFit="contain"
              />
            </View>
          </Modal>
        ) : null}

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          {rows.map((row, index) => (
            <SummaryRowView key={row.label} row={row} first={index === 0} />
          ))}
        </View>

        {isActionable(booking.status) && !rejectMode ? (
          <View style={styles.actions}>
            <AppButton label="Approve" onPress={confirmApprove} loading={approving} disabled={rejecting} />
            <AppButton
              label="Reject"
              variant="secondary"
              onPress={() => setRejectMode(true)}
              disabled={approving}
            />
          </View>
        ) : null}

        {rejectMode ? (
          <View style={[styles.rejectBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText type="smallBold">Reject this booking?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              The reason, if given, is shown to the customer.
            </ThemedText>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. UTR does not match any received payment (optional)"
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[
                styles.reasonInput,
                { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
              ]}
            />
            <View style={styles.actions}>
              <AppButton
                label="Confirm rejection"
                variant="secondary"
                onPress={() => void reject()}
                loading={rejecting}
              />
              <AppButton
                label="Cancel"
                variant="ghost"
                onPress={() => {
                  setRejectMode(false);
                  setReason('');
                }}
                disabled={rejecting}
              />
            </View>
          </View>
        ) : null}
      </KeyboardAwareScrollView>
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
    ...CardShadow,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  utrCallout: {
    borderRadius: 12,
    borderWidth: 2,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  utrValue: {
    fontSize: 28,
    lineHeight: 32,
  },
  screenshotThumbWrap: { alignItems: 'flex-start', gap: Spacing.half },
  screenshotThumb: {
    width: 120,
    height: 120,
    borderRadius: 10,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerClose: {
    position: 'absolute',
    right: Spacing.three,
    zIndex: 1,
    padding: Spacing.two,
  },
  card: {
    ...CardShadow,
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
  actions: { flexDirection: 'row', gap: Spacing.two },
  rejectBox: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  reasonInput: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
