/**
 * UPI QR payment screen (context.txt §278-336, Phase 06).
 *
 * Two steps in one screen, gated by local state rather than two routes: the QR
 * + amount is shown first ("I have paid" reveals the UTR form), because until
 * the customer has actually paid there is nothing for a form to collect.
 *
 * ── What submitting the UTR does NOT do ─────────────────────────────────────
 * It does not mark this booking paid. `POST /api/bookings/:id/utr` moves the
 * booking to `PAYMENT_VERIFICATION` — an admin still has to check the bank
 * statement (§11, §32, Phase 07). The copy on this screen says so explicitly so
 * a customer who just paid does not read "submitted" as "confirmed".
 *
 * Only reachable while the booking is `PENDING_PAYMENT`; the backend enforces
 * the same restriction (`allowedFrom: ['PENDING_PAYMENT']`), so this screen
 * redirects to the summary the moment the booking is anywhere else — including
 * right after a successful submit.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import {
  BookingUtrSubmitRequestSchema,
  formatInr,
  type Booking,
  type BookingUtrSubmitRequest,
  type BookingUtrSubmitRequestParsed,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardShadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';
import { applyApiError } from '@/lib/form-errors';

export default function UpiPaymentScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [havePaid, setHavePaid] = useState(false);

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = useForm<BookingUtrSubmitRequest, unknown, BookingUtrSubmitRequestParsed>({
    resolver: zodResolver(BookingUtrSubmitRequestSchema),
    defaultValues: { utr: '' },
  });
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiRequest<Booking>(`/api/bookings/${id}`);
      setBooking(data);
      // Anything other than "UPI chosen, UTR not submitted yet" belongs back on
      // the summary screen — including the moment a submit here just succeeded.
      if (data.status !== 'PENDING_PAYMENT') router.replace(`/customer/bookings/${id}`);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load this booking.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onSubmit = async (values: BookingUtrSubmitRequestParsed) => {
    setFormError(null);
    try {
      await apiRequest<Booking>(`/api/bookings/${id}/utr`, { method: 'POST', body: values });
      router.replace(`/customer/bookings/${id}`);
    } catch (error) {
      setFormError(applyApiError(error, setError));
    }
  };

  if (booking === null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Pay via UPI' }} />
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

  const vpa = booking.payment?.upiPayeeVpa ?? null;
  const qrImageUrl = booking.location.upiQrImageUrl;

  return (
    <>
      <Stack.Screen options={{ title: 'Pay via UPI' }} />
      <KeyboardAwareScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        bottomOffset={Spacing.four}
      >
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Amount
          </ThemedText>
          <ThemedText type="subtitle">{formatInr(booking.amountInPaise)}</ThemedText>
        </View>

        {qrImageUrl ? (
          <View style={[styles.qrWrap, { backgroundColor: theme.backgroundElement }]}>
            <Image source={{ uri: qrImageUrl }} style={styles.qr} contentFit="contain" />
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              QR code not available for this location. Use the UPI ID below, or ask
              staff at the parking location.
            </ThemedText>
          </View>
        )}

        {vpa ? (
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              Pay to UPI ID
            </ThemedText>
            <ThemedText type="smallBold">{vpa}</ThemedText>
          </View>
        ) : null}

        {!havePaid ? (
          <AppButton label="I have paid" onPress={() => setHavePaid(true)} />
        ) : (
          <View style={styles.form}>
            <ThemedText type="small" themeColor="textSecondary">
              Enter the UPI reference number (UTR) from your payment app. We will
              verify it against our bank statement before confirming your booking —
              this does not confirm it immediately.
            </ThemedText>

            {formError ? (
              <View
                style={[
                  styles.banner,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.danger },
                ]}
              >
                <ThemedText type="small" themeColor="danger">
                  {formError}
                </ThemedText>
              </View>
            ) : null}

            <TextField
              control={control}
              name="utr"
              label="UPI reference / UTR"
              placeholder="e.g. 123456789012"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSubmit(onSubmit)}
            />

            <AppButton
              label="Submit for verification"
              loading={isSubmitting}
              disabled={isSubmitting}
              onPress={handleSubmit(onSubmit)}
            />
          </View>
        )}
      </KeyboardAwareScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    ...CardShadow,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  qrWrap: {
    borderRadius: 12,
    padding: Spacing.three,
    alignItems: 'center',
  },
  qr: {
    width: 240,
    height: 240,
  },
  form: { gap: Spacing.three },
  banner: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
});
