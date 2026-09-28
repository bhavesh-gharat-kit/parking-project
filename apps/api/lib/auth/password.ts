/**
 * Password hashing.
 *
 * `bcryptjs`, not the native `bcrypt`: the launch target is a shared Ubuntu VPS
 * running the API under PM2 (Phase 11), and a native addon there means node-gyp,
 * a toolchain, and a rebuild every Node upgrade. A pure-JS bcrypt is a few times
 * slower per hash, which for a parking app's sign-in volume is invisible and
 * costs one dependency instead of a build step that can fail on deploy day.
 */
import bcrypt from 'bcryptjs';

/**
 * ~250ms per hash on a modest VPS with bcryptjs. High enough to make an offline
 * attack on a leaked hash expensive, low enough that a sign-in at the parking
 * gate does not feel stuck.
 */
const BCRYPT_COST = 12;

/**
 * A real bcrypt hash of a value nothing can supply, used to burn the same amount
 * of CPU when there is nothing to compare against — so "no such user" and
 * "wrong password" take the same time and the response cannot be used to probe
 * which emails are registered. Generated once at module load.
 */
const TIMING_DECOY_HASH = bcrypt.hashSync('timing-decoy-never-a-real-password', 10);

/** bcrypt silently ignores bytes past 72; the shared `PasswordSchema` caps input there. */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

/**
 * Constant-ish time password check.
 *
 * `hash` is nullable because a Google-only account has no password (the
 * `passwordHash` column is NULL by design — see `schema.prisma`). Such an account
 * must not short-circuit: it still pays for a comparison, then fails.
 */
export async function verifyPassword(
  plaintext: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plaintext, TIMING_DECOY_HASH);
    return false;
  }
  return bcrypt.compare(plaintext, hash);
}
