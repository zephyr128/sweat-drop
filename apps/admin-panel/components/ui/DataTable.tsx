'use client';

import { Fragment, useState, useCallback, useEffect, useRef, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, ChevronUp, ChevronDown, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────

export interface ColumnDef<T> {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
  render: (row: T, index: number) => React.ReactNode;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDef {
  key: string;
  label: string;
  options: FilterOption[];
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  loading?: boolean;
  /** Hide search + filter toolbar (e.g. embedded lists with a fixed dataset). */
  hideToolbar?: boolean;
  searchPlaceholder?: string;
  filters?: FilterDef[];
  filterValues?: Record<string, string>;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyCTA?: React.ReactNode;
  onQueryChange: (params: DataTableQuery) => void;
  onRowClick?: (row: T) => void;
  rowKey?: (row: T) => string;
  renderExpandedRow?: (row: T) => React.ReactNode;
  /** Adds visible spacing between rows for card-like appearance */
  cardRows?: boolean;
}

export interface DataTableQuery {
  q?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  filters?: Record<string, string>;
}

const PAGE_SIZES = [10, 25, 50];

// ─── URL State Hook ───────────────────────────────────────────────

export function useDataTableURL() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const getParams = useCallback((): DataTableQuery => {
    return {
      q: searchParams.get('q') || '',
      page: Number(searchParams.get('page')) || 1,
      limit: Number(searchParams.get('limit')) || 25,
      sortBy: searchParams.get('sortBy') || '',
      sortDir: (searchParams.get('sortDir') as 'asc' | 'desc') || 'desc',
    };
  }, [searchParams]);

  const setParams = useCallback((query: DataTableQuery) => {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.page && query.page > 1) params.set('page', String(query.page));
    if (query.limit && query.limit !== 25) params.set('limit', String(query.limit));
    if (query.sortBy) params.set('sortBy', query.sortBy);
    if (query.sortDir && query.sortDir !== 'desc') params.set('sortDir', query.sortDir);
    if (query.filters) {
      for (const [k, v] of Object.entries(query.filters)) {
        if (v && v !== 'all') params.set(k, v);
      }
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname]);

  return { getParams, setParams };
}

// ─── DataTable Component ──────────────────────────────────────────

export function DataTable<T>({
  data,
  columns,
  total,
  page,
  limit,
  totalPages,
  loading = false,
  hideToolbar = false,
  searchPlaceholder = 'Search…',
  filters,
  filterValues = {},
  sortBy,
  sortDir = 'desc',
  emptyIcon,
  emptyTitle = 'No results',
  emptyDescription = 'Try adjusting your search or filters.',
  emptyCTA,
  onQueryChange,
  onRowClick,
  rowKey,
  renderExpandedRow,
  cardRows = false,
}: DataTableProps<T>) {
  const [searchValue, setSearchValue] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = useCallback((value: string) => {
    setSearchValue(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onQueryChange({ q: value, page: 1 });
    }, 300);
  }, [onQueryChange]);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const handleSort = useCallback((key: string) => {
    const newDir = sortBy === key && sortDir === 'asc' ? 'desc' : 'asc';
    onQueryChange({ sortBy: key, sortDir: newDir, page: 1 });
  }, [sortBy, sortDir, onQueryChange]);

  const handleFilter = useCallback((key: string, value: string) => {
    onQueryChange({ filters: { ...filterValues, [key]: value }, page: 1 });
  }, [filterValues, onQueryChange]);

  const handlePageSize = useCallback((newLimit: number) => {
    onQueryChange({ limit: newLimit, page: 1 });
  }, [onQueryChange]);

  const handlePage = useCallback((newPage: number) => {
    onQueryChange({ page: newPage });
  }, [onQueryChange]);

  const startRow = (page - 1) * limit + 1;
  const endRow = Math.min(page * limit, total);

  return (
    <div className="space-y-4">
      {/* Toolbar: Search + Filters */}
      {!hideToolbar && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-4 py-2 bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#00E5FF]/50 transition-colors"
            />
          </div>
          {filters?.map((f) => (
            <select
              key={f.key}
              value={filterValues[f.key] || 'all'}
              onChange={(e) => handleFilter(f.key, e.target.value)}
              className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-[#00E5FF]/50 min-w-[140px]"
            >
              {f.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1A1A1A]">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider ${
                      col.sortable ? 'cursor-pointer select-none hover:text-zinc-300 transition-colors' : ''
                    } ${col.headerClassName || ''}`}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    <span className={`flex items-center gap-1 ${col.headerClassName?.includes('text-right') ? 'justify-end' : ''}`}>
                      {col.label}
                      {col.sortable && sortBy === col.key && (
                        sortDir === 'asc'
                          ? <ChevronUp className="w-3.5 h-3.5 text-[#00E5FF]" />
                          : <ChevronDown className="w-3.5 h-3.5 text-[#00E5FF]" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={cardRows ? '' : 'divide-y divide-[#1A1A1A]'}>
              {loading ? (
                Array.from({ length: Math.min(limit, 5) }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3">
                        <div className="h-4 bg-zinc-800/50 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      {emptyIcon && <div className="text-zinc-600">{emptyIcon}</div>}
                      <div>
                        <p className="text-sm font-medium text-zinc-400">{emptyTitle}</p>
                        <p className="text-xs text-zinc-600 mt-1">{emptyDescription}</p>
                      </div>
                      {emptyCTA}
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((row, i) => {
                  const key = rowKey ? rowKey(row) : String(i);
                  const expanded = renderExpandedRow?.(row);
                  return (
                    <Fragment key={key}>
                      {cardRows && i > 0 && (
                        <tr aria-hidden><td colSpan={columns.length} className="h-2 bg-transparent" /></tr>
                      )}
                      <tr
                        className={`transition-colors ${
                          cardRows
                            ? 'bg-zinc-900/30 hover:bg-zinc-900/60 border-y border-zinc-800/60'
                            : 'hover:bg-zinc-900/50'
                        } ${onRowClick ? 'cursor-pointer' : ''}`}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                      >
                        {columns.map((col) => (
                          <td key={col.key} className={`px-4 ${cardRows ? 'py-4' : 'py-3'} text-sm ${col.className || ''}`}>
                            {col.render(row, i)}
                          </td>
                        ))}
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={columns.length} className="p-0">
                            {expanded}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer: Pagination */}
        {total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-[#1A1A1A]">
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span>
                {startRow}–{endRow} of {total.toLocaleString()}
              </span>
              <select
                value={limit}
                onChange={(e) => handlePageSize(Number(e.target.value))}
                className="bg-transparent border border-[#1A1A1A] rounded px-2 py-1 text-xs text-zinc-400 focus:outline-none"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>{s} / page</option>
                ))}
              </select>
              {loading && <Loader2 className="w-3.5 h-3.5 text-[#00E5FF] animate-spin" />}
            </div>

            <div className="flex items-center gap-1">
              <PagButton onClick={() => handlePage(1)} disabled={page <= 1}>
                <ChevronsLeft className="w-3.5 h-3.5" />
              </PagButton>
              <PagButton onClick={() => handlePage(page - 1)} disabled={page <= 1}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </PagButton>
              <span className="px-3 text-xs text-zinc-400">
                {page} / {totalPages}
              </span>
              <PagButton onClick={() => handlePage(page + 1)} disabled={page >= totalPages}>
                <ChevronRight className="w-3.5 h-3.5" />
              </PagButton>
              <PagButton onClick={() => handlePage(totalPages)} disabled={page >= totalPages}>
                <ChevronsRight className="w-3.5 h-3.5" />
              </PagButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PagButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded border border-[#1A1A1A] text-zinc-500 hover:text-white hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}
