/**
 * Password reset — a real OTP flow (Phase 15), replacing the "call the parking
 * office" stub that shipped for Thursday.
 *
 * That stub's comment set the bar this screen has to clear: *"a reset link is an
 * account takeover path... getting it half right is worse than not having it"*.
 * The answer is a code rather than a link — nothing that merely *reads* the email
 * can spend it, and nothing has to deep-link back into the APK. The security
 * reasoning lives server-side in `apps/api/lib/auth/password-reset.ts`; what
 * follows is only what the screen has to get right.
 *
 * ── Two steps in one screen, gated by local state ──────────────────────────
 *
 * The same shape as `customer/bookings/[id]/upi.tsx` and for the same reason it
 * gives: until the customer has the code there is nothing for the second form to
 * collect. So `sentTo` holds the address step one submitted, and its presence is
 * what reveals step two. Not two routes, because a back-swipe between them would
 * either lose the address or leave a half-finished reset in the history stack.
 *
 * ── The screen cannot tell the customer whether the email exists ───────────
 *
 * `request-otp` answers identically for a registered address, an unregistered
 * one, a Google-only account and a resend inside the cooldown — that is the
 * API's account-enumeration protection, and it would be undone by a screen that
 * said "we found your account". Hence the copy on step two is conditional
 * ("if an account exists for that address"), and it advances to step two
 * regardless. Telling someone to check an inbox that will stay empty is the cost
 * of not telling a stranger whose addresses are registered.
 *
 * ── Keyboard handling ──────────────────────────────────────────────────────
 *
 * `KeyboardAwareScrollView` from the start (Phase 12's pattern), not a
 * `ScrollView` retrofitted later: step two is three stacked fields and the
 * submit button, which on a short Android screen puts the button under the
 * keyboard the moment the OTP field focuses.
 */
import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import {
  ForgotPasswordRequestOtpRequestSchema,
  ForgotPasswordResetFormSchema,
  OTP_RESEND_COOLDOWN_SECONDS,
  type ForgotPasswordRequestOtpRequest,
  type ForgotPasswordRequestOtpRequestParsed,
  type ForgotPasswordRequestOtpResponse,
  type ForgotPasswordResetForm,
  type ForgotPasswordResetFormParsed,
  type ForgotPasswordVerifyOtpRequest,
  type ForgotPasswordVerifyOtpResponse,
} from '@parking/shared';

import { AppButton } from '@/components/app-button';
import { BrandHeader } from '@/components/brand-header';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiRequest } from '@/lib/api';
import { applyApiError } from '@/lib/form-errors';

const EMPTY_RESET_FORM: ForgotPasswordResetForm = {
  otp: '',
  newPassword: '',
  confirmNewPassword: '',
};

export default function ForgotPasswordScreen() {
  const theme = useTheme();

  /**
   * The address step one sent a code to — and the gate on step two.
   *
   * `null` means "step one". Held here rather than re-rendered as an editable
   * input in step two: the code is tied to this exact address server-side, so a
   * field the customer could edit would silently invalidate every attempt. The
   * "Use a different email" button below resets this instead, which is the
   * honest way to change it.
   */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  /**
   * Seconds left before "Resend code" is offered again.
   *
   * Counted from `OTP_RESEND_COOLDOWN_SECONDS`, which is the *server's* number
   * imported from `@parking/shared` rather than a 60 typed here. If the two
   * disagreed, the button would either sit disabled after the server was ready,
   * or — worse — offer a resend the server silently ignores while answering the
   * same generic success, so the customer waits for a second email that was
   * never sent.
   */
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  /* ───────────────────────────── Step one ─────────────────────────────── */

  const emailForm = useForm<
    ForgotPasswordRequestOtpRequest,
    unknown,
    ForgotPasswordRequestOtpRequestParsed
  >({
    resolver: zodResolver(ForgotPasswordRequestOtpRequestSchema),
    defaultValues: { email: '' },
  });
  const [emailError, setEmailError] = useState<string | null>(null);

  /**
   * Shared by "Send code" and "Resend code".
   *
   * Takes the address as an argument rather than reading the form, because a
   * resend happens from step two where the email input is no longer rendered —
   * `sentTo` is the only copy of it by then.
   */
  const requestCode = useCallback(async (email: string) => {
    const body: ForgotPasswordRequestOtpRequest = { email };
    await apiRequest<ForgotPasswordRequestOtpResponse>(
      '/api/auth/forgot-password/request-otp',
      { method: 'POST', body, anonymous: true },
    );
  }, []);

  const onRequestCode = async (values: ForgotPasswordRequestOtpRequestParsed) => {
    setEmailError(null);
    try {
      await requestCode(values.email);
      // `values.email` and not the raw input: `EmailSchema` trims and
      // lower-cases, and this is the string the server keyed the code on, so it
      // has to be the one a resend and the verify call send back.
      setSentTo(values.email);
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      // Only reachable for a malformed request or an unreachable server — the
      // endpoint answers success for every address it recognises and every one it
      // does not.
      setEmailError(applyApiError(error, emailForm.setError));
    }
  };

  /* ───────────────────────────── Step two ─────────────────────────────── */

  const resetForm = useForm<
    ForgotPasswordResetForm,
    unknown,
    ForgotPasswordResetFormParsed
  >({
    resolver: zodResolver(ForgotPasswordResetFormSchema),
    defaultValues: EMPTY_RESET_FORM,
  });
  const [resetError, setResetError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const onResend = async () => {
    if (!sentTo || cooldown > 0 || resending) return;
    setResetError(null);
    setResending(true);
    try {
      await requestCode(sentTo);
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      // The old code is dead the moment the server issues a new one
      // (`requestPasswordResetOtp` clears the address's rows first), so a
      // half-typed guess at it left sitting in the field is only a trap.
      resetForm.resetField('otp');
    } catch (error) {
      setResetError(applyApiError(error, resetForm.setError));
    } finally {
      setResending(false);
    }
  };

  const onReset = async (values: ForgotPasswordResetFormParsed) => {
    if (!sentTo) return;
    setResetError(null);

    // `confirmNewPassword` is validated on the device and dropped here — there is
    // one new password on the wire, the same as `ChangePasswordCard` does.
    const body: ForgotPasswordVerifyOtpRequest = {
      email: sentTo,
      otp: values.otp,
      newPassword: values.newPassword,
    };

    try {
      await apiRequest<ForgotPasswordVerifyOtpResponse>(
        '/api/auth/forgot-password/verify-otp',
        { method: 'POST', body, anonymous: true },
      );
      // Clear all three fields rather than leaving a password sitting in a form
      // on a screen someone may walk away from.
      resetForm.reset(EMPTY_RESET_FORM);
      setResetDone(true);
    } catch (error) {
      // A wrong code arrives as VALIDATION_ERROR with a `fields.otp` entry, so it
      // lands under the code input with the remaining-attempts count. Expired,
      // locked-out and disabled-account failures have no field and show in the
      // banner, which is where "request a new code" belongs.
      setResetError(applyApiError(error, resetForm.setError));
    }
  };

  const startOver = () => {
    setSentTo(null);
    setCooldown(0);
    setResetError(null);
    setEmailError(null);
    resetForm.reset(EMPTY_RESET_FORM);
  };

  /* ─────────────────────────────── Render ─────────────────────────────── */

  // The reset succeeded. No session is handed out by `verify-otp` on purpose
  // (a mailbox is weaker proof than a password, and D3 tokens live 30 days with
  // no way to revoke them), so the only thing left is to go and sign in.
  if (resetDone) {
    return (
      <KeyboardAwareScrollView
        style={[styles.flex, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={Spacing.four}
      >
        <BrandHeader variant="large" style={styles.brand} />

        <View style={styles.header}>
          <ThemedText type="heading">Password updated</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            Sign in with your new password.
          </ThemedText>
        </View>

        <Card>
          <View style={styles.noteRow}>
            <Ionicons name="information-circle-outline" size={18} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.noteText}>
              If you were signed in on another device, that session stays open.
              Sign out there if it is not yours.
            </ThemedText>
          </View>
        </Card>

        <AppButton label="Go to sign in" onPress={() => router.replace('/sign-in')} />
      </KeyboardAwareScrollView>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={[styles.flex, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      bottomOffset={Spacing.four}
    >
      <BrandHeader variant="large" style={styles.brand} />

      <View style={styles.header}>
        <ThemedText type="heading">Forgot password</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          {sentTo === null
            ? 'Enter your email and we will send you a 6-digit code to reset your password.'
            : `Enter the 6-digit code sent to ${sentTo} and choose a new password.`}
        </ThemedText>
      </View>

      {sentTo === null ? (
        <>
          {emailError ? <ErrorBanner message={emailError} /> : null}

          <TextField
            control={emailForm.control}
            name="email"
            label="Email"
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={emailForm.handleSubmit(onRequestCode)}
          />

          <AppButton
            label="Send code"
            onPress={emailForm.handleSubmit(onRequestCode)}
            loading={emailForm.formState.isSubmitting}
            disabled={emailForm.formState.isSubmitting}
          />
        </>
      ) : (
        <>
          <Card>
            <View style={styles.noteRow}>
              <Ionicons name="mail-outline" size={18} color={theme.textSecondary} />
              {/* Conditional on purpose — see the enumeration note in this file's
                  header. The app genuinely does not know whether that address has
                  an account, and must not pretend otherwise. */}
              <ThemedText type="small" themeColor="textSecondary" style={styles.noteText}>
                If an account exists for that address, the code is on its way. It
                expires in 10 minutes. Check your spam folder if it does not
                arrive.
              </ThemedText>
            </View>
          </Card>

          {resetError ? <ErrorBanner message={resetError} /> : null}

          <TextField
            control={resetForm.control}
            name="otp"
            label="6-digit code"
            placeholder="123456"
            keyboardType="number-pad"
            autoCapitalize="none"
            autoComplete="one-time-code"
            autoCorrect={false}
            textContentType="oneTimeCode"
            maxLength={6}
            returnKeyType="next"
          />

          <TextField
            control={resetForm.control}
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
            control={resetForm.control}
            name="confirmNewPassword"
            label="Confirm new password"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={resetForm.handleSubmit(onReset)}
          />

          <AppButton
            label="Reset password"
            onPress={resetForm.handleSubmit(onReset)}
            loading={resetForm.formState.isSubmitting}
            disabled={resetForm.formState.isSubmitting || resending}
          />

          <AppButton
            // The countdown is in the label rather than only in helper text so a
            // customer who taps a disabled button can see why it is disabled.
            label={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            variant="secondary"
            onPress={onResend}
            loading={resending}
            disabled={cooldown > 0 || resending || resetForm.formState.isSubmitting}
          />

          <AppButton label="Use a different email" variant="ghost" onPress={startOver} />
        </>
      )}

      {/* Kept verbatim from the stub this screen replaces. It is the one case the
          flow above genuinely cannot serve: a Google-only account has no
          `passwordHash` (D3), so `request-otp` deliberately sends it nothing, and
          without this card the customer would wait for an email that is never
          coming. */}
      <Card>
        <ThemedText type="smallBold">If you signed in with Google</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Your account has no password — use the “Sign in with Google” button
          instead.
        </ThemedText>
      </Card>

      <Link href="/sign-in" asChild>
        <ThemedText type="small" themeColor="primary" style={styles.centered}>
          Back to sign in
        </ThemedText>
      </Link>
    </KeyboardAwareScrollView>
  );
}

/** The same banner `sign-in.tsx` and `ChangePasswordCard` draw, used twice here. */
function ErrorBanner({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: theme.backgroundElement, borderColor: theme.danger },
      ]}
    >
      <Ionicons name="alert-circle" size={18} color={theme.danger} />
      <ThemedText type="small" themeColor="danger" style={styles.bannerText}>
        {message}
      </ThemedText>
    </View>
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
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  noteText: { flex: 1 },
});
