/**
 * Admin profile screen (Phase 14).
 *
 * The gap this closes: the admin side had no profile screen at all
 * (`_/docs/01-ui-ux-findings.md`, "P1 — Admin has no profile section at all") —
 * the dashboard showed the admin's name and email as a read-only card and that was
 * the whole of it, while customers have had an editable profile since Phase 03.
 *
 * No backend work was needed for this half, and none is done here:
 * `GET`/`PATCH /api/profile` has always been `requireUser`-guarded and scoped to
 * `auth.actor.userId`, so it was already correct for an admin account — there was
 * simply no screen that could reach it (`_/docs/02-logical-findings.md`, "P1 —
 * Admin profile is a backend non-issue").
 *
 * Nothing admin-specific belongs on this screen. An admin's `role` is not
 * editable from the app by anyone, including themselves (context.txt §110-112),
 * and there is no "reset another user's password" path here — that stays out of
 * band in `scripts/create-admin.ts`. So this is `ProfileEditor` with no footer,
 * where the customer screen adds a link to its vehicles.
 */
import { ProfileEditor } from '@/components/profile-editor';

export default function AdminProfileScreen() {
  return <ProfileEditor />;
}
