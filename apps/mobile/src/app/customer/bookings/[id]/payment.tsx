/**
 * Payment method selection (context.txt §237-240, §368-374, Phase 06) — the
 * step between the booking summary and either the UPI QR screen or a
 * cash-at-parking confirmation.
 *
 * Only reachable while the booking is `PENDING`: `POST
 * /api/bookings/:id/payment-method` enforces that server-side too
 * (`transitionBooking`'s `allowedFrom: ['PENDING']`), so a stale tap here after
 * the booking already moved on comes back as a readable error rather than a
 * silent no-op.
 */
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { PAYMENT_METHOD_LABELS, formatInr, type Booking, type PaymentMethod } from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';

const METHODS: { method: PaymentMethod; description: string }[] = [
  { method: 'UPI', description: 'Pay now by scanning a QR code with any UPI app.' },
  { method: 'CASH', description: 'Pay in cash when you arrive at the parking location.' },
];

export default function ChoosePaymentMethodScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PaymentMethod | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiRequest<Booking>(`/api/bookings/${id}`);
      setBooking(data);
      // Already past PENDING — nothing left to choose here (e.g. reopened after
      // choosing on another device). Send the customer back to the summary,
      // which shows whichever state it is actually in.
      if (data.status !== 'PENDING') router.replace(`/customer/bookings/${id}`);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load this booking.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const confirm = async () => {
    if (!selected) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const updated = await apiRequest<Booking>(`/api/bookings/${id}/payment-method`, {
        method: 'POST',
        body: { method: selected },
      });

      if (selected === 'UPI') {
        router.replace(`/customer/bookings/${id}/upi`);
      } else {
        router.replace(`/customer/bookings/${updated.id}`);
      }
    } catch (error) {
      setSubmitError(
        error instanceof ApiError ? error.message : 'Could not save your payment method. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (booking === null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Choose payment method' }} />
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

  return (
    <>
      <Stack.Screen options={{ title: 'Choose payment method' }} />
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ThemedText type="small" themeColor="textSecondary">
          Amount to pay: {formatInr(booking.amountInPaise)}
        </ThemedText>

        <View style={styles.list}>
          {METHODS.map(({ method, description }) => (
            <Pressable
              key={method}
              onPress={() => setSelected(method)}
              style={[
                styles.card,
                {
                  backgroundColor:
                    selected === method ? theme.backgroundSelected : theme.backgroundElement,
                },
              ]}
            >
              <ThemedText type="smallBold">{PAYMENT_METHOD_LABELS[method]}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {description}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {submitError ? (
          <View
            style={[
              styles.banner,
              { backgroundColor: theme.backgroundElement, borderColor: theme.danger },
            ]}
          >
            <ThemedText type="small" themeColor="danger">
              {submitError}
            </ThemedText>
          </View>
        ) : null}

        <AppButton
          label={selected ? `Continue with ${PAYMENT_METHOD_LABELS[selected]}` : 'Choose a payment method'}
          disabled={!selected}
          loading={submitting}
          onPress={() => void confirm()}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  centered: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  list: { gap: Spacing.two },
  card: {
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
