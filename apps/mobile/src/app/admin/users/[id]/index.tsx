/**
 * Admin user detail (context.txt §22) — profile plus booking history.
 *
 * Booking history is fetched from `GET /api/admin/bookings?userId=:id` — the
 * same endpoint the booking queue uses — rather than embedding it in the user
 * response, so this screen and the queue can never show it two different ways.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import {
  formatInr,
  formatIstDateTime,
  type AdminBooking,
  type AdminUser,
  type Paginated,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { Card } from '@/components/card';
import { ScreenContainer } from '@/components/screen-container';
import { StatusBadge, TonePill } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';

export default function AdminUserDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [profile, history] = await Promise.all([
        apiRequest<AdminUser>(`/api/admin/users/${id}`),
        apiRequest<Paginated<AdminBooking>>(`/api/admin/bookings?userId=${id}&pageSize=20`),
      ]);
      setUser(profile);
      setBookings(history.items);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load this user.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const confirmToggleActive = () => {
    if (!user) return;
    const disabling = user.isActive;
    Alert.alert(
      disabling ? 'Disable this user?' : 'Enable this user?',
      disabling
        ? 'They will be signed out immediately and cannot sign in again until re-enabled.'
        : 'They will be able to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: disabling ? 'Disable' : 'Enable',
          style: disabling ? 'destructive' : 'default',
          onPress: () => void toggleActive(!disabling),
        },
      ],
    );
  };

  const toggleActive = async (isActive: boolean) => {
    setTogglingActive(true);
    try {
      setUser(
        await apiRequest<AdminUser>(`/api/admin/users/${id}`, {
          method: 'PATCH',
          body: { isActive },
        }),
      );
    } catch (error) {
      Alert.alert(
        'Could not update this user',
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setTogglingActive(false);
    }
  };

  if (user === null) {
    return (
      <>
        <Stack.Screen options={{ title: 'User' }} />
        <ScreenContainer style={styles.centered}>
          {loadError ? (
            <>
              <ThemedText themeColor="danger">{loadError}</ThemedText>
              <AppButton label="Try again" variant="secondary" onPress={() => void load()} />
            </>
          ) : (
            <ActivityIndicator color={theme.text} />
          )}
        </ScreenContainer>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: user.name ?? user.email }} />
      <ScreenContainer>
        <FlatList
          data={bookings ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.text} />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <Card>
                <View style={styles.cardHeader}>
                  <ThemedText type="smallBold">{user.name ?? '(no name on file)'}</ThemedText>
                  <TonePill
                    label={user.isActive ? 'Active' : 'Disabled'}
                    tone={user.isActive ? 'done' : 'bad'}
                    icon={user.isActive ? 'checkmark-circle' : 'ban-outline'}
                  />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {user.email}
                </ThemedText>
                {user.phone ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {user.phone}
                  </ThemedText>
                ) : null}
                <ThemedText type="small" themeColor="textSecondary">
                  {user.role} · {user.signInMethods.join(' + ') || 'No sign-in method'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Joined {formatIstDateTime(user.createdAt)}
                </ThemedText>
              </Card>

              <AppButton
                label={user.isActive ? 'Disable user' : 'Enable user'}
                variant="secondary"
                onPress={confirmToggleActive}
                loading={togglingActive}
              />

              <ThemedText type="smallBold">Booking history</ThemedText>
            </View>
          }
          ListEmptyComponent={
            bookings === null ? null : (
              <View style={styles.empty}>
                <Ionicons name="receipt-outline" size={32} color={theme.textSecondary} />
                <ThemedText themeColor="textSecondary">No bookings yet.</ThemedText>
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/admin/bookings/${item.id}`)}>
              <Card>
                <View style={styles.cardHeader}>
                  <ThemedText type="smallBold">{item.bookingNumber}</ThemedText>
                  <ThemedText type="smallBold" themeColor="primary">
                    {formatInr(item.amountInPaise)}
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.vehicleNumber} · {item.rateLabel}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatIstDateTime(item.startTime)}
                </ThemedText>
                <StatusBadge status={item.status} />
              </Card>
            </Pressable>
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
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  header: { gap: Spacing.three, marginBottom: Spacing.three },
  list: { gap: Spacing.two },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
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
