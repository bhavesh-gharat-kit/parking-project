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
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Tone = 'good' | 'bad' | 'neutral';

const STATUS_TONE: Record<BookingStatus, Tone> = {
  PENDING: 'neutral',
  PENDING_PAYMENT: 'neutral',
  PAYMENT_VERIFICATION: 'neutral',
  PENDING_APPROVAL: 'neutral',
  CONFIRMED: 'good',
  COMPLETED: 'good',
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
  const theme = useTheme();
  const tone = STATUS_TONE[status];

  // Tinted background derived from the existing theme tokens (8-digit hex
  // alpha) rather than new color tokens, so this reads correctly in both
  // themes without expanding `constants/theme.ts`.
  const foreground = tone === 'good' ? theme.primary : tone === 'bad' ? theme.danger : theme.textSecondary;
  const background = tone === 'neutral' ? theme.backgroundSelected : `${foreground}26`;
  const iconSize = size === 'large' ? 15 : 13;

  return (
    <View style={[styles.badge, size === 'large' && styles.badgeLarge, { backgroundColor: background }]}>
      <Ionicons name={STATUS_ICON[status]} size={iconSize} color={foreground} />
      <ThemedText type={size === 'large' ? 'smallBold' : 'small'} style={{ color: foreground }}>
        {BOOKING_STATUS_LABELS[status]}
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
    borderRadius: 999,
  },
  badgeLarge: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
