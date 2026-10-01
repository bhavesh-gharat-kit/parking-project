/**
 * Digital receipt (context.txt §17-18, §503-519, Phase 08).
 *
 * Reachable from the booking summary once a booking is `CONFIRMED`/`COMPLETED`
 * (Phase 05's summary screen links here), and from booking history
 * (`bookings/index.tsx`).
 *
 * Every field on screen is exactly what `GET /api/bookings/:id/receipt`
 * returned — no client-side recomputation of amount or status (the Phase 08
 * acceptance criterion). A booking that is not yet confirmed answers with
 * `CONFLICT`, which reads here as "not available yet" rather than a generic
 * error.
 *
 * PDF export is a fast-follow (per `_/prompts/08-receipts.md`): this ships the
 * view-only screen plus the native share sheet over a plain-text summary,
 * which needs no new native module or dev-client rebuild before Thursday.
 */
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';

import {
  BOOKING_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  formatInr,
  formatIstDate,
  formatIstDateTime,
  formatIstRange,
  type Receipt,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { CardShadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';

type ReceiptRow = { label: string; value: string };

function ReceiptRowView({ row, first }: { row: ReceiptRow; first: boolean }) {
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

/** Plain-text rendering for the native share sheet — no HTML/PDF dependency. */
function receiptShareText(receipt: Receipt): string {
  const lines = [
    receipt.business.name,
    `Booking ${receipt.bookingNumber}`,
    `${receipt.location.name}, ${receipt.location.city}`,
    '',
    `Vehicle: ${receipt.vehicleNumber} (${VEHICLE_TYPE_LABELS[receipt.vehicleType]})`,
    `Package: ${receipt.rateLabel}`,
    `Time: ${formatIstRange(receipt.startTime, receipt.endTime)}`,
    `Amount: ${formatInr(receipt.amountInPaise)}`,
    `Payment: ${receipt.paymentMethod ? PAYMENT_METHOD_LABELS[receipt.paymentMethod] : '—'}${
      receipt.paymentStatus ? ` (${PAYMENT_STATUS_LABELS[receipt.paymentStatus]})` : ''
    }`,
    `Status: ${BOOKING_STATUS_LABELS[receipt.status]}`,
  ];
  if (receipt.business.supportPhone) lines.push(`Support: ${receipt.business.supportPhone}`);
  return lines.join('\n');
}

export default function ReceiptScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setReceipt(await apiRequest<Receipt>(`/api/bookings/${id}/receipt`));
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : 'Could not load this receipt.',
      );
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

  const shareReceipt = async () => {
    if (!receipt) return;
    setSharing(true);
    try {
      await Share.share({ message: receiptShareText(receipt) });
    } finally {
      setSharing(false);
    }
  };

  if (receipt === null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Receipt' }} />
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

  // context.txt §503-519, in the order that section lists them.
  const rows: ReceiptRow[] = [
    { label: 'Location', value: `${receipt.location.name}, ${receipt.location.city}` },
    { label: 'Address', value: receipt.location.addressLine },
    { label: 'Customer', value: receipt.customer.name ?? receipt.customer.email },
    ...(receipt.customer.phone ? [{ label: 'Contact', value: receipt.customer.phone }] : []),
    { label: 'Vehicle number', value: receipt.vehicleNumber },
    { label: 'Vehicle type', value: VEHICLE_TYPE_LABELS[receipt.vehicleType] },
    { label: 'Booking date', value: formatIstDate(receipt.bookingDate) },
    { label: 'Entry time', value: formatIstDateTime(receipt.startTime) },
    { label: 'Valid until', value: formatIstDateTime(receipt.endTime) },
    { label: 'Package', value: receipt.rateLabel },
    { label: 'Amount', value: formatInr(receipt.amountInPaise) },
    {
      label: 'Payment method',
      value: receipt.paymentMethod ? PAYMENT_METHOD_LABELS[receipt.paymentMethod] : 'Not chosen yet',
    },
    {
      label: 'Payment status',
      value: receipt.paymentStatus ? PAYMENT_STATUS_LABELS[receipt.paymentStatus] : 'Not started',
    },
    { label: 'Booking status', value: BOOKING_STATUS_LABELS[receipt.status] },
  ];

  return (
    <>
      <Stack.Screen options={{ title: 'Receipt' }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.text} />
        }
      >
        <View style={[styles.header, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="subtitle">{receipt.business.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Digital parking receipt
          </ThemedText>
          <ThemedText type="smallBold" themeColor="primary" style={styles.bookingNumber}>
            {receipt.bookingNumber}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          {rows.map((row, index) => (
            <ReceiptRowView key={row.label} row={row} first={index === 0} />
          ))}
        </View>

        {receipt.business.supportPhone ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
            Support: {receipt.business.supportPhone}
          </ThemedText>
        ) : null}

        <AppButton label="Share receipt" variant="secondary" loading={sharing} onPress={() => void shareReceipt()} />
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
    ...CardShadow,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  bookingNumber: { marginTop: Spacing.two },
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
  footer: { textAlign: 'center' },
});
