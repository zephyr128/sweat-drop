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

// CRITICAL: Force dynamic rendering to prevent static generation of error pages
// Without this, Next.js attempts to statically generate /_error: /404 and /_error: /500
// which causes build failures when cookies() are accessed during build
export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const revalidate = 0;

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
