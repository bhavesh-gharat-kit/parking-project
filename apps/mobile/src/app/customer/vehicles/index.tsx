/**
 * Vehicle list (context.txt §5, Phase 03).
 *
 * Refetches on every focus (`useFocusEffect`), not just on mount: the add/edit
 * screen at `vehicles/[id]` is a separate stack entry the customer returns to
 * via the back button, and Expo Router keeps this screen mounted underneath
 * rather than remounting it — a mount-only fetch would show a stale list right
 * after adding a vehicle.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';

import { VEHICLE_TYPE_LABELS, type Vehicle } from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { Card } from '@/components/card';
import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiRequest, ApiError } from '@/lib/api';

export default function VehiclesScreen() {
  const theme = useTheme();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const items = await apiRequest<Vehicle[]>('/api/vehicles');
      setVehicles(items);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load your vehicles.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const confirmDelete = (vehicle: Vehicle) => {
    Alert.alert(
      'Remove vehicle',
      `Remove ${vehicle.number} from your account?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void deleteVehicle(vehicle) },
      ],
    );
  };

  const deleteVehicle = async (vehicle: Vehicle) => {
    setDeletingId(vehicle.id);
    try {
      await apiRequest(`/api/vehicles/${vehicle.id}`, { method: 'DELETE' });
      setVehicles((current) => current?.filter((item) => item.id !== vehicle.id) ?? null);
    } catch (error) {
      // CONFLICT is the backend telling us this vehicle has an active/pending
      // booking (context.txt §5's delete-guard acceptance criterion) — the
      // message is written to be read directly by the customer.
      Alert.alert(
        'Could not remove vehicle',
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <ScreenContainer>
      <FlatList
        data={vehicles ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          vehicles === null ? null : (
            <View style={styles.empty}>
              <Ionicons name="car-outline" size={32} color={theme.textSecondary} />
              <ThemedText themeColor="textSecondary">
                No vehicles yet. Add one to book parking for it.
              </ThemedText>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.cardInfo}>
              <ThemedText type="smallBold">{item.number}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {VEHICLE_TYPE_LABELS[item.type]}
                {item.makeModel ? ` · ${item.makeModel}` : ''}
              </ThemedText>
            </View>
            <View style={styles.cardActions}>
              <AppButton
                label="Edit"
                variant="secondary"
                onPress={() => router.push(`/customer/vehicles/${item.id}`)}
              />
              <AppButton
                label="Remove"
                variant="ghost"
                loading={deletingId === item.id}
                disabled={deletingId === item.id}
                onPress={() => confirmDelete(item)}
              />
            </View>
          </Card>
        )}
      />

      {loadError ? (
        <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
          <Ionicons name="alert-circle" size={18} color={theme.danger} />
          <ThemedText type="small" themeColor="danger" style={styles.bannerText}>
            {loadError}
          </ThemedText>
        </View>
      ) : null}

      <AppButton label="Add vehicle" onPress={() => router.push('/customer/vehicles/new')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  cardInfo: { gap: Spacing.half, flexShrink: 1 },
  cardActions: { flexDirection: 'row', gap: Spacing.two },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.control,
    borderWidth: 1,
    padding: Spacing.three,
  },
  bannerText: { flex: 1 },
});
