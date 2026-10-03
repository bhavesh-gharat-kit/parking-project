import Link from 'next/link';

import { ProfileEditor } from '../../_components/ProfileEditor';

export default function CustomerProfilePage() {
  return (
    <ProfileEditor>
      <Link href="/web/customer/vehicles" className="btn btn-secondary btn-block">
        My vehicles
      </Link>
    </ProfileEditor>
  );
}
