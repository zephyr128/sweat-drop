// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">403</h1>
        <p className="text-[#808080] mb-6">
          You don&apos;t have permission to access this page. This page is restricted to certain roles.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 bg-[#00E5FF] text-black font-medium rounded-lg hover:bg-[#00B8CC] transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
