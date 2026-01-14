import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold text-[#FF5252] mb-4">403</h1>
        <h2 className="text-2xl font-bold text-white mb-4">Forbidden</h2>
        <p className="text-[#808080] mb-6">
          You don't have permission to access this page. This page is restricted to certain roles.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
