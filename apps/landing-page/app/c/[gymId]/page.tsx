import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { detectPlatform, getChannel, getStoreUrl } from '@/lib/store-redirect';
import { QrRedirectPage } from '@/components/qr/QrRedirectPage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Get SweatDrop',
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ gymId: string }>;
}

export default async function CheckinQrPage({ params }: Props) {
  const { gymId } = await params;

  const headersList = await headers();
  const ua = headersList.get('user-agent');
  const platform = detectPlatform(ua);
  const channel = getChannel();
  const storeUrl = getStoreUrl(platform, channel);

  // Preserve gymId as a URL fragment for post-install re-scan awareness.
  const storeUrlWithHint =
    platform === 'other'
      ? storeUrl
      : storeUrl.includes('#')
        ? storeUrl
        : `${storeUrl}#c/${gymId}`;

  return (
    <QrRedirectPage
      platform={platform}
      storeUrl={storeUrlWithHint}
      channel={channel}
    />
  );
}
