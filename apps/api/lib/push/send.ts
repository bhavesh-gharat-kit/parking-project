/**
 * Sends the three Phase 09 notifications (decisions.md D4): booking confirmed,
 * booking rejected, booking expired. Called from `app/api/admin/bookings/[id]/
 * approve`, `.../reject`, and the §15 expiry sweep.
 *
 * Everything in here is best-effort. A booking's approval/rejection/expiry is
 * already committed by `transitionBooking` before this runs, so nothing about
 * push delivery — a bad token, Expo being unreachable, a missing
 * `EXPO_ACCESS_TOKEN` — may ever throw back into that request. `sendBookingPush`
 * catches everything itself and only ever logs; callers do not need their own
 * try/catch and should not await it if the response should not wait on Expo's
 * API.
 */
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';

import { prisma } from '@/lib/db';
import { env } from '@/lib/env';

const expo = new Expo(env.EXPO_ACCESS_TOKEN ? { accessToken: env.EXPO_ACCESS_TOKEN } : undefined);

export type BookingPushPayload = {
  title: string;
  body: string;
  /** Carried in `data` so a tapped notification can deep-link (Phase 09 RN side). */
  bookingId: string;
};

/**
 * Sends `payload` to every active device registered for `userId`.
 *
 * Never throws. A user with no registered devices, an Expo outage, and an
 * individual dead token are all the ordinary course of business, not errors
 * worth surfacing to the admin action or the cron sweep that triggered this.
 */
export async function sendBookingPush(userId: string, payload: BookingPushPayload): Promise<void> {
  try {
    const tokens = await prisma.pushToken.findMany({
      where: { userId, isActive: true },
      select: { token: true },
    });

    const validTokens = tokens
      .map((row) => row.token)
      .filter((token): token is string => Expo.isExpoPushToken(token));

    if (validTokens.length === 0) return;

    const messages: ExpoPushMessage[] = validTokens.map((to) => ({
      to,
      title: payload.title,
      body: payload.body,
      data: { bookingId: payload.bookingId },
    }));

    const staleTokens: string[] = [];

    for (const chunk of expo.chunkPushNotifications(messages)) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        for (const ticket of tickets) {
          if (ticket.status !== 'error') continue;
          console.warn(`[push] delivery error: ${ticket.message}`);
          // §16-ish device hygiene, per the schema comment on `PushToken.isActive`:
          // Expo reports this for an uninstalled app, and re-sending to it forever
          // would just keep failing.
          if (ticket.details?.error === 'DeviceNotRegistered' && ticket.details.expoPushToken) {
            staleTokens.push(ticket.details.expoPushToken);
          }
        }
      } catch (error) {
        console.warn('[push] could not send a notification chunk:', error);
      }
    }

    if (staleTokens.length > 0) {
      await prisma.pushToken.updateMany({
        where: { token: { in: staleTokens } },
        data: { isActive: false },
      });
    }
  } catch (error) {
    console.warn(`[push] could not notify user ${userId}:`, error);
  }
}
