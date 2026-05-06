'use client';

import { Printer } from 'lucide-react';

interface MachineQRPrintProps {
  machineName: string;
  qrUuid: string;
  machineType: 'treadmill' | 'bike';
  gymName?: string;
}

/**
 * Opens the SweatDrop Print Studio for machines in a new tab.
 * The studio (`/print-qr`) renders premium vertical / horizontal / square
 * sticker designs with selectable CTA copy, optimized for removable-adhesive
 * vinyl printing.
 */
export function MachineQRPrint({ machineName, qrUuid, machineType, gymName }: MachineQRPrintProps) {
  const handleOpen = () => {
    const params = new URLSearchParams({
      type: 'machine',
      machineId: qrUuid,
      machineName,
      machineType,
      ...(gymName ? { gymName } : {}),
    });
    window.open(`/print-qr?${params.toString()}`, '_blank', 'noopener');
  };

  return (
    <button
      onClick={handleOpen}
      className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
      title="Open print studio (QR + combined QR/NFC)"
    >
      <Printer className="w-4 h-4" />
    </button>
  );
}
