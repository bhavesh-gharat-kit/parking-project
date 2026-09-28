/**
 * Sign-in (context.txt §4).
 *
 * Email/password and "Sign in with Google", and — the thing context.txt §110-112
 * is explicit about — **no role choice**. There is no Admin toggle, no Admin tab,
 * nothing on this screen that varies by who is signing in. An admin types the
 * same form a customer does and lands somewhere different because of what the
 * backend said about their account, which `src/app/index.tsx` acts on.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import {
  LoginRequestSchema,
  type LoginRequest,
  type LoginRequestParsed,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { applyApiError } from '@/lib/form-errors';
import { GoogleSignInError, isGoogleSignInAvailable } from '@/lib/google-auth';
import { useAuthStore } from '@/stores/auth-store';

export default function SignInScreen() {
  const theme = useTheme();
  const signInWithPassword = useAuthStore((state) => state.signInWithPassword);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);

  const [formError, setFormError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  // Decided once per render rather than per tap: in Expo Go or a build without a
  // Google client ID the button can only fail, so it is not offered at all.
  const googleAvailable = isGoogleSignInAvailable();

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = useForm<LoginRequest, unknown, LoginRequestParsed>({
    resolver: zodResolver(LoginRequestSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginRequestParsed) => {
    setFormError(null);
    try {
      await signInWithPassword(values);
      // The root index redirects on `role`; going there rather than to a stack
      // keeps this screen from having to know the roles exist.
      router.replace('/');
    } catch (error) {
      setFormError(applyApiError(error, setError));
    }
  };

  const onGoogle = async () => {
    setFormError(null);
    setGoogleBusy(true);
    try {
      const signedIn = await signInWithGoogle();
      // `false` means the account picker was dismissed. A cancel is not a failure
      // and showing a message for it would be noise.
      if (signedIn) router.replace('/');
    } catch (error) {
      setFormError(
        error instanceof GoogleSignInError ? error.message : applyApiError(error, setError),
      );
    } finally {
      setGoogleBusy(false);
    }
  };

  const busy = isSubmitting || googleBusy;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <ThemedText type="subtitle">Welcome back</ThemedText>
          <ThemedText themeColor="textSecondary">
            Sign in to book parking and see your bookings.
          </ThemedText>
        </View>

        {formError ? (
          <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
            <ThemedText type="small" themeColor="danger">
              {formError}
            </ThemedText>
          </View>
        ) : null}

        <TextField
          control={control}
          name="email"
          label="Email"
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          textContentType="emailAddress"
          returnKeyType="next"
        />

        <TextField
          control={control}
          name="password"
          label="Password"
          placeholder="Your password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={handleSubmit(onSubmit)}
        />

        <AppButton
          label="Sign in"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          disabled={busy}
        />

        <Link href="/forgot-password" asChild>
          <ThemedText type="small" themeColor="primary" style={styles.centered}>
            Forgot your password?
          </ThemedText>
        </Link>

        {googleAvailable ? (
          <>
            <View style={styles.dividerRow}>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <ThemedText type="small" themeColor="textSecondary">
                or
              </ThemedText>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
            </View>

            <AppButton
              label="Sign in with Google"
              variant="secondary"
              onPress={onGoogle}
              loading={googleBusy}
              disabled={busy}
            />
          </>
        ) : null}

        <View style={styles.footer}>
          <ThemedText type="small" themeColor="textSecondary">
            New here?
          </ThemedText>
          <Link href="/sign-up" asChild>
            <ThemedText type="small" themeColor="primary">
              Create an account
            </ThemedText>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  header: { gap: Spacing.one },
  banner: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  centered: { textAlign: 'center' },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
