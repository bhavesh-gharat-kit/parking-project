/**
 * Digital receipt (context.txt §17-18, §503-519, Phase 08; redesigned UI-03).
 *
 * Reachable from the booking summary once a booking is `CONFIRMED`/`COMPLETED`
 * (Phase 05's summary screen links here), and from booking history
 * (`bookings/index.tsx`).
 *
 * Every field on screen is exactly what `GET /api/bookings/:id/receipt`
 * returned — no client-side recomputation of amount or status (the Phase 08
 * acceptance criterion, re-verified by this redesign). A booking that is not
 * yet confirmed answers with `CONFLICT`, which reads here as "not available
 * yet" rather than a generic error — that guard lives entirely server-side
 * (`apps/api/app/api/bookings/[id]/receipt/route.ts`) and nothing here weakens
 * it.
 *
 * ── Why `paymentStatus === 'PAID'` is effectively the only state this screen
 *    ever shows ─────────────────────────────────────────────────────────────
 * `transitionBooking`'s tables (`packages/shared/src/bookings.ts`,
 * `apps/api/app/api/admin/bookings/[id]/approve/route.ts`) only ever reach
 * `CONFIRMED` by setting `payment.status` to `PAID` in the same transition —
 * there is no other path to `CONFIRMED`, and `COMPLETED` has no further
 * transitions at all. So every receipt this screen can show has a `PAID`
 * payment. The watermark check below is still a real conditional on the
 * field (not a hardcoded `true`) because the schema allows other values
 * defensively, but there is no dead "what if it's PENDING here" case to
 * design for — confirmed by reading the transition tables, not assumed.
 *
 * PDF/share: `buildReceiptHtml` (src/lib/receipt-pdf.ts) renders the exact
 * same `Receipt` this screen already fetched into an HTML document
 * `expo-print` turns into a PDF — no second API call, no separate data path
 * to drift from the on-screen numbers.
 */
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useCallback, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  BOOKING_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  formatInr,
  formatIstDate,
  formatIstDateTime,
  formatIstRange,
  type PaymentStatus,
  type Receipt,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { BrandHeader } from '@/components/brand-header';
import { Card } from '@/components/card';
import { Divider } from '@/components/divider';
import { SectionHeader } from '@/components/section-header';
import { StatusBadge, TonePill, type Tone } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';
import { buildReceiptHtml } from '@/lib/receipt-pdf';

type ReceiptRow = { label: string; value: string } | { label: string; node: ReactNode };

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
      {'node' in row ? (
        row.node
      ) : (
        <ThemedText type="small" style={styles.rowValue}>
          {row.value}
        </ThemedText>
      )}
    </View>
  );
}

type ReceiptSectionProps = {
  title: string;
  icon: Parameters<typeof SectionHeader>[0]['icon'];
  rows: ReceiptRow[];
  /**
   * Overrides the card's own fill when the PAID watermark is showing — an
   * opaque `backgroundElement` behind every section would hide almost all of
   * a large rotated stamp (confirmed by rendering `buildReceiptHtml`'s PDF
   * equivalent before this existed: the watermark was reduced to a sliver in
   * the gaps between cards). A visible border takes over from `CardShadow`
   * for marking the card's edge, since Android's `elevation` shadow does not
   * reliably draw against a transparent background. Row text stays exactly
   * as solid as always, which is what keeps it legible over the stamp.
   */
  cardStyle?: StyleProp<ViewStyle>;
};

function ReceiptSection({ title, icon, rows, cardStyle }: ReceiptSectionProps) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} icon={icon} divided={false} />
      <Card padded={false} style={[styles.rowsCard, cardStyle]}>
        {rows.map((row, index) => (
          <ReceiptRowView key={row.label} row={row} first={index === 0} />
        ))}
      </Card>
    </View>
  );
}

const PAYMENT_STATUS_TONE: Record<PaymentStatus, Tone> = {
  PENDING: 'waiting',
  VERIFICATION_PENDING: 'waiting',
  PAID: 'done',
  FAILED: 'bad',
  REJECTED: 'bad',
  REFUNDED: 'bad',
};

const PAYMENT_STATUS_ICON: Record<PaymentStatus, keyof typeof Ionicons.glyphMap> = {
  PENDING: 'time-outline',
  VERIFICATION_PENDING: 'search-outline',
  PAID: 'checkmark-circle',
  FAILED: 'close-circle',
  REJECTED: 'close-circle',
  REFUNDED: 'arrow-undo-outline',
};

/**
 * A diagonal, low-opacity "PAID" stamp behind the receipt content — shown only
 * when `receipt.paymentStatus === 'PAID'` (see the module doc for why that is,
 * in practice, always true on this screen). `pointerEvents="none"` so it never
 * intercepts taps on the content drawn over it, and it is rendered first so
 * normal RN stacking paints everything else on top of it. Every card on this
 * screen drops its own opaque fill (via `watermarkedCardStyle`, below) while
 * the watermark is showing, or the stamp would only ever be visible in the
 * gaps between cards — row text stays fully opaque regardless, which is what
 * keeps it legible over the stamp.
 */
function PaidWatermark() {
  const theme = useTheme();
  return (
    <View pointerEvents="none" style={styles.watermarkWrap}>
      <ThemedText style={[styles.watermarkText, { color: theme.success }]}>PAID</ThemedText>
    </View>
  );
}

/** Plain-text rendering for the native share sheet fallback — no HTML/PDF dependency. */
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
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  // "Download" opens Android's native print dialog on the generated HTML,
  // whose built-in "Save as PDF" destination writes the file wherever the
  // customer picks via the system Files/Drive chooser — the standard
  // permission-free way to get a PDF onto an Android device, rather than
  // requesting broad storage access just to write into Downloads ourselves.
  const downloadReceipt = async () => {
    if (!receipt) return;
    setActionError(null);
    setDownloading(true);
    try {
      await Print.printAsync({ html: buildReceiptHtml(receipt) });
    } catch {
      setActionError('Could not open the print dialog. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  // "Share" sends the actual PDF file through the native share sheet. Falls
  // back to the old plain-text share only if PDF generation/sharing itself
  // fails, so sharing still works on a device without a share target for
  // PDFs.
  const shareReceipt = async () => {
    if (!receipt) return;
    setActionError(null);
    setSharing(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: buildReceiptHtml(receipt) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share receipt' });
      } else {
        await Share.share({ message: receiptShareText(receipt) });
      }
    } catch {
      try {
        await Share.share({ message: receiptShareText(receipt) });
      } catch {
        setActionError('Could not share the receipt. Please try again.');
      }
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

  const locationRows: ReceiptRow[] = [
    { label: 'Location', value: `${receipt.location.name}, ${receipt.location.city}` },
    { label: 'Address', value: receipt.location.addressLine },
  ];

  const customerRows: ReceiptRow[] = [
    { label: 'Customer', value: receipt.customer.name ?? receipt.customer.email },
    ...(receipt.customer.phone ? ([{ label: 'Contact', value: receipt.customer.phone }] as ReceiptRow[]) : []),
    { label: 'Vehicle number', value: receipt.vehicleNumber },
    { label: 'Vehicle type', value: VEHICLE_TYPE_LABELS[receipt.vehicleType] },
  ];

  const bookingRows: ReceiptRow[] = [
    { label: 'Booking date', value: formatIstDate(receipt.bookingDate) },
    { label: 'Entry time', value: formatIstDateTime(receipt.startTime) },
    { label: 'Valid until', value: formatIstDateTime(receipt.endTime) },
    { label: 'Package', value: receipt.rateLabel },
  ];

  const paymentRows: ReceiptRow[] = [
    { label: 'Amount', value: formatInr(receipt.amountInPaise) },
    {
      label: 'Payment method',
      value: receipt.paymentMethod ? PAYMENT_METHOD_LABELS[receipt.paymentMethod] : 'Not chosen yet',
    },
    {
      label: 'Payment status',
      node: receipt.paymentStatus ? (
        <TonePill
          label={PAYMENT_STATUS_LABELS[receipt.paymentStatus]}
          tone={PAYMENT_STATUS_TONE[receipt.paymentStatus]}
          icon={PAYMENT_STATUS_ICON[receipt.paymentStatus]}
        />
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Not started
        </ThemedText>
      ),
    },
  ];

  const busy = downloading || sharing;
  const watermarked = receipt.paymentStatus === 'PAID';
  const watermarkedCardStyle: StyleProp<ViewStyle> = watermarked
    ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.border }
    : undefined;

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
        <View style={styles.contentWrap}>
          {watermarked ? <PaidWatermark /> : null}

          <View style={styles.contentStack}>
            {/* D-UI1: the receipt is one of the screens the brand header
                appears on, per the locked decision in 00-README.md. */}
            <BrandHeader variant="compact" />
            <Divider />

            <Card style={[styles.headerCard, watermarkedCardStyle]}>
              <ThemedText type="small" themeColor="textSecondary">
                Booking number
              </ThemedText>
              <ThemedText type="subtitle" themeColor="primary" style={styles.bookingNumber}>
                {receipt.bookingNumber}
              </ThemedText>
              <StatusBadge status={receipt.status} size="large" />
            </Card>

            <ReceiptSection title="Location" icon="location-outline" rows={locationRows} cardStyle={watermarkedCardStyle} />
            <ReceiptSection
              title="Customer & vehicle"
              icon="person-outline"
              rows={customerRows}
              cardStyle={watermarkedCardStyle}
            />
            <ReceiptSection title="Booking" icon="calendar-outline" rows={bookingRows} cardStyle={watermarkedCardStyle} />
            <ReceiptSection title="Payment" icon="card-outline" rows={paymentRows} cardStyle={watermarkedCardStyle} />

            {receipt.business.supportPhone ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
                Support: {receipt.business.supportPhone}
              </ThemedText>
            ) : null}

            {actionError ? (
              <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
                <Ionicons name="alert-circle" size={18} color={theme.danger} />
                <ThemedText type="small" themeColor="danger" style={styles.bannerText}>
                  {actionError}
                </ThemedText>
              </View>
            ) : null}

            <View style={styles.actions}>
              <AppButton
                label="Download PDF"
                variant="secondary"
                icon={<Ionicons name="download-outline" size={18} color={theme.text} />}
                loading={downloading}
                disabled={busy}
                onPress={() => void downloadReceipt()}
              />
              <AppButton
                label="Share receipt"
                variant="secondary"
                icon={<Ionicons name="share-social-outline" size={18} color={theme.text} />}
                loading={sharing}
                disabled={busy}
                onPress={() => void shareReceipt()}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  contentWrap: { position: 'relative' },
  contentStack: { gap: Spacing.three },
  watermarkWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watermarkText: {
    fontSize: 88,
    fontWeight: '800',
    letterSpacing: 6,
    opacity: 0.12,
    transform: [{ rotate: '-28deg' }],
  },
  headerCard: { alignItems: 'flex-start' },
  bookingNumber: { marginTop: Spacing.half, marginBottom: Spacing.one },
  section: { gap: Spacing.two },
  rowsCard: {
    paddingHorizontal: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowLabel: { flexShrink: 0 },
  rowValue: { flex: 1, textAlign: 'right' },
  footer: { textAlign: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.control,
    borderWidth: 1,
    padding: Spacing.three,
  },
  bannerText: { flex: 1 },
  actions: { gap: Spacing.two },
});
