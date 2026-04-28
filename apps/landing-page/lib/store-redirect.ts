export type Channel = 'beta' | 'production';
export type Platform = 'ios' | 'android' | 'other';

const IOS_UA_PATTERN = /iPhone|iPad|iPod/i;
const ANDROID_UA_PATTERN = /Android/i;

export function detectPlatform(userAgent: string | null): Platform {
  if (!userAgent) return 'other';
  if (IOS_UA_PATTERN.test(userAgent)) return 'ios';
  if (ANDROID_UA_PATTERN.test(userAgent)) return 'android';
  return 'other';
}

export function getChannel(): Channel {
  return process.env.STORE_REDIRECT_CHANNEL === 'production' ? 'production' : 'beta';
}

// Production store URLs — set NEXT_PUBLIC_APP_STORE_URL once the App Store listing is live.
const PRODUCTION_IOS_URL =
  (process.env.NEXT_PUBLIC_APP_STORE_URL ?? '').trim() ||
  'https://apps.apple.com/app/sweatdrop/id0000000000'; // TODO: set NEXT_PUBLIC_APP_STORE_URL
const PRODUCTION_ANDROID_URL =
  'https://play.google.com/store/apps/details?id=com.sweatdrop.app';

export function getStoreUrl(platform: Platform, channel: Channel): string {
  if (platform === 'ios') {
    if (channel === 'beta') {
      const url = (process.env.NEXT_PUBLIC_TESTFLIGHT_INVITE_URL ?? '').trim();
      if (url) return url;
    }
    return PRODUCTION_IOS_URL;
  }

  if (platform === 'android') {
    if (channel === 'beta') {
      const url = (process.env.NEXT_PUBLIC_PLAY_INTERNAL_TESTING_URL ?? '').trim();
      if (url) return url;
    }
    return PRODUCTION_ANDROID_URL;
  }

  // 'other' (desktop/unknown) — not used for redirect, caller shows both buttons
  return PRODUCTION_IOS_URL;
}

export function getIosUrl(channel: Channel): string {
  return getStoreUrl('ios', channel);
}

export function getAndroidUrl(channel: Channel): string {
  return getStoreUrl('android', channel);
}
