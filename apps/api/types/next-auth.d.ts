/**
 * Module augmentation for the two fields this app adds to an Auth.js session.
 *
 * Without this, `session.user.role` and `token.role` are `any`-adjacent holes in
 * an otherwise strict codebase, and the `role` claim — the one value the whole
 * authorisation model turns on — would be the least type-checked thing in it.
 */
import type { UserRole } from '@parking/shared';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  /** What the Credentials `authorize` callbacks return. */
  interface User {
    role?: UserRole;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    /** Same value as `sub`; see `lib/auth/session.ts`. */
    userId?: string;
    role?: UserRole;
  }
}
