/**
 * Admin user list (context.txt §22).
 *
 * Lists everyone, active or disabled — an admin re-enabling someone needs to
 * find them among the disabled first, same reasoning as the admin location
 * list (Phase 04) listing inactive branches too.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';

import type { AdminUser, Paginated } from '@parking/shared';

import { Card } from '@/components/card';
import { ScreenContainer } from '@/components/screen-container';
import { TonePill } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';

export default function AdminUsersScreen() {
  const theme = useTheme();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const params = new URLSearchParams({ pageSize: '50' });
      if (search) params.set('search', search);

      const page = await apiRequest<Paginated<AdminUser>>(`/api/admin/users?${params.toString()}`);
      setUsers(page.items);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load users.');
    }
  }, [search]);

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

  return (
    <ScreenContainer>
      <TextInput
        value={searchInput}
        onChangeText={setSearchInput}
        onSubmitEditing={() => setSearch(searchInput.trim())}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        placeholder="Search name, email or phone"
        placeholderTextColor={theme.textSecondary}
        returnKeyType="search"
        style={[
          styles.search,
          {
            color: theme.text,
            backgroundColor: searchFocused ? theme.background : theme.backgroundElement,
            borderColor: searchFocused ? theme.primary : theme.borderStrong,
          },
        ]}
      />

      {users === null && !loadError ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.text} />
        </View>
      ) : (
        <FlatList
          data={users ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.text} />
          }
          ListEmptyComponent={
            users === null ? null : (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={32} color={theme.textSecondary} />
                <ThemedText themeColor="textSecondary">No users found.</ThemedText>
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/admin/users/${item.id}`)}>
              <Card>
                <View style={styles.cardHeader}>
                  <ThemedText type="smallBold">{item.name ?? '(no name on file)'}</ThemedText>
                  {item.isActive ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.role}
                    </ThemedText>
                  ) : (
                    <TonePill label="Disabled" tone="bad" icon="ban-outline" />
                  )}
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.email}
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
  search: {
    borderRadius: Radius.control,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    minHeight: 48,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
