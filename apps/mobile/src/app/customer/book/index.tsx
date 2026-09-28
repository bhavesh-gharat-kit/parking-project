/**
 * Customer location picker — first step of the booking flow (context.txt §6,
 * §9, Phase 04).
 *
 * Always rendered from `GET /api/locations`, never a hardcoded list — a second
 * branch the admin adds later shows up here with no app release, and one the
 * admin deactivates disappears on the next fetch (§6, §23, Phase 04
 * acceptance).
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import type { ParkingLocation } from '@parking/shared';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiRequest, ApiError } from '@/lib/api';
import { useBookingDraftStore } from '@/stores/booking-draft-store';

export default function BookLocationScreen() {
  const theme = useTheme();
  const setLocation = useBookingDraftStore((state) => state.setLocation);

  const [locations, setLocations] = useState<ParkingLocation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const items = await apiRequest<ParkingLocation[]>('/api/locations');
      setLocations(items);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load parking locations.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const selectLocation = (location: ParkingLocation) => {
    setLocation(location.id);
    router.push(`/customer/book/${location.id}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedText type="small" themeColor="textSecondary">
        Choose where you&apos;re parking.
      </ThemedText>

      {locations === null && !loadError ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.text} />
        </View>
      ) : (
        <FlatList
          data={locations ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            locations === null ? null : (
              <ThemedText themeColor="textSecondary">
                No parking locations are available right now.
              </ThemedText>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => selectLocation(item)}
              style={[styles.card, { backgroundColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold">{item.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {item.addressLine}, {item.city}
              </ThemedText>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
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
