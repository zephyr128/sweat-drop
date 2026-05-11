/**
 * Browser-side SVG → PNG conversion via the Canvas API.
 *
 * Cross-origin images (e.g. Supabase Storage URLs) will taint the canvas and
 * make toBlob() throw a SecurityError.  Always convert them to a data URL first
 * using fetchAsDataUrl() below, then pass the data URL as customCenterImage to
 * renderBadgeSVG() before calling svgToPng().
 */

/**
 * Fetch a remote URL and return it as a base64 data URL.
 * Use this to inline Supabase Storage gym logos before rendering the SVG.
 */
export async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert an SVG string to a PNG Blob using an off-screen <canvas>.
 * The SVG must not contain any cross-origin image hrefs — use fetchAsDataUrl
 * to pre-resolve them to data URLs.
 *
 * @param svgString  Complete SVG markup (must include xmlns declaration).
 * @param size       Output canvas dimensions in px (width = height). Default: 512.
 */
export async function svgToPng(svgString: string, size = 512): Promise<Blob> {
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.width  = size;
    img.height = size;

    await new Promise<void>((resolve, reject) => {
      img.onload  = () => resolve();
      img.onerror = () => reject(new Error('SVG image failed to load'));
      img.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');

    ctx.drawImage(img, 0, 0, size, size);

    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
