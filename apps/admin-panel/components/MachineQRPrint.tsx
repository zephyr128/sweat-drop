'use client';

import { useRef } from 'react';
import { Printer } from 'lucide-react';

interface MachineQRPrintProps {
  machineName: string;
  qrUuid: string;
  machineType: 'treadmill' | 'bike';
  gymName?: string;
}

export function MachineQRPrint({ machineName, qrUuid, machineType, gymName }: MachineQRPrintProps) {
  const printRef = useRef<HTMLDivElement>(null);

  // QR URL includes sensor type (CSC for Magene S3+)
  const qrUrl = `sweatdrop://machine/${qrUuid}?sensor=csc`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}`;

  const handlePrint = () => {
    if (!printRef.current) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the label');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Machine Label - ${machineName}</title>
          <style>
            @media print {
              @page {
                size: 4in 3in;
                margin: 0.25in;
              }
            }
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 20px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #00E5FF;
              margin-bottom: 10px;
            }
            .machine-name {
              font-size: 18px;
              font-weight: bold;
              margin: 10px 0;
              text-align: center;
            }
            .machine-type {
              font-size: 14px;
              color: #666;
              margin-bottom: 10px;
            }
            .qr-code {
              margin: 20px 0;
            }
            .qr-code img {
              width: 200px;
              height: 200px;
            }
            .qr-url {
              font-size: 10px;
              color: #999;
              word-break: break-all;
              text-align: center;
              margin-top: 10px;
            }
            .gym-name {
              font-size: 12px;
              color: #666;
              margin-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="logo">SweatDrop</div>
          ${gymName ? `<div class="gym-name">${gymName}</div>` : ''}
          <div class="machine-name">${machineName}</div>
          <div class="machine-type">${machineType === 'treadmill' ? '🏃 Treadmill' : '🚴 Bike'}</div>
          <div class="qr-code">
            <img src="${qrCodeUrl}" alt="QR Code" />
          </div>
          <div class="qr-url">${qrUrl}</div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    
    // Wait for image to load before printing
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  return (
    <button
      onClick={handlePrint}
      className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
      title="Print Label"
    >
      <Printer className="w-4 h-4" />
    </button>
  );
}
