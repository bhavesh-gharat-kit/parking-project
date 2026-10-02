/**
 * Password reset — a stub, by agreement with the phase prompt ("Password reset
 * flow can be a stub for Thursday").
 *
 * A real reset means transactional email: an SMTP or provider account, a
 * `PasswordResetToken` table, expiry and single-use semantics, and a deep link
 * back into the app. None of that blocks the booking → payment → approval →
 * receipt loop that decisions.md D1 makes Thursday's target, and getting it half
 * right is worse than not having it — a reset link is an account takeover path.
 *
 * So the honest version for launch: tell the customer to call the parking office,
 * where an admin can reset the password with `npm run admin:create`. A customer
 * who signed in with Google has no password to lose, which is why that is said
 * here too.
 *
 * The support number is hardcoded only because the `AppSetting`-backed settings
 * endpoint arrives in Phase 04; `business.supportPhone` is already seeded for it.
 */
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BrandHeader } from '@/components/brand-header';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ForgotPasswordScreen() {
  const theme = useTheme();

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <BrandHeader variant="large" style={styles.brand} />

      <View style={styles.header}>
        <ThemedText type="heading">Forgot password</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          Self-service password reset is not available yet. Please contact the parking office
          and an administrator will reset it for you.
        </ThemedText>
      </View>

      <Card>
        <ThemedText type="smallBold">If you signed in with Google</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Your account has no password — use the “Sign in with Google” button instead.
        </ThemedText>
      </Card>

      <Link href="/sign-in" asChild>
        <ThemedText type="small" themeColor="primary" style={styles.centered}>
          Back to sign in
        </ThemedText>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    flexGrow: 1,
    justifyContent: 'center',
  },
  brand: { marginBottom: Spacing.two },
  header: { gap: Spacing.one, alignItems: 'center' },
  centered: { textAlign: 'center' },
});
