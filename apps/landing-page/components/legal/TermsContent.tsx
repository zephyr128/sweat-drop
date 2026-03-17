import { TermsContentEn } from './TermsContentEn';
import { TermsContentSr } from './TermsContentSr';

type Lang = 'en' | 'sr';

export function TermsContent({ lang }: { lang: Lang }) {
  return lang === 'sr' ? <TermsContentSr /> : <TermsContentEn />;
}
