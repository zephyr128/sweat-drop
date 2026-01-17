import SignupForm from './SignupForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SearchParams = { [key: string]: string | string[] | undefined };

function getParam(params: SearchParams | null | undefined, key: string): string | null {
  if (!params || !(key in params)) return null;
  const v = params[key];
  return typeof v === 'string' ? v : Array.isArray(v) && v[0] ? String(v[0]) : null;
}

export default function SignupPage({ searchParams }: { searchParams?: SearchParams }) {
  const emailParam = getParam(searchParams, 'email') || '';
  const inviteToken = getParam(searchParams, 'invite');

  return <SignupForm emailParam={emailParam} inviteToken={inviteToken} />;
}
