/**
 * Email/password registration (context.txt §4).
 *
 * Posts to `/api/auth/register`, which creates the account and returns a session
 * in one round trip — so a new customer is in the app rather than back at sign-in
 * retyping the password they just chose.
 *
 * The account is always a `USER`. Nothing on this form, and no field in
 * `RegisterRequestSchema`, can say otherwise (context.txt §110-112).
 */
import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import {
  RegisterRequestSchema,
  type RegisterRequest,
  type RegisterRequestParsed,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { BrandHeader } from '@/components/brand-header';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { applyApiError } from '@/lib/form-errors';
import { useAuthStore } from '@/stores/auth-store';

export default function SignUpScreen() {
  const theme = useTheme();
  const register = useAuthStore((state) => state.register);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = useForm<RegisterRequest, unknown, RegisterRequestParsed>({
    resolver: zodResolver(RegisterRequestSchema),
    defaultValues: { name: '', email: '', phone: '', password: '' },
  });

  const onSubmit = async (values: RegisterRequestParsed) => {
    setFormError(null);
    try {
      await register(values);
      router.replace('/');
    } catch (error) {
      // A duplicate email comes back as CONFLICT with a `fields.email` entry, so
      // it lands on the field rather than in the banner.
      setFormError(applyApiError(error, setError));
    }
  };

  return (
    <KeyboardAwareScrollView
      style={[styles.flex, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      bottomOffset={Spacing.four}
    >
      <BrandHeader variant="large" style={styles.brand} />

      <View style={styles.header}>
        <ThemedText type="heading">Create account</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          You will need this to book parking and get your receipt.
        </ThemedText>
      </View>

      {formError ? (
        <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
          <Ionicons name="alert-circle" size={18} color={theme.danger} />
          <ThemedText type="small" themeColor="danger" style={styles.bannerText}>
            {formError}
          </ThemedText>
        </View>
      ) : null}

      <TextField
        control={control}
        name="name"
        label="Full name"
        placeholder="Ramesh Patil"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
      />

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
        name="phone"
        label="Mobile number"
        placeholder="98765 43210"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        returnKeyType="next"
        hint="Optional. Printed on your parking receipt."
      />

      <TextField
        control={control}
        name="password"
        label="Password"
        placeholder="At least 8 characters"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={handleSubmit(onSubmit)}
      />

      <AppButton
        label="Create account"
        onPress={handleSubmit(onSubmit)}
        loading={isSubmitting}
        disabled={isSubmitting}
      />

      <View style={styles.footer}>
        <ThemedText type="small" themeColor="textSecondary">
          Already have an account?
        </ThemedText>
        <Link href="/sign-in" asChild>
          <ThemedText type="small" themeColor="primary">
            Sign in
          </ThemedText>
        </Link>
      </View>
    </KeyboardAwareScrollView>
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.control,
    borderWidth: 1,
    padding: Spacing.three,
  },
  bannerText: { flex: 1 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
