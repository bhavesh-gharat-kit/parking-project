/**
 * Customer vehicle picker — second step of the booking flow (context.txt §5,
 * §9, Phase 05).
 *
 * §9's order is location → vehicle → package, and that order is load-bearing
 * rather than cosmetic: rates are priced per vehicle type (§7), so choosing the
 * vehicle first means the package list can show exactly the prices that apply to
 * it. The alternative — a Bike/Car toggle on the package screen, which is where
 * Phase 04 left it — lets a customer pick a bike price and then a car, which the
 * backend then has to refuse (`RATE_VEHICLE_MISMATCH`).
 *
 * A customer with no vehicle yet is sent to the Phase 03 form and comes back to
 * a refreshed list — `useFocusEffect`, not a mount-only fetch, because Expo
 * Router keeps this screen mounted underneath the one it pushed.
 */
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { VEHICLE_TYPE_LABELS, type Vehicle } from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';
import { useBookingDraftStore } from '@/stores/booking-draft-store';

export default function BookVehicleScreen() {
  const theme = useTheme();
  const { locationId } = useLocalSearchParams<{ locationId: string }>();
  const vehicleId = useBookingDraftStore((state) => state.vehicleId);
  const setVehicle = useBookingDraftStore((state) => state.setVehicle);

  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setVehicles(await apiRequest<Vehicle[]>('/api/vehicles'));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load your vehicles.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const selectVehicle = (vehicle: Vehicle) => {
    setVehicle(vehicle.id, vehicle.type);
    router.push(`/customer/book/${locationId}/package`);
  };

  const isEmpty = vehicles !== null && vehicles.length === 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Choose a vehicle' }} />
      <ScreenContainer>
        <ThemedText type="small" themeColor="textSecondary">
          Which vehicle are you parking?
        </ThemedText>

        {vehicles === null && !loadError ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : (
          <FlatList
            data={vehicles ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              isEmpty ? (
                <ThemedText themeColor="textSecondary">
                  You have no vehicles yet. Add one to book parking for it.
                </ThemedText>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => selectVehicle(item)}
                style={[
                  styles.card,
                  {
                    backgroundColor:
                      vehicleId === item.id ? theme.backgroundSelected : theme.backgroundElement,
                  },
                ]}
              >
                <ThemedText type="smallBold">{item.number}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {VEHICLE_TYPE_LABELS[item.type]}
                  {item.makeModel ? ` · ${item.makeModel}` : ''}
                </ThemedText>
              </Pressable>
            )}
          />
        )}

        {loadError ? (
          <View
            style={[
              styles.banner,
              { backgroundColor: theme.backgroundElement, borderColor: theme.danger },
            ]}
          >
            <ThemedText type="small" themeColor="danger">
              {loadError}
            </ThemedText>
          </View>
        ) : null}

        <AppButton
          label="Add a vehicle"
          variant={isEmpty ? 'primary' : 'secondary'}
          onPress={() => router.push('/customer/vehicles/new')}
        />
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
