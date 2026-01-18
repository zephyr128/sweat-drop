import Link from 'next/link';

// Prevent static generation - 404 pages must be dynamic
export const dynamic = 'force-dynamic';
export const dynamicParams = true;

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">404</h1>
        <p className="text-[#808080] mb-6">This page could not be found.</p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-[#00E5FF] text-black font-medium rounded-lg hover:bg-[#00B8CC] transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
