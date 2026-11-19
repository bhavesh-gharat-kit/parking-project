import { redirect } from 'next/navigation';

/**
 * The pass application flow was reworked into the simplified 3-step flow at
 * `/web/pass` (details → plan → payment). This old entry now forwards there, so
 * any existing link to "Apply for a pass" lands on the new flow.
 */
export default function NewPassRedirect() {
  redirect('/web/pass');
}
