import React, { useEffect, useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import { listJournalEntries } from '../services/diarioService';
import type { JournalEntryPair } from '../services/diarioService';

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
  const [search, setSearch] = useState('');

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
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Carregando lançamentos…</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600 text-sm font-semibold">{error}</div>
        ) : shown.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            Nenhum lançamento encontrado para o período.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Data', 'Descrição', 'Origem', 'Conta Débito', 'Conta Crédito', 'Valor', 'Status'].map(h => (
                  <th key={h} className="px-4 py-2.5 font-black uppercase tracking-wider text-xs text-slate-400 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map(e => (
                <tr key={e.journalEntryId} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                    {fmtDate(e.entryDate)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700 max-w-[200px] truncate" title={e.description}>
                    {e.description}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs uppercase">
                      {SOURCE_LABEL[e.sourceSystem ?? ''] ?? (e.sourceSystem ?? '—')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-blue-700 font-semibold">{e.debitAccount}</td>
                  <td className="px-4 py-3 text-emerald-700 font-semibold">{e.creditAccount}</td>
                  <td className="px-4 py-3 font-black font-mono text-slate-800 whitespace-nowrap">
                    {fmt(e.debitAmount)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-black uppercase ${
                      e.status === 'CONCILIATED'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}>
                      {e.status === 'CONCILIATED' ? 'Conciliado' : 'Pendente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
