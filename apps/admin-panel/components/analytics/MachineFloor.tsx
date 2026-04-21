'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import { getLiveMachineStatus } from '@/lib/actions/machine-analytics-actions';
import type { LiveMachineData, LiveMachine } from '@/lib/actions/machine-analytics-actions';
import {
  createMachine,
  deleteMachine,
  toggleMachineStatus,
  toggleMaintenance,
  updateMachine,
  registerBLEDevice,
  getMachineQRMap,
} from '@/lib/actions/machine-actions';
import {
  getGymDemoMachines,
  toggleDemoMachine,
  type DemoMachineRow,
} from '@/lib/actions/demo-machines';
import { StatusSummaryBar } from './StatusSummaryBar';
import type { MachineCardAction } from './MachineGrid';
import { MachineFloorGrid } from './MachineFloorGrid';
import { ActiveWorkoutsList } from './ActiveWorkoutsList';
import { MachineQRPrint } from '@/components/MachineQRPrint';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { UserRole } from '@/lib/auth';
import { BrandedQRCode } from '@/components/ui/BrandedQRCode';
import {
  X,
  BarChart3,
  Bluetooth,
  AlertTriangle,
  QrCode,
  Save,
  Printer,
} from 'lucide-react';

const POLL_INTERVAL = 15_000;

const machineSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['treadmill', 'bike']),
  uniqueQrCode: z.string().optional(),
});
type MachineFormData = z.infer<typeof machineSchema>;

interface MachineFloorProps {
  gymId: string;
  userRole: UserRole;
}

const BLE_SERVICES = {
  FTMS: 0x1826,
  CSC: 0x1816,
  RSC: 0x1814,
  HEART_RATE: 0x180d,
};

export function MachineFloor({ gymId, userRole }: MachineFloorProps) {
  // --- Live monitor state ---
  const [data, setData] = useState<LiveMachineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [tick, setTick] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const tickRef = useRef<ReturnType<typeof setInterval>>();

  // --- Management state ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [maintenanceMachineId, setMaintenanceMachineId] = useState<string | null>(null);
  const [maintenanceNotes, setMaintenanceNotes] = useState('');
  const [editingMachineId, setEditingMachineId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingType, setEditingType] = useState<'treadmill' | 'bike'>('treadmill');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedMachineForQR, setSelectedMachineForQR] = useState<LiveMachine | null>(null);
  const [bleRegistrationModal, setBleRegistrationModal] = useState<string | null>(null);
  const [bleStatus, setBleStatus] = useState<{
    step: 'idle' | 'scanning' | 'connecting' | 'detecting' | 'testing' | 'done' | 'error';
    deviceName?: string;
    protocol?: 'ftms' | 'fitshow' | 'magene' | 'ksfit' | 'unknown';
    dataReceived?: boolean;
    error?: string;
    scanAll?: boolean;
  }>({ step: 'idle' });
  const [isPairing, setIsPairing] = useState(false);
  const [qrMap, setQrMap] = useState<Record<string, { qr_uuid: string | null; unique_qr_code: string }>>({});
  const [demoMachines, setDemoMachines] = useState<DemoMachineRow[]>([]);
  const [updatingDemoMachineId, setUpdatingDemoMachineId] = useState<string | null>(null);

  const isSuperAdmin = userRole === 'superadmin';
  const canCreateMachines = isSuperAdmin;
  const canEditMachines = userRole === 'gym_owner' || userRole === 'gym_admin' || isSuperAdmin;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors: formErrors, isSubmitting },
  } = useForm<MachineFormData>({
    resolver: zodResolver(machineSchema),
    defaultValues: { type: 'treadmill' },
  });

  // --- Load QR map (qr_uuid for each machine) ---
  const fetchQRMap = useCallback(async () => {
    const map = await getMachineQRMap(gymId);
    setQrMap(map);
  }, [gymId]);

  const fetchDemoMachines = useCallback(async () => {
    if (!isSuperAdmin) return;
    const result = await getGymDemoMachines(gymId);
    if (result.success && result.data) {
      setDemoMachines(result.data);
      return;
    }
    toast.error(result.error || 'Failed to load demo machine settings');
  }, [gymId, isSuperAdmin]);

  // --- Live monitor logic ---
  const fetchData = useCallback(async () => {
    const result = await getLiveMachineStatus(gymId);
    if (result.success && result.data) {
      setData(result.data);
      setFetchedAt(Date.now());
      setError(null);
    } else {
      setError(result.error || 'Failed to load live status');
    }
    setLoading(false);
  }, [gymId]);

  useEffect(() => { fetchData(); fetchQRMap(); fetchDemoMachines(); }, [fetchData, fetchQRMap, fetchDemoMachines]);

  useEffect(() => {
    tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  useEffect(() => {
    pollRef.current = setInterval(() => {
      getLiveMachineStatus(gymId).then((result) => {
        if (result.success && result.data) {
          setData(result.data);
          setFetchedAt(Date.now());
          setError(null);
        }
      });
    }, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [gymId]);

  useEffect(() => {
    const machineChannel = supabase
      .channel(`machines-live-${gymId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'machines',
        filter: `gym_id=eq.${gymId}`,
      }, (payload) => {
        const updated = payload.new as Record<string, unknown>;
        setData((prev) => {
          if (!prev) return prev;
          const machines = prev.machines.map((m) => {
            if (m.id !== updated.id) return m;
            return {
              ...m,
              is_busy: updated.is_busy as boolean,
              is_active: updated.is_active as boolean,
              is_under_maintenance: (updated.is_under_maintenance ?? false) as boolean,
              last_heartbeat: (updated.last_heartbeat as string) || null,
              last_rpm: (updated.last_rpm as number) || null,
            } satisfies LiveMachine;
          });
          const summary = {
            total_machines: machines.length,
            active_now: machines.filter((m) => m.is_busy).length,
            available: machines.filter((m) => !m.is_busy && m.is_active && !m.is_under_maintenance).length,
            maintenance: machines.filter((m) => m.is_under_maintenance).length,
            inactive: machines.filter((m) => !m.is_active).length,
          };
          return { ...prev, machines, summary };
        });
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    const sessionChannel = supabase
      .channel(`sessions-live-${gymId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sessions',
        filter: `gym_id=eq.${gymId}`,
      }, () => {
        getLiveMachineStatus(gymId).then((result) => {
          if (result.success && result.data) {
            setData(result.data);
            setFetchedAt(Date.now());
          }
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(machineChannel);
      supabase.removeChannel(sessionChannel);
    };
  }, [gymId]);

  // --- Management handlers ---
  const onSubmit = async (formData: MachineFormData) => {
    try {
      const result = await createMachine({ ...formData, gymId }) as {
        success: boolean; data?: any; error?: string;
      };
      if (result.success) {
        toast.success('Machine created successfully');
        reset();
        setIsModalOpen(false);
        fetchData();
        fetchQRMap();
      } else {
        toast.error(`Failed to create machine: ${result.error}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  };

  const handleDelete = async (machineId: string) => {
    if (!(await confirmAction({ title: 'Delete Machine', message: 'Are you sure you want to delete this machine? This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' }))) return;
    try {
      const result = await deleteMachine(machineId, gymId);
      if (result.success) {
        toast.success('Machine deleted');
        fetchData();
      } else {
        toast.error(`Failed to delete: ${result.error}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  };

  const handleToggleStatus = async (machineId: string) => {
    const machine = data?.machines.find((m) => m.id === machineId);
    if (!machine) return;
    try {
      const result = await toggleMachineStatus(machineId, gymId, !machine.is_active);
      if (result.success) {
        toast.success(`Machine ${!machine.is_active ? 'activated' : 'deactivated'}`);
        fetchData();
      } else {
        toast.error(`Failed: ${result.error}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  };

  const handleToggleMaintenance = async (machineId: string) => {
    const machine = data?.machines.find((m) => m.id === machineId);
    if (!machine) return;
    try {
      const result = await toggleMaintenance(
        machineId,
        gymId,
        !machine.is_under_maintenance,
        maintenanceNotes || undefined,
      );
      if (result.success) {
        toast.success(
          `Machine ${!machine.is_under_maintenance ? 'marked as under maintenance' : 'removed from maintenance'}`,
        );
        setMaintenanceMachineId(null);
        setMaintenanceNotes('');
        fetchData();
      } else {
        toast.error(`Failed: ${result.error}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  };

  const handleSaveEdit = async (machineId: string) => {
    try {
      const result = await updateMachine(machineId, gymId, {
        name: editingName,
        type: editingType,
      });
      if (result.success) {
        toast.success('Machine updated');
        setEditingMachineId(null);
        fetchData();
      } else {
        toast.error(`Failed: ${result.error}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  };

  const handleBLERegistration = async (machineId: string, scanAll = false) => {
    if (!('bluetooth' in navigator)) {
      toast.error('Web Bluetooth is not supported. Use Chrome or Edge.');
      return;
    }

    setBleRegistrationModal(machineId);
    setBleStatus({ step: 'scanning', scanAll });
    setIsPairing(true);

    try {
      const requestOptions: any = scanAll
        ? {
            acceptAllDevices: true,
            optionalServices: ['battery_service', 'device_information', 'generic_access', BLE_SERVICES.FTMS, BLE_SERVICES.CSC, BLE_SERVICES.RSC, BLE_SERVICES.HEART_RATE],
          }
        : {
            filters: [
              { services: [BLE_SERVICES.FTMS] },
              { services: [BLE_SERVICES.CSC] },
              { services: [BLE_SERVICES.RSC] },
            ],
            optionalServices: ['battery_service', 'device_information', 'generic_access', BLE_SERVICES.FTMS, BLE_SERVICES.CSC, BLE_SERVICES.RSC],
          };

      const device = await (navigator as any).bluetooth.requestDevice(requestOptions);
      const bleDeviceId = device.id || `BLE-${Date.now()}`;
      const deviceName = device.name || device.id || 'Unknown Device';
      setBleStatus({ step: 'connecting', deviceName });

      const server = await device.gatt.connect();
      setBleStatus({ step: 'detecting', deviceName });

      let detectedProtocol: 'ftms' | 'fitshow' | 'magene' | 'ksfit' | 'unknown' = scanAll ? 'unknown' : 'magene';
      let dataReceived = false;

      try {
        const ftmsService = await server.getPrimaryService(BLE_SERVICES.FTMS);
        if (ftmsService) {
          detectedProtocol = 'ftms';
          setBleStatus({ step: 'testing', deviceName, protocol: 'ftms' });
          try {
            const chars = await ftmsService.getCharacteristics();
            if (chars.length > 0) {
              for (const char of chars) {
                try {
                  if (char.properties.notify) {
                    await char.startNotifications();
                    await new Promise<void>((resolve) => {
                      const handler = () => { dataReceived = true; char.removeEventListener('characteristicvaluechanged', handler); resolve(); };
                      char.addEventListener('characteristicvaluechanged', handler);
                      setTimeout(() => { char.removeEventListener('characteristicvaluechanged', handler); resolve(); }, 3000);
                    });
                    if (dataReceived) break;
                  }
                } catch { /* continue */ }
              }
            }
          } catch { /* FTMS data read failed */ }
        }
      } catch { /* FTMS not available */ }

      if (detectedProtocol !== 'ftms') {
        try {
          const cscService = await server.getPrimaryService(BLE_SERVICES.CSC);
          if (cscService) {
            detectedProtocol = 'magene';
            setBleStatus({ step: 'testing', deviceName, protocol: 'magene' });
            try {
              const measurement = await cscService.getCharacteristic(0x2a5b);
              if (measurement.properties.notify) {
                await measurement.startNotifications();
                await new Promise<void>((resolve) => {
                  const handler = () => { dataReceived = true; measurement.removeEventListener('characteristicvaluechanged', handler); resolve(); };
                  measurement.addEventListener('characteristicvaluechanged', handler);
                  setTimeout(() => { measurement.removeEventListener('characteristicvaluechanged', handler); resolve(); }, 3000);
                });
              }
            } catch { /* CSC data read failed */ }
          }
        } catch { /* CSC not available */ }
      }

      const nameLower = deviceName.toLowerCase();
      if (detectedProtocol === 'unknown' || detectedProtocol === 'magene') {
        if (nameLower.includes('fitshow') || nameLower.includes('fs-')) detectedProtocol = 'fitshow';
        else if (nameLower.includes('ksfit') || nameLower.includes('ks-')) detectedProtocol = 'ksfit';
        else if (nameLower.includes('magene') || nameLower.includes('csc')) detectedProtocol = 'magene';
      }

      setBleStatus({ step: 'done', deviceName, protocol: detectedProtocol, dataReceived });

      const result = await registerBLEDevice(machineId, bleDeviceId, detectedProtocol, dataReceived);
      if (result.success) {
        const protoLabel = detectedProtocol === 'unknown' ? 'Proprietary' : detectedProtocol.toUpperCase();
        toast.success(`BLE device registered: ${deviceName} (${protoLabel})${dataReceived ? ' ✓ Data confirmed' : ''}`);
        fetchData();
      } else {
        toast.error(`Failed to save: ${result.error}`);
      }

      device.gatt.disconnect();
    } catch (err: any) {
      const errorMsg =
        err.name === 'NotFoundError' ? 'No device selected' :
        err.name === 'SecurityError' ? 'Bluetooth permission denied' :
        err.name === 'NetworkError' ? 'Connection failed — ensure device is powered on' :
        err.message;
      setBleStatus({ step: 'error', error: errorMsg });
      toast.error(errorMsg);
    } finally {
      setIsPairing(false);
    }
  };

  // --- Action dispatcher from card menus ---
  const handleCardAction = useCallback((action: MachineCardAction) => {
    const machine = data?.machines.find((m) => m.id === action.machineId);
    if (!machine) return;

    switch (action.type) {
      case 'edit':
        setEditingMachineId(machine.id);
        setEditingName(machine.name);
        setEditingType((machine.type as 'treadmill' | 'bike') || 'treadmill');
        break;
      case 'maintenance':
        setMaintenanceMachineId(machine.id);
        setMaintenanceNotes('');
        break;
      case 'qr':
        setSelectedMachineForQR(machine);
        setQrModalOpen(true);
        break;
      case 'toggle_status':
        handleToggleStatus(machine.id);
        break;
      case 'delete':
        handleDelete(machine.id);
        break;
      case 'ble':
        handleBLERegistration(machine.id);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const handleToggleDemoMachine = async (machine: DemoMachineRow) => {
    const shouldEnable = !machine.is_demo_machine;
    const confirmed = await confirmAction({
      title: shouldEnable ? 'Enable Demo Machine' : 'Disable Demo Machine',
      message: shouldEnable
        ? 'Mark this machine as a demo machine? Apple/Google reviewers and internal QA will be able to start simulator workouts attached to this machine. Real members can still scan it normally.'
        : 'Stop exposing this machine to demo simulators?',
      confirmLabel: shouldEnable ? 'Enable Demo' : 'Disable Demo',
      variant: shouldEnable ? 'default' : 'danger',
    });
    if (!confirmed) return;

    setUpdatingDemoMachineId(machine.id);
    try {
      const result = await toggleDemoMachine({
        machine_id: machine.id,
        is_demo_machine: shouldEnable,
      });
      if (!result.success) {
        toast.error(result.error || 'Failed to update demo machine flag');
        return;
      }
      toast.success(
        shouldEnable
          ? `${machine.name} marked as demo machine`
          : `${machine.name} removed from demo machines`,
      );
      await fetchDemoMachines();
    } finally {
      setUpdatingDemoMachineId(null);
    }
  };

  // --- Render ---
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl h-28" />
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl h-64" />
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl h-48" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const currentEditingMachine = data.machines.find((m) => m.id === editingMachineId);
  const currentMaintenanceMachine = data.machines.find((m) => m.id === maintenanceMachineId);

  return (
    <div className="space-y-4">
      {/* Top actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {canCreateMachines ? (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-5 py-2.5 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors text-sm"
            >
              + Add Machine
            </button>
          ) : (
            <div className="px-4 py-2.5 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-[#808080]">
              <p className="text-xs">
                To add machines, contact{' '}
                <span className="text-[#00E5FF]">SweatDrop Support</span>
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 self-start">
          {canEditMachines && (
            <Link
              href={`/print-qr/batch?gymId=${gymId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-[#1A1A1A] border border-[#2A2A2A] text-[#808080] hover:text-white hover:border-[#00E5FF]/50 rounded-lg font-medium transition-colors inline-flex items-center gap-2 text-sm"
              title="Batch print all machine stickers + a paper install manifest"
            >
              <Printer className="w-4 h-4" />
              Print Kit
            </Link>
          )}
          <Link
            href={`/dashboard/gym/${gymId}/machines/analytics`}
            className="px-4 py-2.5 bg-[#1A1A1A] border border-[#2A2A2A] text-[#808080] hover:text-white hover:border-[#00E5FF]/50 rounded-lg font-medium transition-colors inline-flex items-center gap-2 text-sm"
          >
            <BarChart3 className="w-4 h-4" />
            Analytics
          </Link>
        </div>
      </div>

      <StatusSummaryBar summary={data.summary} isConnected={isConnected} />

      {isSuperAdmin && (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1A1A1A]">
            <h3 className="text-sm font-semibold text-white">Demo Machine Access</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Reviewer and internal QA simulator mapping. Real users still scan machines normally.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-[#121212]">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wide text-zinc-500">Machine</th>
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wide text-zinc-500">Type</th>
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wide text-zinc-500">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wide text-zinc-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]">
                {demoMachines.map((machine) => {
                  const isUpdating = updatingDemoMachineId === machine.id;
                  return (
                    <tr key={machine.id} className="hover:bg-[#111111] transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white">{machine.name}</span>
                          {machine.is_demo_machine && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/40">
                              DEMO
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-zinc-400">{machine.type}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold border ${
                            machine.is_demo_machine
                              ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                              : 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30'
                          }`}
                        >
                          {machine.is_demo_machine ? 'Demo enabled' : 'Regular machine'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => handleToggleDemoMachine(machine)}
                          disabled={isUpdating}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                            machine.is_demo_machine
                              ? 'bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25'
                              : 'bg-[#00E5FF]/15 text-[#00E5FF] border-[#00E5FF]/30 hover:bg-[#00E5FF]/25'
                          }`}
                        >
                          {isUpdating
                            ? 'Saving...'
                            : machine.is_demo_machine
                              ? 'Disable demo'
                              : 'Enable demo'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {demoMachines.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-zinc-500">
                      No machines available for this gym.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <MachineFloorGrid
        gymId={gymId}
        userRole={userRole}
        liveMachines={data.machines}
        fetchedAt={fetchedAt}
        tick={tick}
      />

      <ActiveWorkoutsList machines={data.machines} fetchedAt={fetchedAt} tick={tick} />

      {/* ---- MODALS ---- */}

      {/* Add Machine Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Add New Machine</h2>
              <button onClick={() => { setIsModalOpen(false); reset(); }} className="text-[#808080] hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Machine Name *</label>
                <input
                  {...register('name')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  placeholder="E.g., Treadmill #1, Bike Station A"
                />
                {formErrors.name && <p className="mt-1 text-sm text-[#FF5252]">{formErrors.name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-2">Machine Type *</label>
                <select
                  {...register('type')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                >
                  <option value="treadmill">🏃 Treadmill</option>
                  <option value="bike">🚴 Bike</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-2">QR Code (Optional)</label>
                <input
                  {...register('uniqueQrCode')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  placeholder="Leave empty to auto-generate"
                />
                <p className="mt-1 text-xs text-[#808080]">If left empty, a unique QR code will be automatically generated</p>
              </div>
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Machine'}
                </button>
                <button type="button" onClick={() => { setIsModalOpen(false); reset(); }} className="px-6 py-3 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Machine Modal */}
      {editingMachineId && currentEditingMachine && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Edit Machine</h2>
              <button onClick={() => setEditingMachineId(null)} className="text-[#808080] hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Machine Name</label>
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-2">Machine Type</label>
                <select
                  value={editingType}
                  onChange={(e) => setEditingType(e.target.value as 'treadmill' | 'bike')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                >
                  <option value="treadmill">🏃 Treadmill</option>
                  <option value="bike">🚴 Bike</option>
                </select>
              </div>
              <div className="flex gap-4 pt-2">
                <button
                  onClick={() => handleSaveEdit(editingMachineId)}
                  className="flex-1 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors inline-flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
                <button onClick={() => setEditingMachineId(null)} className="px-6 py-3 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance Modal */}
      {maintenanceMachineId && currentMaintenanceMachine && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">
                {currentMaintenanceMachine.is_under_maintenance ? 'Remove from Maintenance' : 'Mark as Under Maintenance'}
              </h2>
              <button onClick={() => { setMaintenanceMachineId(null); setMaintenanceNotes(''); }} className="text-[#808080] hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-[#808080]">Machine: <span className="text-white">{currentMaintenanceMachine.name}</span></p>
              <div>
                <label className="block text-sm font-medium text-white mb-2">Maintenance Notes (Optional)</label>
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
                  onClick={() => handleToggleMaintenance(maintenanceMachineId)}
                  className="flex-1 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
                >
                  {currentMaintenanceMachine.is_under_maintenance ? 'Remove from Maintenance' : 'Mark as Under Maintenance'}
                </button>
                <button onClick={() => { setMaintenanceMachineId(null); setMaintenanceNotes(''); }} className="px-6 py-3 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrModalOpen && selectedMachineForQR && (() => {
        const qrData = qrMap[selectedMachineForQR.id];
        const qrUuid = qrData?.qr_uuid || qrData?.unique_qr_code || selectedMachineForQR.id;
        const machineCode = qrData?.unique_qr_code || qrUuid;
        const qrUrl = `sweatdrop://machine/${qrUuid}`;
        return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">QR Code</h3>
                <button onClick={() => { setQrModalOpen(false); setSelectedMachineForQR(null); }} className="text-[#808080] hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="space-y-4">
                <p className="text-sm text-[#808080]">
                  Machine: <span className="text-white">{selectedMachineForQR.name}</span>
                </p>

                <div>
                  <label className="text-xs text-[#808080] block mb-1">Machine Code</label>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-[#00E5FF] font-mono bg-[#1A1A1A] px-3 py-2 rounded flex-1 break-all">
                      {machineCode}
                    </code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(machineCode); toast.success('Machine code copied'); }}
                      className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex justify-center bg-white p-4 rounded-lg">
                  <BrandedQRCode value={qrUrl} size={256} />
                </div>

                <div>
                  <label className="text-xs text-[#808080] block mb-1">QR URL</label>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-[#00E5FF] font-mono bg-[#1A1A1A] px-3 py-2 rounded flex-1 break-all">
                      {qrUrl}
                    </code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(qrUrl); toast.success('QR URL copied'); }}
                      className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {qrUuid !== selectedMachineForQR.id && (
                  <div>
                    <label className="text-xs text-[#808080] block mb-1">QR UUID</label>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-[#808080] font-mono bg-[#1A1A1A] px-3 py-2 rounded flex-1 break-all">
                        {qrUuid}
                      </code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(qrUuid); toast.success('QR UUID copied'); }}
                        className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  {isSuperAdmin && (
                    <MachineQRPrint
                      machineName={selectedMachineForQR.name}
                      qrUuid={qrUuid}
                      machineType={(selectedMachineForQR.type as 'treadmill' | 'bike') || 'treadmill'}
                    />
                  )}
                  <button
                    onClick={() => { setQrModalOpen(false); setSelectedMachineForQR(null); }}
                    className="flex-1 px-4 py-2 bg-[#1A1A1A] text-white rounded-lg hover:bg-[#2A2A2A] transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* BLE Registration Modal */}
      {bleRegistrationModal && (
        <BLERegistrationModal
          machineId={bleRegistrationModal}
          machineName={data.machines.find((m) => m.id === bleRegistrationModal)?.name || 'Unknown'}
          bleStatus={bleStatus}
          onClose={() => { setBleRegistrationModal(null); setBleStatus({ step: 'idle' }); }}
          onRetry={(scanAll) => handleBLERegistration(bleRegistrationModal, scanAll)}
        />
      )}
    </div>
  );
}

// Extracted BLE modal for readability
function BLERegistrationModal({
  machineId,
  machineName,
  bleStatus,
  onClose,
  onRetry,
}: {
  machineId: string;
  machineName: string;
  bleStatus: {
    step: string;
    deviceName?: string;
    protocol?: string;
    dataReceived?: boolean;
    error?: string;
    scanAll?: boolean;
  };
  onClose: () => void;
  onRetry: (scanAll: boolean) => void;
}) {
  const canClose = ['done', 'error', 'idle'].includes(bleStatus.step);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Bluetooth className="w-5 h-5 text-[#00E5FF]" />
            BLE Device Registration
          </h3>
          {canClose && (
            <button onClick={onClose} className="text-[#808080] hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
          )}
        </div>

        <div className="space-y-4">
          <p className="text-sm text-[#808080]">Machine: {machineName}</p>

          {bleStatus.scanAll && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-400 font-medium">All Devices Mode — showing all nearby BLE devices</p>
            </div>
          )}

          <div className="space-y-3">
            {[
              { key: 'scanning', next: ['connecting', 'detecting', 'testing', 'done'], label: 'Scan for Device', sub: bleStatus.step === 'scanning' ? 'Waiting for device selection...' : bleStatus.deviceName ? `Found: ${bleStatus.deviceName}` : 'Select a nearby BLE device' },
              { key: 'connecting', next: ['detecting', 'testing', 'done'], label: 'Connect via GATT', sub: bleStatus.step === 'connecting' ? 'Establishing connection...' : ['detecting', 'testing', 'done'].includes(bleStatus.step) ? 'Connected' : 'Connect to device' },
              { key: 'detecting', next: ['testing', 'done'], label: 'Detect Protocol', sub: bleStatus.step === 'detecting' ? 'Checking FTMS, CSC, FitShow, KSFit...' : bleStatus.protocol === 'unknown' ? 'No standard protocol — proprietary' : bleStatus.protocol ? `Detected: ${bleStatus.protocol.toUpperCase()}` : 'Identify BLE protocol' },
              { key: 'testing', next: ['done'], label: 'Verify Data Stream', sub: bleStatus.step === 'testing' ? 'Listening for data (3s)...' : bleStatus.step === 'done' ? (bleStatus.dataReceived ? 'Data stream confirmed' : 'No data received — manual verification needed') : 'Confirm live data from device' },
            ].map((s, i) => {
              const isActive = bleStatus.step === s.key;
              const isDone = s.next.includes(bleStatus.step) || (bleStatus.step === 'done' && s.key === 'testing');
              return (
                <div key={s.key} className={`flex items-center gap-3 p-3 rounded-lg ${isActive ? 'bg-[#1A1A1A] border border-[#00E5FF]/30' : isDone ? 'bg-[#1A1A1A]/50' : 'bg-[#1A1A1A]/30'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isActive ? 'bg-[#00E5FF] text-black animate-pulse' : isDone ? 'bg-emerald-500 text-white' : 'bg-[#2A2A2A] text-[#808080]'}`}>
                    {isDone ? '✓' : i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{s.label}</p>
                    <p className="text-xs text-[#808080]">{s.sub}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {bleStatus.step === 'error' && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <p className="text-sm font-medium text-red-400">Registration Failed</p>
              </div>
              <p className="text-xs text-[#808080]">{bleStatus.error}</p>
            </div>
          )}

          {bleStatus.step === 'done' && (
            <div className={`${bleStatus.dataReceived ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-yellow-500/10 border-yellow-500/30'} border rounded-lg p-4`}>
              <p className={`text-sm font-medium ${bleStatus.dataReceived ? 'text-emerald-400' : 'text-yellow-400'}`}>
                {bleStatus.dataReceived ? '✓ Device registered & verified' : '⚠ Device registered (unverified)'}
              </p>
              <p className="text-xs text-[#808080] mt-1">
                {bleStatus.deviceName} — {bleStatus.protocol === 'unknown' ? 'Proprietary Protocol' : bleStatus.protocol?.toUpperCase()}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2">
            {(bleStatus.step === 'error' || bleStatus.step === 'idle') && (
              <div className="flex gap-3">
                <button onClick={() => onRetry(false)} className="flex-1 px-4 py-2 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors">
                  {bleStatus.step === 'error' ? 'Retry (Standard)' : 'Standard Scan'}
                </button>
                <button onClick={() => onRetry(true)} className="flex-1 px-4 py-2 bg-amber-500 text-black rounded-lg font-bold hover:bg-amber-400 transition-colors text-sm">
                  {bleStatus.step === 'error' ? 'Scan All Devices' : 'All Devices'}
                </button>
              </div>
            )}
            {canClose && (
              <button onClick={onClose} className="w-full px-4 py-2 bg-[#1A1A1A] text-white rounded-lg hover:bg-[#2A2A2A] transition-colors">
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
