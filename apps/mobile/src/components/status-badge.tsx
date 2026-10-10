/**
 * Pill-shaped booking status indicator (Phase 13) — replaces the plain
 * colored `ThemedText` status labels that were scattered across booking
 * screens (`01-ui-ux-findings.md`, "P2 — No visual language for professional
 * beyond icons"). One component so the color/icon/label mapping for a
 * `BookingStatus` lives in exactly one place.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { BOOKING_STATUS_LABELS, type BookingStatus } from '@parking/shared';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Three tones, now that `constants/theme.ts` has the colours to say them with.
 *
 * The split that matters is the one this could not previously make: the four
 * waiting states were `neutral` grey, indistinguishable from an inert label, so
 * a booking that needed the customer to go and pay looked like one that needed
 * nothing. They are `waiting` amber now — something is owed, by someone. `done`
 * moved off `primary` onto the real `success` green, which frees brand blue to
 * mean "the thing to press" rather than "finished".
 */
export type Tone = 'done' | 'waiting' | 'bad';

const STATUS_TONE: Record<BookingStatus, Tone> = {
  PENDING: 'waiting',
  PENDING_PAYMENT: 'waiting',
  PAYMENT_VERIFICATION: 'waiting',
  PENDING_APPROVAL: 'waiting',
  CONFIRMED: 'done',
  COMPLETED: 'done',
  REJECTED: 'bad',
  CANCELLED: 'bad',
  EXPIRED: 'bad',
};

const STATUS_ICON: Record<BookingStatus, keyof typeof Ionicons.glyphMap> = {
  PENDING: 'time-outline',
  PENDING_PAYMENT: 'card-outline',
  PAYMENT_VERIFICATION: 'search-outline',
  PENDING_APPROVAL: 'hourglass-outline',
  CONFIRMED: 'checkmark-circle',
  COMPLETED: 'checkmark-done-circle',
  REJECTED: 'close-circle',
  CANCELLED: 'ban-outline',
  EXPIRED: 'alert-circle-outline',
};

type StatusBadgeProps = {
  status: BookingStatus;
  /** `large` is for header-style summaries; `default` fits a list row. */
  size?: 'default' | 'large';
};

export function StatusBadge({ status, size = 'default' }: StatusBadgeProps) {
  return <TonePill label={BOOKING_STATUS_LABELS[status]} tone={STATUS_TONE[status]} icon={STATUS_ICON[status]} size={size} />;
}

type TonePillProps = {
  label: string;
  tone: Tone;
  icon: keyof typeof Ionicons.glyphMap;
  /** `large` is for header-style summaries; `default` fits a list row. */
  size?: 'default' | 'large';
};

/**
 * The pill `StatusBadge` draws, generalised for the other enabled/disabled
 * style statuses in the app (`isActive` on a location, a rate, a user) that
 * are not a `BookingStatus` but deserve the same "pill, not coloured text"
 * treatment (`01-ui-ux-findings.md`'s "no visual language for professional").
 */
export function TonePill({ label, tone, icon, size = 'default' }: TonePillProps) {
  const theme = useTheme();

  // The fill is the foreground at 15% (the `26` alpha suffix) rather than a
  // second token per tone: one colour per status is one thing to keep legible
  // in both themes, and the tint follows it for free.
  const foreground =
    tone === 'done' ? theme.success : tone === 'waiting' ? theme.warning : theme.danger;
  const background = `${foreground}26`;
  const iconSize = size === 'large' ? 15 : 13;

  return (
    <View style={[styles.badge, size === 'large' && styles.badgeLarge, { backgroundColor: background }]}>
      <Ionicons name={icon} size={iconSize} color={foreground} />
      <ThemedText type={size === 'large' ? 'smallBold' : 'small'} style={{ color: foreground }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  badgeLarge: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
