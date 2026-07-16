// components/empreendimento/SyncCenterTab.tsx
// Centro de Sincronização — mapa vivo das ligações do Empreendimento, e o lugar de onde
// TODAS elas são disparadas. O desenho é um triângulo, não uma estrela: além das arestas
// com o hub (Viabilidade, Arquitetura, Comercial), Arquitetura e Viabilidade falam
// DIRETO entre si (imovib_studies.planta_ai_study_id) — essa é a aresta mais antiga das
// três e ficava invisível aqui, dando a impressão de que tudo passava pelo Empreendimento.
//
// Os botões vivem nos cards do diagrama (2 por aresta, um por sentido); os cards de
// detalhe abaixo ficam só com os números que justificam a ação — sem dois controles para
// a mesma coisa (ui_ux_standard_guide.md §6.4).
import React from 'react';
import {
  Loader2, RefreshCw, ShoppingBag, BarChart3, Building2, ArrowLeftRight,
  CheckCircle2, AlertTriangle, ArrowRight, Link2Off, Clock, Upload, Ruler,
  Download, Send,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { empreendimentoService, CommercialDivergenceSummary, EmpreendimentoWriteBackReport } from '../../services/empreendimentoService';
import { plantaEmpreendimentoSync } from '../../services/plantaEmpreendimentoSync';
import { PlantaAiIntegration } from '../../services/plantaAiIntegration';
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

  // Aresta direta Arquitetura ↔ Viabilidade. Só existe para ESTE empreendimento se os dois
  // estudos que ele referencia apontarem um para o outro (imovib_studies.planta_ai_study_id).
  // Os dois vínculos do empreendimento são independentes: dá para ter um Imovib e um Planta IA
  // que nunca se falaram.
  const [axStudy, setAxStudy] = React.useState<{ selectedScenarioId: string | null; pairedWithImovib: boolean } | null>(null);
  const [axBusy, setAxBusy] = React.useState<'toImovib' | 'fromImovib' | null>(null);

  // Comercial em lote
  const [commBusy, setCommBusy] = React.useState<'publish' | 'pull' | null>(null);

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

    // Aresta Arquitetura ↔ Viabilidade
    if (e.planta_ai_study_id) {
      tasks.push((async () => {
        const [{ data: ps }, { data: im }] = await Promise.all([
          supabase.from('plant_studies').select('selected_scenario_id').eq('id', e.planta_ai_study_id!).maybeSingle(),
          e.imovib_study_id
            ? supabase.from('imovib_studies').select('planta_ai_study_id').eq('id', e.imovib_study_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        setAxStudy({
          selectedScenarioId: ps?.selected_scenario_id ?? null,
          pairedWithImovib: !!im && (im as any).planta_ai_study_id === e.planta_ai_study_id,
        });
      })().catch(() => setAxStudy(null)));
    } else {
      setAxStudy(null);
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

  // ── Empreendimento ⇄ Comercial ────────────────────────────────────────────
  const handlePublishAll = async () => {
    if (!comm || comm.unpublished === 0) return;
    const ok = await confirm({
      title: 'Publicar no Comercial?',
      message: `${comm.unpublished} unidade(s) ainda não publicada(s) serão criadas no Comercial (Venda de Ativos), agrupadas sob o edifício do empreendimento.`,
      confirmLabel: 'Publicar',
      variant: 'warning',
    });
    if (!ok) return;
    setCommBusy('publish');
    try {
      await empreendimentoService.publishAllToCommercial(e.id, organizationId);
      await load();
    } catch (err: any) {
      setStudyError(`Erro ao publicar no Comercial: ${err.message}`);
    } finally { setCommBusy(null); }
  };

  const handlePullFromCommercial = async () => {
    if (!comm || comm.statusDiverge === 0) return;
    const ok = await confirm({
      title: 'Trazer status do Comercial?',
      message: `${comm.statusDiverge} unidade(s) têm status de venda diferente no Comercial. O status de lá é a fonte (é onde a venda acontece) e será aplicado às unidades.`
        + (comm.unmappable ? `\n\n⚠ ${comm.unmappable} unidade(s) em Locado/Manutenção não têm equivalente no Empreendimento e não serão alteradas.` : ''),
      confirmLabel: 'Trazer',
      variant: 'warning',
    });
    if (!ok) return;
    setCommBusy('pull');
    try {
      await empreendimentoService.pullStatusFromCommercial(e.id, organizationId);
      await load();
    } catch (err: any) {
      setStudyError(`Erro ao sincronizar do Comercial: ${err.message}`);
    } finally { setCommBusy(null); }
  };

  // ── Aresta direta Arquitetura ⇄ Viabilidade ───────────────────────────────
  const handleAxToImovib = async () => {
    if (!e.planta_ai_study_id || !axStudy?.selectedScenarioId) return;
    const ok = await confirm({
      title: 'Testar viabilidade do cenário?',
      message: 'O cenário escolhido no Planta IA (terreno, regras, áreas e custos) será enviado ao estudo de viabilidade, recriando a volumetria lá. Não passa pelo Empreendimento.',
      confirmLabel: 'Enviar',
      variant: 'warning',
    });
    if (!ok) return;
    setAxBusy('toImovib');
    try {
      const r = await PlantaAiIntegration.sendToViabilidade(e.planta_ai_study_id, axStudy.selectedScenarioId);
      if (!r.success) throw new Error(r.error || 'Falha ao enviar para viabilidade.');
      await load();
    } catch (err: any) {
      setPlantaError(err.message);
    } finally { setAxBusy(null); }
  };

  const handleAxFromImovib = async () => {
    if (!e.planta_ai_study_id || !e.imovib_study_id) return;
    const ok = await confirm({
      title: 'Atualizar arquitetura a partir do Imovib?',
      message: 'Terreno, regras urbanísticas e briefing do estudo de arquitetura serão sobrescritos com os dados atuais da viabilidade. Os cenários já gerados não são alterados — regere-os depois se quiser refletir a mudança.',
      confirmLabel: 'Atualizar',
      variant: 'warning',
    });
    if (!ok) return;
    setAxBusy('fromImovib');
    try {
      const r = await PlantaAiIntegration.updatePlantaAiFromImovib(e.imovib_study_id, e.planta_ai_study_id);
      if (!r.success) throw new Error(r.error || 'Falha ao atualizar a partir do Imovib.');
      await load();
    } catch (err: any) {
      setPlantaError(err.message);
    } finally { setAxBusy(null); }
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

        {/* Triângulo, não estrela: Arquitetura tem DUAS arestas — uma com o hub e outra
            direta com a Viabilidade (imovib_studies.planta_ai_study_id). Desenhar só os raios
            do hub escondia a ligação mais antiga das três.

            Layout (desktop):                [ARQUITETURA]
                                        ↙(direto)      ↕
                            [VIABILIDADE] ↔ [HUB] ↔ [COMERCIAL]

            Cada aresta é um <EdgeConnector> com seus 2 botões — o conector É a ação. Ter os
            botões dentro do card do vértice fazia o ↕ Arquitetura↔Hub parecer uma ligação
            sem ação nenhuma. */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-3 items-stretch">
          {/* Linha 1 — Arquitetura, sobre o hub */}
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

          {/* Linha 2 — as duas arestas da Arquitetura */}
          <div className="hidden md:block" />
          <EdgeConnector
            orientation="diagonal"
            label="Direto"
            tint="indigo"
            active={!!axStudy?.pairedWithImovib}
            activeTitle="Arquitetura ↔ Viabilidade: ligação direta entre os dois estudos, sem passar pelo Empreendimento"
            inactiveTitle={
              !e.planta_ai_study_id || !e.imovib_study_id
                ? 'Requer os dois estudos vinculados ao empreendimento'
                : 'Os dois estudos vinculados não apontam um para o outro — use "Testar viabilidade" no Planta IA para criar o par'
            }
            actions={axStudy?.pairedWithImovib ? [
              {
                label: 'Testar viabilidade', icon: Send,
                onClick: handleAxToImovib,
                disabled: !axStudy.selectedScenarioId, busy: axBusy === 'toImovib',
                title: axStudy.selectedScenarioId ? 'Enviar o cenário escolhido ao estudo de viabilidade' : 'Escolha um cenário no Planta IA primeiro',
              },
              {
                label: 'Atualizar do Imovib', icon: Download,
                onClick: handleAxFromImovib,
                disabled: false, busy: axBusy === 'fromImovib',
                title: 'Trazer terreno, regras e briefing da viabilidade para a arquitetura',
              },
            ] : undefined}
          />
          <EdgeConnector
            orientation="vertical"
            tint="indigo"
            active={!!e.planta_ai_study_id}
            activeTitle="Arquitetura ↔ Empreendimento"
            inactiveTitle="Nenhum estudo de arquitetura vinculado — vincule pelo botão Editar"
            actions={e.planta_ai_study_id ? [
              {
                label: 'Sincronizar do cenário', icon: Download,
                onClick: handlePlantaSync,
                disabled: plantaDiverge === 0, busy: plantaSyncing,
                title: plantaDiverge === 0 ? 'Nada a sincronizar — cenário e torres alinhados' : 'Criar/atualizar torres e unidades a partir do cenário',
              },
              {
                label: 'Enviar ao cenário', icon: Upload,
                onClick: handlePlantaWriteBack,
                disabled: plantaChanges === 0, busy: plantaWritingBack,
                title: plantaChanges === 0 ? 'Nada a enviar — cenário já reflete o realizado' : 'Recalcular os agregados do cenário a partir das torres reais',
              },
            ] : undefined}
          />
          <div className="hidden md:block" />
          <div className="hidden md:block" />

          {/* Linha 3 — Viabilidade ↔ HUB ↔ Comercial */}
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

          <EdgeConnector
            orientation="horizontal"
            tint="violet"
            active={!!e.imovib_study_id}
            activeTitle="Viabilidade ↔ Empreendimento"
            inactiveTitle="Nenhum estudo de viabilidade vinculado — vincule pelo botão Editar"
            actions={e.imovib_study_id ? [
              {
                label: 'Sincronizar do estudo', icon: Download,
                onClick: onOpenStudySync,
                disabled: studyDiverge === 0, busy: false,
                title: studyDiverge === 0 ? 'Nada a sincronizar' : 'Abrir a sincronização do estudo (permite escolher o que sobrescrever)',
              },
              {
                label: 'Enviar ao estudo', icon: Upload,
                onClick: handleWriteBack,
                disabled: !writeBackReport || writeBackReport.instancesUpdated === 0, busy: writingBack,
                title: !writeBackReport || writeBackReport.instancesUpdated === 0 ? 'Nada a enviar' : 'Enviar dados estruturais das unidades ao estudo',
              },
            ] : undefined}
          />

          {/* Empreendimento (HUB) */}
          <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-4 flex flex-col items-center justify-center text-center">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl mb-2"><Building2 className="w-5 h-5" /></div>
            <span className="text-xs font-black uppercase tracking-wider text-blue-700">{e.name}</span>
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mt-0.5">Hub Central</span>
          </div>

          <EdgeConnector
            orientation="horizontal"
            tint="emerald"
            active={!!comm && comm.total > 0}
            activeTitle="Empreendimento ↔ Venda de Ativos"
            inactiveTitle="Nenhuma unidade cadastrada nas torres deste empreendimento"
            actions={comm && comm.total > 0 ? [
              {
                label: 'Publicar no Comercial', icon: Upload,
                onClick: handlePublishAll,
                disabled: comm.unpublished === 0, busy: commBusy === 'publish',
                title: comm.unpublished === 0 ? 'Todas as unidades já estão publicadas' : `Publicar ${comm.unpublished} unidade(s) não publicada(s)`,
              },
              {
                label: 'Trazer status', icon: Download,
                onClick: handlePullFromCommercial,
                disabled: comm.statusDiverge === 0, busy: commBusy === 'pull',
                title: comm.statusDiverge === 0 ? 'Nenhum status divergente' : `Aplicar o status de venda de ${comm.statusDiverge} unidade(s)`,
              },
            ] : undefined}
          />

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

              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 pt-3 border-t border-gray-100 mt-1">Do Empreendimento para o Estudo</p>
              {writeBackError ? (
                <div className="text-xs text-rose-600 font-medium flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {writeBackError}
                </div>
              ) : writeBackReport ? (
                <>
                  <DiffRow label="Unidades a enviar (estrutural)" value={writeBackReport.instancesUpdated} warn={writeBackReport.instancesUpdated > 0} />
                  <DiffRow label="Sem instância de origem" value={writeBackReport.unitsWithoutInstance} muted />
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

              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 pt-3 border-t border-gray-100 mt-1">Do Empreendimento para o Cenário</p>
              <DiffRow label="Agregados a recalcular" value={plantaChanges} warn={plantaChanges > 0} />
              <DiffRow label="Sem origem no Planta IA" value={plantaUnitsWithoutOrigin} muted />
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

/** Uma ação de sincronização de uma aresta. O sentido é comunicado pelo ícone
 *  (Download = entra no Empreendimento, Upload/Send = sai). */
interface EdgeAction {
  label: string;
  icon: any;
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
  title: string;
}

/** Os dois botões de uma aresta (um por sentido). Desabilitado quando não há o que fazer —
 *  o `title` explica o porquê, senão o botão apagado vira mistério. */
const EdgeActions: React.FC<{ actions: EdgeAction[]; tint: string }> = ({ actions, tint }) => {
  const t = TINTS[tint] ?? TINTS.violet;
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {actions.map(a => (
        <button
          key={a.label}
          onClick={a.onClick}
          disabled={a.disabled || a.busy}
          title={a.title}
          className={`flex items-center gap-1.5 h-8 px-2.5 rounded-[6px] text-[11px] font-semibold transition-all active:scale-95
            disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
            bg-white border ${t.ring} ${t.text} hover:bg-white/60 disabled:hover:bg-white`}
        >
          {a.busy
            ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            : <a.icon className="w-3.5 h-3.5 shrink-0" />}
          <span className="truncate">{a.label}</span>
        </button>
      ))}
    </div>
  );
};

/**
 * Uma aresta do diagrama: o ícone da ligação + os 2 botões (um por sentido).
 *
 * Toda aresta é um conector — inclusive a que liga ao hub. Ter os botões dentro do card do
 * vértice e só a aresta "Direto" com botões próprios fazia o `↕` Arquitetura↔Hub parecer uma
 * ligação sem ação nenhuma (feedback real do usuário). Aqui o conector é a ação.
 *
 * Visível também no mobile: com `hidden md:flex` os botões sumiriam na coluna única.
 */
const EdgeConnector: React.FC<{
  orientation: 'horizontal' | 'vertical' | 'diagonal';
  label?: string;
  tint: string;
  active: boolean;
  inactiveTitle?: string;
  activeTitle?: string;
  actions?: EdgeAction[];
}> = ({ orientation, label, tint, active, inactiveTitle, activeTitle, actions }) => {
  const t = TINTS[tint] ?? TINTS.violet;
  const rot = orientation === 'vertical' ? 'rotate-90' : orientation === 'diagonal' ? '-rotate-45' : '';
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 min-w-[168px] py-1">
      <div className="flex items-center gap-1.5" title={active ? activeTitle : inactiveTitle}>
        <ArrowLeftRight className={`w-4 h-4 ${rot} ${active ? t.text : 'text-gray-300'}`} />
        {label && (
          <span className={`text-[9px] font-bold uppercase tracking-widest ${active ? t.text : 'text-gray-300'}`}>
            {label}
          </span>
        )}
      </div>
      {active && actions
        ? <EdgeActions actions={actions} tint={tint} />
        : (
          <span className="text-[9px] text-gray-300 font-medium text-center leading-snug max-w-[160px]" title={inactiveTitle}>
            {inactiveTitle ? 'Sem vínculo' : ''}
          </span>
        )}
    </div>
  );
};

/** Vértice = só estado (vínculo, divergências, rodapé). As ações vivem nos conectores. */
const VertexCard: React.FC<{
  icon: any; tint: string; title: string; subtitle: string;
  linked: boolean; unlinkedLabel: string; error: string | null;
  divergences: number; extraOrphans: number; footer: string | null;
  className?: string;
}> = ({ icon: Icon, tint, title, subtitle, linked, unlinkedLabel, error, divergences, footer, className = '' }) => {
  const t = TINTS[tint] ?? TINTS.violet;
  const aligned = linked && !error && divergences === 0;
  return (
    <div className={`rounded-2xl border ${t.ring} ${t.bg} p-4 flex flex-col ${className}`}>
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
      {footer && <span className="text-[9px] font-medium text-gray-400 pt-2">{footer}</span>}
    </div>
  );
};

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
