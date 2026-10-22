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
// Os botões vivem SÓ nos conectores do diagrama (um por ação); os cards de detalhe abaixo
// ficam só com os números que justificam a ação. As duas ligações são de mão única hoje:
// Arquitetura → Empreendimento (o desenho publicado é a origem) e Empreendimento →
// Viabilidade (o estudo lê a estrutura daqui desde 19/10/2026; o envio leva o espelho).
// Correções de 22/10/2026: docs/planos/2026-10-20-empreendimento-aba-sincronizacao.md.
import React from 'react';
import {
  Loader2, RefreshCw, BarChart3, Building2, ArrowLeftRight, ArrowDown, ArrowLeft,
  CheckCircle2, AlertTriangle, AlertCircle, Link2Off, Clock, Upload, Ruler,
  Download, LandPlot, ExternalLink, Inbox,
} from 'lucide-react';
import { blueprintEmpreendimentoSync } from '../../services/blueprintEmpreendimentoSync';
import { massaEmpreendimentoSync } from '../../services/massaEmpreendimentoSync';
import { previewWriteBackImovib, applyWriteBackImovib, WriteBackItem, WriteBackResult } from '../../services/sync/writeBackImovib';
import { empreendimentoAuditService } from '../../services/empreendimentoAuditService';
import { Empreendimento, ArquiteturaSyncReport } from '../../types';
import { useConfirm } from '../ui/confirm';
import WriteBackPreviewSheet from './WriteBackPreviewSheet';

interface Props {
  empreendimento: Empreendimento;
  /** Depois de qualquer envio: o detalhe recarrega o empreendimento e o contador da Curadoria. */
  onChanged?: () => void;
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return null;
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// Trabalho a fazer = o que o envio grava + os conflitos que ele mandaria à Curadoria. O que
// já espera decisão na Curadoria, ou foi rejeitado lá, não é trabalho desta aba.
const totalDe = (r: ArquiteturaSyncReport | null) =>
  (r ? r.towersCreated + r.towersUpdated + r.unitsCreated + r.unitsUpdated + (r.conflitosNovos ?? 0) : 0);
const orfaosDe = (r: ArquiteturaSyncReport | null) => (r ? r.orphanTowers.length + r.orphanUnits.length : 0);
const naCuradoriaDe = (r: ArquiteturaSyncReport | null) => r?.conflitosNaCuradoria ?? 0;

/** Mensagem do resultado de um envio da Planta, com o vocabulário do estudo (torre/quadra). */
function resumoDoEnvio(r: ArquiteturaSyncReport, torre: [string, string], unidade: [string, string]): string {
  const partes: string[] = [];
  if (r.towersCreated) partes.push(`${plural(r.towersCreated, ...torre)} criada(s)`);
  if (r.unitsCreated) partes.push(`${plural(r.unitsCreated, ...unidade)} criada(s)`);
  const atualizadas = r.towersUpdated + r.unitsUpdated;
  if (atualizadas) partes.push(`${atualizadas} atualizada(s)`);
  if (r.conflitosEnviados) partes.push(`${plural(r.conflitosEnviados, 'conflito enviado', 'conflitos enviados')} à Curadoria`);
  return partes.length ? partes.join(' · ') : 'Nada mudou: o empreendimento já refletia o estudo.';
}

function resumoDoEnvioAoEstudo(r: WriteBackResult): string {
  const partes: string[] = [];
  const criadas = r.instancesCreated + r.instancesAdopted;
  if (criadas) partes.push(`${plural(criadas, 'unidade criada', 'unidades criadas')} no estudo`);
  if (r.instancesUpdated) partes.push(`${plural(r.instancesUpdated, 'unidade atualizada', 'unidades atualizadas')}`);
  const blocos = r.blocksCreated + r.blocksAdopted;
  if (blocos) partes.push(`${plural(blocos, 'bloco criado', 'blocos criados')}`);
  return partes.length ? `Enviado ao estudo: ${partes.join(' · ')}` : 'Nada enviado: o estudo já refletia o empreendimento.';
}

export const SyncCenterTab: React.FC<Props> = ({ empreendimento: e, onChanged }) => {
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

  // Data do último envio de cada ligação, lida do Histórico (um evento por envio).
  // `last_synced_at` NÃO serve: só o sync da Planta o carimba, e ele aparecia no card da
  // Viabilidade (o Garden Cambuhy mostrava 17/07/2026, do sync Imovib→Emp já removido).
  const [ultimoEnvioArquitetura, setUltimoEnvioArquitetura] = React.useState<string | null>(null);
  const [ultimoEnvioViabilidade, setUltimoEnvioViabilidade] = React.useState<string | null>(null);

  const [notice, setNotice] = React.useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotice({ msg, type });
    setTimeout(() => setNotice(null), 6000);
  };

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

    // Planta Inteligente — massa e LOTEAMENTO (B3). Só roda o dry-run com estudo vinculado.
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
    } else {
      setLoteamentoReport(null);
      setMassaReport(null);
    }

    // Data é informação de apoio: falhar aqui não pode derrubar a aba.
    tasks.push(
      Promise.all([
        empreendimentoAuditService.list(e.id, { source: ['sync_blueprint', 'sync_massa'], action: ['sync'], limit: 1 }),
        empreendimentoAuditService.list(e.id, { source: ['sync_imovib'], action: ['publish'], limit: 1 }),
      ])
        .then(([arq, viab]) => {
          setUltimoEnvioArquitetura(arq[0]?.created_at ?? null);
          setUltimoEnvioViabilidade(viab[0]?.created_at ?? null);
        })
        .catch(err => {
          console.warn('[SyncCenterTab] não leu o Histórico para as datas de envio:', err);
          setUltimoEnvioArquitetura(null);
          setUltimoEnvioViabilidade(null);
        })
    );

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
      const result = await applyWriteBackImovib(e.id, selectedUnitIds);
      notify(resumoDoEnvioAoEstudo(result));
      await load();
      onChanged?.();
    } catch (err: any) {
      setWriteBackError(err.message);
      notify(`Erro ao enviar ao estudo: ${err.message}`, 'error');
    } finally {
      setWritingBack(false);
    }
  };

  /** Texto do confirmar: o que é gravado e o que vai para a Curadoria, com o vocabulário do estudo. */
  const mensagemDoEnvio = (r: ArquiteturaSyncReport, torres: string, unidades: string, regra: string) => {
    const linhas = [`Serão criadas/atualizadas ${r.towersCreated + r.towersUpdated} ${torres} e ${r.unitsCreated + r.unitsUpdated} ${unidades}.`];
    if (r.conflitosNovos) {
      linhas.push(`${plural(r.conflitosNovos, 'campo diverge', 'campos divergem')} do que o cadastro já tem: não ${r.conflitosNovos === 1 ? 'é gravado' : 'são gravados'}, ${r.conflitosNovos === 1 ? 'vai' : 'vão'} para a aba Curadoria, onde você decide.`);
    }
    linhas.push(regra);
    return linhas.join('\n\n');
  };

  /** LOTEAMENTO (B3): traz as quadras e os lotes da versão PUBLICADA do desenho. */
  const handleLoteamentoSync = async () => {
    if (!loteamentoReport || totalDe(loteamentoReport) === 0) return;
    const ok = await confirm({
      title: 'Trazer o loteamento para o empreendimento?',
      message: mensagemDoEnvio(loteamentoReport, 'quadra(s)', 'lote(s)',
        'Só a geometria vem do desenho (quadra, número, área, testada e confrontantes), da versão PUBLICADA. Preço e status de venda dos lotes já existentes não são tocados.'),
      confirmLabel: 'Trazer',
      variant: 'warning',
    });
    if (!ok) return;
    setLoteamentoSyncing(true);
    try {
      const r = await blueprintEmpreendimentoSync.syncToEmpreendimento(e.id);
      notify(resumoDoEnvio(r, ['quadra', 'quadras'], ['lote', 'lotes']));
      await load();
      onChanged?.();
    } catch (err: any) {
      setLoteamentoError(err.message);
      notify(`Erro ao trazer o loteamento: ${err.message}`, 'error');
    } finally {
      setLoteamentoSyncing(false);
    }
  };

  const handleMassaSync = async () => {
    if (!massaReport || totalDe(massaReport) === 0) return;
    const ok = await confirm({
      title: 'Trazer o estudo de massa para o empreendimento?',
      message: mensagemDoEnvio(massaReport, 'torre(s)', 'unidade(s)',
        'A estrutura vem da versão PUBLICADA da massa, com o produto congelado nela (pavimentos, unidades, áreas, tipologia); preço, status, posição e orientação só nascem com a unidade — o que o cadastro já tem não é tocado. Unidade que sumiu da massa fica como órfã, nunca é apagada.'),
      confirmLabel: 'Trazer',
      variant: 'warning',
    });
    if (!ok) return;
    setMassaSyncing(true);
    try {
      const r = await massaEmpreendimentoSync.syncToEmpreendimento(e.id);
      notify(resumoDoEnvio(r, ['torre', 'torres'], ['unidade', 'unidades']));
      await load();
      onChanged?.();
    } catch (err: any) {
      setMassaError(err.message);
      notify(`Erro ao trazer a massa: ${err.message}`, 'error');
    } finally {
      setMassaSyncing(false);
    }
  };

  // Write-back Emp→Viabilidade: quantas unidades seriam atualizadas e quantas criadas no estudo.
  const wbTotal = writeBackItems?.length ?? 0;
  const wbCreates = writeBackItems?.filter(i => i.kind === 'create').length ?? 0;
  const wbUpdates = writeBackItems?.filter(i => i.kind === 'update').length ?? 0;

  // Planta Inteligente: um estudo é de massa OU de loteamento (ou ainda nenhum dos dois).
  const massaTotal = totalDe(massaReport);
  const loteamentoTotal = totalDe(loteamentoReport);
  const temMassa = !!massaReport && (massaReport.scenarioUnits > 0 || massaTotal > 0 || orfaosDe(massaReport) > 0);
  const temLote = !!loteamentoReport && (loteamentoReport.scenarioUnits > 0 || loteamentoTotal > 0 || orfaosDe(loteamentoReport) > 0);
  // Sem nenhum dos dois, os dois aparecem — cada um diz o que falta (cards E botões: antes o
  // diagrama mostrava só "Trazer da massa" e o loteamento sumia).
  const mostrarMassa = !!e.blueprint_study_id && (temMassa || !temLote);
  const mostrarLote = !!e.blueprint_study_id && (temLote || !temMassa);

  // Botão desligado sempre diz o PORQUÊ — e o motivo certo: "nada a trazer" não é o mesmo
  // que "o estudo não tem massa publicada".
  const motivoMassa = massaError
    ? 'Não foi possível verificar o estudo de massa — veja o erro no card abaixo'
    : !temMassa
      ? 'O estudo não tem massa publicada: desenhe os blocos (Terreno › Massa) e publique na Planta Inteligente'
      : massaTotal === 0
        ? 'Nada a trazer: o empreendimento já reflete a massa publicada'
        : null;
  const motivoLote = loteamentoError
    ? 'Não foi possível verificar o loteamento — veja o erro no card abaixo'
    : !temLote
      ? 'O estudo não tem lotes publicados: desenhe os lotes (Terreno › Lotear) e publique na Planta Inteligente'
      : loteamentoTotal === 0
        ? 'Nada a trazer: o empreendimento já reflete o loteamento publicado'
        : null;

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
                                                            ↓
                                 [VIABILIDADE] ← [HUB]

            Cada aresta é um <EdgeConnector> com seus botões — o conector É a ação. Ter os
            botões dentro do card do vértice fazia a ligação Arquitetura↔Hub parecer uma
            ligação sem ação nenhuma. A seta aponta o sentido em que o dado anda. */}
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
            divergences={massaTotal + loteamentoTotal}
            naCuradoria={naCuradoriaDe(massaReport) + naCuradoriaDe(loteamentoReport)}
            footer={
              temMassa
                ? `${massaReport!.scenarioUnits} unidade(s) na massa publicada`
                : temLote
                  ? `${loteamentoReport!.scenarioUnits} lote(s) no desenho publicado`
                  : null
            }
            lastSent={e.blueprint_study_id ? (fmtDate(ultimoEnvioArquitetura) ? `Último envio: ${fmtDate(ultimoEnvioArquitetura)}` : 'Nada trazido ainda') : null}
          />

          {/* Linha 2 — aresta Arquitetura → Hub. */}
          <div className="hidden md:block" />
          <div className="hidden md:block" />
          <EdgeConnector
            icon={ArrowDown}
            label="Arquitetura → Empreendimento"
            tint="indigo"
            active={!!e.blueprint_study_id}
            activeTitle="Planta Inteligente → Empreendimento (o desenho publicado é a origem; preço e status nunca voltam)"
            inactiveTitle="Nenhum estudo da Planta Inteligente vinculado — vincule pelo botão Editar, ou envie desde a própria planta"
            actions={e.blueprint_study_id ? [
              ...(mostrarMassa ? [{
                label: 'Trazer da massa', icon: Download, direction: 'in' as const,
                onClick: handleMassaSync,
                disabled: motivoMassa !== null, busy: massaSyncing,
                title: motivoMassa ?? 'Criar/atualizar torres e unidades a partir da versão publicada do estudo de massa',
                testId: 'trazer-da-massa',
              }] : []),
              ...(mostrarLote ? [{
                label: 'Trazer o loteamento', icon: Download, direction: 'in' as const,
                onClick: handleLoteamentoSync,
                disabled: motivoLote !== null, busy: loteamentoSyncing,
                title: motivoLote ?? 'Criar/atualizar quadras e lotes a partir da versão publicada',
                testId: 'trazer-o-loteamento',
              }] : []),
              {
                // Navegação, não sincronização: ícone de link, não de envio.
                label: 'Abrir na planta', icon: ExternalLink, direction: 'out' as const,
                onClick: () => { window.location.hash = `#/blueprint?studyId=${e.blueprint_study_id}`; },
                disabled: false, busy: false,
                title: 'Abrir o estudo na Planta Inteligente (o caminho de volta é mudar o desenho e publicar — preço e status nunca voltam)',
              },
            ] : undefined}
          />

          {/* Linha 3 — Viabilidade ← HUB */}
          <VertexCard
            icon={BarChart3}
            tint="violet"
            title="Viabilidade"
            subtitle="Estudo Imovib"
            linked={!!e.imovib_study_id}
            unlinkedLabel="Nenhum estudo vinculado"
            error={writeBackError}
            divergences={wbTotal}
            naCuradoria={0}
            footer={null}
            lastSent={e.imovib_study_id ? (fmtDate(ultimoEnvioViabilidade) ? `Último envio ao estudo: ${fmtDate(ultimoEnvioViabilidade)}` : 'Nada enviado ao estudo ainda') : null}
          />

          <EdgeConnector
            icon={ArrowLeft}
            label="Empreendimento → Viabilidade"
            tint="violet"
            active={!!e.imovib_study_id}
            activeTitle="Empreendimento → Viabilidade (o estudo lê torres, unidades e áreas daqui; o envio leva o espelho de vendas)"
            inactiveTitle="Nenhum estudo de viabilidade vinculado — vincule pelo botão Editar"
            actions={e.imovib_study_id ? [
              {
                label: 'Enviar ao estudo', icon: Upload, direction: 'out',
                onClick: handleWriteBack,
                disabled: wbTotal === 0 || !!writeBackError, busy: writingBack,
                title: writeBackError
                  ? 'Não foi possível verificar o estudo — veja o erro no card abaixo'
                  : wbTotal === 0 ? 'Nada a enviar: o estudo já reflete o empreendimento' : `Enviar ${wbTotal} unidade(s) ao estudo (${wbCreates} nova(s), ${wbUpdates} atualização(ões))`,
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

      {/* Detalhamento — só os números; as ações ficam nos conectores do diagrama */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Empreendimento → Viabilidade */}
        <RelationCard
          title="Empreendimento → Viabilidade"
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

              <p className="text-xs font-medium text-gray-500 pt-3 border-t border-gray-100 mt-1">Espelho de vendas do estudo</p>
              {writeBackError ? (
                <ErrorLine text={writeBackError} />
              ) : writeBackItems ? (
                <>
                  <DiffRow label="Unidades a atualizar no estudo" value={wbUpdates} warn={wbUpdates > 0} />
                  <DiffRow label="Unidades a criar no estudo" value={wbCreates} warn={wbCreates > 0} />
                  <HelpText>
                    Envia nome, pavimento, área privativa, posição e orientação — criando bloco/unidade no estudo quando não existirem lá. Preço, status e tipologia nunca são propagados.
                  </HelpText>
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
              <ErrorLine text={massaError} />
            ) : massaReport ? (
              <>
                <p className="text-xs font-medium text-gray-500 pt-1">Da massa publicada para o empreendimento</p>
                <DiffRow label="Torres a criar" value={massaReport.towersCreated} />
                <DiffRow label="Torres a atualizar" value={massaReport.towersUpdated} />
                <DiffRow label="Unidades a criar" value={massaReport.unitsCreated} />
                <DiffRow label="Unidades a atualizar" value={massaReport.unitsUpdated} />
                <CuradoriaRows report={massaReport} />
                <DiffRow label="Unidades na massa" value={massaReport.scenarioUnits} muted />
                {orfaosDe(massaReport) > 0 && <DiffRow label="Itens órfãos (mantidos)" value={orfaosDe(massaReport)} warn />}
                {massaReport.warnings.map((w, i) => <WarningLine key={i} text={w} />)}
                <HelpText>
                  Vem da massa: torre (pavimentos, unidades por andar, custo e preço/m² de referência) e unidade (nome, andar, tipologia, áreas, dormitórios). Preço, status, posição e orientação só nascem com a unidade.
                </HelpText>
              </>
            ) : null}
          </RelationCard>
        )}

        {/* LOTEAMENTO → EMPREENDIMENTO (B3). Aresta de MÃO ÚNICA, e de propósito:
            o desenho é a origem. Mudar a área de um lote é mover vértice na
            planta, não editar um número no cadastro — e reconstruir geometria a
            partir de uma área não tem solução única. */}
        {mostrarLote && (
          <RelationCard title="Loteamento → Empreendimento" icon={LandPlot} tint="emerald">
            {loteamentoError ? (
              <ErrorLine text={loteamentoError} />
            ) : loteamentoReport ? (
              <>
                <p className="text-xs font-medium text-gray-500 pt-1">Da versão publicada para o empreendimento</p>
                <DiffRow label="Quadras a criar" value={loteamentoReport.towersCreated} />
                <DiffRow label="Quadras a atualizar" value={loteamentoReport.towersUpdated} />
                <DiffRow label="Lotes a criar" value={loteamentoReport.unitsCreated} />
                <DiffRow label="Lotes a atualizar" value={loteamentoReport.unitsUpdated} />
                <CuradoriaRows report={loteamentoReport} />
                <DiffRow label="Lotes no desenho" value={loteamentoReport.scenarioUnits} muted />
                {orfaosDe(loteamentoReport) > 0 && <DiffRow label="Itens órfãos (mantidos)" value={orfaosDe(loteamentoReport)} warn />}
                {loteamentoReport.warnings.map((w, i) => <WarningLine key={i} text={w} />)}
                <HelpText>
                  Só a geometria vem do desenho: quadra, número, área, testada e confrontantes. Preço e status de venda são do empreendimento, e só nascem com o lote.
                </HelpText>
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

      {/* Toast (§13) — resultado de cada envio */}
      {notice && (
        <div role="status" className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${
          notice.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" /> {notice.msg}
        </div>
      )}
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

/** Uma ação de uma aresta. O sentido é comunicado pelo ícone
 *  (Download = entra, Upload = sai, ExternalLink = navega) E pelo preenchimento (`direction`). */
interface EdgeAction {
  label: string;
  icon: any;
  /** 'in' = traz dados para este lado (tingido) · 'out' = leva para o outro lado ou navega (neutro) */
  direction: 'in' | 'out';
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
  /** Desligado: o MOTIVO. Ligado: o que a ação faz. */
  title: string;
  testId?: string;
}

/** Os botões de uma aresta. Desligado quando não há o que fazer — o `title` explica o porquê.
 *  O title vai num <span> em volta: botão `disabled` não recebe hover em todo navegador, e o
 *  motivo sumia (mesma armadilha do ActionIconButton). */
const EdgeActions: React.FC<{ actions: EdgeAction[]; tint: string }> = ({ actions, tint }) => {
  const t = TINTS[tint] ?? TINTS.violet;
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {actions.map(a => (
        <span key={a.label} className="flex" title={a.title}>
          <button
            onClick={a.onClick}
            disabled={a.disabled || a.busy}
            data-testid={a.testId}
            className={`flex-1 flex items-center gap-1.5 h-8 px-2.5 rounded-[6px] text-[11px] font-semibold border transition-all active:scale-95
              disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
              ${a.direction === 'in' ? t.soft : OUT_BTN}`}
          >
            {a.busy
              ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              : <a.icon className="w-3.5 h-3.5 shrink-0" />}
            <span className="truncate">{a.label}</span>
          </button>
        </span>
      ))}
    </div>
  );
};

/**
 * Uma aresta do diagrama: a seta da ligação + os botões, agrupados numa caixa que leva o
 * NOME da ligação.
 *
 * Toda aresta é um conector — inclusive a que liga ao hub. Ter os botões dentro do card do
 * vértice fazia a ligação Arquitetura↔Hub parecer sem ação nenhuma (feedback real do
 * usuário). Aqui o conector é a ação.
 *
 * O `label` é obrigatório: sem rótulo, os pares de botões flutuavam sem dizer a que ligação
 * pertenciam (feedback real, 2026-07-16). A caixa ao redor existe pelo mesmo motivo — sem ela,
 * dois pares na mesma coluna leem como uma lista única, porque proximidade agrupa mais forte
 * que espaço em branco.
 *
 * Visível também no mobile: com `hidden md:flex` os botões sumiriam na coluna única.
 */
const EdgeConnector: React.FC<{
  /** Seta no sentido em que o dado anda (as duas ligações são de mão única). */
  icon: any;
  label: string;
  tint: string;
  active: boolean;
  inactiveTitle?: string;
  activeTitle?: string;
  actions?: EdgeAction[];
}> = ({ icon: Icon, label, tint, active, inactiveTitle, activeTitle, actions }) => {
  const t = TINTS[tint] ?? TINTS.violet;
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 min-w-[176px] py-1">
      {/* `title` vai no <span>, não no ícone: os componentes do lucide-react não aceitam
          `title` como prop (só passam adiante props de <svg> tipadas em LucideProps). */}
      <span className="flex" title={active ? activeTitle : inactiveTitle}>
        <Icon className={`w-4 h-4 ${active ? t.text : 'text-gray-300'}`} />
      </span>
      {active && actions ? (
        <div className={`w-full rounded-[10px] border ${t.ring} ${t.bg} p-2`}>
          {/* Rótulo de diagrama — nomeia a ligação (§8.1), uppercase mantido */}
          <p className={`text-[9px] font-bold uppercase tracking-widest text-center leading-tight mb-1.5 ${t.text}`}>
            {label}
          </p>
          <EdgeActions actions={actions} tint={tint} />
        </div>
      ) : (
        <span className="text-[11px] text-gray-400 font-medium text-center leading-snug max-w-[160px]" title={inactiveTitle}>
          {inactiveTitle ? 'Sem vínculo' : ''}
        </span>
      )}
    </div>
  );
};

/** Vértice = só estado (vínculo, divergências, Curadoria, rodapé, último envio). As ações vivem nos conectores. */
const VertexCard: React.FC<{
  icon: any; tint: string; title: string; subtitle: string;
  linked: boolean; unlinkedLabel: string; error: string | null;
  divergences: number;
  /** Conflitos esperando decisão na Curadoria — não são divergência a trazer, mas não somem. */
  naCuradoria: number;
  footer: string | null;
  lastSent: string | null;
  className?: string;
}> = ({ icon: Icon, tint, title, subtitle, linked, unlinkedLabel, error, divergences, naCuradoria, footer, lastSent, className = '' }) => {
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
        <span className="text-xs font-medium text-gray-500 flex items-center gap-1"><Link2Off className="w-3.5 h-3.5" /> {unlinkedLabel}</span>
      ) : error ? (
        <span className="text-xs font-medium text-rose-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Erro ao verificar</span>
      ) : aligned ? (
        <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Alinhado</span>
      ) : (
        <span className="text-xs font-semibold text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {divergences} divergência{divergences > 1 ? 's' : ''}</span>
      )}
      {linked && !error && naCuradoria > 0 && (
        <span className="text-xs font-medium text-amber-700 flex items-center gap-1 mt-1"><Inbox className="w-3.5 h-3.5" /> {naCuradoria} aguardando a Curadoria</span>
      )}
      {footer && <span className="text-[11px] font-medium text-gray-500 pt-2">{footer}</span>}
      {lastSent && <span className="text-[11px] font-medium text-gray-500 pt-0.5">{lastSent}</span>}
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

/** Conflitos que este envio manda à Curadoria, os que já esperam lá e os rejeitados. */
const CuradoriaRows: React.FC<{ report: ArquiteturaSyncReport }> = ({ report }) => (
  <>
    {(report.conflitosNovos ?? 0) > 0 && <DiffRow label="Campos em conflito (vão para a Curadoria)" value={report.conflitosNovos ?? 0} warn />}
    {(report.conflitosNaCuradoria ?? 0) > 0 && <DiffRow label="Aguardando decisão na Curadoria" value={report.conflitosNaCuradoria ?? 0} warn />}
    {(report.conflitosRejeitados ?? 0) > 0 && <DiffRow label="Mantidos por decisão na Curadoria" value={report.conflitosRejeitados ?? 0} muted />}
  </>
);

const DiffRow: React.FC<{ label: string; value: number; warn?: boolean; muted?: boolean }> = ({ label, value, warn, muted }) => (
  <div className="flex items-center justify-between text-xs">
    <span className={`font-medium ${muted ? 'text-gray-500' : 'text-gray-600'}`}>{label}</span>
    <span className={`font-semibold tabular-nums px-2 py-0.5 rounded-[6px] ${
      value === 0 ? 'text-gray-500'
      : warn ? 'bg-amber-500/10 text-amber-700'
      : 'bg-gray-100 text-gray-700'
    }`}>{value}</span>
  </div>
);

const HelpText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] text-gray-500 leading-relaxed pt-1">{children}</p>
);

const WarningLine: React.FC<{ text: string }> = ({ text }) => (
  <p className="text-xs text-amber-700 flex items-start gap-1.5 leading-relaxed pt-1">
    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {text}
  </p>
);

const ErrorLine: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-xs text-rose-600 font-medium flex items-start gap-1.5">
    <AlertTriangle className="w-4 h-4 shrink-0" /> {text}
  </div>
);

const EmptyHint: React.FC<{ icon: any; text: string }> = ({ icon: Icon, text }) => (
  <div className="flex items-start gap-2 text-xs text-gray-500 font-medium py-2">
    <Icon className="w-4 h-4 shrink-0 mt-0.5" /> {text}
  </div>
);

export default SyncCenterTab;
