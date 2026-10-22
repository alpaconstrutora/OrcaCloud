// components/empreendimento/SyncCenterTab.tsx
// Centro de Sincronização dos ESTUDOS — mapa vivo das ligações do Empreendimento com a
// Arquitetura (Planta Inteligente: massa e loteamento) e a Viabilidade (Imovib), e o lugar
// de onde esses syncs são disparados. Tudo passa pelo hub: a aresta direta Arquitetura ↔
// Viabilidade era do Planta AI v1, removido em 19/10/2026
// (docs/planos/2026-10-19-remover-planta-ai.md).
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
  Download, LandPlot
} from 'lucide-react';
import { blueprintEmpreendimentoSync } from '../../services/blueprintEmpreendimentoSync';
import { massaEmpreendimentoSync } from '../../services/massaEmpreendimentoSync';
import { terrenoEmpreendimentoSync, type TerrenoSyncReport } from '../../services/terrenoEmpreendimentoSync';
import { previewWriteBackImovib, applyWriteBackImovib, WriteBackItem } from '../../services/sync/writeBackImovib';
import { Empreendimento, ArquiteturaSyncReport } from '../../types';
import { useConfirm } from '../ui/confirm';
import WriteBackPreviewSheet from './WriteBackPreviewSheet';

interface Props {
  empreendimento: Empreendimento;
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return null;
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
};

export const SyncCenterTab: React.FC<Props> = ({ empreendimento: e }) => {
  const confirm = useConfirm();
  const [loading, setLoading] = React.useState(true);
  const [writeBackItems, setWriteBackItems] = React.useState<WriteBackItem[] | null>(null);
  const [writeBackError, setWriteBackError] = React.useState<string | null>(null);
  const [writingBack, setWritingBack] = React.useState(false);
  const [writeBackSheetOpen, setWriteBackSheetOpen] = React.useState(false);

  // ESTUDO DE MASSA — Planta Inteligente (M3). Mão única, como o loteamento: a
  // massa publicada é a origem das torres e unidades; preço e status são do
  // empreendimento. Desde 02/10/2026 a ARQUITETURA do empreendimento é a Planta
  // Inteligente (massa + loteamento).
  const [massaReport, setMassaReport] = React.useState<ArquiteturaSyncReport | null>(null);
  const [massaError, setMassaError] = React.useState<string | null>(null);
  const [massaSyncing, setMassaSyncing] = React.useState(false);

  // Loteamento — Planta Inteligente (B3). Não tem write-back: o desenho é a
  // origem, e reconstruir geometria a partir de uma área não tem solução única.
  const [loteamentoReport, setLoteamentoReport] = React.useState<ArquiteturaSyncReport | null>(null);
  const [loteamentoError, setLoteamentoError] = React.useState<string | null>(null);
  const [loteamentoSyncing, setLoteamentoSyncing] = React.useState(false);
  // TERRENO da planta (22/10/2026): campos do próprio empreendimento — vazio preenche, diferente vai à Curadoria.
  const [terrenoReport, setTerrenoReport] = React.useState<TerrenoSyncReport | null>(null);
  const [terrenoError, setTerrenoError] = React.useState<string | null>(null);
  const [terrenoSyncing, setTerrenoSyncing] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setWriteBackError(null);
    setLoteamentoError(null);
    setMassaError(null);
    const tasks: Promise<void>[] = [];

    // Viabilidade — só o espelho (empreendimento → estudo). A estrutura o estudo LÊ
    // daqui desde 19/10/2026 (utils/imovibEstrutura.ts): não há mais o que puxar dele.
    if (e.imovib_study_id) {
      tasks.push(
        previewWriteBackImovib(e.id)
          .then(r => setWriteBackItems(r))
          .catch(err => { setWriteBackError(err.message); setWriteBackItems(null); })
      );
    } else {
      setWriteBackItems(null);
    }

    // Planta Inteligente — massa e LOTEAMENTO (B3): a terceira aresta. So roda o dry-run com estudo vinculado.
    if (e.blueprint_study_id) {
      tasks.push(
        blueprintEmpreendimentoSync.previewSync(e.id)
          .then(r => setLoteamentoReport(r))
          .catch(err => { setLoteamentoError(err.message); setLoteamentoReport(null); })
      );
      tasks.push(
        massaEmpreendimentoSync.previewSync(e.id)
          .then(r => setMassaReport(r))
          .catch(err => { setMassaError(err.message); setMassaReport(null); })
      );
      tasks.push(
        terrenoEmpreendimentoSync.previewSync(e.id)
          .then(r => { setTerrenoError(null); setTerrenoReport(r); })
          .catch(err => { setTerrenoError(err.message); setTerrenoReport(null); })
      );
    } else {
      setLoteamentoReport(null);
      setMassaReport(null);
      setTerrenoReport(null);
    }

    await Promise.all(tasks);
    setLoading(false);
  }, [e.id, e.imovib_study_id, e.blueprint_study_id]);

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

  const loteamentoOrphans = (loteamentoReport?.orphanTowers.length ?? 0) + (loteamentoReport?.orphanUnits.length ?? 0);
  const loteamentoTotal = loteamentoReport
    ? loteamentoReport.towersCreated + loteamentoReport.towersUpdated + loteamentoReport.unitsCreated + loteamentoReport.unitsUpdated
    : 0;

  /** LOTEAMENTO (B3): traz as quadras e os lotes da versão PUBLICADA do desenho. */
  const handleLoteamentoSync = async () => {
    if (!loteamentoReport) return;
    const total = loteamentoReport.towersCreated + loteamentoReport.towersUpdated
      + loteamentoReport.unitsCreated + loteamentoReport.unitsUpdated;
    if (total === 0) return;
    const ok = await confirm({
      title: 'Trazer o loteamento para o empreendimento?',
      message: `Serão criadas/atualizadas ${loteamentoReport.towersCreated + loteamentoReport.towersUpdated} quadra(s) e ${loteamentoReport.unitsCreated + loteamentoReport.unitsUpdated} lote(s) a partir da versão PUBLICADA do desenho.

Só a geometria vem do desenho (quadra, número, área, testada e confrontantes). Preço e status de venda dos lotes já existentes não são tocados.`,
      confirmLabel: 'Trazer',
      variant: 'warning',
    });
    if (!ok) return;
    setLoteamentoSyncing(true);
    try {
      await blueprintEmpreendimentoSync.syncToEmpreendimento(e.id);
      await load();
    } catch (err: any) {
      setLoteamentoError(err.message);
    } finally {
      setLoteamentoSyncing(false);
    }
  };

  /** TERRENO: vazio entra na ficha; diferente vira proposta na Curadoria (nada é sobrescrito aqui). */
  const terrenoTotal = (terrenoReport?.fills.length ?? 0) + (terrenoReport?.conflicts.length ?? 0);
  const handleTerrenoSync = async () => {
    if (!terrenoReport || terrenoTotal === 0) return;
    const ok = await confirm({
      title: 'Trazer o terreno da planta?',
      message:
        `${terrenoReport.fills.length} campo(s) vazio(s) da ficha serão preenchidos com o terreno da versão PUBLICADA da planta.` +
        (terrenoReport.conflicts.length > 0
          ? `\n\n${terrenoReport.conflicts.length} campo(s) com valor diferente NÃO são trocados: viram propostas na aba Curadoria, para você aprovar ou rejeitar um a um.`
          : ''),
      confirmLabel: 'Trazer',
      variant: 'warning',
    });
    if (!ok) return;
    setTerrenoSyncing(true);
    try {
      await terrenoEmpreendimentoSync.syncToEmpreendimento(e.id);
      await load();
    } catch (err: any) {
      setTerrenoError(err.message);
    } finally {
      setTerrenoSyncing(false);
    }
  };

  const handleMassaSync = async () => {
    if (!massaReport) return;
    const total = massaReport.towersCreated + massaReport.towersUpdated + massaReport.unitsCreated + massaReport.unitsUpdated;
    if (total === 0) return;
    const ok = await confirm({
      title: 'Trazer o estudo de massa para o empreendimento?',
      message: `Serão criadas/atualizadas ${massaReport.towersCreated + massaReport.towersUpdated} torre(s) e ${massaReport.unitsCreated + massaReport.unitsUpdated} unidade(s) a partir da versão PUBLICADA do estudo de massa (com o produto congelado nela).

A estrutura vem da massa (pavimentos, unidades, áreas, tipologia); preço, status, posição e orientação só nascem com a unidade — o que o cadastro já tem não é tocado. Unidade que sumiu da massa fica como órfã, nunca é apagada.`,
      confirmLabel: 'Trazer',
      variant: 'warning',
    });
    if (!ok) return;
    setMassaSyncing(true);
    try {
      await massaEmpreendimentoSync.syncToEmpreendimento(e.id);
      await load();
    } catch (err: any) {
      setMassaError(err.message);
    } finally {
      setMassaSyncing(false);
    }
  };

  // Write-back Emp→Viabilidade: quantas unidades seriam atualizadas e quantas criadas no estudo.
  const wbTotal = writeBackItems?.length ?? 0;
  const wbCreates = writeBackItems?.filter(i => i.kind === 'create').length ?? 0;
  const wbUpdates = writeBackItems?.filter(i => i.kind === 'update').length ?? 0;

  // Planta Inteligente: um estudo é de massa OU de loteamento (ou ainda nenhum dos dois).
  const totalDe = (r: ArquiteturaSyncReport | null) => (r ? r.towersCreated + r.towersUpdated + r.unitsCreated + r.unitsUpdated : 0);
  const orfaosDe = (r: ArquiteturaSyncReport | null) => (r ? r.orphanTowers.length + r.orphanUnits.length : 0);
  const massaTotal = totalDe(massaReport);
  const loteamentoTotalArq = totalDe(loteamentoReport);
  const temMassa = !!massaReport && (massaReport.scenarioUnits > 0 || massaTotal > 0 || orfaosDe(massaReport) > 0);
  const temLote = !!loteamentoReport && (loteamentoReport.scenarioUnits > 0 || loteamentoTotalArq > 0 || orfaosDe(loteamentoReport) > 0);
  // Sem nenhum dos dois, os dois cards aparecem — cada um diz o que falta.
  const mostrarMassa = !!e.blueprint_study_id && (temMassa || !temLote);
  const mostrarLote = !!e.blueprint_study_id && (temLote || !temMassa);

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

        {/* Os estudos em volta do hub.

            Layout (desktop):                     [ARQUITETURA]
                                                            ↕
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
            subtitle="Planta Inteligente"
            linked={!!e.blueprint_study_id}
            unlinkedLabel="Nenhum estudo vinculado"
            error={massaError || loteamentoError}
            divergences={massaTotal + loteamentoTotalArq}
            extraOrphans={orfaosDe(massaReport) + orfaosDe(loteamentoReport)}
            footer={
              temMassa
                ? `${massaReport!.scenarioUnits} unidade(s) na massa publicada`
                : temLote
                  ? `${loteamentoReport!.scenarioUnits} lote(s) no desenho publicado`
                  : null
            }
          />

          {/* Linha 2 — aresta Arquitetura ↔ Hub. */}
          <div className="hidden md:block" />
          <div className="hidden md:block" />
          <EdgeConnector
            orientation="vertical"
            label="Arquitetura → Empreendimento"
            tint="indigo"
            active={!!e.blueprint_study_id}
            activeTitle="Planta Inteligente → Empreendimento (o desenho publicado é a origem)"
            inactiveTitle="Nenhum estudo da Planta Inteligente vinculado — vincule pelo botão Editar, ou envie desde a própria planta"
            actions={e.blueprint_study_id ? [
              ...(mostrarMassa ? [{
                label: 'Trazer da massa', icon: Download, direction: 'in' as const,
                onClick: handleMassaSync,
                disabled: massaTotal === 0, busy: massaSyncing,
                title: massaTotal === 0 ? 'Nada a trazer: o empreendimento já reflete a massa publicada' : 'Criar/atualizar torres e unidades a partir da versão publicada do estudo de massa',
              }] : []),
              ...(mostrarLote && temLote ? [{
                label: 'Trazer o loteamento', icon: Download, direction: 'in' as const,
                onClick: handleLoteamentoSync,
                disabled: loteamentoTotalArq === 0, busy: loteamentoSyncing,
                title: loteamentoTotalArq === 0 ? 'Nada a trazer: o empreendimento já reflete o loteamento publicado' : 'Criar/atualizar quadras e lotes a partir da versão publicada',
              }] : []),
              {
                label: 'Abrir a planta', icon: Upload, direction: 'out' as const,
                onClick: () => { window.location.hash = `#/blueprint?studyId=${e.blueprint_study_id}`; },
                disabled: false, busy: false,
                title: 'Abrir o estudo na Planta Inteligente (o caminho de volta é mudar o desenho e publicar — preço e status nunca voltam)',
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
            error={writeBackError}
            divergences={wbTotal}
            extraOrphans={0}
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
          ) : (
            <>
              <p className="text-xs text-gray-600 pt-1">
                Torres, unidades e áreas: o estudo lê direto deste empreendimento. O que a Planta
                Inteligente enviar aqui aparece na Viabilidade na próxima abertura.
              </p>

              <p className="text-[10px] font-semibold text-gray-400 pt-3 border-t border-gray-100 mt-1">Espelho de vendas do estudo</p>
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
          )}
        </RelationCard>

        {/* Sem estudo vinculado: um card só, genérico — não faz sentido chamar de "loteamento" o que ainda não existe. */}
        {!e.blueprint_study_id && (
          <RelationCard title="Planta Inteligente → Empreendimento" icon={Ruler} tint="indigo">
            <EmptyHint icon={Link2Off} text="Este empreendimento não está vinculado a um estudo da Planta Inteligente. Vincule pelo botão Editar, ou envie desde a própria planta (estudo de massa ou loteamento)." />
          </RelationCard>
        )}

        {/* ESTUDO DE MASSA → EMPREENDIMENTO (M3): a arquitetura do empreendimento. */}
        {mostrarMassa && (
          <RelationCard title="Estudo de massa → Empreendimento" icon={Ruler} tint="indigo">
            {massaError ? (
              <div className="text-xs text-rose-600 font-medium flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {massaError}
              </div>
            ) : massaReport ? (
              <>
                <p className="text-[10px] font-semibold text-gray-400 pt-1">Da massa publicada para o empreendimento</p>
                <DiffRow label="Torres a criar" value={massaReport.towersCreated} />
                <DiffRow label="Torres a atualizar" value={massaReport.towersUpdated} />
                <DiffRow label="Unidades a criar" value={massaReport.unitsCreated} />
                <DiffRow label="Unidades a atualizar" value={massaReport.unitsUpdated} />
                <DiffRow label="Unidades na massa" value={massaReport.scenarioUnits} muted />
                {orfaosDe(massaReport) > 0 && <DiffRow label="Itens órfãos (mantidos)" value={orfaosDe(massaReport)} warn />}
                {massaReport.warnings.map((w, i) => (
                  <p key={i} className="text-[10px] text-amber-600 font-medium flex items-start gap-1.5 leading-relaxed pt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {w}
                  </p>
                ))}
                <button
                  type="button"
                  onClick={handleMassaSync}
                  disabled={massaSyncing || massaTotal === 0}
                  title={massaTotal === 0 ? 'Nada a trazer: o empreendimento já reflete a massa publicada' : 'Traz torres e unidades da versão publicada — preço e status das existentes não são tocados'}
                  className="mt-3 w-full rounded-[8px] bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                  data-testid="trazer-da-massa"
                >
                  {massaSyncing ? 'Trazendo…' : `Trazer ${massaTotal || ''} ${massaTotal === 1 ? 'item' : 'itens'}`.trim()}
                </button>
                <p className="text-[9px] text-gray-400 font-medium leading-relaxed pt-1">
                  Vem da massa: torre (pavimentos, unidades por andar, custo e preço/m² de referência) e unidade (nome, andar, tipologia, áreas, dormitórios). Preço, status, posição e orientação só nascem com a unidade.
                </p>
              </>
            ) : null}
          </RelationCard>
        )}

        {/* LOTEAMENTO ↔ EMPREENDIMENTO (B3). Aresta de MÃO ÚNICA, e de propósito:
            o desenho é a origem. Mudar a área de um lote é mover vértice na
            planta, não editar um número no cadastro — e reconstruir geometria a
            partir de uma área não tem solução única. */}
        {mostrarLote && (
        <RelationCard
          title="Loteamento → Empreendimento"
          icon={LandPlot}
          tint="emerald"
        >
          {!e.blueprint_study_id ? (
            <EmptyHint icon={Link2Off} text="Este empreendimento não está vinculado a um estudo da Planta Inteligente. Vincule pelo botão Editar, ou envie desde a própria planta." />
          ) : loteamentoError ? (
            <div className="text-xs text-rose-600 font-medium flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {loteamentoError}
            </div>
          ) : loteamentoReport ? (
            <>
              <p className="text-[10px] font-semibold text-gray-400 pt-1">Da versão publicada para o empreendimento</p>
              <DiffRow label="Quadras a criar" value={loteamentoReport.towersCreated} />
              <DiffRow label="Quadras a atualizar" value={loteamentoReport.towersUpdated} />
              <DiffRow label="Lotes a criar" value={loteamentoReport.unitsCreated} />
              <DiffRow label="Lotes a atualizar" value={loteamentoReport.unitsUpdated} />
              <DiffRow label="Lotes no desenho" value={loteamentoReport.scenarioUnits} muted />
              {loteamentoOrphans > 0 && <DiffRow label="Itens órfãos (mantidos)" value={loteamentoOrphans} warn />}
              {loteamentoReport.warnings.map((w, i) => (
                <p key={i} className="text-[10px] text-amber-600 font-medium flex items-start gap-1.5 leading-relaxed pt-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {w}
                </p>
              ))}
              <button
                type="button"
                onClick={handleLoteamentoSync}
                disabled={loteamentoSyncing || loteamentoTotal === 0}
                title={
                  loteamentoTotal === 0
                    ? 'Nada a trazer: o empreendimento já reflete a versão publicada do desenho'
                    : 'Traz quadras e lotes da versão publicada — preço e status dos lotes existentes não são tocados'
                }
                className="mt-3 w-full rounded-[8px] bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {loteamentoSyncing ? 'Trazendo…' : `Trazer ${loteamentoTotal || ''} ${loteamentoTotal === 1 ? 'item' : 'itens'}`.trim()}
              </button>
              <p className="text-[9px] text-gray-400 font-medium leading-relaxed pt-1">
                Só a geometria vem do desenho: quadra, número, área, testada e confrontantes. Preço e status de venda são do empreendimento, e só nascem com o lote.
              </p>
            </>
          ) : null}
        </RelationCard>
        )}

        {/* TERRENO ↔ EMPREENDIMENTO (22/10/2026): área, testada, fundos, profundidade, laterais e tipo
            medidos no lote da versão publicada. Mesmas regras de toda a sincronização: vazio
            preenche, diferente vai à Curadoria. Card próprio porque o de Loteamento some em
            estudo de massa, e o terreno existe nos dois. */}
        {e.blueprint_study_id && (
        <RelationCard
          title="Terreno → Empreendimento"
          icon={Ruler}
          tint="emerald"
        >
          {terrenoError ? (
            <div className="text-xs text-rose-600 font-medium flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {terrenoError}
            </div>
          ) : terrenoReport?.motivo ? (
            <EmptyHint icon={Link2Off} text={terrenoReport.motivo} />
          ) : terrenoReport ? (
            <>
              <p className="text-[10px] font-semibold text-gray-400 pt-1">Da versão publicada para a ficha (Torres & Unidades › Terreno)</p>
              <DiffRow label="Campos vazios a preencher" value={terrenoReport.fills.length} />
              <DiffRow label="Diferentes (vão à Curadoria)" value={terrenoReport.conflicts.length} warn={terrenoReport.conflicts.length > 0} />
              {[...terrenoReport.fills, ...terrenoReport.conflicts].map(c => (
                <p key={c.field} className="text-[10px] text-gray-500 font-medium leading-relaxed" data-testid={`terreno-sync-${c.field}`}>
                  {c.label}: {c.from == null || c.from === '' ? '—' : String(c.from)} → {String(c.to)}
                </p>
              ))}
              <button
                type="button"
                onClick={handleTerrenoSync}
                disabled={terrenoSyncing || terrenoTotal === 0}
                title={terrenoTotal === 0 ? 'Nada a trazer: a ficha já tem o terreno da versão publicada' : 'Preenche os vazios e manda as diferenças para a Curadoria'}
                className="mt-3 w-full rounded-[8px] bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {terrenoSyncing ? 'Trazendo…' : terrenoTotal === 0 ? 'Nada a trazer' : 'Trazer o terreno'}
              </button>
              <p className="text-[9px] text-gray-400 font-medium leading-relaxed pt-1">
                Medidas do desenho; profundidade é a média das laterais. O que a ficha já tem nunca é trocado aqui — só pela Curadoria.
              </p>
            </>
          ) : null}
        </RelationCard>
        )}

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
