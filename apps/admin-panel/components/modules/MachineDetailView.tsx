'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useReactToPrint } from 'react-to-print';
import { useRef } from 'react';
import { Printer, ArrowLeft, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { UserRole } from '@/lib/auth';
import Link from 'next/link';

interface Machine {
  id: string;
  gym_id: string;
  name: string;
  type: 'treadmill' | 'bike';
  unique_qr_code: string;
  qr_uuid?: string;
  is_active: boolean;
  is_under_maintenance?: boolean;
  maintenance_notes?: string;
  sensor_id?: string | null;
  sensor_paired_at?: string | null;
  created_at: string;
  updated_at: string;
  gyms?: {
    id: string;
    name: string;
    city: string | null;
    country: string | null;
  };
}

interface MachineDetailViewProps {
  machine: Machine;
  userRole: UserRole;
}

export function MachineDetailView({ machine, userRole }: MachineDetailViewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // QR URL format: sweatdrop://machine/[qr_uuid]
  const qrUuid = machine.qr_uuid || machine.unique_qr_code;
  const qrUrl = `sweatdrop://machine/${qrUuid}`;

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Machine Sticker - ${machine.name}`,
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
        .sticker-content {
          box-shadow: none !important;
        }
      }
    `,
  });

  const copyQRUrl = () => {
    navigator.clipboard.writeText(qrUrl);
    setCopied(true);
    toast.success('QR URL copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const copyQRUuid = () => {
    navigator.clipboard.writeText(qrUuid);
    setCopied(true);
    toast.success('QR UUID copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link
        href={userRole === 'superadmin' 
          ? '/dashboard/super/machines'
          : `/dashboard/gym/${machine.gym_id}/machines`
        }
        className="no-print inline-flex items-center gap-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Machines</span>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Machine Info */}
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">Machine Information</h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm text-[#808080] block mb-1">Machine Name</label>
                <p className="text-white text-lg font-medium">{machine.name}</p>
              </div>

              <div>
                <label className="text-sm text-[#808080] block mb-1">Type</label>
                <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-[#FF9100]/10 text-[#FF9100]">
                  {machine.type === 'treadmill' ? '🏃 Treadmill' : '🚴 Bike'}
                </span>
              </div>

              {machine.gyms && (
                <div>
                  <label className="text-sm text-[#808080] block mb-1">Gym</label>
                  <p className="text-white">
                    {machine.gyms.name}
                    {machine.gyms.city && ` - ${machine.gyms.city}`}
                    {machine.gyms.country && `, ${machine.gyms.country}`}
                  </p>
                </div>
              )}

              <div>
                <label className="text-sm text-[#808080] block mb-1">Status</label>
                <div className="flex items-center gap-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      machine.is_active
                        ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                        : 'bg-[#808080]/10 text-[#808080]'
                    }`}
                  >
                    {machine.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {machine.is_under_maintenance && (
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#FF6B6B]/10 text-[#FF6B6B]">
                      Under Maintenance
                    </span>
                  )}
                </div>
              </div>

              {machine.sensor_id && (
                <div>
                  <label className="text-sm text-[#808080] block mb-1">Sensor ID</label>
                  <code className="text-sm text-[#00E5FF] font-mono bg-[#1A1A1A] px-3 py-2 rounded block break-all">
                    {machine.sensor_id}
                  </code>
                </div>
              )}

              <div>
                <label className="text-sm text-[#808080] block mb-1">QR UUID</label>
                <div className="flex items-center gap-2">
                  <code className="text-sm text-[#00E5FF] font-mono bg-[#1A1A1A] px-3 py-2 rounded flex-1 break-all">
                    {qrUuid}
                  </code>
                  <button
                    onClick={copyQRUuid}
                    className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                    title="Copy UUID"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-[#00E5FF]" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm text-[#808080] block mb-1">QR URL</label>
                <div className="flex items-center gap-2">
                  <code className="text-sm text-[#00E5FF] font-mono bg-[#1A1A1A] px-3 py-2 rounded flex-1 break-all">
                    {qrUrl}
                  </code>
                  <button
                    onClick={copyQRUrl}
                    className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                    title="Copy QR URL"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-[#00E5FF]" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: QR Code Display & Sticker */}
        <div className="space-y-6">
          {/* QR Code Display */}
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4">QR Code</h2>
            
            <div className="flex flex-col items-center gap-4">
              {/* QR Code with white background for better scanning */}
              <div className="bg-white p-4 rounded-lg border-2 border-[#1A1A1A]">
                <QRCodeSVG
                  value={qrUrl}
                  size={256}
                  level="H"
                  includeMargin={true}
                  bgColor="#FFFFFF"
                  fgColor="#000000"
                />
              </div>

              <p className="text-sm text-[#808080] text-center">
                Scan this QR code with the SweatDrop mobile app to start a workout
              </p>
            </div>
          </div>

          {/* Print Sticker */}
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4">Print Sticker</h2>
            
            <div className="flex flex-col items-center gap-4">
              {/* Print Button */}
              <button
                onClick={handlePrint}
                className="no-print flex items-center gap-2 px-6 py-3 bg-[#00E5FF]/10 text-[#00E5FF] rounded-lg hover:bg-[#00E5FF]/20 transition-colors font-medium"
              >
                <Printer className="w-5 h-5" />
                <span>Print Sticker</span>
              </button>

              {/* Sticker Preview - Print Friendly */}
              <div
                ref={printRef}
                className="sticker-content bg-white p-8 rounded-lg shadow-lg flex flex-col items-center justify-center"
                style={{
                  width: '100%',
                  maxWidth: '4in',
                  minHeight: '3in',
                }}
              >
                {/* Logo */}
                <div className="text-2xl font-bold text-[#00E5FF] mb-2">SweatDrop</div>

                {/* Gym Name */}
                {machine.gyms?.name && (
                  <div className="text-sm text-gray-600 mb-1">{machine.gyms.name}</div>
                )}

                {/* Machine Name */}
                <div className="text-lg font-bold text-gray-900 mb-4 text-center">
                  {machine.name}
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

              <p className="text-xs text-[#808080] text-center">
                Click "Print Sticker" to print a label for this machine
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
