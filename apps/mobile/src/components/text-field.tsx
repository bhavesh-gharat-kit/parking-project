/**
 * A labelled text input bound to React Hook Form.
 *
 * Exists because the alternative is the `<Controller>` + label + error-text
 * triple repeated per field, and the sign-in, sign-up and Phase 03 profile forms
 * have a dozen fields between them. Keeping it in one place also means the error
 * styling and the `accessibilityLabel` are consistent by construction rather than
 * by discipline.
 */
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
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
  ...inputProps
}: TextFieldProps<T>) {
  const theme = useTheme();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const error = fieldState.error?.message;

        return (
          <View style={styles.field}>
            <ThemedText type="smallBold">{label}</ThemedText>

            <TextInput
              {...inputProps}
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                  // A red outline rather than only red helper text: colour alone
                  // is not a reliable signal, and the outline points at which
                  // field to fix without reading.
                  borderColor: error ? theme.danger : theme.border,
                },
              ]}
              placeholderTextColor={theme.textSecondary}
              value={field.value == null ? '' : String(field.value)}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              accessibilityLabel={label}
              // Announced by TalkBack alongside the field, so the error is not
              // visual-only.
              accessibilityHint={error ?? hint}
            />

            {error ? (
              <ThemedText type="small" themeColor="danger">
                {error}
              </ThemedText>
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
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
});
