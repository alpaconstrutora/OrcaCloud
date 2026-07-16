// components/empreendimento/SyncCenterTab.tsx
// Centro de Sincronização — painel de comando do Empreendimento como hub entre
// Viabilidade (Imovib) e Venda de Ativos (Comercial). Mostra o estado dos vínculos,
// detecta divergências e dispara as sincronizações existentes. Somente leitura/diagnóstico
// (as ações reusam o SyncFromStudyModal e a aba Espelho de Vendas).
import React from 'react';
import {
  Loader2, RefreshCw, ShoppingBag, BarChart3, Building2, ArrowLeftRight,
  CheckCircle2, AlertTriangle, ArrowRight, Link2Off, Clock, Upload, Ruler,
} from 'lucide-react';
import { empreendimentoService, CommercialDivergenceSummary, EmpreendimentoWriteBackReport } from '../../services/empreendimentoService';
import { plantaEmpreendimentoSync } from '../../services/plantaEmpreendimentoSync';
import { Empreendimento, EmpreendimentoSyncReport, PlantaAiSyncReport, PlantaAiWriteBackReport } from '../../types';
import { useConfirm } from '../ui/confirm';

interface Props {
  empreendimento: Empreendimento;
  onOpenStudySync: () => void;
  onGoToComercial: () => void;
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return null;
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
};

export const SyncCenterTab: React.FC<Props> = ({ empreendimento: e, onOpenStudySync, onGoToComercial }) => {
  // Sempre o org do próprio empreendimento — nunca o seletor global (que pode estar
  // em "Todas as Organizações" = string vazia).
  const organizationId = e.organization_id;
  const confirm = useConfirm();
  const [loading, setLoading] = React.useState(true);
  const [studyReport, setStudyReport] = React.useState<EmpreendimentoSyncReport | null>(null);
  const [studyError, setStudyError] = React.useState<string | null>(null);
  const [comm, setComm] = React.useState<CommercialDivergenceSummary | null>(null);
  const [writeBackReport, setWriteBackReport] = React.useState<EmpreendimentoWriteBackReport | null>(null);
  const [writeBackError, setWriteBackError] = React.useState<string | null>(null);
  const [writingBack, setWritingBack] = React.useState(false);

  // Planta IA (vínculo direto)
  const [plantaReport, setPlantaReport] = React.useState<PlantaAiSyncReport | null>(null);
  const [plantaError, setPlantaError] = React.useState<string | null>(null);
  const [plantaWriteBack, setPlantaWriteBack] = React.useState<PlantaAiWriteBackReport[] | null>(null);
  const [plantaSyncing, setPlantaSyncing] = React.useState(false);
  const [plantaWritingBack, setPlantaWritingBack] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setStudyError(null);
    setWriteBackError(null);
    setPlantaError(null);
    const tasks: Promise<void>[] = [];

    // Viabilidade — só roda o dry-run se houver estudo vinculado
    if (e.imovib_study_id) {
      tasks.push(
        empreendimentoService.previewSync(e.id)
          .then(r => setStudyReport(r))
          .catch(err => { setStudyError(err.message); setStudyReport(null); })
      );
      tasks.push(
        empreendimentoService.previewWriteBackToStudy(e.id)
          .then(r => setWriteBackReport(r))
          .catch(err => { setWriteBackError(err.message); setWriteBackReport(null); })
      );
    } else {
      setStudyReport(null);
      setWriteBackReport(null);
    }

    // Planta IA — só roda o dry-run se houver estudo de arquitetura vinculado
    if (e.planta_ai_study_id) {
      tasks.push(
        plantaEmpreendimentoSync.previewSync(e.id)
          .then(r => setPlantaReport(r))
          .catch(err => { setPlantaError(err.message); setPlantaReport(null); })
      );
      tasks.push(
        plantaEmpreendimentoSync.previewWriteBack(e.id)
          .then(r => setPlantaWriteBack(r))
          .catch(() => setPlantaWriteBack(null))
      );
    } else {
      setPlantaReport(null);
      setPlantaWriteBack(null);
    }

    // Comercial
    tasks.push(
      empreendimentoService.getCommercialDivergenceSummary(e.id, organizationId)
        .then(s => setComm(s))
        .catch(err => { console.error('[SyncCenter] erro comercial:', err); setComm(null); })
    );

    await Promise.all(tasks);
    setLoading(false);
  }, [e.id, e.imovib_study_id, e.planta_ai_study_id, organizationId]);

  React.useEffect(() => { load(); }, [load]);

  const handleWriteBack = async () => {
    if (!writeBackReport || writeBackReport.instancesUpdated === 0) return;
    const ok = await confirm({
      title: 'Enviar ao Estudo de Viabilidade?',
      message: `${writeBackReport.instancesUpdated} unidade${writeBackReport.instancesUpdated > 1 ? 's' : ''} do empreendimento ${writeBackReport.instancesUpdated > 1 ? 'têm' : 'tem'} nome, pavimento, área privativa, posição ou orientação diferentes da instância de origem no estudo.\n\nSó dados estruturais são enviados — preço e status de venda nunca são propagados ao estudo.`,
      confirmLabel: 'Enviar',
      variant: 'warning',
    });
    if (!ok) return;
    setWritingBack(true);
    try {
      await empreendimentoService.writeBackToStudy(e.id);
      await load();
    } catch (err: any) {
      setWriteBackError(err.message);
    } finally {
      setWritingBack(false);
    }
  };

  const handlePlantaSync = async () => {
    if (!plantaReport) return;
    const total = plantaReport.towersCreated + plantaReport.towersUpdated
      + plantaReport.unitsCreated + plantaReport.unitsUpdated;
    if (total === 0) return;
    const ok = await confirm({
      title: 'Sincronizar do Planta IA?',
      message: `Serão criadas/atualizadas ${plantaReport.towersCreated + plantaReport.towersUpdated} torre(s) e ${plantaReport.unitsCreated + plantaReport.unitsUpdated} unidade(s) a partir do cenário escolhido no estudo de arquitetura.\n\nSó dados estruturais (nome, pavimento, áreas, dormitórios) são sincronizados — preço e status de venda das unidades já existentes não são tocados.`,
      confirmLabel: 'Sincronizar',
      variant: 'warning',
    });
    if (!ok) return;
    setPlantaSyncing(true);
    try {
      await plantaEmpreendimentoSync.syncToEmpreendimento(e.id);
      await load();
    } catch (err: any) {
      setPlantaError(err.message);
    } finally {
      setPlantaSyncing(false);
    }
  };

  const handlePlantaWriteBack = async () => {
    const changes = (plantaWriteBack || []).reduce((s, r) => s + r.changes.length, 0);
    if (!plantaWriteBack || changes === 0) return;
    const ok = await confirm({
      title: 'Enviar ao Estudo de Arquitetura?',
      message: `${changes} agregado(s) do cenário serão recalculados a partir das torres/unidades reais (pavimentos, unidades por andar, total de unidades e áreas).\n\nVGV, custo estimado e status de venda nunca são propagados — o cenário permanece uma simulação independente do realizado.`,
      confirmLabel: 'Enviar',
      variant: 'warning',
    });
    if (!ok) return;
    setPlantaWritingBack(true);
    try {
      await plantaEmpreendimentoSync.writeBackToPlantaScenario(e.id);
      await load();
    } catch (err: any) {
      setPlantaError(err.message);
    } finally {
      setPlantaWritingBack(false);
    }
  };

  // Divergências de Viabilidade = itens que o sync criaria/atualizaria
  const studyDiverge = studyReport
    ? studyReport.towersCreated + studyReport.towersUpdated + studyReport.unitsCreated + studyReport.unitsUpdated
    : 0;
  const studyOrphans = studyReport
    ? studyReport.orphanTowers.length + studyReport.orphanUnits.length
    : 0;

  const commDiverge = comm
    ? comm.statusDiverge + comm.priceDiverge + comm.orphans + comm.unmappable
    : 0;

  const plantaDiverge = plantaReport
    ? plantaReport.towersCreated + plantaReport.towersUpdated + plantaReport.unitsCreated + plantaReport.unitsUpdated
    : 0;
  const plantaOrphans = plantaReport
    ? plantaReport.orphanTowers.length + plantaReport.orphanUnits.length
    : 0;
  const plantaChanges = (plantaWriteBack || []).reduce((s, r) => s + r.changes.length, 0);
  const plantaUnitsWithoutOrigin = (plantaWriteBack || []).reduce((s, r) => s + r.unitsWithoutPlantaOrigin, 0);

  if (loading) return (
    <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
  );

  return (
    <div className="space-y-6">
      {/* Fluxo dos 3 vértices */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black text-gray-800 text-sm uppercase tracking-wider flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-blue-600" /> Centro de Sincronização
          </h3>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200"
          >
            <RefreshCw className="w-3 h-3" /> Recarregar
          </button>
        </div>

        {/* Topologia em estrela: o Empreendimento é o hub e tem 3 raios independentes.
            O Planta IA fala DIRETO com o hub (ponte 20270209000000) — antes só chegava aqui
            via Imovib, em 2 saltos. */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-3 items-stretch">
          {/* Linha 1 — Arquitetura, acima do hub */}
          <div className="hidden md:block" />
          <div className="hidden md:block" />
          <VertexCard
            icon={Ruler}
            tint="indigo"
            title="Arquitetura"
            subtitle="Planta IA"
            linked={!!e.planta_ai_study_id}
            unlinkedLabel="Nenhum estudo vinculado"
            error={plantaError}
            divergences={plantaDiverge}
            extraOrphans={plantaOrphans}
            footer={plantaReport ? `${plantaReport.scenarioUnits} unidade(s) no cenário` : null}
          />
          <div className="hidden md:block" />
          <div className="hidden md:block" />

          {/* Seta vertical hub ↕ arquitetura */}
          <div className="hidden md:block" />
          <div className="hidden md:block" />
          <div className="hidden md:flex items-center justify-center text-gray-300 py-1">
            <ArrowLeftRight className="w-5 h-5 rotate-90" />
          </div>
          <div className="hidden md:block" />
          <div className="hidden md:block" />

          {/* Linha 2 — Viabilidade ↔ HUB ↔ Comercial */}
          <VertexCard
            icon={BarChart3}
            tint="violet"
            title="Viabilidade"
            subtitle="Estudo Imovib"
            linked={!!e.imovib_study_id}
            unlinkedLabel="Nenhum estudo vinculado"
            error={studyError}
            divergences={studyDiverge}
            extraOrphans={studyOrphans}
            footer={e.last_synced_at ? `Última sync: ${fmtDate(e.last_synced_at)}` : 'Nunca sincronizado'}
          />

          <Arrow />

          {/* Empreendimento (HUB) */}
          <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-4 flex flex-col items-center justify-center text-center">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl mb-2"><Building2 className="w-5 h-5" /></div>
            <span className="text-xs font-black uppercase tracking-wider text-blue-700">{e.name}</span>
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mt-0.5">Hub Central</span>
          </div>

          <Arrow />

          {/* Comercial */}
          <VertexCard
            icon={ShoppingBag}
            tint="emerald"
            title="Venda de Ativos"
            subtitle="Comercial"
            linked={!!comm && comm.published > 0}
            unlinkedLabel={comm && comm.total > 0 ? 'Nenhuma unidade publicada' : 'Sem unidades'}
            error={null}
            divergences={commDiverge}
            extraOrphans={comm?.orphans ?? 0}
            footer={comm ? `${comm.published}/${comm.total} publicadas` : '—'}
          />
        </div>
      </div>

      {/* Detalhamento + ações */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Viabilidade ↔ Empreendimento */}
        <RelationCard
          title="Viabilidade ↔ Empreendimento"
          icon={BarChart3}
          tint="violet"
        >
          {!e.imovib_study_id ? (
            <EmptyHint icon={Link2Off} text="Este empreendimento não está vinculado a um estudo de viabilidade. Vincule pelo botão Editar." />
          ) : studyError ? (
            <div className="text-xs text-rose-600 font-medium flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {studyError}
            </div>
          ) : studyReport ? (
            <>
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 pt-1">Do Estudo para o Empreendimento</p>
              <DiffRow label="Torres a criar" value={studyReport.towersCreated} />
              <DiffRow label="Torres a atualizar" value={studyReport.towersUpdated} />
              <DiffRow label="Unidades a criar" value={studyReport.unitsCreated} />
              <DiffRow label="Unidades a atualizar" value={studyReport.unitsUpdated} />
              <DiffRow label="Estado comercial preservado" value={studyReport.skippedDueToLocalChanges.length} muted />
              {studyOrphans > 0 && <DiffRow label="Itens órfãos (mantidos)" value={studyOrphans} warn />}
              <button
                onClick={onOpenStudySync}
                className="mt-2 w-full px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Sincronizar do Estudo
              </button>

              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 pt-3 border-t border-gray-100 mt-1">Do Empreendimento para o Estudo</p>
              {writeBackError ? (
                <div className="text-xs text-rose-600 font-medium flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {writeBackError}
                </div>
              ) : writeBackReport ? (
                <>
                  <DiffRow label="Unidades a enviar (estrutural)" value={writeBackReport.instancesUpdated} warn={writeBackReport.instancesUpdated > 0} />
                  <DiffRow label="Sem instância de origem" value={writeBackReport.unitsWithoutInstance} muted />
                  <button
                    onClick={handleWriteBack}
                    disabled={writingBack || writeBackReport.instancesUpdated === 0}
                    className="mt-2 w-full px-4 py-2.5 bg-white hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed text-violet-700 border border-violet-200 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2"
                  >
                    {writingBack ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {writeBackReport.instancesUpdated === 0 ? 'Nada a enviar' : 'Enviar ao Estudo'}
                  </button>
                  <p className="text-[9px] text-gray-400 font-medium leading-relaxed pt-1">
                    Envia nome, pavimento, área privativa, posição e orientação. Preço, status e tipologia nunca são propagados de volta.
                  </p>
                </>
              ) : null}
            </>
          ) : null}
        </RelationCard>

        {/* Arquitetura ↔ Empreendimento (ponte direta, sem passar pelo Imovib) */}
        <RelationCard
          title="Arquitetura ↔ Empreendimento"
          icon={Ruler}
          tint="indigo"
        >
          {!e.planta_ai_study_id ? (
            <EmptyHint icon={Link2Off} text="Este empreendimento não está vinculado a um estudo de arquitetura (Planta IA). Vincule pelo botão Editar." />
          ) : plantaError ? (
            <div className="text-xs text-rose-600 font-medium flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {plantaError}
            </div>
          ) : plantaReport ? (
            <>
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 pt-1">Do Cenário para o Empreendimento</p>
              <DiffRow label="Torres a criar" value={plantaReport.towersCreated} />
              <DiffRow label="Torres a atualizar" value={plantaReport.towersUpdated} />
              <DiffRow label="Unidades a criar" value={plantaReport.unitsCreated} />
              <DiffRow label="Unidades a atualizar" value={plantaReport.unitsUpdated} />
              {plantaOrphans > 0 && <DiffRow label="Itens órfãos (mantidos)" value={plantaOrphans} warn />}
              {plantaReport.warnings.map((w, i) => (
                <p key={i} className="text-[10px] text-amber-600 font-medium flex items-start gap-1.5 leading-relaxed pt-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {w}
                </p>
              ))}
              <button
                onClick={handlePlantaSync}
                disabled={plantaSyncing || plantaDiverge === 0}
                className="mt-2 w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2"
              >
                {plantaSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {plantaDiverge === 0 ? 'Nada a sincronizar' : 'Sincronizar do Cenário'}
              </button>

              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 pt-3 border-t border-gray-100 mt-1">Do Empreendimento para o Cenário</p>
              <DiffRow label="Agregados a recalcular" value={plantaChanges} warn={plantaChanges > 0} />
              <DiffRow label="Sem origem no Planta IA" value={plantaUnitsWithoutOrigin} muted />
              <button
                onClick={handlePlantaWriteBack}
                disabled={plantaWritingBack || plantaChanges === 0}
                className="mt-2 w-full px-4 py-2.5 bg-white hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-700 border border-indigo-200 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2"
              >
                {plantaWritingBack ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {plantaChanges === 0 ? 'Nada a enviar' : 'Enviar ao Cenário'}
              </button>
              <p className="text-[9px] text-gray-400 font-medium leading-relaxed pt-1">
                Envia pavimentos, unidades por andar, total de unidades e áreas. VGV, custo e status de venda nunca voltam ao cenário.
              </p>
            </>
          ) : null}
        </RelationCard>

        {/* Empreendimento ↔ Comercial */}
        <RelationCard
          title="Empreendimento ↔ Venda de Ativos"
          icon={ShoppingBag}
          tint="emerald"
        >
          {!comm || comm.total === 0 ? (
            <EmptyHint icon={Link2Off} text="Nenhuma unidade cadastrada nas torres deste empreendimento." />
          ) : (
            <>
              <DiffRow label="Publicadas no Comercial" value={comm.published} muted />
              <DiffRow label="Não publicadas" value={comm.unpublished} muted />
              <DiffRow label="Status divergente" value={comm.statusDiverge} warn={comm.statusDiverge > 0} />
              <DiffRow label="Preço divergente" value={comm.priceDiverge} warn={comm.priceDiverge > 0} />
              <DiffRow label="Locado/Manutenção (sem equivalente)" value={comm.unmappable} warn={comm.unmappable > 0} />
              {comm.orphans > 0 && <DiffRow label="Vínculos órfãos" value={comm.orphans} warn />}
              <button
                onClick={onGoToComercial}
                className="mt-3 w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2"
              >
                Abrir Espelho de Vendas <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </RelationCard>
      </div>

      {/* Limitação conhecida */}
      <div className="bg-gray-50/60 border border-dashed border-gray-200 rounded-2xl p-4 flex items-start gap-2.5">
        <Clock className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500 font-medium leading-relaxed">
          <strong className="text-gray-600">Tipologia</strong> não é enviada de volta ao estudo — mudar a tipologia de
          uma unidade exige re-vincular a instância a um tipo diferente no Imovib, uma operação estrutural que ainda
          não tem escrita reversa automática. Ajuste manualmente no estudo quando necessário.
        </p>
      </div>
    </div>
  );
};

// ── Sub-componentes ───────────────────────────────────────────────────────────

const TINTS: Record<string, { bg: string; text: string; ring: string }> = {
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-600',  ring: 'border-violet-100' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'border-emerald-100' },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-600',  ring: 'border-indigo-100' },
};

const VertexCard: React.FC<{
  icon: any; tint: string; title: string; subtitle: string;
  linked: boolean; unlinkedLabel: string; error: string | null;
  divergences: number; extraOrphans: number; footer: string | null;
}> = ({ icon: Icon, tint, title, subtitle, linked, unlinkedLabel, error, divergences, footer }) => {
  const t = TINTS[tint] ?? TINTS.violet;
  const aligned = linked && !error && divergences === 0;
  return (
    <div className={`rounded-2xl border ${t.ring} ${t.bg} p-4 flex flex-col`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-2 bg-white rounded-lg ${t.text} border ${t.ring}`}><Icon className="w-4 h-4" /></div>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wider text-gray-700 truncate">{title}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">{subtitle}</p>
        </div>
      </div>
      {!linked ? (
        <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1"><Link2Off className="w-3 h-3" /> {unlinkedLabel}</span>
      ) : error ? (
        <span className="text-[10px] font-bold text-rose-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Erro ao verificar</span>
      ) : aligned ? (
        <span className="text-[10px] font-black text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Alinhado</span>
      ) : (
        <span className="text-[10px] font-black text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {divergences} divergência{divergences > 1 ? 's' : ''}</span>
      )}
      {footer && <span className="text-[9px] font-medium text-gray-400 mt-auto pt-2">{footer}</span>}
    </div>
  );
};

const Arrow: React.FC = () => (
  <div className="hidden md:flex items-center justify-center text-gray-300">
    <ArrowLeftRight className="w-5 h-5" />
  </div>
);

const RelationCard: React.FC<{ title: string; icon: any; tint: string; children: React.ReactNode }> = ({ title, icon: Icon, tint, children }) => {
  const t = TINTS[tint] ?? TINTS.violet;
  return (
    <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
      <h4 className="font-black text-gray-800 text-xs uppercase tracking-wider mb-4 flex items-center gap-2">
        <span className={`p-1.5 rounded-lg ${t.bg} ${t.text}`}><Icon className="w-3.5 h-3.5" /></span>
        {title}
      </h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
};

const DiffRow: React.FC<{ label: string; value: number; warn?: boolean; muted?: boolean }> = ({ label, value, warn, muted }) => (
  <div className="flex items-center justify-between text-xs">
    <span className={`font-medium ${muted ? 'text-gray-400' : 'text-gray-600'}`}>{label}</span>
    <span className={`font-black tabular-nums px-2 py-0.5 rounded-md ${
      value === 0 ? 'text-gray-300'
      : warn ? 'bg-amber-500/10 text-amber-600'
      : 'bg-gray-100 text-gray-600'
    }`}>{value}</span>
  </div>
);

const EmptyHint: React.FC<{ icon: any; text: string }> = ({ icon: Icon, text }) => (
  <div className="flex items-start gap-2 text-xs text-gray-400 font-medium py-2">
    <Icon className="w-4 h-4 shrink-0 mt-0.5" /> {text}
  </div>
);

export default SyncCenterTab;
