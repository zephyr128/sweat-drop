const rawHost = process.env.NEXT_PUBLIC_QR_PUBLIC_HOST;
const PUBLIC_HOST = typeof rawHost === 'string' && rawHost.trim() ? rawHost.trim() : 'https://sweat-drop.com';

export function machineQrUrl(qrUuid: string, machineType?: string | null): string {
  const sensorParam = machineType === 'bike' ? '?s=csc' : '';
  return `${PUBLIC_HOST}/m/${qrUuid}${sensorParam}`;
}

export function checkinQrUrl(gymId: string): string {
  return `${PUBLIC_HOST}/c/${gymId}`;
}
