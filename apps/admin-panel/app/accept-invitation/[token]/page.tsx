// 1. Prisili dinamičko renderovanje (ovo zaobilazi dedupe-fetch tokom build-a)
export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const revalidate = 0;

import InvitationHandler from './InvitationHandler';

// 2. Napravi najjednostavniji mogući Server Component koji samo prosleđuje token
export default function AcceptInvitationPage({ params }: { params: { token: string } }) {
  // Ako params ne postoji ili je prazan tokom build-a
  if (!params?.token) {
    return null;
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <InvitationHandler token={params.token} />
    </div>
  );
}
