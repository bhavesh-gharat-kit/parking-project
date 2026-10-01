/**
 * Customer profile screen (context.txt §5, Phase 03; password change Phase 14).
 *
 * The body — name, read-only email, phone, and the change-password form — lives in
 * `ProfileEditor`, which `admin/profile.tsx` renders identically: both roles edit
 * their own row through the same `requireUser`-guarded endpoint, so there was
 * nothing role-specific left to put here once the admin screen existed. What is
 * specific to the customer side is the link onward to their vehicles.
 */
import { router } from 'expo-router';

import { AppButton } from '@/components/app-button';
import { ProfileEditor } from '@/components/profile-editor';

export default function ProfileScreen() {
  return (
    <ProfileEditor>
      <AppButton
        label="My vehicles"
        variant="secondary"
        onPress={() => router.push('/customer/vehicles')}
      />
    </ProfileEditor>
  );
}
