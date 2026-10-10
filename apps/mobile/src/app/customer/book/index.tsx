/**
 * Customer location picker — first step of the booking flow (context.txt §6,
 * §9, Phase 04).
 *
 * Always rendered from `GET /api/locations`, never a hardcoded list — a second
 * branch the admin adds later shows up here with no app release, and one the
 * admin deactivates disappears on the next fetch (§6, §23, Phase 04
 * acceptance).
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import type { ParkingLocation } from '@parking/shared';

import { Card } from '@/components/card';
import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
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
    <ScreenContainer>
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
              <View style={styles.empty}>
                <Ionicons name="location-outline" size={32} color={theme.textSecondary} />
                <ThemedText themeColor="textSecondary">
                  No parking locations are available right now.
                </ThemedText>
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => selectLocation(item)}>
              <Card>
                <ThemedText type="smallBold">{item.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.addressLine}, {item.city}
                </ThemedText>
              </Card>
            </Pressable>
          )}
        />
      )}

      {loadError ? (
        <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
          <Ionicons name="alert-circle" size={18} color={theme.danger} />
          <ThemedText type="small" themeColor="danger" style={styles.bannerText}>
            {loadError}
          </ThemedText>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: {
    gap: Spacing.two,
  },
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
