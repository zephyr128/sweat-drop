import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ToasterProvider } from '@/components/ToasterProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SweatDrop Admin',
  description: 'Admin panel for SweatDrop gym management',
};

// Force dynamic rendering to prevent static generation issues with error pages
// This ensures error pages (404, 500) are not statically generated during build
export const dynamic = 'force-dynamic';
export const dynamicParams = true;

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
