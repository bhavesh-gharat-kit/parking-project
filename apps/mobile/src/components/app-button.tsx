/**
 * The app's button.
 *
 * Three variants and a `loading` state, because every auth action here is a
 * network call on a connection that may be slow: a button that gives no feedback
 * gets tapped again, and a second sign-up attempt is a confusing 409 rather than
 * a no-op. `loading` both shows a spinner and disables the press.
 */
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type AppButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  /** Rendered before the label — the Google mark on the Google button. */
  icon?: React.ReactNode;
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
}: AppButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const background =
    variant === 'primary'
      ? theme.primary
      : variant === 'secondary'
        ? theme.backgroundElement
        : 'transparent';

  const foreground = variant === 'primary' ? theme.onPrimary : theme.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: variant === 'secondary' ? theme.border : 'transparent',
          // Dimming rather than a separate disabled colour keeps one token per
          // variant and reads correctly in both themes.
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator size="small" color={foreground} /> : icon}
        <ThemedText type="smallBold" style={{ color: foreground }}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
});
