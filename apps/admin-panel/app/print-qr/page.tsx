'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function PrintQRContent() {
  const searchParams = useSearchParams();
  const gymId = searchParams.get('gymId') || '';
  const gymName = searchParams.get('gymName') || 'Gym';
  const type = (searchParams.get('type') || 'checkin') as 'checkin' | 'machine';
  const machineId = searchParams.get('machineId') || '';
  const machineName = searchParams.get('machineName') || 'Machine';

  const isCheckin = type === 'checkin';
  const qrData = isCheckin
    ? `sweatdrop://checkin/${gymId}`
    : `sweatdrop://machine/${machineId}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrData)}`;
  const heading = isCheckin ? 'CHECK IN HERE' : 'SCAN TO TRAIN';
  const subtitle = isCheckin ? gymName : machineName;

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; background: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="bg-[#111] border-2 border-[#222] rounded-3xl p-12 text-center max-w-[420px] w-full">
        <div className="text-sm font-bold tracking-[4px] uppercase text-[#00E5FF] mb-8">
          💧 SWEATDROP
        </div>

        <div className="inline-block p-4 bg-white rounded-2xl mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt="QR Code"
            width={280}
            height={280}
            className="block"
          />
        </div>

        <h1 className="text-[28px] font-extrabold tracking-wider text-white mb-2">
          {heading}
        </h1>
        <p className="text-base text-[#808080] mb-2">{subtitle}</p>
        {isCheckin && (
          <p className="text-[13px] text-[#00E5FF] mt-3">
            Scan the QR code in the SweatDrop app
          </p>
        )}
      </div>

      <button
        onClick={() => window.print()}
        className="no-print mt-8 px-8 py-3 bg-[#00E5FF] text-black font-semibold rounded-xl hover:bg-[#00C8E0] transition-colors text-base"
      >
        🖨️ Print
      </button>
    </div>
  );
}

export default function PrintQRPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-white">Loading...</div>}>
      <PrintQRContent />
    </Suspense>
  );
}
