// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import LoginForm from './LoginForm';

type SearchParams = { [key: string]: string | string[] | undefined };

function getParam(params: SearchParams | null | undefined, key: string): string | null {
  if (!params || !(key in params)) return null;
  const v = params[key];
  return typeof v === 'string' ? v : Array.isArray(v) && v[0] ? String(v[0]) : null;
}

export default function LoginPage({ searchParams }: { searchParams?: SearchParams }) {
  const redirectUrl = getParam(searchParams, 'redirect');
  const emailParam = getParam(searchParams, 'email') || '';
  const errorParam = getParam(searchParams, 'error');

  return (
    <LoginForm
      redirectUrl={redirectUrl}
      emailParam={emailParam}
      errorParam={errorParam}
    />
  );
}
