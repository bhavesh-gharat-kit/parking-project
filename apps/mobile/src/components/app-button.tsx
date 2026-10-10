/**
 * The app's button.
 *
 * Three variants and a `loading` state, because every auth action here is a
 * network call on a connection that may be slow: a button that gives no feedback
 * gets tapped again, and a second sign-up attempt is a confusing 409 rather than
 * a no-op. `loading` both shows a spinner and disables the press.
 *
 * ── The three variants are three different weights, not three fills ─────────
 * Primary is filled and lifted off the page (`ButtonShadow`); secondary is a
 * tinted surface with a real outline; ghost has no surface at all and reads as
 * a link that happens to be button-sized. Pressed and disabled are drawn rather
 * than dimmed: the old `opacity: 0.5` made a disabled button look like a
 * rendering glitch, and a 15% dim is not a press you can feel.
 */
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ButtonShadow, Radius, Spacing } from '@/constants/theme';
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
  /**
   * Loading is not drawn as disabled even though it is unpressable: a primary
   * button that goes grey the instant you tap it reads as "that did not work",
   * which is the opposite of what a spinner is there to say. It keeps its fill
   * and its label colour, and only the spinner changes.
   */
  const inert = isDisabled && !loading;

  /**
   * Disabled is one appearance for all three variants on purpose: "this is not
   * pressable right now" is the same statement whichever button it is, and a
   * dimmed-but-still-blue primary reads as a loading bug.
   *
   * Ghost keeps `text` rather than taking `primary`: the app's ghost buttons are
   * "Remove", "Cancel", "Edit" and a back link, none of which wants to be the
   * brand-coloured thing on its screen. Its lighter weight comes from having no
   * surface, not from its colour.
   */
  const foreground = inert
    ? theme.textSecondary
    : variant === 'primary'
      ? theme.onPrimary
      : theme.text;

  const surface = (pressed: boolean) => {
    if (inert) return variant === 'ghost' ? 'transparent' : theme.backgroundElement;
    if (variant === 'primary') return theme.primary;
    if (variant === 'ghost') return pressed ? theme.backgroundElement : 'transparent';

    return pressed ? theme.backgroundSelected : theme.backgroundElement;
  };

  const outline = (pressed: boolean) => {
    if (variant === 'primary' || variant === 'ghost') return 'transparent';
    if (inert) return theme.border;

    // Darkening the outline on press gives the secondary button a visible
    // state change even where its two surface tints are hard to tell apart.
    return pressed ? theme.textSecondary : theme.borderStrong;
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        // Only the primary is lifted, and it drops back down while held or
        // disabled — the shadow is carrying the state, not decorating.
        variant === 'primary' && !pressed && !inert && ButtonShadow,
        {
          backgroundColor: surface(pressed),
          borderColor: outline(pressed),
          // The press itself: a filled button has no second fill to swap to, so
          // it darkens; the outlined ones already changed surface above.
          opacity: pressed && variant === 'primary' ? 0.88 : 1,
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
    borderRadius: Radius.control,
    // A real 1px rather than `hairlineWidth`: at 0.5px on a 3x screen the
    // secondary button's outline rounds away to nothing on some devices.
    borderWidth: 1,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    // Android's 48dp minimum touch target, which padding alone misses when the
    // label wraps short.
    minHeight: 48,
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
});
