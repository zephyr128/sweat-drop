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
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ s?: string }>;
}

export default async function MachineQrPage({ params, searchParams }: Props) {
  const [{ uuid }, { s }] = await Promise.all([params, searchParams]);

  const headersList = await headers();
  const ua = headersList.get('user-agent');
  const platform = detectPlatform(ua);
  const channel = getChannel();
  const storeUrl = getStoreUrl(platform, channel);

  // Preserve uuid and optional sensor hint as a URL fragment so users can
  // bookmark / share the link before they install the app. After install,
  // re-scanning goes through Universal Links directly.
  const fragment = s ? `m/${uuid}?s=${encodeURIComponent(s)}` : `m/${uuid}`;
  const storeUrlWithHint =
    platform === 'other'
      ? storeUrl // desktop: no redirect, fragment not needed
      : storeUrl.includes('#')
        ? storeUrl
        : `${storeUrl}#${fragment}`;
  const appUrl = s
    ? `sweatdrop://machine/${encodeURIComponent(uuid)}?s=${encodeURIComponent(s)}`
    : `sweatdrop://machine/${encodeURIComponent(uuid)}`;

  return (
    <QrRedirectPage
      platform={platform}
      storeUrl={storeUrlWithHint}
      appUrl={appUrl}
      channel={channel}
    />
  );
}
