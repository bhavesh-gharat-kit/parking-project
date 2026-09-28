/**
 * Customer package picker — second step of the booking flow (context.txt §7,
 * §9, Phase 04).
 *
 * Rates come live from `GET /api/locations/:id/rates?vehicleType=...`, never
 * hardcoded — a price the admin edits shows up here on the next fetch, no app
 * release (§24, Phase 04 acceptance), and switching Bike/Car re-fetches a
 * different price list (§7's worked example).
 *
 * There is no "Continue" action yet: creating the booking itself, picking a
 * specific vehicle from the customer's garage, and payment are Phase 05/06.
 * This screen's job is only to prove the location → package rendering works
 * end to end.
 */
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import {
  formatInr,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  type ParkingRate,
  type VehicleType,
} from '@parking/shared';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiRequest, ApiError } from '@/lib/api';
import { useBookingDraftStore } from '@/stores/booking-draft-store';

/** Rates are only seeded for Bike/Car (Phase 04); Other stays selectable for when it is. */
const SELECTABLE_VEHICLE_TYPES = VEHICLE_TYPES;

export default function BookPackageScreen() {
  const theme = useTheme();
  const { locationId } = useLocalSearchParams<{ locationId: string }>();
  const rateId = useBookingDraftStore((state) => state.rateId);
  const setRate = useBookingDraftStore((state) => state.setRate);

  const [vehicleType, setVehicleType] = useState<VehicleType>('CAR');
  const [rates, setRates] = useState<ParkingRate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setRates(null);
    try {
      const items = await apiRequest<ParkingRate[]>(
        `/api/locations/${locationId}/rates?vehicleType=${vehicleType}`,
      );
      setRates(items);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load parking packages.');
    }
  }, [locationId, vehicleType]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Choose a package' }} />
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.field}>
          <ThemedText type="smallBold">Vehicle type</ThemedText>
          <View style={styles.row}>
            {SELECTABLE_VEHICLE_TYPES.map((type) => (
              <Pressable
                key={type}
                onPress={() => setVehicleType(type)}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      vehicleType === type ? theme.backgroundSelected : theme.backgroundElement,
                  },
                ]}
              >
                <ThemedText type="small">{VEHICLE_TYPE_LABELS[type]}</ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

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

        {loadError ? (
          <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
            <ThemedText type="small" themeColor="danger">
              {loadError}
            </ThemedText>
          </View>
        ) : null}
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
  field: { gap: Spacing.one },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: 999,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: {
    gap: Spacing.two,
  },
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
