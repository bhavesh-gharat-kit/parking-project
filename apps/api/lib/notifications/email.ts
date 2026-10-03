/**
 * Transactional email, via Brevo's HTTP API (Phase 15).
 *
 * ── Why Brevo, and why the HTTP API rather than SMTP ───────────────────────
 *
 * Brevo because a sibling project of this user's (`reliableverify`) already
 * sends production mail through it, so there is one provider account and one set
 * of deliverability problems across both rather than two. The HTTP API rather
 * than SMTP because the launch target is a shared Ubuntu VPS behind Nginx
 * (Phase 11): outbound port 587 is the first thing a hosting provider blocks,
 * and an SMTP send that hangs on a blocked port looks exactly like a slow one.
 * An HTTPS POST either answers or fails.
 *
 * ── Configured at send time, not at boot ───────────────────────────────────
 *
 * `BREVO_API_KEY` / `EMAIL_FROM` are optional in `lib/env.ts`, matching
 * `GOOGLE_WEB_CLIENT_ID`'s precedent there: a VPS where email was never set up
 * must still take bookings at the gate, because forgot-password is the only flow
 * that needs this. So the check lives here, throws a message that names the
 * missing variable, and happens only when something actually tries to send.
 *
 * ── This module does not decide whether to send ────────────────────────────
 *
 * It sends what it is given. Whether an address should receive a reset code at
 * all — and the fact that the answer must never be visible in an HTTP response —
 * is `lib/auth/password-reset.ts`'s problem, which is also the only caller.
 */
import { env } from '@/lib/env';

/** What `sendEmail` needs. `text` is not optional — see the note on it below. */
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  /**
   * The plain-text alternative, required rather than optional on purpose. A
   * transactional HTML email with no text part scores worse with every spam
   * filter there is, and this particular mail has about ten minutes to arrive
   * before the code in it is worthless — the one email in this app that cannot
   * afford a spam folder.
   */
  text: string;
};

/**
 * Email was never configured on this server.
 *
 * Its own type so a caller can tell "the business has not set up email" apart
 * from "Brevo rejected the send" and log them differently — the first is a
 * deployment step someone forgot, the second is an outage or a bad sender.
 */
export class EmailNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(
      `Email is not configured on this server: ${missing.join(', ')} ` +
        `${missing.length === 1 ? 'is' : 'are'} missing. ` +
        'Set them in apps/api/.env (see .env.example) — EMAIL_FROM must be an ' +
        'address verified under Brevo → Senders.',
    );
    this.name = 'EmailNotConfiguredError';
  }
}

function resolveSender(): { apiKey: string; email: string; name: string } {
  const apiKey = env.BREVO_API_KEY?.trim();
  const email = env.EMAIL_FROM?.trim();

  const missing: string[] = [];
  if (!apiKey) missing.push('BREVO_API_KEY');
  if (!email) missing.push('EMAIL_FROM');
  if (missing.length > 0) throw new EmailNotConfiguredError(missing);

  return {
    apiKey: apiKey!,
    email: email!,
    // `EMAIL_FROM_NAME` is the one of the three that is genuinely optional:
    // without it the mail still sends, it just shows the raw address in the
    // recipient's inbox list. Brevo caps a display name at 70 characters.
    name: (env.EMAIL_FROM_NAME?.trim() || 'Pay & Park').slice(0, 70),
  };
}

/**
 * Sends one email and resolves when Brevo has accepted it.
 *
 * Accepted, not delivered — Brevo queues from here, so a successful return means
 * the provider took the message, not that it reached an inbox. There is no
 * retry, no queue and no bounce handling in this phase: the customer's own
 * "Resend code" button is the retry, which is the right one anyway, because the
 * usual reason a code does not arrive is a typo'd address that no amount of
 * retrying will fix.
 *
 * The SDK is imported dynamically so its module graph is not pulled into the
 * cold start of every other route handler in the app — only a reset request
 * pays for it.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const sender = resolveSender();

  const { BrevoClient } = await import('@getbrevo/brevo');
  const brevo = new BrevoClient({ apiKey: sender.apiKey });

  await brevo.transactionalEmails.sendTransacEmail({
    sender: { email: sender.email, name: sender.name },
    to: [{ email: message.to }],
    subject: message.subject,
    htmlContent: message.html,
    textContent: message.text,
  });
}
