'use client';

export interface StoreReportRow {
  item_name: string;
  item_id: string;
  redemptions_count: number;
  price_drops: number;
  total_drops_spent: number;
  pending_count: number;
  confirmed_count: number;
  is_active: boolean;
}

interface StoreReportTableProps {
  data: StoreReportRow[];
}

export function StoreReportTable({ data }: StoreReportTableProps) {
  if (!data || data.length === 0) {
    return (
      <section>
        <h3 className="text-xs text-zinc-500 tracking-wider font-medium uppercase mb-3">Store Performance</h3>
        <div className="border-t border-zinc-800 pt-4">
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-8 text-center text-zinc-500">
            No store data for this period
          </div>
        </div>
      </section>
    );
  }

  const totalRedemptions = data.reduce((s, r) => s + r.redemptions_count, 0);
  const totalDropsSpent = data.reduce((s, r) => s + r.total_drops_spent, 0);
  const totalPending = data.reduce((s, r) => s + r.pending_count, 0);
  const totalConfirmed = data.reduce((s, r) => s + r.confirmed_count, 0);

  return (
    <section>
      <h3 className="text-xs text-zinc-500 tracking-wider font-medium uppercase mb-3">Store Performance</h3>
      <div className="border-t border-zinc-800 pt-4">
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium">Name</th>
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium text-right">Price</th>
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium text-right">Redemptions</th>
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium text-right">Drops Spent</th>
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium text-right">Pending</th>
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium text-right">Confirmed</th>
                  <th className="px-4 py-3 text-xs text-zinc-500 uppercase tracking-wider font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.item_id} className="border-b border-zinc-800 hover:bg-zinc-900/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-white">{item.item_name}</td>
                    <td className="px-4 py-3 text-sm text-zinc-300 text-right tabular-nums">{item.price_drops} 💧</td>
                    <td className="px-4 py-3 text-sm text-zinc-300 text-right tabular-nums">{item.redemptions_count}</td>
                    <td className="px-4 py-3 text-sm text-zinc-300 text-right tabular-nums">{item.total_drops_spent.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-yellow-500 text-right tabular-nums">{item.pending_count}</td>
                    <td className="px-4 py-3 text-sm text-green-500 text-right tabular-nums">{item.confirmed_count}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.is_active
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                          : 'bg-zinc-700/30 text-zinc-500 border border-zinc-700/20'
                      }`}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-zinc-900/30 font-semibold">
                  <td className="px-4 py-3 text-sm text-white">TOTAL</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-sm text-white text-right tabular-nums">{totalRedemptions}</td>
                  <td className="px-4 py-3 text-sm text-white text-right tabular-nums">{totalDropsSpent.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-yellow-500 text-right tabular-nums">{totalPending}</td>
                  <td className="px-4 py-3 text-sm text-green-500 text-right tabular-nums">{totalConfirmed}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
