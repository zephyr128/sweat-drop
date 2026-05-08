'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check, ChevronRight, AlertTriangle, Edit2, Save, X, Bluetooth } from 'lucide-react';
import { setBleDeviceNameManual } from '@/lib/actions/machine-actions';

export interface MachineForBackfill {
  id: string;
  name: string;
  gym_id: string;
  gym_name: string;
  sensor_id: string | null;
  sensor_paired_at: string | null;
  ble_device_name: string | null;
  ble_serial_number: string | null;
  ble_pairing_verified: boolean;
}

interface BleIdentityBackfillManagerProps {
  machines: MachineForBackfill[];
}

export function BleIdentityBackfillManager({ machines: initialMachines }: BleIdentityBackfillManagerProps) {
  const [machines, setMachines] = useState<MachineForBackfill[]>(initialMachines);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const verified = machines.filter(m => m.ble_pairing_verified);
  const nameOnly = machines.filter(m => m.ble_device_name && !m.ble_pairing_verified);
  const pending = machines.filter(m => !m.ble_device_name);

  const handleStartEdit = (machine: MachineForBackfill) => {
    setEditingId(machine.id);
    setEditingName(machine.ble_device_name ?? '');
  };

  const handleSave = async (machineId: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      toast.error('BLE device name cannot be empty');
      return;
    }

    setSavingId(machineId);
    try {
      const result = await setBleDeviceNameManual(machineId, trimmed);
      if (result.success) {
        setMachines(prev =>
          prev.map(m =>
            m.id === machineId
              ? { ...m, ble_device_name: trimmed }
              : m
          )
        );
        toast.success(`BLE Device Name set: ${trimmed}`);
        setEditingId(null);
        setEditingName('');
      } else {
        toast.error(result.error ?? 'Failed to save');
      }
    } catch {
      toast.error('Unexpected error');
    } finally {
      setSavingId(null);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditingName('');
  };

  return (
    <div className="space-y-6">
      {/* Status Tile */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-4">BLE Identity Migration Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-white">{machines.length}</p>
            <p className="text-xs text-zinc-500 mt-1">Total machines</p>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{verified.length}</p>
            <p className="text-xs text-zinc-500 mt-1">Verified ✓</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">Name + serial cached</p>
          </div>
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-yellow-400">{nameOnly.length}</p>
            <p className="text-xs text-zinc-500 mt-1">Name only</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">Serial pending first workout</p>
          </div>
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-red-400">{pending.length}</p>
            <p className="text-xs text-zinc-500 mt-1">Pending ⚠</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">No BLE name yet</p>
          </div>
        </div>

        {pending.length === 0 && (
          <div className="mt-4 flex items-center gap-2 text-emerald-400 text-sm">
            <Check className="w-4 h-4" />
            All machines have BLE Device Names — migration complete.
          </div>
        )}
      </div>

      {/* Pending machines (ble_device_name IS NULL) */}
      {pending.length > 0 && (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#1A1A1A] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <h2 className="text-base font-semibold text-white">
              Pending Machines ({pending.length})
            </h2>
            <span className="text-xs text-zinc-500">— will self-heal on first workout via auto-cache</span>
          </div>
          <div className="divide-y divide-[#1A1A1A]">
            {pending.map(machine => (
              <div key={machine.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/super/machines/${machine.id}`}
                        className="text-white font-medium hover:text-[#00E5FF] transition-colors flex items-center gap-1"
                      >
                        {machine.name}
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                      </Link>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{machine.gym_name}</p>
                    {machine.sensor_id ? (
                      <p className="text-[10px] text-zinc-600 mt-1 font-mono" title="Legacy Web Bluetooth device.id">
                        Legacy sensor: {machine.sensor_id.length > 24 ? `${machine.sensor_id.slice(0, 20)}…` : machine.sensor_id}
                      </p>
                    ) : (
                      <p className="text-[10px] text-zinc-600 mt-1">No BLE pairing on file</p>
                    )}
                    {machine.sensor_paired_at && (
                      <p className="text-[10px] text-zinc-600">
                        Last paired: {new Date(machine.sensor_paired_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <div className="flex-shrink-0">
                    {editingId === machine.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSave(machine.id);
                            if (e.key === 'Escape') handleCancel();
                          }}
                          placeholder="e.g. 38069-129"
                          className="px-3 py-1.5 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none w-44 font-mono"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSave(machine.id)}
                          disabled={savingId === machine.id}
                          className="p-1.5 text-[#00E5FF] hover:text-[#00B8CC] transition-colors disabled:opacity-50"
                          title="Save"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleCancel}
                          className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-600 hidden sm:block">Auto-cache pending</span>
                        <button
                          onClick={() => handleStartEdit(machine)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1A1A] border border-[#2A2A2A] text-zinc-400 hover:text-[#00E5FF] hover:border-[#00E5FF]/40 rounded-lg text-xs transition-colors"
                          title="Manually enter BLE Device Name"
                        >
                          <Edit2 className="w-3 h-3" />
                          Enter name
                        </button>
                        <Link
                          href={`/dashboard/super/machines`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1A1A] border border-[#2A2A2A] text-zinc-400 hover:text-yellow-400 hover:border-yellow-400/40 rounded-lg text-xs transition-colors"
                          title="Go to machines list to re-pair via BLE"
                        >
                          <Bluetooth className="w-3 h-3" />
                          Re-pair
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Name-only machines (ble_device_name set, ble_pairing_verified = false) */}
      {nameOnly.length > 0 && (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#1A1A1A] flex items-center gap-2">
            <Bluetooth className="w-4 h-4 text-yellow-400" />
            <h2 className="text-base font-semibold text-white">
              Name Captured — Serial Pending ({nameOnly.length})
            </h2>
            <span className="text-xs text-zinc-500">— serial will auto-cache on first workout</span>
          </div>
          <div className="divide-y divide-[#1A1A1A]">
            {nameOnly.map(machine => (
              <div key={machine.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/super/machines/${machine.id}`}
                        className="text-white font-medium hover:text-[#00E5FF] transition-colors flex items-center gap-1"
                      >
                        {machine.name}
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                      </Link>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{machine.gym_name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <code className="text-sm text-[#00E5FF] font-mono font-semibold">{machine.ble_device_name}</code>
                      <p className="text-[10px] text-yellow-500 mt-0.5">Serial pending first workout</p>
                    </div>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                      Pending
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verified machines */}
      {verified.length > 0 && (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#1A1A1A] flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">
              Verified ({verified.length})
            </h2>
            <span className="text-xs text-zinc-500">— name + serial cached, strict matching active</span>
          </div>
          <div className="divide-y divide-[#1A1A1A]">
            {verified.map(machine => (
              <div key={machine.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/super/machines/${machine.id}`}
                      className="text-white font-medium hover:text-[#00E5FF] transition-colors flex items-center gap-1"
                    >
                      {machine.name}
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                    </Link>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{machine.gym_name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <code className="text-sm text-[#00E5FF] font-mono font-semibold">{machine.ble_device_name}</code>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                    Verified ✓
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {machines.length === 0 && (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-12 text-center text-zinc-500">
          No machines found.
        </div>
      )}
    </div>
  );
}
