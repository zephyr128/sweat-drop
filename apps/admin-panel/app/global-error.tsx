// app/global-error.tsx
'use client';

// Note: Client Components cannot export route segment config
// global-error.tsx is always dynamic in Next.js App Router
// CRITICAL: This must return full HTML document - no layout, no styled-jsx, no context

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#000000', color: '#FFFFFF', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ padding: '2rem', textAlign: 'center', maxWidth: '28rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0 0 0.5rem 0' }}>Something went wrong</h2>
          <p style={{ margin: '0 0 1.5rem 0', color: '#808080' }}>{error.message || 'An unexpected error occurred.'}</p>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#00E5FF',
              color: '#000000',
              fontWeight: '500',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
            onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#00B8CC'; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#00E5FF'; }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
