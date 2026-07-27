// components/empreendimento/SyncCenterTab.tsx
// Centro de Sincronização dos ESTUDOS — mapa vivo das ligações do Empreendimento com a
// Viabilidade (Imovib) e a Arquitetura (Planta IA), e o lugar de onde esses syncs são
// disparados. O desenho é um triângulo: além das duas arestas com o hub, Arquitetura e
// Viabilidade falam DIRETO entre si (imovib_studies.planta_ai_study_id) — a aresta mais
// antiga das três, que ficava invisível e dava a impressão de que tudo passava pelo hub.
//
// As pontes com Comercial (Venda de Ativos) e Locações NÃO moram mais aqui: elas viviam
// duplicadas com as abas Espelho de Vendas / Espelho de Locações, que fazem o mesmo
// publish/pull de forma mais rica (unidade a unidade, órfãos, endereço, KPIs). Aqui ficou
// só o que não existe em nenhum outro lugar: o sync dos estudos (ui_ux_guia_unificado.md §6.4).
//
// Os botões vivem nos cards do diagrama (2 por aresta, um por sentido); os cards de
// detalhe abaixo ficam só com os números que justificam a ação.
import React from 'react';
import {
  Loader2, RefreshCw, BarChart3, Building2, ArrowLeftRight,
  CheckCircle2, AlertTriangle, Link2Off, Clock, Upload, Ruler,
  Download, Send,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { empreendimentoService } from '../../services/empreendimentoService';
import { plantaEmpreendimentoSync } from '../../services/plantaEmpreendimentoSync';
import { PlantaAiIntegration } from '../../services/plantaAiIntegration';
import { previewWriteBackImovib, applyWriteBackImovib, WriteBackItem } from '../../services/sync/writeBackImovib';
import { Empreendimento, EmpreendimentoSyncReport, PlantaAiSyncReport, PlantaAiWriteBackReport } from '../../types';
import { useConfirm } from '../ui/confirm';
import WriteBackPreviewSheet from './WriteBackPreviewSheet';

interface Props {
  empreendimento: Empreendimento;
  onOpenStudySync: () => void;
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return null;
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
};

export const SyncCenterTab: React.FC<Props> = ({ empreendimento: e, onOpenStudySync }) => {
  const confirm = useConfirm();
  const [loading, setLoading] = React.useState(true);
  const [studyReport, setStudyReport] = React.useState<EmpreendimentoSyncReport | null>(null);
  const [studyError, setStudyError] = React.useState<string | null>(null);
  const [writeBackItems, setWriteBackItems] = React.useState<WriteBackItem[] | null>(null);
  const [writeBackError, setWriteBackError] = React.useState<string | null>(null);
  const [writingBack, setWritingBack] = React.useState(false);
  const [writeBackSheetOpen, setWriteBackSheetOpen] = React.useState(false);

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
        previewWriteBackImovib(e.id)
          .then(r => setWriteBackItems(r))
          .catch(err => { setWriteBackError(err.message); setWriteBackItems(null); })
      );
    } else {
      setStudyReport(null);
      setWriteBackItems(null);
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

    await Promise.all(tasks);
    setLoading(false);
  }, [e.id, e.imovib_study_id, e.planta_ai_study_id]);

  React.useEffect(() => { load(); }, [load]);

  // Abre o preview com seleção (em vez de um sim/não): o usuário decide o que atualizar e o
  // que criar no estudo. A aplicação real acontece em handleWriteBackApply.
  const handleWriteBack = () => {
    if (!writeBackItems || writeBackItems.length === 0) return;
    setWriteBackSheetOpen(true);
  };

  const handleWriteBackApply = async (selectedUnitIds: string[]) => {
    setWritingBack(true);
    try {
      await applyWriteBackImovib(e.id, selectedUnitIds);
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

  // Write-back Emp→Viabilidade: quantas unidades seriam atualizadas e quantas criadas no estudo.
  const wbTotal = writeBackItems?.length ?? 0;
  const wbCreates = writeBackItems?.filter(i => i.kind === 'create').length ?? 0;
  const wbUpdates = writeBackItems?.filter(i => i.kind === 'update').length ?? 0;

  // Divergências de Viabilidade = itens que o sync criaria/atualizaria
  const studyDiverge = studyReport
    ? studyReport.towersCreated + studyReport.towersUpdated + studyReport.unitsCreated + studyReport.unitsUpdated
    : 0;
  const studyOrphans = studyReport
    ? studyReport.orphanTowers.length + studyReport.orphanUnits.length
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
      <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xs font-semibold text-gray-500 flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-blue-600" /> Centro de Sincronização
          </h3>
          <button
            onClick={load}
            className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-[6px] bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 transition-all active:scale-95"
          >
            <RefreshCw className="w-3 h-3" /> Recarregar
          </button>
        </div>

        {/* Triângulo dos estudos: Arquitetura tem DUAS arestas — uma com o hub e outra
            direta com a Viabilidade (imovib_studies.planta_ai_study_id). Desenhar só os raios
            do hub escondia a ligação mais antiga das três.

            Layout (desktop):                     [ARQUITETURA]
                                             ↙(direto)      ↕
                                 [VIABILIDADE] ↔ [HUB]

            Cada aresta é um <EdgeConnector> com seus 2 botões — o conector É a ação. Ter os
            botões dentro do card do vértice fazia o ↕ Arquitetura↔Hub parecer uma ligação
            sem ação nenhuma. */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
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

          {/* Linha 2 — aresta Arquitetura ↔ Hub. A aresta direta Arquitetura↔Viabilidade
              NÃO mora aqui: ver a faixa abaixo do grid. */}
          <div className="hidden md:block" />
          <div className="hidden md:block" />
          <EdgeConnector
            orientation="vertical"
            label="Arquitetura ↔ Empreendimento"
            tint="indigo"
            active={!!e.planta_ai_study_id}
            activeTitle="Arquitetura ↔ Empreendimento"
            inactiveTitle="Nenhum estudo de arquitetura vinculado — vincule pelo botão Editar"
            actions={e.planta_ai_study_id ? [
              {
                label: 'Sincronizar do cenário', icon: Download, direction: 'in',
                onClick: handlePlantaSync,
                disabled: plantaDiverge === 0, busy: plantaSyncing,
                title: plantaDiverge === 0 ? 'Nada a sincronizar — cenário e torres alinhados' : 'Criar/atualizar torres e unidades a partir do cenário',
              },
              {
                label: 'Enviar ao cenário', icon: Upload, direction: 'out',
                onClick: handlePlantaWriteBack,
                disabled: plantaChanges === 0, busy: plantaWritingBack,
                title: plantaChanges === 0 ? 'Nada a enviar — cenário já reflete o realizado' : 'Recalcular os agregados do cenário a partir das torres reais',
              },
            ] : undefined}
          />

          {/* Linha 3 — Viabilidade ↔ HUB */}
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
            label="Viabilidade ↔ Empreendimento"
            tint="violet"
            active={!!e.imovib_study_id}
            activeTitle="Viabilidade ↔ Empreendimento"
            inactiveTitle="Nenhum estudo de viabilidade vinculado — vincule pelo botão Editar"
            actions={e.imovib_study_id ? [
              {
                label: 'Sincronizar do estudo', icon: Download, direction: 'in',
                onClick: onOpenStudySync,
                disabled: studyDiverge === 0, busy: false,
                title: studyDiverge === 0 ? 'Nada a sincronizar' : 'Abrir a sincronização do estudo (permite escolher o que sobrescrever)',
              },
              {
                label: 'Enviar ao estudo', icon: Upload, direction: 'out',
                onClick: handleWriteBack,
                disabled: wbTotal === 0, busy: writingBack,
                title: wbTotal === 0 ? 'Nada a enviar' : `Enviar ${wbTotal} unidade(s) ao estudo (${wbCreates} nova(s), ${wbUpdates} atualização(ões))`,
              },
            ] : undefined}
          />

          {/* Empreendimento (HUB) — rótulo de diagrama (nomeia o nó central do desenho, §8.1), uppercase mantido */}
          <div className="rounded-[10px] border-2 border-blue-200 bg-blue-50/40 p-4 flex flex-col items-center justify-center text-center">
            <div className="p-2.5 bg-blue-600 text-white rounded-[6px] mb-2"><Building2 className="w-5 h-5" /></div>
            <span className="text-xs font-black uppercase tracking-wider text-blue-700">{e.name}</span>
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mt-0.5">Hub Central</span>
          </div>
        </div>

        {/* Aresta direta Arquitetura ↔ Viabilidade — em faixa própria, de propósito.
            Ela liga dois VÉRTICES (Arquitetura no topo, Viabilidade na ponta esquerda) sem
            passar pelo hub, então não existe coluna do grid que seja "dela": quando morava na
            coluna 2, caía embaixo da aresta Viabilidade↔Hub e os 4 botões liam como um menu
            único da Viabilidade — a seta girada -45° era a única pista do contrário
            (feedback real, 2026-07-16). Aqui ela tem nome, explicação e espaço próprios. */}
        <div className="mt-5 pt-5 border-t border-dashed border-gray-200">
          <div className="rounded-[10px] border border-indigo-100 bg-indigo-50/40 p-3 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <ArrowLeftRight className={`w-4 h-4 -rotate-45 shrink-0 mt-0.5 ${axStudy?.pairedWithImovib ? 'text-indigo-600' : 'text-gray-300'}`} />
              <div className="min-w-0">
                <p className={`text-[10px] font-bold uppercase tracking-widest ${axStudy?.pairedWithImovib ? 'text-indigo-700' : 'text-gray-400'}`}>
                  Arquitetura ↔ Viabilidade
                </p>
                <p className="text-[10px] text-gray-500 font-medium leading-relaxed mt-0.5">
                  Ligação direta entre os dois estudos — não passa pelo Empreendimento.
                </p>
              </div>
            </div>
            {axStudy?.pairedWithImovib ? (
              <EdgeActions
                tint="indigo"
                layout="row"
                actions={[
                  {
                    label: 'Testar viabilidade', icon: Send, direction: 'out',
                    onClick: handleAxToImovib,
                    disabled: !axStudy.selectedScenarioId, busy: axBusy === 'toImovib',
                    title: axStudy.selectedScenarioId ? 'Enviar o cenário escolhido ao estudo de viabilidade' : 'Escolha um cenário no Planta IA primeiro',
                  },
                  {
                    label: 'Atualizar do Imovib', icon: Download, direction: 'in',
                    onClick: handleAxFromImovib,
                    disabled: false, busy: axBusy === 'fromImovib',
                    title: 'Trazer terreno, regras e briefing da viabilidade para a arquitetura',
                  },
                ]}
              />
            ) : (
              <span
                className="text-[10px] text-gray-400 font-medium shrink-0"
                title={
                  !e.planta_ai_study_id || !e.imovib_study_id
                    ? 'Requer os dois estudos vinculados ao empreendimento'
                    : 'Os dois estudos vinculados não apontam um para o outro — use "Testar viabilidade" no Planta IA para criar o par'
                }
              >
                Sem vínculo direto
              </span>
            )}
          </div>
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
              <p className="text-[10px] font-semibold text-gray-400 pt-1">Do estudo para o empreendimento</p>
              <DiffRow label="Torres a criar" value={studyReport.towersCreated} />
              <DiffRow label="Torres a atualizar" value={studyReport.towersUpdated} />
              <DiffRow label="Unidades a criar" value={studyReport.unitsCreated} />
              <DiffRow label="Unidades a atualizar" value={studyReport.unitsUpdated} />
              <DiffRow label="Estado comercial preservado" value={studyReport.skippedDueToLocalChanges.length} muted />
              {studyOrphans > 0 && <DiffRow label="Itens órfãos (mantidos)" value={studyOrphans} warn />}

              <p className="text-[10px] font-semibold text-gray-400 pt-3 border-t border-gray-100 mt-1">Do empreendimento para o estudo</p>
              {writeBackError ? (
                <div className="text-xs text-rose-600 font-medium flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {writeBackError}
                </div>
              ) : writeBackItems ? (
                <>
                  <DiffRow label="Unidades a atualizar no estudo" value={wbUpdates} warn={wbUpdates > 0} />
                  <DiffRow label="Unidades a criar no estudo" value={wbCreates} warn={wbCreates > 0} />
                  <p className="text-[9px] text-gray-400 font-medium leading-relaxed pt-1">
                    Envia nome, pavimento, área privativa, posição e orientação — criando bloco/unidade no estudo quando não existirem lá. Preço, status e tipologia nunca são propagados.
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
              <p className="text-[10px] font-semibold text-gray-400 pt-1">Do cenário para o empreendimento</p>
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

              <p className="text-[10px] font-semibold text-gray-400 pt-3 border-t border-gray-100 mt-1">Do empreendimento para o cenário</p>
              <DiffRow label="Agregados a recalcular" value={plantaChanges} warn={plantaChanges > 0} />
              <DiffRow label="Sem origem no Planta IA" value={plantaUnitsWithoutOrigin} muted />
              <p className="text-[9px] text-gray-400 font-medium leading-relaxed pt-1">
                Envia pavimentos, unidades por andar, total de unidades e áreas. VGV, custo e status de venda nunca voltam ao cenário.
              </p>
            </>
          ) : null}
        </RelationCard>

      </div>

      {/* Onde foram parar as pontes com Vendas e Locações — o publish/pull dessas duas
          agora mora só nas abas Espelho, que fazem o mesmo de forma mais rica. */}
      <div className="bg-blue-50/40 border border-dashed border-blue-200 rounded-[10px] p-4 flex items-start gap-2.5">
        <ArrowLeftRight className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-gray-600 font-medium leading-relaxed">
          As pontes com <strong className="text-gray-700">Venda de Ativos</strong> e <strong className="text-gray-700">Locações</strong> (publicar unidades e trazer status)
          ficam nas abas <strong className="text-gray-700">Espelho de Vendas</strong> e <strong className="text-gray-700">Espelho de Locações</strong>, onde você
          resolve unidade a unidade, limpa vínculos órfãos e acompanha os KPIs. Este centro cuida só do sync com os estudos.
        </p>
      </div>

      {/* Limitação conhecida */}
      <div className="bg-gray-50/60 border border-dashed border-gray-200 rounded-[10px] p-4 flex items-start gap-2.5">
        <Clock className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500 font-medium leading-relaxed">
          <strong className="text-gray-600">Tipologia</strong> não é enviada de volta ao estudo — mudar a tipologia de
          uma unidade exige re-vincular a instância a um tipo diferente no Imovib, uma operação estrutural que ainda
          não tem escrita reversa automática. Ajuste manualmente no estudo quando necessário.
        </p>
      </div>

      <WriteBackPreviewSheet
        open={writeBackSheetOpen}
        onClose={() => setWriteBackSheetOpen(false)}
        items={writeBackItems ?? []}
        onApply={handleWriteBackApply}
      />
    </div>
  );
};

// ── Sub-componentes ───────────────────────────────────────────────────────────

const TINTS: Record<string, { bg: string; text: string; ring: string; soft: string }> = {
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-600',  ring: 'border-violet-100', soft: 'bg-violet-100/60 border-violet-200 text-violet-700 hover:bg-violet-100' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'border-emerald-100', soft: 'bg-emerald-100/60 border-emerald-200 text-emerald-700 hover:bg-emerald-100' },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-600',  ring: 'border-indigo-100', soft: 'bg-indigo-100/60 border-indigo-200 text-indigo-700 hover:bg-indigo-100' },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-600',    ring: 'border-teal-100',   soft: 'bg-teal-100/60 border-teal-200 text-teal-700 hover:bg-teal-100' },
};

/** Botão de saída: neutro de propósito. Ter os 2 sentidos com a mesma pílula branca
 *  deixava o ícone de 14px (Download vs Upload) como único diferenciador. */
const OUT_BTN = 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50';

/** Uma ação de sincronização de uma aresta. O sentido é comunicado pelo ícone
 *  (Download = entra, Upload/Send = sai) E pelo preenchimento (`direction`). */
interface EdgeAction {
  label: string;
  icon: any;
  /** 'in' = traz dados para este lado (tingido) · 'out' = leva para o outro lado (neutro) */
  direction: 'in' | 'out';
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
  title: string;
}

/** Os dois botões de uma aresta (um por sentido). Desabilitado quando não há o que fazer —
 *  o `title` explica o porquê, senão o botão apagado vira mistério. */
const EdgeActions: React.FC<{ actions: EdgeAction[]; tint: string; layout?: 'stack' | 'row' }> = ({ actions, tint, layout = 'stack' }) => {
  const t = TINTS[tint] ?? TINTS.violet;
  return (
    <div className={layout === 'row' ? 'flex flex-row gap-1.5 shrink-0' : 'flex flex-col gap-1.5 w-full'}>
      {actions.map(a => (
        <button
          key={a.label}
          onClick={a.onClick}
          disabled={a.disabled || a.busy}
          title={a.title}
          className={`flex items-center gap-1.5 h-8 px-2.5 rounded-[6px] text-[11px] font-semibold border transition-all active:scale-95
            disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
            ${a.direction === 'in' ? t.soft : OUT_BTN}`}
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
 * Uma aresta do diagrama: o ícone da ligação + os 2 botões (um por sentido), agrupados
 * numa caixa que leva o NOME da ligação.
 *
 * Toda aresta é um conector — inclusive a que liga ao hub. Ter os botões dentro do card do
 * vértice e só a aresta "Direto" com botões próprios fazia o `↕` Arquitetura↔Hub parecer uma
 * ligação sem ação nenhuma (feedback real do usuário). Aqui o conector é a ação.
 *
 * O `label` é obrigatório: quando só a aresta "Direto" tinha rótulo, os outros três pares de
 * botões flutuavam sem dizer a que ligação pertenciam (feedback real, 2026-07-16). A caixa ao
 * redor existe pelo mesmo motivo — sem ela, dois pares na mesma coluna leem como uma lista
 * única de 4 opções, porque proximidade agrupa mais forte que espaço em branco.
 *
 * Visível também no mobile: com `hidden md:flex` os botões sumiriam na coluna única.
 */
const EdgeConnector: React.FC<{
  orientation: 'horizontal' | 'vertical';
  label: string;
  tint: string;
  active: boolean;
  inactiveTitle?: string;
  activeTitle?: string;
  actions?: EdgeAction[];
}> = ({ orientation, label, tint, active, inactiveTitle, activeTitle, actions }) => {
  const t = TINTS[tint] ?? TINTS.violet;
  const rot = orientation === 'vertical' ? 'rotate-90' : '';
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 min-w-[176px] py-1">
      {/* `title` vai no <span>, não no ícone: os componentes do lucide-react não aceitam
          `title` como prop (só passam adiante props de <svg> tipadas em LucideProps). */}
      <span className="flex" title={active ? activeTitle : inactiveTitle}>
        <ArrowLeftRight className={`w-4 h-4 ${rot} ${active ? t.text : 'text-gray-300'}`} />
      </span>
      {active && actions ? (
        <div className={`w-full rounded-[10px] border ${t.ring} ${t.bg} p-2`}>
          <p className={`text-[9px] font-bold uppercase tracking-widest text-center leading-tight mb-1.5 ${t.text}`}>
            {label}
          </p>
          <EdgeActions actions={actions} tint={tint} />
        </div>
      ) : (
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
    <div className={`rounded-[10px] border ${t.ring} ${t.bg} p-4 flex flex-col ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-2 bg-white rounded-[6px] ${t.text} border ${t.ring}`}><Icon className="w-4 h-4" /></div>
        <div className="min-w-0">
          {/* Rótulo de diagrama — nomeia um vértice do desenho (§8.1), uppercase mantido */}
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
    <div className="bg-white p-5 rounded-[10px] border border-gray-100 shadow-sm">
      <h4 className="text-xs font-semibold text-gray-500 mb-4 flex items-center gap-2">
        <span className={`p-1.5 rounded-[6px] ${t.bg} ${t.text}`}><Icon className="w-3.5 h-3.5" /></span>
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
