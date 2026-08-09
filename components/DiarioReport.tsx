import React, { useEffect, useState } from 'react';
import { BookOpen, Search, MoveHorizontal } from 'lucide-react';
import { listJournalEntries } from '../services/diarioService';
import type { JournalEntryPair } from '../services/diarioService';
import { useResizableColumns, usePersistedState } from './ui/TableUtils';

const DIARIO_COL_WIDTHS: Record<string, number> = {
  data: 110, descricao: 220, origem: 110, contaDebito: 150, contaCredito: 150, valor: 140, status: 120,
};

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d: string) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

const SOURCE_LABEL: Record<string, string> = {
  NFE:       'NF-e',
  PAYROLL:   'Folha',
  MANUAL:    'Manual',
};

interface Props {
  organizationId: string | null;
}

export default function DiarioReport({ organizationId }: Props) {
  const [entries, setEntries] = useState<JournalEntryPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [search, setSearch] = usePersistedState<string>('diarioReport:search', '');
  const cols = useResizableColumns(DIARIO_COL_WIDTHS, 'diarioReportColWidths');

  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-01-01`;
  const defaultTo   = now.toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo,   setDateTo]   = useState(defaultTo);

  useEffect(() => {
    setLoading(true);
    setError('');
    listJournalEntries(organizationId, { dateFrom, dateTo })
      .then(setEntries)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [organizationId, dateFrom, dateTo]);

  const shown = entries.filter(e =>
    !search ||
    e.description.toLowerCase().includes(search.toLowerCase()) ||
    e.debitAccount.toLowerCase().includes(search.toLowerCase()) ||
    e.creditAccount.toLowerCase().includes(search.toLowerCase())
  );

  const totalDebit  = shown.reduce((s, e) => s + e.debitAmount,  0);
  const totalCredit = shown.reduce((s, e) => s + e.creditAmount, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
          <BookOpen className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-800">Diário Contábil</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Lançamentos em partida dobrada gerados automaticamente
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar conta ou descrição…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">De</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20" />
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">até</span>
          <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}
            className="text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20" />
        </div>
      </div>

      {/* Totalizadores */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Lançamentos',    val: shown.length,          color: 'text-slate-800' },
          { label: 'Total Débitos',  val: fmt(totalDebit),       color: 'text-blue-700' },
          { label: 'Total Créditos', val: fmt(totalCredit),      color: 'text-emerald-700' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">{s.label}</p>
            <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-[10px] border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Carregando lançamentos…</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600 text-sm font-medium">{error}</div>
        ) : shown.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            Nenhum lançamento encontrado para o período.
          </div>
        ) : (
          <>
            <div className="flex justify-end p-2 border-b border-slate-100">
              <button onClick={() => cols.autoFit()} className="p-1.5 rounded-[6px] text-slate-400 hover:text-slate-600 transition-all" title="Ajustar largura das colunas ao conteúdo">
                <MoveHorizontal className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-x-auto">
            <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: Object.keys(DIARIO_COL_WIDTHS).reduce((s, k) => s + cols.getWidth(k), 0) }}>
              <colgroup>
                {Object.keys(DIARIO_COL_WIDTHS).map(k => <col key={k} data-col-key={k} style={{ width: `${cols.getWidth(k)}px` }} />)}
              </colgroup>
              <thead>
                <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
                  {[
                    ['data', 'Data'], ['descricao', 'Descrição'], ['origem', 'Origem'],
                    ['contaDebito', 'Conta Débito'], ['contaCredito', 'Conta Crédito'], ['valor', 'Valor'], ['status', 'Status'],
                  ].map(([key, h]) => (
                    <th key={key} className="px-6 py-2 border-r border-gray-100 last:border-r-0 font-semibold text-xs text-gray-500 whitespace-nowrap relative overflow-hidden">
                      {h}
                      <cols.ResizeHandle colKey={key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map(e => (
                  <tr key={e.journalEntryId} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-slate-500 whitespace-nowrap">
                      {fmtDate(e.entryDate)}
                    </td>
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-slate-700 truncate" title={e.description}>
                      {e.description}
                    </td>
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-indigo-700">
                      {SOURCE_LABEL[e.sourceSystem ?? ''] ?? (e.sourceSystem ?? '—')}
                    </td>
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-blue-700">{e.debitAccount}</td>
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-emerald-700">{e.creditAccount}</td>
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-slate-800 whitespace-nowrap">
                      {fmt(e.debitAmount)}
                    </td>
                    <td className="px-6 py-2.5 text-sm font-normal">
                      <span className={e.status === 'CONCILIATED' ? 'text-emerald-700' : 'text-amber-700'}>
                        {e.status === 'CONCILIATED' ? 'Conciliado' : 'Pendente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
