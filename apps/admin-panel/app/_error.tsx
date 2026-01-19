export const dynamic = 'force-dynamic';

export default function CustomError({ statusCode }: { statusCode?: number }) {
  return (
    <div style={{ padding: '5rem 2rem', textAlign: 'center' }}>
      <h1>Error {statusCode || 'Unknown'}</h1>
      <p>An error occurred. Please try again later.</p>
    </div>
  );
}
