/**
 * Admin user detail (context.txt §22) — profile plus booking history.
 *
 * Booking history is fetched from `GET /api/admin/bookings?userId=:id` — the
 * same endpoint the booking queue uses — rather than embedding it in the user
 * response, so this screen and the queue can never show it two different ways.
 */
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import {
  BOOKING_STATUS_LABELS,
  formatInr,
  formatIstDateTime,
  type AdminBooking,
  type AdminUser,
  type BookingStatus,
  type Paginated,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';

function statusColor(status: BookingStatus): ThemeColor {
  if (status === 'CONFIRMED' || status === 'COMPLETED') return 'primary';
  if (status === 'REJECTED' || status === 'EXPIRED' || status === 'CANCELLED') return 'danger';
  return 'textSecondary';
}

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
        <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
          {loadError ? (
            <>
              <ThemedText themeColor="danger">{loadError}</ThemedText>
              <AppButton label="Try again" variant="secondary" onPress={() => void load()} />
            </>
          ) : (
            <ActivityIndicator color={theme.text} />
          )}
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: user.name ?? user.email }} />
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <FlatList
          data={bookings ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.text} />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <View style={styles.cardHeader}>
                  <ThemedText type="smallBold">{user.name ?? '(no name on file)'}</ThemedText>
                  <ThemedText type="small" themeColor={user.isActive ? 'primary' : 'danger'}>
                    {user.isActive ? 'Active' : 'Disabled'}
                  </ThemedText>
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
              </View>

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
              <ThemedText themeColor="textSecondary">No bookings yet.</ThemedText>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/admin/bookings/${item.id}`)}
              style={[styles.card, { backgroundColor: theme.backgroundElement }]}
            >
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
              <ThemedText type="small" themeColor={statusColor(item.status)}>
                {BOOKING_STATUS_LABELS[item.status]}
              </ThemedText>
            </Pressable>
          )}
        />

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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  header: { gap: Spacing.three, marginBottom: Spacing.three },
  list: { gap: Spacing.two },
  card: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  banner: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
});
