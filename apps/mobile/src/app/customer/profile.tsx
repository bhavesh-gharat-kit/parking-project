/**
 * Profile screen (context.txt §5, Phase 03).
 *
 * `email` is shown but never editable: it is the login identifier for both
 * providers (D3), so there is no field for it in `UpdateProfileRequestSchema`
 * to post in the first place.
 *
 * A successful save calls `updateUser`, not just local component state — the
 * cached session in `expo-secure-store` has to change too, or the edited name
 * would revert the moment the app is closed and reopened (the Phase 03
 * acceptance criterion is that this round-trips through the backend).
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import {
  UpdateProfileRequestSchema,
  type ProfileResponse,
  type UpdateProfileRequest,
  type UpdateProfileRequestParsed,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiRequest } from '@/lib/api';
import { applyApiError } from '@/lib/form-errors';
import { useAuthStore } from '@/stores/auth-store';

export default function ProfileScreen() {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = useForm<UpdateProfileRequest, unknown, UpdateProfileRequestParsed>({
    resolver: zodResolver(UpdateProfileRequestSchema),
    defaultValues: { name: user?.name ?? '', phone: user?.phone ?? '' },
  });

  const onSubmit = async (values: UpdateProfileRequestParsed) => {
    setFormError(null);
    setSaved(false);
    try {
      const { user: updated } = await apiRequest<ProfileResponse>('/api/profile', {
        method: 'PATCH',
        body: values,
      });
      await updateUser(updated);
      setSaved(true);
    } catch (error) {
      setFormError(applyApiError(error, setError));
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {formError ? (
          <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
            <ThemedText type="small" themeColor="danger">
              {formError}
            </ThemedText>
          </View>
        ) : null}

        {saved ? (
          <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.primary }]}>
            <ThemedText type="small" themeColor="primary">
              Saved.
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.field}>
          <ThemedText type="smallBold">Email</ThemedText>
          <ThemedText themeColor="textSecondary">{user?.email}</ThemedText>
        </View>

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
          name="phone"
          label="Mobile number"
          placeholder="98765 43210"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          returnKeyType="done"
          hint="Printed on your parking receipt."
          onSubmitEditing={handleSubmit(onSubmit)}
        />

        <AppButton
          label="Save changes"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          disabled={isSubmitting}
        />

        <AppButton
          label="My vehicles"
          variant="secondary"
          onPress={() => router.push('/customer/vehicles')}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  field: { gap: Spacing.one },
  banner: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
});
