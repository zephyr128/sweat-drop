'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import Link from 'next/link';
import { createMachine, deleteMachine, toggleMachineStatus, toggleMaintenance, updateMachine, pairSensorToMachine } from '@/lib/actions/machine-actions';
import { X, Trash2, Power, QrCode, Wrench, AlertTriangle, Edit2, Bluetooth, Save, Eye } from 'lucide-react';
import { UserRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase-client';
import { MachineQRPrint } from '@/components/MachineQRPrint';
import { QRCodeSVG } from 'qrcode.react';

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
  const [reportsMap, setReportsMap] = useState<Map<string, number>>(initialReports);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [maintenanceMachineId, setMaintenanceMachineId] = useState<string | null>(null);
  const [maintenanceNotes, setMaintenanceNotes] = useState('');
  const [editingMachineId, setEditingMachineId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingType, setEditingType] = useState<'treadmill' | 'bike'>('treadmill');
  const [pairingMachineId, setPairingMachineId] = useState<string | null>(null);
  const [isPairing, setIsPairing] = useState(false);
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

      const result = await createMachine(submitData);

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
    if (!confirm('Are you sure you want to delete this machine?')) return;

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

  const handlePairSensor = async (machineId: string) => {
    if (!('bluetooth' in navigator)) {
      toast.error('Web Bluetooth is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    setIsPairing(true);
    setPairingMachineId(machineId);

    try {
      // Request Bluetooth device with Cycling Speed and Cadence service (0x1816)
      // Magene Gemini 210 uses this service
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { services: [0x1816] }, // Cycling Speed and Cadence Service
        ],
        optionalServices: [
          'battery_service',
          'device_information',
          'generic_access',
        ],
      });

      // IMPORTANT: Show warning about Cadence mode before pairing
      const confirmCadenceMode = confirm(
        '⚠️ VAŽNO: Magene S3+ Sensor\n\n' +
        'Pre nego što nastavite, proverite da li je senzor u CADENCE MODU:\n\n' +
        '✅ Senzor mora biti u Cadence modu (CRVENO SVETLO)\n' +
        '✅ Ako je u Speed modu (plavo svetlo), pritisnite dugme na senzoru da prebacite u Cadence mod\n\n' +
        'Da li je senzor u Cadence modu (crveno svetlo)?'
      );

      if (!confirmCadenceMode) {
        toast.error('Pairing otkazan. Proverite da li je senzor u Cadence modu.');
        setIsPairing(false);
        setPairingMachineId(null);
        return;
      }

      toast.info('Connecting to sensor...');

      // Connect to GATT server
      const server = await device.gatt.connect();
      
      // Get device identifier
      // Use device.id (unique identifier) or device.name as sensor_id
      // device.id is typically a MAC address or unique identifier
      let sensorId = device.id;
      
      // If device.id is not available, try to get device name
      if (!sensorId) {
        try {
          const nameService = await server.getPrimaryService('generic_access');
          const nameCharacteristic = await nameService.getCharacteristic('gap.device_name');
          const nameValue = await nameCharacteristic.readValue();
          const decoder = new TextDecoder('utf-8');
          sensorId = decoder.decode(nameValue);
        } catch (e) {
          console.warn('Could not read device name:', e);
        }
      }

      // Fallback to device name or generate ID
      if (!sensorId) {
        sensorId = device.name || `MAGENE-S3+-${Date.now()}`;
      }

      toast.info(`Sensor found: ${sensorId}`);

      // Pair sensor to machine via server action
      const result = await pairSensorToMachine(machineId, sensorId);

      if (result.success) {
        // Refresh machines to get updated qr_uuid
        const { data: updatedMachine } = await supabase
          .from('machines')
          .select('*')
          .eq('id', machineId)
          .single();

        if (updatedMachine) {
          setMachines(
            machines.map((m) =>
              m.id === machineId
                ? { ...m, sensor_id: sensorId, sensor_paired_at: new Date().toISOString(), qr_uuid: updatedMachine.qr_uuid }
                : m
            )
          );
        } else {
          setMachines(
            machines.map((m) =>
              m.id === machineId
                ? { ...m, sensor_id: sensorId, sensor_paired_at: new Date().toISOString() }
                : m
            )
          );
        }
        toast.success('Sensor paired successfully');
      } else {
        toast.error(`Failed to pair sensor: ${result.error}`);
      }

      // Disconnect
      device.gatt.disconnect();
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        toast.error('No Bluetooth device selected or device not found');
      } else if (error.name === 'SecurityError') {
        toast.error('Bluetooth permission denied. Please allow Bluetooth access.');
      } else if (error.name === 'NetworkError') {
        toast.error('Failed to connect to device. Make sure the sensor is powered on and nearby.');
      } else {
        toast.error(`Bluetooth error: ${error.message}`);
      }
      console.error('Bluetooth pairing error:', error);
    } finally {
      setIsPairing(false);
      setPairingMachineId(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
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
                          <div className="mt-2 text-xs text-[#808080]">
                            Sensor: <span className="text-[#00E5FF]">{machine.sensor_id}</span>
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
                                    onClick={() => handlePairSensor(machine.id)}
                                    disabled={isPairing && pairingMachineId === machine.id}
                                    className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors disabled:opacity-50"
                                    title={machine.sensor_id ? 'Re-pair sensor' : 'Pair BLE sensor'}
                                  >
                                    <Bluetooth
                                      className={`w-4 h-4 ${
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

              <div className="flex justify-center bg-white p-4 rounded-lg">
                <QRCodeSVG
                  value={`sweatdrop://machine/${selectedMachineForQR.qr_uuid}`}
                  size={256}
                  level="H"
                  includeMargin={true}
                  bgColor="#FFFFFF"
                  fgColor="#000000"
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
                        navigator.clipboard.writeText(`sweatdrop://machine/${selectedMachineForQR.qr_uuid}`);
                        toast.success('QR URL copied to clipboard');
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
                        navigator.clipboard.writeText(selectedMachineForQR.qr_uuid);
                        toast.success('QR UUID copied to clipboard');
                      }}
                      className="p-2 text-[#808080] hover:text-[#00E5FF] transition-colors"
                      title="Copy UUID"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                {isSuperAdmin && (
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
    </div>
  );
}
