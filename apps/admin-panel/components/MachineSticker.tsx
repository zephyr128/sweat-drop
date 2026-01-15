'use client';

import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useReactToPrint } from 'react-to-print';
import { Printer } from 'lucide-react';

interface MachineStickerProps {
  machineName: string;
  qrUuid: string;
  machineType: 'treadmill' | 'bike';
  gymName?: string;
}

export function MachineSticker({ machineName, qrUuid, gymName }: MachineStickerProps) {
  const printRef = useRef<HTMLDivElement>(null);

  // QR URL format: sweatdrop://machine/[qr_uuid]
  const qrUrl = `sweatdrop://machine/${qrUuid}`;

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Machine Sticker - ${machineName}`,
    pageStyle: `
      @page {
        size: 4in 3in;
        margin: 0.25in;
      }
      @media print {
        body {
          margin: 0;
          padding: 0;
        }
        .no-print {
          display: none !important;
        }
      }
    `,
  });

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Print Button */}
      <button
        onClick={handlePrint}
        className="no-print flex items-center gap-2 px-4 py-2 bg-[#00E5FF]/10 text-[#00E5FF] rounded-lg hover:bg-[#00E5FF]/20 transition-colors"
      >
        <Printer className="w-4 h-4" />
        <span>Print Sticker</span>
      </button>

      {/* Sticker Content - Print Friendly */}
      <div
        ref={printRef}
        className="bg-white p-8 rounded-lg shadow-lg flex flex-col items-center justify-center"
        style={{
          width: '4in',
          minHeight: '3in',
        }}
      >
        {/* Logo */}
        <div className="text-2xl font-bold text-[#00E5FF] mb-2">SweatDrop</div>

        {/* Gym Name */}
        {gymName && (
          <div className="text-sm text-gray-600 mb-1">{gymName}</div>
        )}

        {/* Machine Name */}
        <div className="text-lg font-bold text-gray-900 mb-4 text-center">
          {machineName}
        </div>

        {/* QR Code - White background for better camera scanning */}
        <div className="bg-white p-4 rounded-lg border-2 border-gray-200 mb-4">
          <QRCodeSVG
            value={qrUrl}
            size={200}
            level="H"
            includeMargin={true}
            bgColor="#FFFFFF"
            fgColor="#000000"
          />
        </div>

        {/* UUID as backup */}
        <div className="text-xs text-gray-500 font-mono text-center break-all mt-2">
          {qrUuid}
        </div>
      </div>
    </div>
  );
}
