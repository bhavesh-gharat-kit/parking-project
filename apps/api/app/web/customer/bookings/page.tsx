import { redirect } from 'next/navigation';

/**
 * The website is pass-only: daily booking and vehicle management were removed
 * from the customer UI. The API routes (and the Android app) still use them, so
 * only this page is redirected, to keep old links and bookmarks from 404ing.
 */
export default function RemovedCustomerPage() {
  redirect('/web/customer');
}
