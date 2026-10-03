/**
 * UPI QR payment screen (context.txt §278-336, Phase 06; Phase 15).
 *
 * Two steps in one screen, gated by local state rather than two routes: the QR
 * + amount is shown first ("I have paid" reveals the proof-of-payment form),
 * because until the customer has actually paid there is nothing for a form to
 * collect.
 *
 * ── Screenshot required, UTR optional (Phase 15) ───────────────────────────
 * The payment screenshot is the evidence the admin actually checks, so it is
 * required — the backend rejects a submission without one. The UTR text
 * field stays as an optional aid, not a second required field, since typing
 * it is error-prone and the screenshot already contains it.
 *
 * ── What submitting this does NOT do ────────────────────────────────────────
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
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import {
  BookingUtrSubmitRequestSchema,
  formatInr,
  type Booking,
  type BookingUtrSubmitRequest,
  type BookingUtrSubmitRequestParsed,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest, apiUpload } from '@/lib/api';
import { applyApiError } from '@/lib/form-errors';

/** The local file state kept for preview; `onSubmit` uploads it via `apiUpload`. */
type PickedScreenshot = { uri: string; name: string; type: string };

export default function UpiPaymentScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [havePaid, setHavePaid] = useState(false);
  const [screenshot, setScreenshot] = useState<PickedScreenshot | null>(null);

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

  const captureFrom = async (source: 'camera' | 'library') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        `Allow ${source === 'camera' ? 'camera' : 'photo library'} access to attach a screenshot.`,
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });

    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    const extension = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const type =
      asset.mimeType ??
      (extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg');

    setScreenshot({ uri: asset.uri, name: asset.fileName ?? `utr-screenshot.${extension}`, type });
  };

  // §278-336, Phase 15 — the screenshot is the required evidence; `onSubmit`
  // refuses to call the API without one.
  const pickScreenshot = () => {
    Alert.alert('Attach payment screenshot', 'Choose a source', [
      { text: 'Camera', onPress: () => void captureFrom('camera') },
      { text: 'Gallery', onPress: () => void captureFrom('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const onSubmit = async (values: BookingUtrSubmitRequestParsed) => {
    setFormError(null);

    // The backend has no JSON-only path any more — a screenshot is always
    // required, and a JSON body cannot carry a file — so this is checked
    // before ever calling the API, not left for the server to reject.
    if (!screenshot) {
      setFormError('Attach a screenshot of your payment confirmation to continue.');
      return;
    }

    try {
      // `apiUpload` reads `screenshot.uri` and builds the multipart body in
      // native code — see its comment in `lib/api.ts` for why this isn't
      // `apiRequest` with a hand-built `FormData` (two different failure
      // modes going through RN's own JS networking for this exact call).
      //
      // A multi-MB photo on a weak or congested mobile connection (the exact
      // condition at a parking gate this app is built for) routinely takes
      // longer than the global 20s API timeout, which exists to catch an
      // unreachable server, not a slow-but-working upload. Give this one call
      // real headroom instead of failing a perfectly good upload mid-transfer.
      await apiUpload<Booking>(`/api/bookings/${id}/utr`, {
        fileUri: screenshot.uri,
        fieldName: 'screenshot',
        mimeType: screenshot.type,
        fields: values.utr ? { utr: values.utr } : undefined,
        timeoutMs: 90_000,
      });
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
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Amount
          </ThemedText>
          <ThemedText type="subtitle">{formatInr(booking.amountInPaise)}</ThemedText>
        </Card>

        {qrImageUrl ? (
          <View style={[styles.qrWrap, { backgroundColor: theme.backgroundElement }]}>
            <Image source={{ uri: qrImageUrl }} style={styles.qr} contentFit="contain" />
          </View>
        ) : (
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              QR code not available for this location. Use the UPI ID below, or ask
              staff at the parking location.
            </ThemedText>
          </Card>
        )}

        {vpa ? (
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              Pay to UPI ID
            </ThemedText>
            <ThemedText type="smallBold">{vpa}</ThemedText>
          </Card>
        ) : null}

        {!havePaid ? (
          <AppButton label="I have paid" onPress={() => setHavePaid(true)} />
        ) : (
          <View style={styles.form}>
            <ThemedText type="small" themeColor="textSecondary">
              Attach a screenshot of your payment confirmation. We will verify it
              against our bank statement before confirming your booking — this
              does not confirm it immediately.
            </ThemedText>

            {formError ? (
              <View
                style={[
                  styles.banner,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.danger },
                ]}
              >
                <Ionicons name="alert-circle" size={18} color={theme.danger} />
                <ThemedText type="small" themeColor="danger" style={styles.bannerText}>
                  {formError}
                </ThemedText>
              </View>
            ) : null}

            <View style={styles.screenshotField}>
              <ThemedText type="small" themeColor="textSecondary">
                Payment screenshot
              </ThemedText>

              {screenshot ? (
                <View style={styles.screenshotPreviewWrap}>
                  <Image
                    source={{ uri: screenshot.uri }}
                    style={styles.screenshotPreview}
                    contentFit="cover"
                  />
                  <View style={styles.screenshotActions}>
                    <AppButton label="Retake" variant="secondary" onPress={pickScreenshot} />
                    <Pressable
                      onPress={() => setScreenshot(null)}
                      style={[styles.removeButton, { backgroundColor: theme.backgroundElement }]}
                    >
                      <Ionicons name="close" size={18} color={theme.text} />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <AppButton
                  label="Attach screenshot"
                  variant="secondary"
                  onPress={pickScreenshot}
                  icon={<Ionicons name="camera-outline" size={18} color={theme.text} />}
                />
              )}
            </View>

            <TextField
              control={control}
              name="utr"
              label="UPI reference / UTR (optional)"
              placeholder="e.g. 123456789012"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSubmit(onSubmit)}
            />

            <AppButton
              label="Submit for verification"
              loading={isSubmitting}
              disabled={isSubmitting || !screenshot}
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
  qrWrap: {
    borderRadius: Radius.surface,
    padding: Spacing.three,
    alignItems: 'center',
  },
  qr: {
    width: 240,
    height: 240,
  },
  form: { gap: Spacing.three },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.control,
    borderWidth: 1,
    padding: Spacing.three,
  },
  bannerText: { flex: 1 },
  screenshotField: { gap: Spacing.one },
  screenshotPreviewWrap: { gap: Spacing.two },
  screenshotPreview: {
    width: 160,
    height: 160,
    borderRadius: Radius.surface,
  },
  screenshotActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
