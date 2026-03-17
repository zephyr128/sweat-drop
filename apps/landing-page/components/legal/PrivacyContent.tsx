import { PrivacyContentEn } from './PrivacyContentEn';
import { PrivacyContentSr } from './PrivacyContentSr';

type Lang = 'en' | 'sr';

export function PrivacyContent({ lang }: { lang: Lang }) {
  return lang === 'sr' ? <PrivacyContentSr /> : <PrivacyContentEn />;
}
