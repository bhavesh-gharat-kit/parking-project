/**
 * The profile screen's body, shared by `customer/profile.tsx` and
 * `admin/profile.tsx` (Phase 14).
 *
 * Both roles edit the same row through the same endpoint — `GET`/`PATCH
 * /api/profile` is `requireUser`-guarded and always addresses
 * `auth.actor.userId`, so an admin editing their profile is not a different
 * operation from a customer doing it. The two screens differ only in what they
 * offer *after* the form, which is what `children` is for.
 *
 * `email` is shown but never editable: it is the login identifier for both
 * providers (D3), so there is no field for it in `UpdateProfileRequestSchema` to
 * post in the first place.
 *
 * A successful save calls `updateUser`, not just local component state — the
 * cached session in `expo-secure-store` has to change too, or the edited name
 * would revert the moment the app is closed and reopened (the Phase 03
 * acceptance criterion is that this round-trips through the backend).
 *
 * What Phase 14 adds is a `GET /api/profile` on focus, for `hasPassword`: whether
 * this account has a password at all, which decides whether the change-password
 * form is offered. That flag is deliberately not on the cached `SessionUser` (see
 * `ProfileResponseSchema`), so it has to be read from the server rather than
 * guessed from what is in SecureStore. On focus rather than once on mount,
 * matching how `admin/index.tsx` refreshes the dashboard — coming back to this
 * screen shows the current row, not whatever was cached when it first opened.
 *
 * Keyboard handling is the Phase 12 pattern — `KeyboardAwareScrollView` with
 * `bottomOffset`, the same as `sign-up.tsx` and every other form here. Worth
 * noting because this screen is now the tallest form in the app: six inputs and
 * two submit buttons, which on the Android 9 test device is well past where the
 * keyboard would otherwise cover the last field.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import {
  UpdateProfileRequestSchema,
  type ProfileResponse,
  type UpdateProfileRequest,
  type UpdateProfileRequestParsed,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { ChangePasswordCard } from '@/components/change-password-card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardShadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, apiRequest } from '@/lib/api';
import { applyApiError } from '@/lib/form-errors';
import { useAuthStore } from '@/stores/auth-store';

type ProfileEditorProps = {
  /** Rendered below the forms — the screen's own extra navigation. */
  children?: React.ReactNode;
};

export function ProfileEditor({ children }: ProfileEditorProps) {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /** `null` while the answer is still unknown — see `loadError` below. */
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setError,
    reset,
    formState: { isSubmitting },
  } = useForm<UpdateProfileRequest, unknown, UpdateProfileRequestParsed>({
    resolver: zodResolver(UpdateProfileRequestSchema),
    defaultValues: { name: user?.name ?? '', phone: user?.phone ?? '' },
  });

  /** Set inside `load`, after its await — never read or written during render. */
  const seeded = useRef(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const profile = await apiRequest<ProfileResponse>('/api/profile');
      setHasPassword(profile.hasPassword);
      await updateUser(profile.user);

      // Seed the inputs from the server once, in case the cached session this
      // form opened with was stale. After that the fields belong to whoever is
      // typing in them: coming back to this screen refetches `hasPassword`, and
      // must not overwrite a half-typed name with what the server last said.
      if (!seeded.current) {
        seeded.current = true;
        reset({ name: profile.user.name ?? '', phone: profile.user.phone ?? '' });
      }
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : 'Could not load your profile.',
      );
    }
  }, [reset, updateUser]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onSubmit = async (values: UpdateProfileRequestParsed) => {
    setFormError(null);
    setSaved(false);
    try {
      const { user: updated, hasPassword: updatedHasPassword } =
        await apiRequest<ProfileResponse>('/api/profile', {
          method: 'PATCH',
          body: values,
        });
      await updateUser(updated);
      setHasPassword(updatedHasPassword);
      reset({ name: updated.name ?? '', phone: updated.phone ?? '' });
      setSaved(true);
    } catch (error) {
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

      <PasswordSection hasPassword={hasPassword} loadError={loadError} onRetry={() => void load()} />

      {children}
    </KeyboardAwareScrollView>
  );
}

/**
 * The change-password slot, in its three states.
 *
 * The form is hidden rather than disabled for a Google-only account, because
 * there is no password to change — a greyed-out "Change password" button would be
 * asking the customer to work out why. And it stays hidden while `hasPassword` is
 * unknown: showing it optimistically would mean a form that can only fail, which
 * is the one outcome the phase set out to avoid.
 */
function PasswordSection({
  hasPassword,
  loadError,
  onRetry,
}: {
  hasPassword: boolean | null;
  loadError: string | null;
  onRetry: () => void;
}) {
  const theme = useTheme();

  if (loadError !== null && hasPassword === null) {
    return (
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">Change password</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {loadError}
        </ThemedText>
        <AppButton label="Try again" variant="secondary" onPress={onRetry} />
      </View>
    );
  }

  if (hasPassword === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.text} />
      </View>
    );
  }

  if (!hasPassword) {
    return (
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">You signed in with Google</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Your account has no password — keep using the “Sign in with Google”
          button, and there is nothing here to change.
        </ThemedText>
      </View>
    );
  }

  return <ChangePasswordCard />;
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
  card: {
    ...CardShadow,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  loading: { paddingVertical: Spacing.five, alignItems: 'center' },
});
