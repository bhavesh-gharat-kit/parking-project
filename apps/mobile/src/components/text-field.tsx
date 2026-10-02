/**
 * A labelled text input bound to React Hook Form.
 *
 * Exists because the alternative is the `<Controller>` + label + error-text
 * triple repeated per field, and the sign-in, sign-up and Phase 03 profile forms
 * have a dozen fields between them. Keeping it in one place also means the error
 * styling and the `accessibilityLabel` are consistent by construction rather than
 * by discipline.
 *
 * ── Three states, drawn ─────────────────────────────────────────────────────
 * The client's "forms look third-class" is mostly one thing: a field looked
 * identical whether you were typing in it or not. So the field now says which
 * of three things it is.
 *
 *   resting  `borderStrong` outline on the tinted element surface
 *   focused  `primary` outline, and the surface drops to the page background so
 *            the field reads as open rather than as a grey slab
 *   error    `danger` outline, and the message gets an icon so it is not a
 *            colour-only signal
 *
 * All three use the same 1.5pt outline. Changing the *width* on focus is the
 * obvious way to do this and the wrong one: it reflows the input by half a point
 * on every focus, which on a form of six fields is visible as a twitch.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TextFieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  /** Shown under the input when there is no error — units, format hints. */
  hint?: string;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'onBlur' | 'style'>;

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  onFocus,
  ...inputProps
}: TextFieldProps<T>) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const error = fieldState.error?.message;
        const accent = error ? theme.danger : focused ? theme.primary : theme.borderStrong;

        return (
          <View style={styles.field}>
            {/* The label takes the accent colour too, so a form with one bad
                field out of six points at it twice. */}
            <ThemedText type="smallBold" style={error || focused ? { color: accent } : undefined}>
              {label}
            </ThemedText>

            <TextInput
              {...inputProps}
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: focused ? theme.background : theme.backgroundElement,
                  borderColor: accent,
                },
              ]}
              placeholderTextColor={theme.textSecondary}
              value={field.value == null ? '' : String(field.value)}
              onChangeText={field.onChange}
              onFocus={(event) => {
                setFocused(true);
                onFocus?.(event);
              }}
              onBlur={() => {
                setFocused(false);
                // React Hook Form's blur is what marks the field touched, so it
                // has to still run — this is why `onBlur` is omitted from the
                // forwarded props rather than merged like `onFocus`.
                field.onBlur();
              }}
              accessibilityLabel={label}
              // Announced by TalkBack alongside the field, so the error is not
              // visual-only.
              accessibilityHint={error ?? hint}
            />

            {error ? (
              <View style={styles.message}>
                <Ionicons name="alert-circle" size={14} color={theme.danger} />
                <ThemedText type="small" themeColor="danger" style={styles.messageText}>
                  {error}
                </ThemedText>
              </View>
            ) : hint ? (
              <ThemedText type="small" themeColor="textSecondary">
                {hint}
              </ThemedText>
            ) : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.one },
  input: {
    borderRadius: Radius.control,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    // Matches `AppButton` so a field and the button under it line up as one
    // column of controls rather than two sizes of box.
    minHeight: 48,
  },
  message: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  // Without this the message clips to one line instead of wrapping next to the
  // icon, and server-side validation messages are long.
  messageText: { flex: 1 },
});
