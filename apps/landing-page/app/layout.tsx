import type { Metadata } from 'next';
import React from 'react';
import { Space_Grotesk, Inter } from 'next/font/google';
import './globals.css';
import { LanguageProvider } from '@/lib/use-language';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://sweatdrop.com'),
  title: {
    default: 'SweatDrop - The Digital Layer for Modern Gyms',
    template: '%s | SweatDrop',
  },
  description: 'Transform your gym equipment into connected experiences. IoT sensors and mobile app that increase member retention and drive revenue.',
  keywords: [
    'gym management software',
    'fitness IoT sensors',
    'gym member retention',
    'fitness gamification',
    'gym technology',
    'smart gym equipment',
    'fitness rewards platform',
    'gym analytics',
  ],
  authors: [{ name: 'SweatDrop' }],
  creator: 'SweatDrop',
  publisher: 'SweatDrop',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['sr_RS'],
    url: 'https://sweatdrop.com',
    siteName: 'SweatDrop',
    title: 'SweatDrop - The Digital Layer for Modern Gyms',
    description: 'Transform your gym equipment into connected experiences. Increase retention. Drive revenue.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'SweatDrop Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SweatDrop - The Digital Layer for Modern Gyms',
    description: 'Transform your gym equipment into connected experiences. Increase retention. Drive revenue.',
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    languages: {
      'en': 'https://sweatdrop.com',
      'sr': 'https://sweatdrop.com',
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="bg-background text-white antialiased">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
