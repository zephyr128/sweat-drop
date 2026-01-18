'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#000000', color: '#FFFFFF', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ padding: '5rem 2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '4rem', margin: '0 0 1rem 0' }}>404</h1>
          <p style={{ fontSize: '1.25rem', margin: '0 0 2rem 0', color: '#808080' }}>Page Not Found</p>
          <p style={{ margin: '0 0 2rem 0', color: '#808080' }}>The requested page could not be found.</p>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#00E5FF',
              color: '#000000',
              fontWeight: '500',
              borderRadius: '0.5rem',
              textDecoration: 'none',
            }}
          >
            Go Home
          </Link>
        </div>
      </body>
    </html>
  );
}
