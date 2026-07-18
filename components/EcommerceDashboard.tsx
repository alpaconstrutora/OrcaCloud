import React from 'react';
import { ecommerceService } from '../services/ecommerceService';
import { companyService } from '../services/companyService';
import { ttsService } from '../services/ttsService';
import { useConfirm } from './ui/confirm';
import { EcommerceChecklist, EcommerceRule, EcommercePhysicalLocation, EcommerceEvidence, Company, TtsCalculationResult } from '../types';

// Competência atual (1º dia do mês) e dias restantes até o fim do ciclo mensal.
function currentReferenceMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}
function diasAteFimDoMes(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(lastDay - now.getDate(), 0);
}

function formatMoney(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface EcommerceDashboardProps {
  organizationId: string;
  onNavigate: (view: string) => void;
}

const EcommerceDashboard: React.FC<EcommerceDashboardProps> = ({
  organizationId,
  onNavigate
}) => {
  const [loading, setLoading] = React.useState(true);
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = React.useState<string>('');
  const [checklists, setChecklists] = React.useState<any[]>([]);
  const [rules, setRules] = React.useState<EcommerceRule[]>([]);
  const [locations, setLocations] = React.useState<EcommercePhysicalLocation[]>([]);
  const [evidences, setEvidences] = React.useState<EcommerceEvidence[]>([]);
  // interestadualPct = null → ainda não há lançamentos de saída para a competência.
  // Nunca exibimos um número fictício: sem dados, a UI mostra "sem lançamentos".
  const [interestadualPct, setInterestadualPct] = React.useState<number | null>(null);
  const [ttsResult, setTtsResult] = React.useState<TtsCalculationResult | null>(null);
  const [minShare, setMinShare] = React.useState(30);
  const [diasRestantes] = React.useState(diasAteFimDoMes());
  // null = ainda não há base para pontuar. Um score inicial fixo (era 85) fazia
  // uma org sem nenhum dado exibir "85 — Excelente".
  const [score, setScore] = React.useState<number | null>(null);
  const [backfilling, setBackfilling] = React.useState(false);
  const [backfillMsg, setBackfillMsg] = React.useState<string | null>(null);
  const confirm = useConfirm();

  // Carrega checklists + apuração TTS real de uma filial e recalcula o score.
  const loadCompanyData = React.useCallback(
    async (companyId: string) => {
      const [checkData, tts] = await Promise.all([
        ecommerceService.listChecklists(organizationId, companyId),
        ttsService.apurarComCalculo(organizationId, companyId, currentReferenceMonth()),
      ]);
      setChecklists(checkData);

      const pct = tts.resultado ? tts.resultado.pct_interestadual : null;
      setInterestadualPct(pct);
      setTtsResult(tts.resultado);
      // Meta desta apuração. Usar o `minShare` do state aqui leria o valor do
      // ciclo ANTERIOR (o setState abaixo só vale no próximo render), fazendo o
      // score da primeira carga ser calculado contra o default de 30%.
      const metaAtual = tts.resultado ? tts.resultado.min_interstate_share : minShare;
      if (tts.resultado) setMinShare(metaAtual);

      // Score = 60% checklists conformes + 40% métrica interestadual. A antiga
      // parcela de "20% docs em dia" era a constante 100 — inflava todo score em
      // 20 pontos sem medir nada. Sem nenhuma das duas bases, não há score.
      const temChecklists = checkData.length > 0;
      const temApuracao = pct !== null;

      if (!temChecklists && !temApuracao) {
        setScore(null);
        return;
      }

      const conformes = checkData.filter((c) => c.status === 'conforme').length;
      const pctConformes = temChecklists ? (conformes / checkData.length) * 100 : 0;
      const interestadualScore = !temApuracao
        ? 0
        : pct >= metaAtual ? 100 : (pct / metaAtual) * 100;

      // Renormaliza sobre as bases disponíveis, para uma org que só tem uma das
      // duas não ser penalizada pela ausência da outra.
      const peso = (temChecklists ? 0.6 : 0) + (temApuracao ? 0.4 : 0);
      const bruto = (temChecklists ? pctConformes * 0.6 : 0) + (temApuracao ? interestadualScore * 0.4 : 0);
      setScore(Math.round(bruto / peso));
    },
    [organizationId, minShare]
  );

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const comps = await companyService.list(organizationId);
      setCompanies(comps);

      const [rulesData, locsData, evData] = await Promise.all([
        ecommerceService.listRules(organizationId),
        ecommerceService.listPhysicalLocations(organizationId),
        ecommerceService.listEvidences(organizationId),
      ]);
      setRules(rulesData);
      setLocations(locsData);
      setEvidences(evData);

      if (comps.length > 0) {
        const defaultComp = comps[0].id;
        setSelectedCompanyId(defaultComp);
        await loadCompanyData(defaultComp);
      }
    } catch (error) {
      console.error('Erro ao carregar dados do e-commerce:', error);
    } finally {
      setLoading(false);
    }
  }, [organizationId, loadCompanyData]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCompanyChange = async (companyId: string) => {
    setSelectedCompanyId(companyId);
    try {
      setLoading(true);
      await loadCompanyData(companyId);
    } catch (error) {
      console.error('Erro ao atualizar empresa:', error);
    } finally {
      setLoading(false);
    }
  };

  // Importa movimentos de ICMS a partir das NF-e já ingeridas no Fiscal.
  const handleBackfill = async () => {
    if (!organizationId) {
      setBackfillMsg('Organização não carregada. Recarregue a página e tente novamente.');
      return;
    }
    const ok = await confirm({
      title: 'Importar movimentos das NF-e?',
      message:
        'Vamos gerar a apuração de ICMS a partir das NF-e já ingeridas no módulo Fiscal ' +
        '(direção e escopo pelo CFOP; filial pelo CNPJ). É idempotente — importações ' +
        'anteriores da mesma origem são substituídas, não duplicadas.',
      confirmLabel: 'Importar',
    });
    if (!ok) return;

    try {
      setBackfilling(true);
      setBackfillMsg(null);
      const r = await ttsService.backfillFromNfe(organizationId);
      console.log('[TTS backfill] diagnóstico:', r);
      const partes = [
        `${r.movements_created} movimento(s) de ${r.invoices_applied}/${r.invoices_scanned} NF-e`,
      ];
      if (r.skipped_no_company > 0) partes.push(`${r.skipped_no_company} item(ns) sem filial (CNPJ não cadastrado)`);
      if (r.skipped_no_cfop > 0) partes.push(`${r.skipped_no_cfop} sem CFOP`);
      if (r.skipped_exterior > 0) partes.push(`${r.skipped_exterior} de exterior`);

      if (r.movements_created === 0) {
        // Diagnóstico do descasamento de CNPJ (a causa mais comum de 0 movimentos)
        const diag: string[] = [];
        diag.push(`Saídas: ${r.direction_counts.saida} · Entradas: ${r.direction_counts.entrada}`);
        diag.push(`CNPJ cadastrado: ${r.registered_cnpjs.join(', ') || 'nenhum'}`);
        if (r.empty_cnpj_items > 0) diag.push(`${r.empty_cnpj_items} item(ns) com CNPJ vazio na nota`);
        if (r.sample_unmatched_cnpjs.length > 0) diag.push(`CNPJ nas notas (amostra): ${r.sample_unmatched_cnpjs.slice(0, 6).join(', ')}`);
        setBackfillMsg(`Nenhum movimento gerado. ${partes.slice(1).join(' · ')}. ${diag.join(' · ')}.`);
      } else {
        setBackfillMsg(`Importado: ${partes.join(' · ')}.`);
      }
      if (selectedCompanyId) await loadCompanyData(selectedCompanyId);
    } catch (error) {
      console.error('Erro no backfill de NF-e:', error);
      setBackfillMsg(`Erro ao importar: ${error instanceof Error ? error.message : 'desconhecido'}`);
    } finally {
      setBackfilling(false);
    }
  };

  if (loading && companies.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F8FAFC]">
        <div className="w-8 h-8 border-4 border-[#0F172A] border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Carregando Governança...</span>
      </div>
    );
  }

  // Estatísticas de checklists
  const totalChecks = checklists.length;
  const conformeChecks = checklists.filter(c => c.status === 'conforme').length;
  const pendenteChecks = checklists.filter(c => c.status === 'pendente').length;
  const riscoChecks = checklists.filter(c => c.status === 'inconforme').length;

  // Ocupação real das áreas físicas demarcadas (antes: "14/20" fixo no JSX)
  const locOcupado = locations.filter(l => l.status === 'ocupado').length;
  const locManutencao = locations.filter(l => l.status === 'manutencao').length;
  const locDisponivel = locations.length - locOcupado - locManutencao;
  const pctLoc = (n: number) => (locations.length === 0 ? 0 : (n / locations.length) * 100);

  // Últimas evidências de fato registradas (antes: duas NF-e inventadas no JSX)
  const ultimasEvidencias = evidences.slice(0, 3);
  const rotuloOperacao: Record<string, string> = {
    expedicao: 'Expedição',
    recebimento: 'Recebimento',
    inventario: 'Inventário',
  };

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            🛡️ ÒPURA E-commerce
          </h1>
          <p className="text-xs font-semibold text-slate-500">
            Painel de controle regulatório e governança fiscal (TTS-MG)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedCompanyId}
            onChange={(e) => handleCompanyChange(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-form-input font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.razao_social} ({c.cnpj ? c.cnpj.substring(0, 5) + '...' : 'Filial'})</option>
            ))}
          </select>

          <button
            onClick={handleBackfill}
            disabled={backfilling || !organizationId || companies.length === 0}
            className="h-9 px-3 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-2 text-xs font-bold text-slate-700 active:scale-95 transition-transform hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title={companies.length === 0 ? 'Cadastre ao menos uma filial para importar' : 'Gerar apuração a partir das NF-e já ingeridas no Fiscal'}
          >
            {backfilling ? '⏳ Importando...' : '📥 Importar das NF-e'}
          </button>

          <button
            onClick={fetchData}
            className="w-9 h-9 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-button active:scale-95 transition-transform hover:bg-slate-50"
            title="Sincronizar"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Resultado do backfill */}
      {backfillMsg && (
        <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex items-start justify-between gap-3">
          <p className="text-xs font-medium text-slate-600">{backfillMsg}</p>
          <button onClick={() => setBackfillMsg(null)} className="text-slate-400 hover:text-slate-600 text-xs shrink-0">✕</button>
        </div>
      )}

      {/* Grid Principal - Score & Indicador TTS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Score Card */}
        <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Score de E-commerce</span>
            {/* §8 — status é texto colorido simples, sem pílula/fundo/uppercase */}
            {score !== null && (
              <span className={`text-sm font-normal ${
                score >= 90 ? 'text-emerald-700' :
                score >= 70 ? 'text-amber-700' : 'text-rose-600'
              }`}>
                {score >= 90 ? 'Excelente' : score >= 70 ? 'Atenção' : 'Risco'}
              </span>
            )}
          </div>

          {score === null ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black tracking-tight text-slate-300">—</span>
                <span className="text-xs font-bold text-slate-400">sem base de cálculo</span>
              </div>
              <span className="text-xs text-slate-500">
                Cadastre obrigações ou registre a apuração do mês para que o score seja calculado.
              </span>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black text-slate-800 tracking-tight">{score}</span>
                <span className="text-sm font-bold text-slate-400">/ 100</span>
              </div>

              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    score >= 90 ? 'bg-emerald-500' :
                    score >= 70 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${score}%` }}
                />
              </div>
              <span className="text-xs text-slate-500">
                60% obrigações conformes · 40% meta interestadual (TTS).
              </span>
            </>
          )}
        </div>

        {/* TTS-MG Interestadual KPI Card */}
        <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Saídas Interestaduais (TTS)</span>
            <span className="text-sm font-normal text-slate-600">
              Meta mínima {minShare}%
            </span>
          </div>

          {interestadualPct === null ? (
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black tracking-tight text-slate-300">—</span>
              <span className="text-xs font-bold text-slate-400">sem lançamentos</span>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className={`text-5xl font-black tracking-tight ${
                interestadualPct >= minShare ? 'text-slate-800' : 'text-rose-600'
              }`}>{interestadualPct}%</span>
              <span className="text-xs font-bold text-slate-400">apurado no mês</span>
            </div>
          )}

          {interestadualPct === null ? (
            <div className="text-xs text-slate-500">
              Registre saídas do mês na apuração para acompanhar a elegibilidade do benefício.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Ciclo: Restam <b>{diasRestantes} dias</b></span>
                <span className={interestadualPct >= minShare ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                  {interestadualPct >= minShare ? '✓ Elegível' : '⚠ Risco de perda'}
                </span>
              </div>
              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                <div
                  className={`h-full ${interestadualPct >= minShare ? 'bg-emerald-500' : 'bg-rose-500'}`}
                  style={{ width: `${Math.min((interestadualPct / (minShare + 10)) * 100, 100)}%` }}
                />
              </div>
              {ttsResult && ttsResult.economia > 0 && (
                <div className="text-xs text-slate-500 pt-1 border-t border-slate-100">
                  Economia estimada no mês: <b className="text-emerald-600">{formatMoney(ttsResult.economia)}</b>
                </div>
              )}
            </>
          )}
        </div>

        {/* Resumo de Checklists */}
        <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Status de Obrigações</span>
            <span className="text-xs font-bold text-slate-500">Total: {totalChecks}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-emerald-50/50 border border-emerald-100 p-2.5 rounded-xl text-center">
              <span className="block text-lg font-black text-emerald-700">{conformeChecks}</span>
              <span className="text-[9px] font-bold text-emerald-600 uppercase">Conformes</span>
            </div>
            <div className="bg-amber-50/50 border border-amber-100 p-2.5 rounded-xl text-center">
              <span className="block text-lg font-black text-amber-700">{pendenteChecks}</span>
              <span className="text-[9px] font-bold text-amber-600 uppercase">Pendentes</span>
            </div>
            <div className="bg-rose-50/50 border border-rose-100 p-2.5 rounded-xl text-center">
              <span className="block text-lg font-black text-rose-700">{riscoChecks}</span>
              <span className="text-[9px] font-bold text-rose-600 uppercase">Atenção</span>
            </div>
          </div>

          <button
            onClick={() => onNavigate('ecommerce-checklists')}
            className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-button font-bold uppercase tracking-wider transition-all active:scale-95"
          >
            Ver Obrigações
          </button>
        </div>
      </div>

      {/* Alertas Urgentes — só quando há apuração real abaixo da margem de segurança */}
      {interestadualPct !== null && interestadualPct < minShare + 5 && (
        <div className="bg-amber-50 border border-amber-200/80 p-4 rounded-2xl flex items-start gap-3 shadow-sm">
          <span className="text-xl">⚠️</span>
          <div>
            <h4 className="text-xs font-black uppercase text-amber-800 tracking-wider">Aviso de Risco Regulatória (TTS)</h4>
            <p className="text-xs font-medium text-amber-700 mt-0.5">
              O percentual interestadual de vendas da filial ({interestadualPct}%) está próximo da margem mínima permitida ({minShare}%). É altamente recomendado direcionar as próximas expedições para fora de Minas Gerais nos próximos {diasRestantes} dias para blindar o benefício.
            </p>
          </div>
        </div>
      )}

      {/* Atalhos Rápidos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Painel de Segregação Física */}
        <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">🗺️ Segregação Física de Estoque</h3>
              <p className="text-xs text-slate-400">Verifique a demarcação das áreas exclusivas das filiais</p>
            </div>
            <button
              onClick={() => onNavigate('ecommerce-physical-map')}
              className="text-xs font-black uppercase tracking-wider text-slate-900 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-100"
            >
              Abrir Mapa
            </button>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
            {locations.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                Nenhuma área física demarcada ainda. Abra o mapa para cadastrar as posições, lockers e salas.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>Status dos Lockers &amp; Posições:</span>
                  <span className="text-slate-800 font-bold">{locOcupado}/{locations.length} Ocupados</span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden flex">
                  <div className="bg-emerald-500 h-full" style={{ width: `${pctLoc(locDisponivel)}%` }} title={`Disponível: ${locDisponivel}`} />
                  <div className="bg-sky-500 h-full" style={{ width: `${pctLoc(locOcupado)}%` }} title={`Ocupado/segregado: ${locOcupado}`} />
                  <div className="bg-rose-500 h-full" style={{ width: `${pctLoc(locManutencao)}%` }} title={`Manutenção/bloqueado: ${locManutencao}`} />
                </div>
                <div className="flex gap-4 text-[9px] font-bold text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Disponível ({locDisponivel})</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-500" /> Segregado ({locOcupado})</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Bloqueado ({locManutencao})</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Trilha de Evidências */}
        <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">📸 Trilha de Evidências</h3>
              <p className="text-xs text-slate-400">Auditoria operacional e registro fotográfico de notas fiscais</p>
            </div>
            <button
              onClick={() => onNavigate('ecommerce-checklists')}
              className="text-xs font-black uppercase tracking-wider text-slate-900 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-100"
            >
              Nova Evidência
            </button>
          </div>

          <div className="space-y-2.5">
            {ultimasEvidencias.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                Nenhuma evidência registrada ainda. Anexe comprovantes às obrigações para formar a trilha de auditoria.
              </p>
            ) : (
              ultimasEvidencias.map(ev => (
                <div key={ev.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <div className="space-y-0.5 min-w-0">
                    <span className="block text-xs font-black text-slate-700 truncate">
                      {rotuloOperacao[ev.operation_type] || ev.operation_type}
                      {ev.document_ref ? ` — ${ev.document_ref}` : ''}
                    </span>
                    <span className="block text-[8px] text-slate-400 truncate">
                      {new Date(ev.captured_at).toLocaleString('pt-BR')} • Operador: {ev.operator_email}
                    </span>
                  </div>
                  {/* "Auditado" era rótulo fixo: hoje reflete se o arquivo tem hash de integridade */}
                  <span className={`text-sm font-normal shrink-0 ${ev.file_hash ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {ev.file_hash ? 'Íntegra' : 'Sem hash'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default EcommerceDashboard;
