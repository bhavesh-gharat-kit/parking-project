/**
 * Customer dashboard (context.txt §9).
 *
 * The two entry points that matter are "Book parking" (which starts the §9 flow:
 * location → vehicle → package → summary) and "My bookings" (which is how a
 * customer gets back to a booking's summary afterwards).
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { CardShadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/auth-store';

export default function CustomerHomeScreen() {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  return (
    <ScreenContainer>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">Welcome back{user?.name ? `, ${user.name}` : ''}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {user?.email}
        </ThemedText>
      </View>

      <View style={styles.menu}>
        <AppButton
          label="Book parking"
          icon={<Ionicons name="location-outline" size={20} color={theme.onPrimary} />}
          onPress={() => router.push('/customer/book')}
        />
        <AppButton
          label="My bookings"
          variant="secondary"
          icon={<Ionicons name="receipt-outline" size={20} color={theme.text} />}
          onPress={() => router.push('/customer/bookings')}
        />
        <AppButton
          label="My vehicles"
          variant="secondary"
          icon={<Ionicons name="car-outline" size={20} color={theme.text} />}
          onPress={() => router.push('/customer/vehicles')}
        />
        <AppButton
          label="My profile"
          variant="secondary"
          icon={<Ionicons name="person-outline" size={20} color={theme.text} />}
          onPress={() => router.push('/customer/profile')}
        />
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        Book a slot, pay by UPI or cash, and track your booking status and
        receipt right here — an unfinished booking is released after 10
        minutes if it&apos;s not completed.
      </ThemedText>

      <View style={styles.spacer} />

      <AppButton label="Sign out" variant="secondary" onPress={() => void signOut()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    ...CardShadow,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  menu: { gap: Spacing.two },
  spacer: { flex: 1 },
});
