/**
 * The password-reset code email (Phase 15).
 *
 * ── A code, not a link ─────────────────────────────────────────────────────
 *
 * The stub this phase replaces (`apps/mobile/src/app/forgot-password.tsx`) was
 * blunt about why it was a stub: "a reset link is an account takeover path". A
 * link is a bearer credential that travels through mail clients, link scanners
 * and chat previews, any of which can fetch it and spend it; it also needs a deep
 * link back into the APK to be useful on a phone at all. A code the customer
 * types into a screen they already have open skips both problems — it is useless
 * to anything that merely *reads* the mail.
 *
 * ── The copy is doing security work ────────────────────────────────────────
 *
 * Three lines are not decoration:
 *   - "If you did not request this, ignore this email" is what makes an
 *     unrequested code harmless rather than alarming. `request-otp` answers the
 *     same way for any address (so an attacker can aim one of these at a real
 *     customer), and the account is untouched until the code is used.
 *   - "Do not share this code" is the one defence against the phone call that
 *     asks for it. There is no other.
 *   - Saying who sent it, by business name, is how the customer tells this from
 *     the generic phishing version of itself.
 *
 * No customer name, no booking details, no vehicle number: everything in here is
 * either public (the business name) or already known to whoever opened the
 * mailbox, so a forwarded copy leaks nothing extra.
 */
import { OTP_TTL_MINUTES } from '@/lib/auth/otp';
import type { EmailMessage } from '@/lib/notifications/email';

/**
 * Minimal escaping for the one interpolated value that is not ours.
 *
 * `businessName` comes from the `AppSetting` table, which an admin edits through
 * a form (§24) — so it is attacker-adjacent in exactly the way a hardcoded string
 * is not, and it lands inside an HTML document here. The code itself is six
 * digits from `generateOtp` and needs nothing.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPasswordResetEmail(input: {
  to: string;
  code: string;
  businessName: string;
}): EmailMessage {
  const brand = escapeHtml(input.businessName);

  // Inline styles and a table-free single column, because an email client is not
  // a browser: Gmail strips <style> blocks on some clients, Outlook ignores much
  // of flexbox, and this mail has one job on a phone screen — show six digits
  // large enough to read and type without zooming.
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${brand} password reset</title>
  </head>
  <body style="margin:0;padding:24px 12px;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2933;">
    <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border-radius:12px;padding:28px 24px;">
      <p style="margin:0 0 4px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">${brand}</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#1f2933;">Reset your password</h1>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#4b5563;">
        Enter this code in the app to choose a new password.
      </p>

      <div style="margin:0 0 20px;padding:18px 12px;background-color:#f4f5f7;border-radius:10px;text-align:center;">
        <span style="font-size:32px;font-weight:700;letter-spacing:0.18em;color:#1f2933;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;">${input.code}</span>
      </div>

      <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#4b5563;">
        The code expires in ${OTP_TTL_MINUTES} minutes and can be used once.
      </p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#4b5563;">
        <strong>Do not share this code with anyone</strong> — not even with someone
        who says they work for ${brand}. We will never ask you for it.
      </p>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;" />

      <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">
        If you did not ask to reset your password, you can ignore this email —
        your password has not changed and nothing else is needed.
      </p>
    </div>
  </body>
</html>`;

  // The same information, in the order it is useful when a client shows text
  // only. Not a stripped-down version: the warnings matter more here, because
  // text-only is also what most screen readers and smartwatch previews get.
  const text = [
    `${input.businessName} — reset your password`,
    '',
    `Your code is: ${input.code}`,
    '',
    `Enter it in the app to choose a new password. The code expires in ${OTP_TTL_MINUTES} minutes and can be used once.`,
    '',
    `Do not share this code with anyone, including anyone claiming to be from ${input.businessName}. We will never ask you for it.`,
    '',
    'If you did not ask to reset your password, ignore this email — your password has not changed.',
  ].join('\n');

  return {
    to: input.to,
    // The code is deliberately NOT in the subject line. A subject shows on a
    // locked phone's notification, which is the one place the code is readable
    // by someone holding the phone but unable to open the mailbox.
    subject: `Reset your ${input.businessName} password`,
    html,
    text,
  };
}
