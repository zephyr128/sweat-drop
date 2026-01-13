'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { createMachine, deleteMachine, toggleMachineStatus, toggleMaintenance } from '@/lib/actions/machine-actions';
import { X, Trash2, Power, QrCode, Wrench, AlertTriangle } from 'lucide-react';

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
  is_active: boolean;
  is_under_maintenance?: boolean;
  maintenance_notes?: string;
  created_at: string;
  updated_at: string;
}

interface MachinesManagerProps {
  gymId: string;
  initialMachines: Machine[];
  initialReports?: Map<string, number>;
}

export function MachinesManager({ gymId, initialMachines, initialReports = new Map() }: MachinesManagerProps) {
  const [machines, setMachines] = useState<Machine[]>(initialMachines);
  const [reportsMap, setReportsMap] = useState<Map<string, number>>(initialReports);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [maintenanceMachineId, setMaintenanceMachineId] = useState<string | null>(null);
  const [maintenanceNotes, setMaintenanceNotes] = useState('');

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
      const submitData: any = {
        ...data,
        gymId,
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
      const result = await deleteMachine(machineId, gymId);
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
      const result = await toggleMachineStatus(machineId, gymId, !currentStatus);
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
      const result = await toggleMaintenance(
        machineId,
        gymId,
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

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
        >
          + Add Machine
        </button>
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
                  <td colSpan={6} className="px-6 py-12 text-center text-[#808080]">
                    No machines yet. Create your first machine!
                  </td>
                </tr>
              ) : (
                machines.map((machine) => {
                  const reportCount = reportsMap.get(machine.id) || 0;
                  return (
                    <tr key={machine.id} className="hover:bg-[#1A1A1A]/50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="text-white font-medium">{machine.name}</div>
                          {reportCount > 0 && (
                            <div className="flex items-center gap-1" title={`${reportCount} pending report(s)`}>
                              <AlertTriangle className="w-4 h-4 text-[#FF6B6B]" />
                              <span className="text-xs text-[#FF6B6B]">{reportCount}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#FF9100]/10 text-[#FF9100]">
                          {machine.type === 'treadmill' ? '🏃 Treadmill' : '🚴 Bike'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <code className="text-sm text-[#00E5FF] font-mono bg-[#1A1A1A] px-2 py-1 rounded">
                            {machine.unique_qr_code}
                          </code>
                          <button
                            onClick={() => copyQRCode(machine.unique_qr_code)}
                            className="p-1 text-[#808080] hover:text-[#00E5FF] transition-colors"
                            title="Copy QR code"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            machine.is_active
                              ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                              : 'bg-[#808080]/10 text-[#808080]'
                          }`}
                        >
                          {machine.is_active ? 'Active' : 'Inactive'}
                        </span>
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
                          <button
                            onClick={() => handleDelete(machine.id)}
                            disabled={deletingId === machine.id}
                            className="p-2 text-[#808080] hover:text-[#FF5252] transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
    </div>
  );
}
