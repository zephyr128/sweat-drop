import { Linking } from 'react-native';

function trimEnv(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Public Terms of Service URL (set EXPO_PUBLIC_TERMS_URL per environment). */
export function getTermsUrl(): string {
  return trimEnv(process.env.EXPO_PUBLIC_TERMS_URL);
}

/** Public Privacy Policy URL (set EXPO_PUBLIC_PRIVACY_URL per environment). */
export function getPrivacyUrl(): string {
  return trimEnv(process.env.EXPO_PUBLIC_PRIVACY_URL);
}

export function hasConfiguredLegalUrls(): boolean {
  return Boolean(getTermsUrl() || getPrivacyUrl());
}

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Opens a legal URL in the system browser. No-ops with an alert if missing or invalid.
 */
export async function openLegalUrl(
  url: string,
  options?: { onInvalid?: () => void },
): Promise<void> {
  const trimmed = trimEnv(url);
  if (!trimmed || !isHttpUrl(trimmed)) {
    options?.onInvalid?.();
    return;
  }
  const can = await Linking.canOpenURL(trimmed);
  if (!can) {
    options?.onInvalid?.();
    return;
  }
  await Linking.openURL(trimmed);
}
