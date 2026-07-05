import React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
} from '@tanstack/react-table';
import { Layers } from 'lucide-react';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  meta?: any;
  onRowClick?: (row: TData) => void;
  getRowProps?: (row: TData) => React.HTMLAttributes<HTMLTableRowElement>;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  meta,
  onRowClick,
  getRowProps,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta,
  });

  return (
    <div className="rounded-md border border-gray-200 bg-white overflow-hidden shadow-sm w-full">
      <div className="overflow-x-auto w-full">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    style={{ width: header.getSize() !== 150 ? header.getSize() : 'auto' }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-200">
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const rowProps = getRowProps ? getRowProps(row.original) : {};
                const customProps = Object.fromEntries(Object.entries(rowProps).filter(([k]) => k !== 'className' && k !== 'onClick'));
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-blue-50/60 transition-colors group ${onRowClick ? 'cursor-pointer' : ''} ${rowProps.className || ''}`}
                    onClick={(e) => {
                        if (onRowClick) onRowClick(row.original);
                        if (rowProps.onClick) rowProps.onClick(e as any);
                    }}
                    {...customProps}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 text-gray-600 align-middle">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="h-24 text-center text-gray-400"
                >
                  <div className="flex flex-col items-center justify-center py-8">
                    <Layers className="w-8 h-8 text-gray-200 mb-2" />
                    <span>Nenhum dado encontrado.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
