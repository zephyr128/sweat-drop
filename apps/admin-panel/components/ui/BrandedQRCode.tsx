'use client';

import { QRCodeSVG } from 'qrcode.react';

interface BrandedQRCodeProps {
  value: string;
  size?: number;
  /** Override the logo image src. Defaults to the SweatDrop app icon. */
  logoSrc?: string;
  /** Logo size as a fraction of the QR code size (0–1). Default: 0.22 */
  logoFraction?: number;
}

/**
 * QR code with the SweatDrop app icon embedded in the center.
 * Uses error correction level H so the logo doesn't break scannability.
 */
export function BrandedQRCode({
  value,
  size = 200,
  logoSrc = '/app-icon.png',
  logoFraction = 0.22,
}: BrandedQRCodeProps) {
  const logoSize = Math.round(size * logoFraction);

  return (
    <QRCodeSVG
      value={value}
      size={size}
      level="H"
      includeMargin
      bgColor="#FFFFFF"
      fgColor="#000000"
      imageSettings={{
        src: logoSrc,
        width: logoSize,
        height: logoSize,
        excavate: true,
      }}
    />
  );
}
