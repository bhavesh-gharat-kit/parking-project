/**
 * Customer dashboard (context.txt §9).
 *
 * The two entry points that matter are "Book parking" (which starts the §9 flow:
 * location → vehicle → package → summary) and "My bookings" (which is how a
 * customer gets back to a booking's summary afterwards). Payment, admin approval
 * and the receipt are Phases 06-08.
 */
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/auth-store';

export default function CustomerHomeScreen() {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedText type="subtitle">Customer</ThemedText>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">{user?.name ?? 'Signed in'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {user?.email}
        </ThemedText>
      </View>

      <View style={styles.menu}>
        <AppButton label="Book parking" onPress={() => router.push('/customer/book')} />
        <AppButton
          label="My bookings"
          variant="secondary"
          onPress={() => router.push('/customer/bookings')}
        />
        <AppButton
          label="My vehicles"
          variant="secondary"
          onPress={() => router.push('/customer/vehicles')}
        />
        <AppButton
          label="My profile"
          variant="secondary"
          onPress={() => router.push('/customer/profile')}
        />
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        Booking is live end to end: the parking decides the price, and an
        unfinished booking is released after 10 minutes. Choosing how to pay and
        the digital receipt arrive in the next releases.
      </ThemedText>

      <View style={styles.spacer} />

      <AppButton label="Sign out" variant="secondary" onPress={() => void signOut()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  menu: { gap: Spacing.two },
  spacer: { flex: 1 },
});
