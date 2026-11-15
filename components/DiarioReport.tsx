import React, { useEffect, useState } from 'react';
import { Search, Download } from 'lucide-react';
import { listJournalEntries } from '../services/diarioService';
import type { JournalEntryPair } from '../services/diarioService';
import { useResizableColumns, usePersistedState } from './ui/TableUtils';
import { useCargaVigente } from '../hooks/useCargaVigente';
import { motivoPeriodoInvalido } from '../utils/periodoControladoria';
import { FalhaDeCarga, PeriodoInvalido } from './controladoria/EstadosDaCarga';
import { BarraDeEscopo, BOTAO_DA_BARRA, BotaoAutoAjuste } from './controladoria/BarraDeEscopo';
import type { EscopoControladoria } from './controladoria/escopo';
import { KpiCard } from './ui/KpiCard';
import { GRADE_DE_INDICADORES } from './controladoria/indicadores';
import { baixarCSV } from './controladoria/csv';

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
  escopo: EscopoControladoria;
}

export default function DiarioReport({ organizationId, escopo }: Props) {
  const [entries, setEntries] = useState<JournalEntryPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [search, setSearch] = usePersistedState<string>('diarioReport:search', '');
  const cols = useResizableColumns(DIARIO_COL_WIDTHS, 'diarioReportColWidths');
  const novaCarga = useCargaVigente();

  const { de: dateFrom, ate: dateTo, obraId } = escopo;
  const motivoPeriodo = motivoPeriodoInvalido(dateFrom, dateTo);

  useEffect(() => {
    const vigente = novaCarga();
    if (motivoPeriodoInvalido(dateFrom, dateTo)) {
      setEntries([]); setFalhou(false); setLoading(false);
      return;
    }
    setLoading(true);
    setFalhou(false);
    listJournalEntries(organizationId, { dateFrom, dateTo, projectId: obraId || undefined })
      .then(d => { if (vigente()) setEntries(d); })
      .catch(e => {
        if (!vigente()) return;
        setEntries([]);
        setFalhou(true);
        console.error('[Diário]', e);
      })
      .finally(() => { if (vigente()) setLoading(false); });
  }, [novaCarga, organizationId, dateFrom, dateTo, obraId, tentativa]);

  const shown = entries.filter(e =>
    !search ||
    e.description.toLowerCase().includes(search.toLowerCase()) ||
    e.debitAccount.toLowerCase().includes(search.toLowerCase()) ||
    e.creditAccount.toLowerCase().includes(search.toLowerCase())
  );

  const totalDebit  = shown.reduce((s, e) => s + e.debitAmount,  0);
  const totalCredit = shown.reduce((s, e) => s + e.creditAmount, 0);

  return (
    <div className="space-y-6">
      <BarraDeEscopo escopo={escopo}
        aplica={{ periodo: true, regime: 'O diário lista os lançamentos como foram gerados, cada um na sua data: não há regime.', obra: null }}>
        <button type="button" disabled={shown.length === 0}
          title={shown.length ? 'Baixar os lançamentos da tela em CSV' : 'Sem lançamentos para exportar'}
          onClick={() => baixarCSV(`Diario_${dateFrom}_${dateTo}.csv`,
            ['Data', 'Descrição', 'Origem', 'Conta débito', 'Conta crédito', 'Valor', 'Situação'],
            shown.map(e => [e.entryDate, e.description, SOURCE_LABEL[e.sourceSystem ?? ''] ?? e.sourceSystem, e.debitAccount, e.creditAccount, e.debitAmount, e.status === 'CONCILIATED' ? 'Conciliado' : 'Pendente']))}
          className={`${BOTAO_DA_BARRA} disabled:opacity-40 disabled:cursor-not-allowed`}>
          <Download className="w-4 h-4" aria-hidden="true" /> CSV
        </button>
      </BarraDeEscopo>

      {/* Totalizadores — só com dado de verdade: zero durante a falha ou com
          período incompleto seria um número afirmado sobre o que não foi lido. */}
      {!motivoPeriodo && !loading && !falhou && (
      <div className={GRADE_DE_INDICADORES}>
        <KpiCard destaque label="Lançamentos" value={shown.length.toLocaleString('pt-BR')}
          sub={search ? 'Os que casam com a busca' : 'No período'} />
        <KpiCard destaque label="Total de débitos" value={fmt(totalDebit)} />
        <KpiCard destaque label="Total de créditos" value={fmt(totalCredit)}
          sub={Math.abs(totalDebit - totalCredit) < 0.005 ? 'Débitos = créditos' : `Diferença de ${fmt(totalDebit - totalCredit)}`} />
      </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-[10px] border border-slate-200 overflow-hidden">
        {/* Busca acoplada à tabela (§5.2): recorta as linhas carregadas, não o período. */}
        <div className="flex items-center gap-2 p-2 border-b border-slate-100">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" aria-hidden="true" />
            <input
              type="text"
              aria-label="Buscar no diário por conta ou descrição"
              placeholder="Buscar conta ou descrição…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-sm text-gray-900 bg-white border border-gray-200 rounded-[6px] placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <BotaoAutoAjuste onClick={() => cols.autoFit()} />
        </div>
        {motivoPeriodo ? (
          <PeriodoInvalido motivo={motivoPeriodo} />
        ) : loading ? (
          <div role="status" className="flex items-center justify-center py-16 text-gray-600 gap-2">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Carregando lançamentos…</span>
          </div>
        ) : falhou ? (
          <FalhaDeCarga oQue="o diário contábil" onRetry={() => setTentativa(t => t + 1)} />
        ) : shown.length === 0 ? (
          <div className="p-12 text-center text-slate-600 text-sm">
            {search
              ? 'Nenhum lançamento casa com a busca.'
              : 'Nenhum lançamento no diário neste período. Aqui entram só os lançamentos gravados em partida dobrada (débito e crédito); os demais aparecem na DRE e no Balancete.'}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', minWidth: '100%', width: Object.keys(DIARIO_COL_WIDTHS).reduce((s, k) => s + cols.getWidth(k), 0) }}>
              <colgroup>
                {Object.keys(DIARIO_COL_WIDTHS).map(k => <col key={k} data-col-key={k} style={{ width: `${cols.getWidth(k)}px` }} />)}
                <col />
              </colgroup>
              <thead>
                <tr className="bg-white text-gray-700 border-b border-gray-200">
                  {[
                    ['data', 'Data'], ['descricao', 'Descrição'], ['origem', 'Origem'],
                    ['contaDebito', 'Conta Débito'], ['contaCredito', 'Conta Crédito'], ['valor', 'Valor'], ['status', 'Status'],
                  ].map(([key, h]) => (
                    <th key={key} className="px-6 py-2 border-r border-gray-100 font-semibold text-xs text-gray-700 whitespace-nowrap relative overflow-hidden">
                      {h}
                      <cols.ResizeHandle colKey={key} />
                    </th>
                  ))}
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map(e => (
                  <tr key={e.journalEntryId} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 whitespace-nowrap">
                      {fmtDate(e.entryDate)}
                    </td>
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">
                      <span className="block truncate" title={e.description}>{e.description}</span>
                    </td>
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-indigo-700">
                      {SOURCE_LABEL[e.sourceSystem ?? ''] ?? (e.sourceSystem ?? '—')}
                    </td>
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-blue-700">{e.debitAccount}</td>
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-emerald-700">{e.creditAccount}</td>
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-slate-800 whitespace-nowrap">
                      {fmt(e.debitAmount)}
                    </td>
                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal">
                      <span className={e.status === 'CONCILIATED' ? 'text-emerald-700' : 'text-amber-700'}>
                        {e.status === 'CONCILIATED' ? 'Conciliado' : 'Pendente'}
                      </span>
                    </td>
                    <td aria-hidden="true"></td>
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
