/**
 * Customer package picker and the point the booking is created — third step of
 * the booking flow (context.txt §7, §9, Phase 05).
 *
 * Rates come live from `GET /api/locations/:id/rates?vehicleType=...`, never
 * hardcoded: a price the admin edits shows up here on the next fetch with no app
 * release (§24), and the list is filtered to the type of the vehicle chosen on
 * the previous screen rather than to a toggle on this one.
 *
 * ── What "Confirm" sends ───────────────────────────────────────────────────
 * Three ids: location, vehicle, rate. No amount, no times, no status
 * (context.txt §32) — `formatInr(rate.priceInPaise)` below is shown so the
 * customer knows what they are agreeing to, and is then thrown away. What the
 * booking costs is whatever the server put on the booking it created, which is
 * what the summary screen renders.
 *
 * On success the draft is reset and the summary screen REPLACES this one in the
 * stack: the booking now exists server-side with a 10-minute window on it (§15),
 * so a back button returning to a package list that would create a second
 * booking is exactly what should not be there.
 */
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import {
  formatInr,
  VEHICLE_TYPE_LABELS,
  type Booking,
  type ParkingRate,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { CardShadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';
import { useBookingDraftStore } from '@/stores/booking-draft-store';

export default function BookPackageScreen() {
  const theme = useTheme();
  const { locationId } = useLocalSearchParams<{ locationId: string }>();

  const vehicleId = useBookingDraftStore((state) => state.vehicleId);
  const vehicleType = useBookingDraftStore((state) => state.vehicleType);
  const rateId = useBookingDraftStore((state) => state.rateId);
  const setRate = useBookingDraftStore((state) => state.setRate);
  const resetDraft = useBookingDraftStore((state) => state.reset);

  const [rates, setRates] = useState<ParkingRate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!vehicleType) return;
    setLoadError(null);
    try {
      setRates(
        await apiRequest<ParkingRate[]>(
          `/api/locations/${locationId}/rates?vehicleType=${vehicleType}`,
        ),
      );
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load parking packages.');
    }
  }, [locationId, vehicleType]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const selectedRate = rates?.find((rate) => rate.id === rateId) ?? null;
  // A submit failure is the more urgent of the two, and they cannot both be new.
  const banner = submitError ?? loadError;

  const confirm = async () => {
    if (!vehicleId || !rateId) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const booking = await apiRequest<Booking>('/api/bookings', {
        method: 'POST',
        body: { locationId, vehicleId, rateId },
      });

      resetDraft();
      router.replace(`/customer/bookings/${booking.id}`);
    } catch (error) {
      // The backend's messages here are written to be read by a customer — a
      // retired package or a vehicle removed on another device both come back as
      // "choose again" rather than as a code.
      setSubmitError(
        error instanceof ApiError ? error.message : 'Could not create your booking. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Reached by deep link, or after the draft was reset by a booking just made.
  if (!vehicleType || !vehicleId) {
    return (
      <>
        <Stack.Screen options={{ title: 'Choose a package' }} />
        <ScreenContainer>
          <ThemedText themeColor="textSecondary">
            Choose a vehicle first — parking packages are priced per vehicle type.
          </ThemedText>
          <AppButton
            label="Choose a vehicle"
            onPress={() => router.replace(`/customer/book/${locationId}`)}
          />
        </ScreenContainer>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Choose a package' }} />
      <ScreenContainer>
        <ThemedText type="small" themeColor="textSecondary">
          {VEHICLE_TYPE_LABELS[vehicleType]} packages at this location.
        </ThemedText>

        {rates === null && !loadError ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : (
          <FlatList
            data={rates ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              rates === null ? null : (
                <ThemedText themeColor="textSecondary">
                  No {VEHICLE_TYPE_LABELS[vehicleType].toLowerCase()} packages at this location yet.
                </ThemedText>
              )
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setRate(item.id)}
                style={[
                  styles.card,
                  {
                    backgroundColor:
                      rateId === item.id ? theme.backgroundSelected : theme.backgroundElement,
                  },
                ]}
              >
                <ThemedText type="smallBold">{item.label}</ThemedText>
                <ThemedText themeColor="primary">{formatInr(item.priceInPaise)}</ThemedText>
              </Pressable>
            )}
          />
        )}

        {banner ? (
          <View
            style={[
              styles.banner,
              { backgroundColor: theme.backgroundElement, borderColor: theme.danger },
            ]}
          >
            <ThemedText type="small" themeColor="danger">
              {banner}
            </ThemedText>
          </View>
        ) : null}

        <AppButton
          label={
            selectedRate
              ? `Continue · ${selectedRate.label} · ${formatInr(selectedRate.priceInPaise)}`
              : 'Choose a package to continue'
          }
          disabled={!selectedRate}
          loading={submitting}
          onPress={() => void confirm()}
        />
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { gap: Spacing.two },
  card: {
    ...CardShadow,
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
