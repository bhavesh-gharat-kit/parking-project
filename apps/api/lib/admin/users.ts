/**
 * The admin user-management projection (context.txt §22, Phase 07).
 *
 * Shared by `GET /api/admin/users` (list) and `GET /api/admin/users/:id`
 * (detail) so the two screens can never disagree about what a user row looks
 * like.
 */
import type { User } from '@/generated/prisma/client';
import type { AdminUser } from '@parking/shared';

/** Only whether a credential exists for each method — never the hash itself. */
export function toAdminUser(user: User): AdminUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    imageUrl: user.imageUrl,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    signInMethods: [
      ...(user.passwordHash ? (['PASSWORD'] as const) : []),
      ...(user.googleId ? (['GOOGLE'] as const) : []),
    ],
  };
}
