/**
 * "Change password" — the in-app, signed-in password change (Phase 14).
 *
 * Shared by `customer/profile.tsx` and `admin/profile.tsx` because it is the same
 * form on both: `POST /api/profile/change-password` always acts on whichever
 * account the Bearer token belongs to, so there is nothing role-specific to
 * parameterise (see the route handler's comment on that).
 *
 * This is not the forgot-password flow. That one is for a signed-out customer who
 * does not know their password (`src/app/forgot-password.tsx`, a stub until Phase
 * 15); this one requires the current password precisely because the session alone
 * must not be enough to change it.
 *
 * `confirmNewPassword` is validated here and then dropped: `ChangePasswordRequest`
 * has two fields, and only those two are posted.
 *
 * Named `...Card` rather than `...Form` because `ChangePasswordForm` is already the
 * shared *type* this file validates against, and one name for both reads as a bug.
 */
import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import {
  ChangePasswordFormSchema,
  type ChangePasswordForm,
  type ChangePasswordFormParsed,
  type ChangePasswordRequest,
  type ChangePasswordResponse,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiRequest } from '@/lib/api';
import { applyApiError } from '@/lib/form-errors';

const EMPTY: ChangePasswordForm = {
  currentPassword: '',
  newPassword: '',
  confirmNewPassword: '',
};

export function ChangePasswordCard() {
  const theme = useTheme();
  const [formError, setFormError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  const {
    control,
    handleSubmit,
    setError,
    reset,
    formState: { isSubmitting },
  } = useForm<ChangePasswordForm, unknown, ChangePasswordFormParsed>({
    resolver: zodResolver(ChangePasswordFormSchema),
    defaultValues: EMPTY,
  });

  const onSubmit = async (values: ChangePasswordFormParsed) => {
    setFormError(null);
    setChanged(false);

    const body: ChangePasswordRequest = {
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    };

    try {
      await apiRequest<ChangePasswordResponse>('/api/profile/change-password', {
        method: 'POST',
        body,
      });
      // Clear all three fields rather than leaving the new password sitting in a
      // form on a screen someone may walk away from.
      reset(EMPTY);
      setChanged(true);
    } catch (error) {
      // A wrong current password comes back as VALIDATION_ERROR with a
      // `fields.currentPassword` entry, so it lands under that input instead of
      // in the banner — and deliberately not as a 401, which `lib/api.ts` would
      // treat as a dead session and sign the user out over a typo.
      setFormError(applyApiError(error, setError));
    }
  };

  return (
    <Card>
      <ThemedText type="smallBold">Change password</ThemedText>

      {formError ? (
        <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
          <Ionicons name="alert-circle" size={18} color={theme.danger} />
          <ThemedText type="small" themeColor="danger" style={styles.bannerText}>
            {formError}
          </ThemedText>
        </View>
      ) : null}

      {changed ? (
        <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.primary }]}>
          <Ionicons name="checkmark-circle" size={18} color={theme.primary} />
          <ThemedText type="small" themeColor="primary" style={styles.bannerText}>
            Password changed. Use the new one next time you sign in.
          </ThemedText>
        </View>
      ) : null}

      <TextField
        control={control}
        name="currentPassword"
        label="Current password"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="next"
      />

      <TextField
        control={control}
        name="newPassword"
        label="New password"
        placeholder="At least 8 characters"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
      />

      <TextField
        control={control}
        name="confirmNewPassword"
        label="Confirm new password"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={handleSubmit(onSubmit)}
      />

      <AppButton
        label="Change password"
        onPress={handleSubmit(onSubmit)}
        loading={isSubmitting}
        disabled={isSubmitting}
      />

      <ThemedText type="small" themeColor="textSecondary">
        You stay signed in on this device. Sessions already open on other devices
        are not signed out.
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
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
