import type { Platform, Channel } from '@/lib/store-redirect';
import { getIosUrl, getAndroidUrl } from '@/lib/store-redirect';

interface Props {
  platform: Platform;
  storeUrl: string;
  appUrl?: string;
  channel: Channel;
}

/**
 * Rendered server-side. On mobile the inline script runs before hydration.
 * Android tries the custom scheme first, then falls back to Play Store.
 * iOS keeps direct App Store behavior. Desktop shows both store buttons.
 */
export function QrRedirectPage({ platform, storeUrl, appUrl, channel }: Props) {
  const isMobile = platform === 'ios' || platform === 'android';
  const iosUrl = getIosUrl(channel);
  const androidUrl = getAndroidUrl(channel);

  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 40%, rgba(0,229,204,0.07) 0%, transparent 70%)',
        }}
      />

      {/* Immediate JS redirect for mobile */}
      {isMobile && (
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var platform=${JSON.stringify(platform)};var storeUrl=${JSON.stringify(storeUrl)};var appUrl=${JSON.stringify(appUrl ?? null)};if(platform==='android'&&appUrl){var fallbackTimer=window.setTimeout(function(){window.location.replace(storeUrl);},1200);var clearFallback=function(){window.clearTimeout(fallbackTimer);};var onVisibilityChange=function(){if(document.visibilityState==='hidden'){clearFallback();document.removeEventListener('visibilitychange',onVisibilityChange);}};window.addEventListener('pagehide',clearFallback,{once:true});window.addEventListener('blur',clearFallback,{once:true});document.addEventListener('visibilitychange',onVisibilityChange);window.location.href=appUrl;return;}window.location.replace(storeUrl);}catch(e){}})();`,
          }}
        />
      )}

      <div className="relative z-10 max-w-sm w-full flex flex-col items-center text-center gap-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <span
            className="text-5xl tracking-wider"
            style={{
              fontFamily: 'var(--font-display)',
              color: '#00E5CC',
            }}
          >
            SWEATDROP
          </span>
          <p className="text-sm text-text-2 tracking-widest uppercase font-mono">
            {isMobile ? 'Opening your app…' : 'Get the app'}
          </p>
        </div>

        {/* Card */}
        <div
          className="w-full rounded-2xl p-6 flex flex-col gap-5"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {isMobile ? (
            <>
              {/* Spinner */}
              <div className="flex justify-center">
                <div
                  className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: 'rgba(0,229,204,0.5)', borderTopColor: 'transparent' }}
                />
              </div>

              <div className="space-y-1">
                <p className="text-text font-medium">
                  {platform === 'ios'
                    ? 'Redirecting to the App Store…'
                    : 'Opening SweatDrop…'}
                </p>
                <p className="text-sm text-text-2">
                  If nothing happens in a few seconds, tap the button below.
                </p>
              </div>

              <a
                href={storeUrl}
                className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-90 active:scale-95"
                style={{ background: '#00E5CC', color: '#000000' }}
              >
                {platform === 'ios' ? (
                  <>
                    <AppleIcon />
                    Open in App Store
                  </>
                ) : (
                  <>
                    <PlayIcon />
                    Open in Google Play
                  </>
                )}
              </a>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-text font-medium">SweatDrop isn&apos;t available on desktop.</p>
                <p className="text-sm text-text-2">
                  Download the app on your phone to scan gym equipment and track your workouts.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <a
                  href={iosUrl}
                  className="inline-flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-90"
                  style={{ background: '#00E5CC', color: '#000000' }}
                >
                  <AppleIcon />
                  Download on the App Store
                </a>

                <a
                  href={androidUrl}
                  className="inline-flex items-center justify-center gap-2.5 w-full py-3 rounded-xl font-medium text-sm transition-opacity hover:opacity-90"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: '#F5F5F7',
                  }}
                >
                  <PlayIcon />
                  Get it on Google Play
                </a>
              </div>
            </>
          )}
        </div>

        <p className="text-xs text-text-3">
          &copy; {new Date().getFullYear()} SweatDrop. All rights reserved.
        </p>
      </div>
    </main>
  );
}

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M11.182 0c.163 1.023-.282 2.05-.94 2.773-.66.726-1.714 1.277-2.72 1.2C7.36 2.903 7.871 1.88 8.534 1.17 9.2.457 10.29-.04 11.182 0zM14 11.36c-.47 1.31-.923 2.192-1.604 3.064-.583.748-1.31 1.576-2.26 1.576-.9 0-1.187-.576-2.24-.576-1.08 0-1.374.59-2.25.59-.93 0-1.7-.88-2.3-1.644C1.934 12.635 1 10.26 1 7.98 1 4.46 3.163 2.59 5.29 2.59c.956 0 1.762.627 2.375.627.587 0 1.5-.666 2.617-.666.437 0 1.657.074 2.51 1.205l.068.1-.063.047C12.158 4.45 11.5 5.38 11.5 6.598c0 1.415.81 2.33 1.538 2.809a11.7 11.7 0 0 0-.53 1.25l-.508.703z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M.5 2.027C.5.804 1.84.082 2.868.703l11.25 5.973a1.5 1.5 0 0 1 0 2.648L2.868 15.297C1.84 15.918.5 15.196.5 13.973V2.027z" />
    </svg>
  );
}
