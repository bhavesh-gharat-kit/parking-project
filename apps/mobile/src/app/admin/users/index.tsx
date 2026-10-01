/**
 * Admin user list (context.txt §22).
 *
 * Lists everyone, active or disabled — an admin re-enabling someone needs to
 * find them among the disabled first, same reasoning as the admin location
 * list (Phase 04) listing inactive branches too.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';

import type { AdminUser, Paginated } from '@parking/shared';

import { ThemedText } from '@/components/themed-text';
import { CardShadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';

export default function AdminUsersScreen() {
  const theme = useTheme();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <TextInput
        value={searchInput}
        onChangeText={setSearchInput}
        onSubmitEditing={() => setSearch(searchInput.trim())}
        placeholder="Search name, email or phone"
        placeholderTextColor={theme.textSecondary}
        returnKeyType="search"
        style={[
          styles.search,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
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
            users === null ? null : <ThemedText themeColor="textSecondary">No users found.</ThemedText>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/admin/users/${item.id}`)}
              style={[styles.card, { backgroundColor: theme.backgroundElement }]}
            >
              <View style={styles.cardHeader}>
                <ThemedText type="smallBold">{item.name ?? '(no name on file)'}</ThemedText>
                <ThemedText type="small" themeColor={item.isActive ? 'textSecondary' : 'danger'}>
                  {item.isActive ? item.role : 'Disabled'}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {item.email}
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
  search: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { gap: Spacing.two },
  card: {
    ...CardShadow,
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
