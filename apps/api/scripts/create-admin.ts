/**
 * Creates or promotes an ADMIN account — the ONLY way an admin comes into
 * existence (context.txt §4, §110-112).
 *
 *   npm run admin:create -w api -- --email you@example.com --name "Your Name"
 *   npm run admin:create -w api -- --email you@example.com --password 'correct horse battery'
 *
 * Existing account → promoted to ADMIN (and re-enabled if it was disabled).
 * New account      → created as ADMIN. With no `--password`, a strong one is
 *                    generated and printed once.
 *
 * ── Why a script and not a seed, a flag, or a screen ────────────────────────
 *
 * Not in `prisma/seed.ts`: a seed runs on every deploy, so a default admin in it
 * would mean a known email and password on the production VPS forever, and
 * re-seeding could silently reinstate an account the business had disabled.
 *
 * Not an in-app path: there is deliberately no endpoint, screen or request field
 * anywhere in this codebase that can raise a role. Anyone who can run this script
 * already has shell access to the VPS and the database credentials, so it grants
 * nothing they could not do with `UPDATE User SET role = 'ADMIN'` — it just does
 * it without hand-written SQL, and hashes the password properly on the way in.
 *
 * Bootstrapping the first admin on the VPS is therefore one command at deploy time
 * (Phase 11), run from `apps/api`.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { EmailSchema } from '@parking/shared';

import { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../lib/auth/password';

type Args = {
  email: string;
  name?: string;
  phone?: string;
  password?: string;
};

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg?.startsWith('--')) continue;

    // Supports both `--email x` and `--email=x`.
    const [key, inlineValue] = arg.slice(2).split('=', 2);
    if (!key) continue;
    const value = inlineValue ?? argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Flag --${key} needs a value.`);
    }
    if (inlineValue === undefined) i += 1;
    flags.set(key, value);
  }

  const email = flags.get('email');
  if (!email) {
    throw new Error(
      'Usage: npm run admin:create -w api -- --email you@example.com [--name "Your Name"] [--phone 9876543210] [--password "..."]',
    );
  }

  const parsedEmail = EmailSchema.safeParse(email);
  if (!parsedEmail.success) {
    throw new Error(`Not a valid email address: ${email}`);
  }

  return {
    email: parsedEmail.data,
    name: flags.get('name'),
    phone: flags.get('phone'),
    password: flags.get('password'),
  };
}

/** 24 URL-safe characters — long enough that nobody is tempted to guess it. */
function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });

  try {
    const existing = await prisma.user.findUnique({ where: { email: args.email } });

    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: 'ADMIN',
          isActive: true,
          ...(args.name ? { name: args.name } : {}),
          ...(args.phone ? { phone: args.phone } : {}),
          // A password is only touched when one was passed, so promoting an
          // existing customer does not lock them out of the password they know.
          ...(args.password ? { passwordHash: await hashPassword(args.password) } : {}),
        },
      });

      console.log(`Promoted ${updated.email} to ADMIN (id ${updated.id}).`);
      if (args.password) console.log('Password was reset to the value you supplied.');
      else if (!updated.passwordHash) {
        console.log(
          'Note: this account has no password and signs in with Google only. Re-run with --password to add one.',
        );
      }
      return;
    }

    const password = args.password ?? generatePassword();
    const created = await prisma.user.create({
      data: {
        email: args.email,
        name: args.name ?? 'Administrator',
        phone: args.phone ?? null,
        role: 'ADMIN',
        passwordHash: await hashPassword(password),
        // Nothing verifies an admin's mailbox; whoever ran this command is the
        // verification.
        emailVerifiedAt: new Date(),
      },
    });

    console.log(`Created ADMIN ${created.email} (id ${created.id}).`);
    if (!args.password) {
      console.log('');
      console.log('  Generated password (shown once — store it in a password manager):');
      console.log(`  ${password}`);
      console.log('');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
