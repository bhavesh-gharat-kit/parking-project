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
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CardShadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ForgotPasswordScreen() {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedText type="subtitle">Forgot password</ThemedText>

      <ThemedText themeColor="textSecondary">
        Self-service password reset is not available yet. Please contact the parking office and
        an administrator will reset it for you.
      </ThemedText>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">If you signed in with Google</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Your account has no password — use the “Sign in with Google” button instead.
        </ThemedText>
      </View>

      <Link href="/sign-in" asChild>
        <ThemedText type="small" themeColor="primary">
          Back to sign in
        </ThemedText>
      </Link>
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
    ...CardShadow,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
});
