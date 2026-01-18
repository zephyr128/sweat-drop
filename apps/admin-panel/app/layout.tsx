import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import dynamicImport from 'next/dynamic';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

// CRITICAL: Dynamically import ToasterProvider with ssr: false to prevent build errors
// This ensures it's never evaluated during static generation of error pages
const ToasterProvider = dynamicImport(
  () => import('@/components/ToasterProvider').then((mod) => ({ default: mod.ToasterProvider })),
  { ssr: false }
);

export const metadata: Metadata = {
  title: 'SweatDrop Admin',
  description: 'Admin panel for SweatDrop gym management',
};

// CRITICAL: Force dynamic rendering to prevent static generation errors with Supabase
// This ensures the layout is never statically prerendered, avoiding context/auth issues
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#000000] text-white`}>
        {children}
        <ToasterProvider />
      </body>
    </html>
  );
}
