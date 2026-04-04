'use client';

import { useRef } from 'react';
import { Printer } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { BrandedQRCode } from '@/components/ui/BrandedQRCode';

interface MachineQRPrintProps {
  machineName: string;
  qrUuid: string;
  machineType: 'treadmill' | 'bike';
  gymName?: string;
}

export function MachineQRPrint({ machineName, qrUuid, machineType, gymName }: MachineQRPrintProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const qrUrl = `sweatdrop://machine/${qrUuid}?sensor=csc`;

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Machine Label - ${machineName}`,
    pageStyle: `
      @page { size: 4in 3in; margin: 0.25in; }
      @media print {
        body { margin: 0; padding: 0; }
        .no-print { display: none !important; }
      }
    `,
  });

  return (
    <>
      <button
        onClick={handlePrint}
        className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
        title="Print Label"
      >
        <Printer className="w-4 h-4" />
      </button>

      {/* Hidden printable content */}
      <div style={{ display: 'none' }}>
        <div
          ref={printRef}
          style={{
            fontFamily: 'Arial, sans-serif',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '3in',
            background: '#fff',
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#00E5FF', marginBottom: 10 }}>
            SweatDrop
          </div>
          {gymName && (
            <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{gymName}</div>
          )}
          <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' }}>
            {machineName}
          </div>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
            {machineType === 'treadmill' ? '🏃 Treadmill' : '🚴 Bike'}
          </div>
          <div style={{ margin: '8px 0', background: '#fff', padding: 4, borderRadius: 8 }}>
            <BrandedQRCode value={qrUrl} size={200} />
          </div>
          <div style={{ fontSize: 10, color: '#999', wordBreak: 'break-all', textAlign: 'center', marginTop: 10 }}>
            {qrUrl}
          </div>
        </div>
      </div>
    </>
  );
}
