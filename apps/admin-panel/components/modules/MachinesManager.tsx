'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import Link from 'next/link';
import { createMachine, deleteMachine, toggleMachineStatus, toggleMaintenance, updateMachine, pairSensorToMachine, registerBLEDevice } from '@/lib/actions/machine-actions';
import { X, Trash2, Power, QrCode, Wrench, AlertTriangle, Edit2, Bluetooth, Save, Eye, BarChart3 } from 'lucide-react';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { UserRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase-client';
import { MachineQRPrint } from '@/components/MachineQRPrint';
import { BrandedQRCode } from '@/components/ui/BrandedQRCode';

const machineSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['treadmill', 'bike']),
  uniqueQrCode: z.string().optional(), // Optional - will be auto-generated if not provided
});

type MachineFormData = z.infer<typeof machineSchema>;

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
  ble_protocol?: string | null;
  protocol_verified?: boolean;
  created_at: string;
  updated_at: string;
  gyms?: {
    id: string;
    name: string;
    city: string | null;
    country: string | null;
  };
}

interface MachinesManagerProps {
  gymId: string;
  initialMachines: Machine[];
  initialReports?: Map<string, number>;
  userRole: UserRole;
  isGlobalView?: boolean;
}

export function MachinesManager({ gymId, initialMachines, initialReports = new Map(), userRole, isGlobalView = false }: MachinesManagerProps) {
  const [machines, setMachines] = useState<Machine[]>(initialMachines);
  const [reportsMap, _setReportsMap] = useState<Map<string, number>>(initialReports);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [maintenanceMachineId, setMaintenanceMachineId] = useState<string | null>(null);
  const [maintenanceNotes, setMaintenanceNotes] = useState('');
  const [editingMachineId, setEditingMachineId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingType, setEditingType] = useState<'treadmill' | 'bike'>('treadmill');
  const [pairingMachineId, setPairingMachineId] = useState<string | null>(null);
  const [isPairing, setIsPairing] = useState(false);
  const [bleRegistrationModal, setBleRegistrationModal] = useState<string | null>(null);
  const [bleStatus, setBleStatus] = useState<{
    step: 'idle' | 'scanning' | 'connecting' | 'detecting' | 'testing' | 'done' | 'error';
    deviceName?: string;
    protocol?: 'ftms' | 'fitshow' | 'magene' | 'ksfit' | 'unknown';
    dataReceived?: boolean;
    error?: string;
    scanAll?: boolean;
  }>({ step: 'idle' });
  const [gyms, setGyms] = useState<Array<{ id: string; name: string; city: string | null; country: string | null }>>([]);
  const [selectedGymId, setSelectedGymId] = useState<string>(gymId || '');
  const [loadingGyms, setLoadingGyms] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedMachineForQR, setSelectedMachineForQR] = useState<Machine | null>(null);
  
  const isSuperAdmin = userRole === 'superadmin';
  const canCreateMachines = isSuperAdmin;
  const canEditMachines = userRole === 'gym_owner' || userRole === 'gym_admin' || userRole === 'superadmin';
  const canToggleActive = isSuperAdmin;

  // Load gyms for global view
  useEffect(() => {
    if (isGlobalView && isSuperAdmin) {
      setLoadingGyms(true);
      supabase
        .from('gyms')
        .select('id, name, city, country')
        .eq('status', 'active')
        .order('name')
        .then(({ data, error }) => {
          if (error) {
            console.error('Error loading gyms:', error);
          } else {
            setGyms(data || []);
            if (data && data.length > 0 && !selectedGymId) {
              setSelectedGymId(data[0].id);
            }
          }
          setLoadingGyms(false);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGlobalView, isSuperAdmin]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MachineFormData>({
    resolver: zodResolver(machineSchema),
    defaultValues: {
      type: 'treadmill',
    },
  });

  const onSubmit = async (data: MachineFormData) => {
    try {
      // For global view, use selected gym; otherwise use prop gymId
      const effectiveGymId = isGlobalView ? selectedGymId : gymId;
      
      if (!effectiveGymId) {
        toast.error('Please select a gym');
        return;
      }

      const submitData: any = {
        ...data,
        gymId: effectiveGymId,
      };

      const result = await createMachine(submitData) as {
        success: boolean;
        data?: Machine;
        error?: string;
      };

      if (result.success && result.data) {
        setMachines([result.data as Machine, ...machines]);
        toast.success('Machine created successfully');
        reset();
        setIsModalOpen(false);
      } else {
        toast.error(`Failed to create machine: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const handleDelete = async (machineId: string) => {
    if (!(await confirmAction({ title: 'Delete Machine', message: 'Are you sure you want to delete this machine?', confirmLabel: 'Delete', variant: 'danger' }))) return;

    setDeletingId(machineId);
    try {
      const machine = machines.find(m => m.id === machineId);
      const effectiveGymId = isGlobalView && machine ? machine.gym_id : gymId;
      const result = await deleteMachine(machineId, effectiveGymId);
      if (result.success) {
        setMachines(machines.filter((m) => m.id !== machineId));
        toast.success('Machine deleted successfully');
      } else {
        toast.error(`Failed to delete: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleStatus = async (machineId: string, currentStatus: boolean) => {
    try {
      const machine = machines.find(m => m.id === machineId);
      const effectiveGymId = isGlobalView && machine ? machine.gym_id : gymId;
      const result = await toggleMachineStatus(machineId, effectiveGymId, !currentStatus);
      if (result.success) {
        setMachines(
          machines.map((m) =>
            m.id === machineId ? { ...m, is_active: !currentStatus } : m
          )
        );
        toast.success(
          `Machine ${!currentStatus ? 'activated' : 'deactivated'} successfully`
        );
      } else {
        toast.error(`Failed to update status: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const handleToggleMaintenance = async (machineId: string, currentStatus: boolean) => {
    try {
      const machine = machines.find(m => m.id === machineId);
      const effectiveGymId = isGlobalView && machine ? machine.gym_id : gymId;
      const result = await toggleMaintenance(
        machineId,
        effectiveGymId,
        !currentStatus,
        maintenanceNotes || undefined
      );
      if (result.success) {
        setMachines(
          machines.map((m) =>
            m.id === machineId
              ? {
                  ...m,
                  is_under_maintenance: !currentStatus,
                  maintenance_notes: !currentStatus ? maintenanceNotes : undefined,
                  maintenance_started_at: !currentStatus ? new Date().toISOString() : undefined,
                }
              : m
          )
        );
        toast.success(
          `Machine ${!currentStatus ? 'marked as under maintenance' : 'removed from maintenance'}`
        );
        setMaintenanceMachineId(null);
        setMaintenanceNotes('');
      } else {
        toast.error(`Failed to update maintenance status: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const copyQRCode = (qrCode: string) => {
    navigator.clipboard.writeText(qrCode);
    toast.success('QR code copied to clipboard');
  };

  const showQRCode = (machine: Machine) => {
    if (!machine.qr_uuid) {
      toast.error('QR code not available. Please ensure the machine has a QR UUID.');
      return;
    }
    setSelectedMachineForQR(machine);
    setQrModalOpen(true);
  };

  const handleEdit = (machine: Machine) => {
    setEditingMachineId(machine.id);
    setEditingName(machine.name);
    setEditingType(machine.type);
  };

  const handleSaveEdit = async (machineId: string) => {
    try {
      const machine = machines.find(m => m.id === machineId);
      const effectiveGymId = isGlobalView && machine ? machine.gym_id : gymId;
      const result = await updateMachine(machineId, effectiveGymId, {
        name: editingName,
        type: editingType,
      });

      if (result.success) {
        setMachines(
          machines.map((m) =>
            m.id === machineId ? { ...m, name: editingName, type: editingType } : m
          )
        );
        toast.success('Machine updated successfully');
        setEditingMachineId(null);
      } else {
        toast.error(`Failed to update: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  // BLE Protocol UUIDs
  const BLE_SERVICES = {
    FTMS: 0x1826,       // Fitness Machine Service
    CSC: 0x1816,        // Cycling Speed and Cadence (Magene)
    RSC: 0x1814,        // Running Speed and Cadence
    HEART_RATE: 0x180D,  // Heart Rate
  };

  const handleBLERegistration = async (machineId: string, scanAll = false) => {
    if (!('bluetooth' in navigator)) {
      toast.error('Web Bluetooth is not supported. Use Chrome or Edge.');
      return;
    }

    setBleRegistrationModal(machineId);
    setBleStatus({ step: 'scanning', scanAll });

    try {
      // Scan for BLE devices — standard mode uses service filters, scan-all mode shows every device
      const requestOptions: any = scanAll
        ? {
            acceptAllDevices: true,
            optionalServices: [
              'battery_service',
              'device_information',
              'generic_access',
              BLE_SERVICES.FTMS,
              BLE_SERVICES.CSC,
              BLE_SERVICES.RSC,
              BLE_SERVICES.HEART_RATE,
            ],
          }
        : {
            filters: [
              { services: [BLE_SERVICES.FTMS] },
              { services: [BLE_SERVICES.CSC] },
              { services: [BLE_SERVICES.RSC] },
            ],
            optionalServices: [
              'battery_service',
              'device_information',
              'generic_access',
              BLE_SERVICES.FTMS,
              BLE_SERVICES.CSC,
              BLE_SERVICES.RSC,
            ],
          };

      const device = await (navigator as any).bluetooth.requestDevice(requestOptions);

      // CRITICAL: Save device.id (Web Bluetooth opaque ID, base64) as sensor_id for the DB.
      // Mobile app detects base64 strings and enters scan-by-name mode instead of direct connect.
      // device.name is the human-readable name (e.g., "YESOUL282920") — used for UI display only.
      const bleDeviceId = device.id || `BLE-${Date.now()}`;
      const deviceName = device.name || device.id || 'Unknown Device';
      setBleStatus({ step: 'connecting', deviceName });

      // Connect to GATT server
      const server = await device.gatt.connect();
      setBleStatus({ step: 'detecting', deviceName });

      // Protocol detection — try FTMS first, then CSC (Magene), then others
      let detectedProtocol: 'ftms' | 'fitshow' | 'magene' | 'ksfit' | 'unknown' = scanAll ? 'unknown' : 'magene';
      let dataReceived = false;

      // Try FTMS (Fitness Machine Service) — most standard
      try {
        const ftmsService = await server.getPrimaryService(BLE_SERVICES.FTMS);
        if (ftmsService) {
          detectedProtocol = 'ftms';
          setBleStatus({ step: 'testing', deviceName, protocol: 'ftms' });

          // Try to read a characteristic to confirm data stream
          try {
            // Indoor Bike Data characteristic (0x2AD2) or Treadmill Data (0x2ACD)
            const chars = await ftmsService.getCharacteristics();
            if (chars.length > 0) {
              // Try to start notifications on the first data characteristic
              for (const char of chars) {
                try {
                  if (char.properties.notify) {
                    await char.startNotifications();
                    // Wait briefly for data
                    await new Promise<void>((resolve) => {
                      const handler = () => {
                        dataReceived = true;
                        char.removeEventListener('characteristicvaluechanged', handler);
                        resolve();
                      };
                      char.addEventListener('characteristicvaluechanged', handler);
                      setTimeout(() => {
                        char.removeEventListener('characteristicvaluechanged', handler);
                        resolve();
                      }, 3000);
                    });
                    if (dataReceived) break;
                  }
                } catch { /* continue to next characteristic */ }
              }
            }
          } catch (e) {
            console.warn('FTMS data read failed:', e);
          }
        }
      } catch {
        // FTMS not available
      }

      // If not FTMS, try CSC (Magene-style sensors)
      if (detectedProtocol !== 'ftms') {
        try {
          const cscService = await server.getPrimaryService(BLE_SERVICES.CSC);
          if (cscService) {
            detectedProtocol = 'magene';
            setBleStatus({ step: 'testing', deviceName, protocol: 'magene' });

            try {
              // CSC Measurement characteristic (0x2A5B)
              const measurement = await cscService.getCharacteristic(0x2A5B);
              if (measurement.properties.notify) {
                await measurement.startNotifications();
                await new Promise<void>((resolve) => {
                  const handler = () => {
                    dataReceived = true;
                    measurement.removeEventListener('characteristicvaluechanged', handler);
                    resolve();
                  };
                  measurement.addEventListener('characteristicvaluechanged', handler);
                  setTimeout(() => {
                    measurement.removeEventListener('characteristicvaluechanged', handler);
                    resolve();
                  }, 3000);
                });
              }
            } catch (e) {
              console.warn('CSC data read failed:', e);
            }
          }
        } catch {
          // CSC not available
        }
      }

      // Check device name for FitShow/KSFit/other protocol hints
      const nameLower = deviceName.toLowerCase();
      if (detectedProtocol === 'unknown' || detectedProtocol === 'magene') {
        if (nameLower.includes('fitshow') || nameLower.includes('fs-')) {
          detectedProtocol = 'fitshow';
        } else if (nameLower.includes('ksfit') || nameLower.includes('ks-')) {
          detectedProtocol = 'ksfit';
        } else if (nameLower.includes('magene') || nameLower.includes('csc')) {
          detectedProtocol = 'magene';
        }
      }

      setBleStatus({
        step: 'done',
        deviceName,
        protocol: detectedProtocol,
        dataReceived,
      });

      // Save to database — use bleDeviceId (base64 opaque ID) so mobile can scan-match
      const result = await registerBLEDevice(
        machineId,
        bleDeviceId,
        detectedProtocol,
        dataReceived
      );

      if (result.success) {
        setMachines(
          machines.map((m) =>
            m.id === machineId
              ? {
                  ...m,
                  sensor_id: bleDeviceId,
                  sensor_paired_at: new Date().toISOString(),
                  ble_protocol: detectedProtocol === 'unknown' ? null : detectedProtocol,
                  protocol_verified: dataReceived,
                }
              : m
          )
        );
        const protoLabel = detectedProtocol === 'unknown' ? 'Proprietary' : detectedProtocol.toUpperCase();
        toast.success(`BLE device registered: ${deviceName} (${protoLabel})${dataReceived ? ' ✓ Data confirmed' : ''}`);
      } else {
        toast.error(`Failed to save: ${result.error}`);
      }

      // Disconnect
      device.gatt.disconnect();
    } catch (error: any) {
      const errorMsg =
        error.name === 'NotFoundError' ? 'No device selected' :
        error.name === 'SecurityError' ? 'Bluetooth permission denied' :
        error.name === 'NetworkError' ? 'Connection failed — ensure device is powered on' :
        error.message;

      setBleStatus({ step: 'error', error: errorMsg });
      toast.error(errorMsg);
      console.error('Bluetooth pairing error:', error);
    } finally {
      setIsPairing(false);
      setPairingMachineId(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <div className="flex items-center gap-3">
          {canCreateMachines ? (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
            >
              + Add Machine
            </button>
          ) : (
            <div className="px-6 py-3 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-[#808080]">
              <p className="text-sm">
                To add more machines, please contact{' '}
                <span className="text-[#00E5FF]">SweatDrop Support</span>
              </p>
            </div>
          )}
          <Link
            href={`/dashboard/gym/${gymId}/machines/analytics`}
            className="px-5 py-3 bg-[#1A1A1A] border border-[#2A2A2A] text-[#808080] hover:text-white hover:border-[#00E5FF]/50 rounded-lg font-medium transition-colors inline-flex items-center gap-2 text-sm"
          >
            <BarChart3 className="w-4 h-4" />
            Machine Hub
          </Link>
        </div>
      </div>

      {/* Machines Table */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#1A1A1A]">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Name</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Type</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">QR Code</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Status</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Maintenance</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1A1A]">
              {machines.length === 0 ? (
                <tr>
                  <td colSpan={isGlobalView ? 7 : 6} className="px-6 py-12 text-center text-[#808080]">
                    No machines yet. {isSuperAdmin ? 'Create your first machine!' : 'No machines assigned to this gym.'}
                  </td>
                </tr>
              ) : (
                machines.map((machine) => {
                  const reportCount = reportsMap.get(machine.id) || 0;
                  return (
                    <tr key={machine.id} className="hover:bg-[#1A1A1A]/50">
                      {isGlobalView && (
                        <td className="px-6 py-4">
                          <div className="text-white font-medium">
                            {machine.gyms?.name || 'Unknown Gym'}
                          </div>
                          {machine.gyms?.city && (
                            <div className="text-xs text-[#808080]">
                              {machine.gyms.city}{machine.gyms.country ? `, ${machine.gyms.country}` : ''}
                            </div>
                          )}
                        </td>
                      )}
                      <td className="px-6 py-4">
                        {editingMachineId === machine.id ? (
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="px-3 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <Link
                              href={isGlobalView 
                                ? `/dashboard/super/machines/${machine.id}`
                                : `/dashboard/gym/${gymId}/machines/${machine.id}`
                              }
                              className="text-white font-medium hover:text-[#00E5FF] transition-colors"
                            >
                              {machine.name}
                            </Link>
                            {reportCount > 0 && (
                              <div className="flex items-center gap-1" title={`${reportCount} pending report(s)`}>
                                <AlertTriangle className="w-4 h-4 text-[#FF6B6B]" />
                                <span className="text-xs text-[#FF6B6B]">{reportCount}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {editingMachineId === machine.id ? (
                          <select
                            value={editingType}
                            onChange={(e) => setEditingType(e.target.value as 'treadmill' | 'bike')}
                            className="px-3 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                          >
                            <option value="treadmill">🏃 Treadmill</option>
                            <option value="bike">🚴 Bike</option>
                          </select>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#FF9100]/10 text-[#FF9100]">
                            {machine.type === 'treadmill' ? '🏃 Treadmill' : '🚴 Bike'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <code className="text-sm text-[#00E5FF] font-mono bg-[#1A1A1A] px-2 py-1 rounded">
                            {machine.unique_qr_code}
                          </code>
                          {machine.qr_uuid ? (
                            <>
                              <button
                                onClick={() => showQRCode(machine)}
                                className="p-1 text-[#808080] hover:text-[#00E5FF] transition-colors"
                                title="View QR code"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => copyQRCode(`sweatdrop://machine/${machine.qr_uuid}`)}
                                className="p-1 text-[#808080] hover:text-[#00E5FF] transition-colors"
                                title="Copy QR URL"
                              >
                                <QrCode className="w-4 h-4" />
                              </button>
                              {isSuperAdmin && (
                                <MachineQRPrint
                                  machineName={machine.name}
                                  qrUuid={machine.qr_uuid}
                                  machineType={machine.type}
                                  gymName={machine.gyms?.name}
                                />
                              )}
                            </>
                          ) : (
                            <button
                              onClick={() => copyQRCode(machine.unique_qr_code)}
                              className="p-1 text-[#808080] hover:text-[#00E5FF] transition-colors"
                              title="Copy QR code"
                            >
                              <QrCode className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {isSuperAdmin && machine.sensor_id && (
                          <div className="mt-2 text-xs text-[#808080] flex items-center gap-2">
                            <span>BLE: <span className="text-[#00E5FF]" title={machine.sensor_id}>
                              {machine.sensor_id.length > 16 ? `${machine.sensor_id.slice(0, 12)}…` : machine.sensor_id}
                            </span></span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                              machine.ble_protocol
                                ? machine.protocol_verified 
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                  : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                                : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            }`}>
                              {machine.ble_protocol 
                                ? `${machine.ble_protocol.toUpperCase()}${machine.protocol_verified ? ' ✓' : ' ?'}`
                                : 'PROPRIETARY'}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {canToggleActive ? (
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer ${
                              machine.is_active
                                ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                                : 'bg-[#808080]/10 text-[#808080]'
                            }`}
                            onClick={() => handleToggleStatus(machine.id, machine.is_active)}
                            title="Click to toggle (SuperAdmin only)"
                          >
                            {machine.is_active ? 'Active' : 'Inactive'}
                          </span>
                        ) : (
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              machine.is_active
                                ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                                : 'bg-[#808080]/10 text-[#808080]'
                            }`}
                          >
                            {machine.is_active ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => {
                            setMaintenanceMachineId(machine.id);
                            setMaintenanceNotes(machine.maintenance_notes || '');
                          }}
                          className={`p-2 transition-colors ${
                            machine.is_under_maintenance
                              ? 'text-[#FF6B6B] hover:text-[#FF5252]'
                              : 'text-[#808080] hover:text-[#FF6B6B]'
                          }`}
                          title={machine.is_under_maintenance ? 'Remove from maintenance' : 'Mark as under maintenance'}
                        >
                          <Wrench className={`w-4 h-4 ${machine.is_under_maintenance ? 'opacity-100' : 'opacity-50'}`} />
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {editingMachineId === machine.id ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(machine.id)}
                                className="p-2 text-[#00E5FF] hover:text-[#00B8CC] transition-colors"
                                title="Save"
                              >
                                <Save className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingMachineId(null);
                                  setEditingName('');
                                }}
                                className="p-2 text-[#808080] hover:text-white transition-colors"
                                title="Cancel"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              {canEditMachines && (
                                <button
                                  onClick={() => handleEdit(machine)}
                                  className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                                  title="Edit name/type"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}
                              {isSuperAdmin && (
                                <>
                                  <button
                                    onClick={() => handleBLERegistration(machine.id)}
                                    disabled={isPairing && pairingMachineId === machine.id}
                                    className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors disabled:opacity-50"
                                    title={machine.sensor_id ? `${machine.ble_protocol?.toUpperCase() || 'BLE'} ${machine.protocol_verified ? '✓' : '?'} — Click to re-pair` : 'Register BLE device'}
                                  >
                                    <Bluetooth
                                      className={`w-4 h-4 ${
                                        machine.protocol_verified ? 'text-emerald-400' :
                                        machine.sensor_id ? 'text-[#00E5FF]' : ''
                                      }`}
                                    />
                                  </button>
                                  {canToggleActive && (
                                    <button
                                      onClick={() =>
                                        handleToggleStatus(machine.id, machine.is_active)
                                      }
                                      className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                                      title={machine.is_active ? 'Deactivate' : 'Activate'}
                                    >
                                      <Power
                                        className={`w-4 h-4 ${
                                          machine.is_active ? 'text-[#00E5FF]' : ''
                                        }`}
                                      />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDelete(machine.id)}
                                    disabled={deletingId === machine.id}
                                    className="p-2 text-[#808080] hover:text-[#FF5252] transition-colors disabled:opacity-50"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Machine Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Add New Machine</h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  reset();
                }}
                className="text-[#808080] hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Gym Selection for Global View */}
              {isGlobalView && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Gym <span className="text-[#FF5252]">*</span>
                  </label>
                  {loadingGyms ? (
                    <div className="px-4 py-3 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-[#808080]">
                      Loading gyms...
                    </div>
                  ) : (
                    <select
                      value={selectedGymId}
                      onChange={(e) => setSelectedGymId(e.target.value)}
                      required
                      className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                    >
                      <option value="">Select a gym...</option>
                      {gyms.map((gym) => (
                        <option key={gym.id} value={gym.id}>
                          {gym.name} {gym.city && `(${gym.city}${gym.country ? `, ${gym.country}` : ''})`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Machine Name *
                </label>
                <input
                  {...register('name')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  placeholder="E.g., Treadmill #1, Bike Station A"
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-[#FF5252]">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Machine Type *
                </label>
                <select
                  {...register('type')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                >
                  <option value="treadmill">🏃 Treadmill</option>
                  <option value="bike">🚴 Bike</option>
                </select>
                {errors.type && (
                  <p className="mt-1 text-sm text-[#FF5252]">{errors.type.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  QR Code (Optional)
                </label>
                <input
                  {...register('uniqueQrCode')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  placeholder="Leave empty to auto-generate"
                />
                <p className="mt-1 text-xs text-[#808080]">
                  If left empty, a unique QR code will be automatically generated
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Creating...' : 'Create Machine'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    reset();
                  }}
                  className="px-6 py-3 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Maintenance Modal */}
      {maintenanceMachineId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">
                {machines.find((m) => m.id === maintenanceMachineId)?.is_under_maintenance
                  ? 'Remove from Maintenance'
                  : 'Mark as Under Maintenance'}
              </h2>
              <button
                onClick={() => {
                  setMaintenanceMachineId(null);
                  setMaintenanceNotes('');
                }}
                className="text-[#808080] hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Maintenance Notes (Optional)
                </label>
                <textarea
                  value={maintenanceNotes}
                  onChange={(e) => setMaintenanceNotes(e.target.value)}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none resize-none"
                  placeholder="E.g., Waiting for parts, sensor replacement needed..."
                  rows={3}
                />
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    const machine = machines.find((m) => m.id === maintenanceMachineId);
                    if (machine) {
                      handleToggleMaintenance(machine.id, machine.is_under_maintenance || false);
                    }
                  }}
                  className="flex-1 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
                >
                  {machines.find((m) => m.id === maintenanceMachineId)?.is_under_maintenance
                    ? 'Remove from Maintenance'
                    : 'Mark as Under Maintenance'}
                </button>
                <button
                  onClick={() => {
                    setMaintenanceMachineId(null);
                    setMaintenanceNotes('');
                  }}
                  className="px-6 py-3 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrModalOpen && selectedMachineForQR && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">QR Code</h3>
              <button
                onClick={() => {
                  setQrModalOpen(false);
                  setSelectedMachineForQR(null);
                }}
                className="text-[#808080] hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-[#808080] mb-2">Machine: {selectedMachineForQR.name}</p>
                {selectedMachineForQR.gyms?.name && (
                  <p className="text-sm text-[#808080] mb-4">Gym: {selectedMachineForQR.gyms.name}</p>
                )}
              </div>

              {selectedMachineForQR.qr_uuid && (
                <>
                  <div className="flex justify-center bg-white p-4 rounded-lg">
                    <BrandedQRCode
                      value={`sweatdrop://machine/${selectedMachineForQR.qr_uuid}`}
                      size={256}
                    />
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-[#808080] block mb-1">QR URL</label>
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-[#00E5FF] font-mono bg-[#1A1A1A] px-3 py-2 rounded flex-1 break-all">
                          {`sweatdrop://machine/${selectedMachineForQR.qr_uuid}`}
                        </code>
                        <button
                          onClick={() => {
                            if (selectedMachineForQR.qr_uuid) {
                              navigator.clipboard.writeText(`sweatdrop://machine/${selectedMachineForQR.qr_uuid}`);
                              toast.success('QR URL copied to clipboard');
                            }
                          }}
                          className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                          title="Copy QR URL"
                        >
                      <QrCode className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-[#808080] block mb-1">QR UUID</label>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-[#00E5FF] font-mono bg-[#1A1A1A] px-3 py-2 rounded flex-1 break-all">
                      {selectedMachineForQR.qr_uuid}
                    </code>
                    <button
                      onClick={() => {
                        if (selectedMachineForQR.qr_uuid) {
                          navigator.clipboard.writeText(selectedMachineForQR.qr_uuid);
                          toast.success('QR UUID copied to clipboard');
                        }
                      }}
                      className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                      title="Copy UUID"
                      disabled={!selectedMachineForQR.qr_uuid}
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
                </>
              )}

              <div className="flex gap-3 pt-4">
                {isSuperAdmin && selectedMachineForQR.qr_uuid && (
                  <MachineQRPrint
                    machineName={selectedMachineForQR.name}
                    qrUuid={selectedMachineForQR.qr_uuid}
                    machineType={selectedMachineForQR.type}
                    gymName={selectedMachineForQR.gyms?.name}
                  />
                )}
                <button
                  onClick={() => {
                    setQrModalOpen(false);
                    setSelectedMachineForQR(null);
                  }}
                  className="flex-1 px-4 py-2 bg-[#1A1A1A] text-white rounded-lg hover:bg-[#2A2A2A] transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BLE Registration Modal */}
      {bleRegistrationModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Bluetooth className="w-5 h-5 text-[#00E5FF]" />
                BLE Device Registration
              </h3>
              {(bleStatus.step === 'done' || bleStatus.step === 'error' || bleStatus.step === 'idle') && (
                <button
                  onClick={() => {
                    setBleRegistrationModal(null);
                    setBleStatus({ step: 'idle' });
                  }}
                  className="text-[#808080] hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              )}
            </div>

            <div className="space-y-4">
              {/* Machine info */}
              <p className="text-sm text-[#808080]">
                Machine: {machines.find(m => m.id === bleRegistrationModal)?.name || 'Unknown'}
              </p>

              {/* Scan mode indicator */}
              {bleStatus.scanAll && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-400 font-medium">All Devices Mode — showing all nearby BLE devices</p>
                </div>
              )}

              {/* Step indicator */}
              <div className="space-y-3">
                {/* Step 1: Scanning */}
                <div className={`flex items-center gap-3 p-3 rounded-lg ${
                  bleStatus.step === 'scanning' ? 'bg-[#1A1A1A] border border-[#00E5FF]/30' :
                  ['connecting', 'detecting', 'testing', 'done'].includes(bleStatus.step) ? 'bg-[#1A1A1A]/50' : 'bg-[#1A1A1A]/30'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    bleStatus.step === 'scanning' ? 'bg-[#00E5FF] text-black animate-pulse' :
                    ['connecting', 'detecting', 'testing', 'done'].includes(bleStatus.step) ? 'bg-emerald-500 text-white' : 'bg-[#2A2A2A] text-[#808080]'
                  }`}>
                    {['connecting', 'detecting', 'testing', 'done'].includes(bleStatus.step) ? '✓' : '1'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Scan for Device</p>
                    <p className="text-xs text-[#808080]">
                      {bleStatus.step === 'scanning' ? 'Waiting for device selection...' : 
                       bleStatus.deviceName ? `Found: ${bleStatus.deviceName}` : 'Select a nearby BLE device'}
                    </p>
                  </div>
                </div>

                {/* Step 2: Connecting */}
                <div className={`flex items-center gap-3 p-3 rounded-lg ${
                  bleStatus.step === 'connecting' ? 'bg-[#1A1A1A] border border-[#00E5FF]/30' :
                  ['detecting', 'testing', 'done'].includes(bleStatus.step) ? 'bg-[#1A1A1A]/50' : 'bg-[#1A1A1A]/30'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    bleStatus.step === 'connecting' ? 'bg-[#00E5FF] text-black animate-pulse' :
                    ['detecting', 'testing', 'done'].includes(bleStatus.step) ? 'bg-emerald-500 text-white' : 'bg-[#2A2A2A] text-[#808080]'
                  }`}>
                    {['detecting', 'testing', 'done'].includes(bleStatus.step) ? '✓' : '2'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Connect via GATT</p>
                    <p className="text-xs text-[#808080]">
                      {bleStatus.step === 'connecting' ? 'Establishing connection...' :
                       ['detecting', 'testing', 'done'].includes(bleStatus.step) ? 'Connected' : 'Connect to device'}
                    </p>
                  </div>
                </div>

                {/* Step 3: Protocol Detection */}
                <div className={`flex items-center gap-3 p-3 rounded-lg ${
                  bleStatus.step === 'detecting' ? 'bg-[#1A1A1A] border border-[#00E5FF]/30' :
                  ['testing', 'done'].includes(bleStatus.step) ? 'bg-[#1A1A1A]/50' : 'bg-[#1A1A1A]/30'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    bleStatus.step === 'detecting' ? 'bg-[#00E5FF] text-black animate-pulse' :
                    ['testing', 'done'].includes(bleStatus.step) ? 'bg-emerald-500 text-white' : 'bg-[#2A2A2A] text-[#808080]'
                  }`}>
                    {['testing', 'done'].includes(bleStatus.step) ? '✓' : '3'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Detect Protocol</p>
                    <p className="text-xs text-[#808080]">
                      {bleStatus.step === 'detecting' ? 'Checking FTMS, CSC, FitShow, KSFit...' :
                       bleStatus.protocol === 'unknown' ? 'No standard protocol — proprietary device' :
                       bleStatus.protocol ? `Detected: ${bleStatus.protocol.toUpperCase()}` : 'Identify BLE protocol'}
                    </p>
                  </div>
                </div>

                {/* Step 4: Data Stream Test */}
                <div className={`flex items-center gap-3 p-3 rounded-lg ${
                  bleStatus.step === 'testing' ? 'bg-[#1A1A1A] border border-[#00E5FF]/30' :
                  bleStatus.step === 'done' ? 'bg-[#1A1A1A]/50' : 'bg-[#1A1A1A]/30'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    bleStatus.step === 'testing' ? 'bg-[#00E5FF] text-black animate-pulse' :
                    bleStatus.step === 'done' ? (bleStatus.dataReceived ? 'bg-emerald-500 text-white' : 'bg-yellow-500 text-black') : 'bg-[#2A2A2A] text-[#808080]'
                  }`}>
                    {bleStatus.step === 'done' ? (bleStatus.dataReceived ? '✓' : '!') : '4'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Verify Data Stream</p>
                    <p className="text-xs text-[#808080]">
                      {bleStatus.step === 'testing' ? 'Listening for data (3s)...' :
                       bleStatus.step === 'done' ? (bleStatus.dataReceived ? 'Data stream confirmed' : 'No data received — manual verification needed') :
                       'Confirm live data from device'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Error state */}
              {bleStatus.step === 'error' && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <p className="text-sm font-medium text-red-400">Registration Failed</p>
                  </div>
                  <p className="text-xs text-[#808080]">{bleStatus.error}</p>
                </div>
              )}

              {/* Success state */}
              {bleStatus.step === 'done' && (
                <div className={`${bleStatus.dataReceived ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-yellow-500/10 border-yellow-500/30'} border rounded-lg p-4`}>
                  <p className={`text-sm font-medium ${bleStatus.dataReceived ? 'text-emerald-400' : 'text-yellow-400'}`}>
                    {bleStatus.dataReceived ? '✓ Device registered & verified' : '⚠ Device registered (unverified)'}
                  </p>
                  <p className="text-xs text-[#808080] mt-1">
                    {bleStatus.deviceName} — {bleStatus.protocol === 'unknown' ? 'Proprietary Protocol' : bleStatus.protocol?.toUpperCase()}
                    {!bleStatus.dataReceived && ' — Start pedaling/walking to verify data stream'}
                  </p>
                  {bleStatus.protocol === 'unknown' && (
                    <p className="text-xs text-amber-400 mt-2">
                      ⚠ This device uses a proprietary BLE protocol. Workout tracking requires a custom parser in the mobile app.
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-3 pt-2">
                {bleStatus.step === 'error' && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setBleStatus({ step: 'idle' });
                        handleBLERegistration(bleRegistrationModal, false);
                      }}
                      className="flex-1 px-4 py-2 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
                    >
                      Retry (Standard)
                    </button>
                    <button
                      onClick={() => {
                        setBleStatus({ step: 'idle', scanAll: true });
                        handleBLERegistration(bleRegistrationModal, true);
                      }}
                      className="flex-1 px-4 py-2 bg-amber-500 text-black rounded-lg font-bold hover:bg-amber-400 transition-colors"
                    >
                      Scan All Devices
                    </button>
                  </div>
                )}
                {bleStatus.step === 'idle' && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setBleStatus({ step: 'idle' });
                        handleBLERegistration(bleRegistrationModal, false);
                      }}
                      className="flex-1 px-4 py-2 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
                    >
                      Standard Scan
                    </button>
                    <button
                      onClick={() => {
                        setBleStatus({ step: 'idle', scanAll: true });
                        handleBLERegistration(bleRegistrationModal, true);
                      }}
                      className="flex-1 px-4 py-2 bg-amber-500 text-black rounded-lg font-bold hover:bg-amber-400 transition-colors text-sm"
                    >
                      All Devices
                    </button>
                  </div>
                )}
                {(bleStatus.step === 'done' || bleStatus.step === 'error' || bleStatus.step === 'idle') && (
                  <button
                    onClick={() => {
                      setBleRegistrationModal(null);
                      setBleStatus({ step: 'idle' });
                    }}
                    className="w-full px-4 py-2 bg-[#1A1A1A] text-white rounded-lg hover:bg-[#2A2A2A] transition-colors"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
