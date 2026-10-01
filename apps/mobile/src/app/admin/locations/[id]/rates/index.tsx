/**
 * Admin rate list for one location (context.txt §7, §24, Phase 04).
 *
 * Shows every rate, active or not, so retiring and re-activating a price is
 * possible from the same screen. Changing a price here is reflected in the
 * customer app on its next fetch — no app rebuild (§24, Phase 04 acceptance).
 */
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';

import {
  formatInr,
  VEHICLE_TYPE_LABELS,
  type AdminParkingLocation,
  type AdminParkingRate,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { CardShadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiRequest, ApiError } from '@/lib/api';

export default function AdminRatesScreen() {
  const theme = useTheme();
  const { id: locationId } = useLocalSearchParams<{ id: string }>();

  const [location, setLocation] = useState<AdminParkingLocation | null>(null);
  const [rates, setRates] = useState<AdminParkingRate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [locationData, ratesData] = await Promise.all([
        apiRequest<AdminParkingLocation>(`/api/admin/locations/${locationId}`),
        apiRequest<AdminParkingRate[]>(`/api/admin/locations/${locationId}/rates`),
      ]);
      setLocation(locationData);
      setRates(ratesData);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load rates.');
    }
  }, [locationId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const confirmToggle = (rate: AdminParkingRate) => {
    const action = rate.isActive ? 'Retire' : 'Re-activate';
    Alert.alert(
      `${action} rate`,
      `${action} "${VEHICLE_TYPE_LABELS[rate.vehicleType]} · ${rate.label}" at ${formatInr(rate.priceInPaise)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: action, onPress: () => void toggleRate(rate) },
      ],
    );
  };

  const toggleRate = async (rate: AdminParkingRate) => {
    setTogglingId(rate.id);
    try {
      if (rate.isActive) {
        await apiRequest(`/api/admin/locations/${locationId}/rates/${rate.id}`, { method: 'DELETE' });
      } else {
        await apiRequest(`/api/admin/locations/${locationId}/rates/${rate.id}`, {
          method: 'PATCH',
          body: {
            vehicleType: rate.vehicleType,
            durationMinutes: rate.durationMinutes,
            priceInRupees: rate.priceInPaise / 100,
            sortOrder: rate.sortOrder,
            isActive: true,
          },
        });
      }
      await load();
    } catch (error) {
      Alert.alert(
        'Could not update rate',
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: location ? `${location.name} rates` : 'Rates' }} />
      <ScreenContainer>
        <FlatList
          data={rates ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            rates === null ? null : (
              <ThemedText themeColor="textSecondary">
                No rates yet. Add one so customers have something to book.
              </ThemedText>
            )
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.cardInfo}>
                <View style={styles.titleRow}>
                  <ThemedText type="smallBold">
                    {VEHICLE_TYPE_LABELS[item.vehicleType]} · {item.label}
                  </ThemedText>
                  <ThemedText type="small" themeColor={item.isActive ? 'primary' : 'danger'}>
                    {item.isActive ? 'Active' : 'Retired'}
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatInr(item.priceInPaise)}
                </ThemedText>
              </View>
              <View style={styles.cardActions}>
                <AppButton
                  label="Edit"
                  variant="secondary"
                  onPress={() => router.push(`/admin/locations/${locationId}/rates/${item.id}`)}
                />
                <AppButton
                  label={item.isActive ? 'Retire' : 'Re-activate'}
                  variant="ghost"
                  loading={togglingId === item.id}
                  disabled={togglingId === item.id}
                  onPress={() => confirmToggle(item)}
                />
              </View>
            </View>
          )}
        />

        {loadError ? (
          <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
            <ThemedText type="small" themeColor="danger">
              {loadError}
            </ThemedText>
          </View>
        ) : null}

        <AppButton
          label="Add rate"
          onPress={() => router.push(`/admin/locations/${locationId}/rates/new`)}
        />
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  card: {
    ...CardShadow,
    borderRadius: 12,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  cardInfo: { gap: Spacing.half, flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexShrink: 1 },
  cardActions: { flexDirection: 'row', gap: Spacing.two },
  banner: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
});
