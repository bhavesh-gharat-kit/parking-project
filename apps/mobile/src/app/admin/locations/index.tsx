/**
 * Admin location list (context.txt §3, §6, §23, Phase 04).
 *
 * Shows every location, active or not — an admin re-enabling a closed branch
 * needs to find it here first, unlike the customer's picker which only ever
 * sees the active ones (`GET /api/locations`).
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import type { AdminParkingLocation } from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { CardShadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiRequest, ApiError } from '@/lib/api';

export default function AdminLocationsScreen() {
  const theme = useTheme();
  const [locations, setLocations] = useState<AdminParkingLocation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const items = await apiRequest<AdminParkingLocation[]>('/api/admin/locations');
      setLocations(items);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load locations.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ScreenContainer>
      <FlatList
        data={locations ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          locations === null ? null : (
            <ThemedText themeColor="textSecondary">No locations yet. Add one below.</ThemedText>
          )
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.cardInfo}>
              <View style={styles.titleRow}>
                <ThemedText type="smallBold">{item.name}</ThemedText>
                <ThemedText type="small" themeColor={item.isActive ? 'primary' : 'danger'}>
                  {item.isActive ? 'Active' : 'Inactive'}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {item.code} · {item.city}, {item.state}
              </ThemedText>
            </View>
            <View style={styles.cardActions}>
              <AppButton
                label="Rates"
                variant="secondary"
                onPress={() => router.push(`/admin/locations/${item.id}/rates`)}
              />
              <AppButton
                label="Edit"
                variant="ghost"
                onPress={() => router.push(`/admin/locations/${item.id}`)}
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

      <AppButton label="Add location" onPress={() => router.push('/admin/locations/new')} />
    </ScreenContainer>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardActions: { flexDirection: 'row', gap: Spacing.two },
  banner: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
});
