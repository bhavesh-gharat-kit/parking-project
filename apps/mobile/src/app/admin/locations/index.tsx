/**
 * Admin location list (context.txt §3, §6, §23, Phase 04).
 *
 * Shows every location, active or not — an admin re-enabling a closed branch
 * needs to find it here first, unlike the customer's picker which only ever
 * sees the active ones (`GET /api/locations`).
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import type { AdminParkingLocation } from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { Card } from '@/components/card';
import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { TonePill } from '@/components/status-badge';
import { Radius, Spacing } from '@/constants/theme';
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
            <View style={styles.empty}>
              <Ionicons name="business-outline" size={32} color={theme.textSecondary} />
              <ThemedText themeColor="textSecondary">No locations yet. Add one below.</ThemedText>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.cardInfo}>
              <View style={styles.titleRow}>
                <ThemedText type="smallBold">{item.name}</ThemedText>
                <TonePill
                  label={item.isActive ? 'Active' : 'Inactive'}
                  tone={item.isActive ? 'done' : 'bad'}
                  icon={item.isActive ? 'checkmark-circle' : 'pause-circle-outline'}
                />
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

      <AppButton label="Add location" onPress={() => router.push('/admin/locations/new')} />
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
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
