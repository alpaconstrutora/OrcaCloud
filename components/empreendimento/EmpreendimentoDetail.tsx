// components/empreendimento/EmpreendimentoDetail.tsx
import { moverEntreAbas } from '../ui/abasPeloTeclado';
import React from 'react';
import { ArrowLeft, FileText, Layers, BarChart3, ShoppingBag, KeyRound, Map, ArrowLeftRight, ScrollText, Inbox, AlertCircle, Link2, History, ListChecks, Scale, FolderOpen } from 'lucide-react';
import { Empreendimento, EmpreendimentoStatus, EmpreendimentoUnitCharacteristic } from '../../types';
import TowerEditor from './TowerEditor';
import UnidadeUnicaEditor from './UnidadeUnicaEditor';
import { estruturaDoTipo, type EstruturaDoTipo } from '../../utils/empreendimentoTipos';
import { ehUnidadeUnica, temTerrenoProprio } from '../../utils/empreendimentoUnidadeUnica';
import { EspelhoVendasTab } from './EspelhoVendasTab';
import { EspelhoLocacoesTab } from './EspelhoLocacoesTab';
import { SyncCenterTab } from './SyncCenterTab';
import CuradoriaTab from './CuradoriaTab';
import SecaoTitulo from '../ui/SecaoTitulo';
import CaracteristicasAdicionaisTab from './CaracteristicasAdicionaisTab';
import { empreendimentoProposalService } from '../../services/empreendimentoProposalService';
import MapaRegulatorioEditor from '../MapaRegulatorioEditor';
import VinculacoesTab from './VinculacoesTab';
import HistoricoTab from './HistoricoTab';
import DocumentosEmpreendimentoTab from './DocumentosEmpreendimentoTab';
import EmpreendimentoForm from './EmpreendimentoForm';
import TerrenoSecao from './TerrenoSecao';
import { espelhosDoObjetivo } from '../../utils/empreendimentoObjetivo';
import { haPendenciaDeSaida, CONFIRMAR_SAIDA } from '../../lib/guardaDeSaida';
import { empreendimentoService } from '../../services/empreendimentoService';
import { empreendimentoTypeService } from '../../services/empreendimentoTypeService';
import { empreendimentoUnitCharacteristicService } from '../../services/empreendimentoUnitCharacteristicService';
import { blueprintEstudoDoEmpreendimento } from '../../services/blueprintEstudoDoEmpreendimento';
import { useConfirm } from '../ui/confirm';
import { generateIncorporationMemorialDraftPdf } from '../../services/incorporationMemorialService';
import { nbr12721ExportService } from '../../services/nbr12721ExportService';

interface Props {
  empreendimento: Empreendimento;
  organizationId: string;
  onBack: () => void;
  /** A Visão Geral gravou a ficha — o pai troca o registro aberto e a linha da lista (§22). */
  onSaved: (e: Empreendimento) => void;
  onGoToStudy?: () => void;
  onSynced?: () => void;
  /** `handleLoadProject` — abre obra/orçamento/planejamento carregados (aba Vinculações). */
  onOpenProject?: (projectId: string, targetView?: string | null) => void | Promise<void>;
  onChangeView?: (view: string) => void;
}

const STATUS_LABELS: Record<EmpreendimentoStatus, string> = {
  PLANEJAMENTO: 'Planejamento',
  LANCAMENTO: 'Lançamento',
  EM_OBRAS: 'Em Obras',
  ENTREGUE: 'Entregue',
  EM_OPERACAO: 'Em Operação',
  ENCERRADO: 'Encerrado',
};

// Fallback só usado se o catálogo (Configurações do Sistema → Tipos de Empreendimento)
// ainda não carregou ou o tipo salvo foi excluído do catálogo.
const FALLBACK_TIPO_LABELS: Record<string, string> = {
  VERTICAL: 'Vertical',
  HORIZONTAL: 'Horizontal',
  MISTO: 'Misto',
  COND_LOGISTICO: 'Condomínio Logístico',
  COND_INDUSTRIAL: 'Condomínio Industrial',
};

// Texto colorido, sem pílula/fundo/uppercase (ui_ux_guia_unificado.md §8).
const STATUS_TEXT_COLOR: Record<EmpreendimentoStatus, string> = {
  PLANEJAMENTO: 'text-gray-600',
  LANCAMENTO: 'text-amber-600',
  EM_OBRAS: 'text-blue-600',
  ENTREGUE: 'text-emerald-600',
  EM_OPERACAO: 'text-teal-600',
  ENCERRADO: 'text-slate-500',
};

type Tab = 'visao' | 'sync' | 'torres' | 'caracteristicas' | 'regulatorio' | 'comercial' | 'locacoes' | 'documentos' | 'vinculos' | 'historico';

export const EmpreendimentoDetail: React.FC<Props> = ({ empreendimento: e, organizationId, onBack, onSaved, onGoToStudy, onSynced, onOpenProject, onChangeView }) => {
  const [tab, setTabBruto] = React.useState<Tab>('visao');
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [generatingMemorial, setGeneratingMemorial] = React.useState(false);
  // ÁREAS NBR 12721 NA PLANTA (14/10/2026, Fase 6b): o quadro de áreas mora no estudo da
  // Planta vinculado; sem estudo, cria um "sem desenho" a partir deste empreendimento.
  const confirmar = useConfirm();
  const [criandoAreas, setCriandoAreas] = React.useState(false);
  const abrirAreasNaPlanta = (studyId: string) => {
    // `origem=empreendimento` (15/11/2026): a tela mostra a trilha com este empreendimento e a
    // seta volta para cá (`#/empreendimentos?id=`), não para o desenho da Planta.
    window.location.hash = `#/blueprint?studyId=${studyId}&tela=areas-nbr12721&origem=empreendimento`;
  };
  const [pendingCuradoria, setPendingCuradoria] = React.useState(0);
  // Quantas propostas o empreendimento já teve: sem nenhuma, o bloco Curadoria nem aparece na Sincronização.
  const [totalCuradoria, setTotalCuradoria] = React.useState(0);
  const [tipoNameMap, setTipoNameMap] = React.useState<Record<string, string>>({});
  const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  const loadPendingCuradoria = React.useCallback(async () => {
    try {
      const [pendentes, total] = await Promise.all([
        empreendimentoProposalService.countPending(e.id),
        empreendimentoProposalService.countAll(e.id),
      ]);
      setPendingCuradoria(pendentes);
      setTotalCuradoria(total);
    } catch {
      setPendingCuradoria(0); // curadoria indisponível (migration não aplicada) — badge some
      setTotalCuradoria(0);
    }
  }, [e.id]);

  React.useEffect(() => { loadPendingCuradoria(); }, [loadPendingCuradoria, refreshKey]);

  // Unidade única (09/11/2026): o Tipo diz se a aba é Torres & Unidades ou a do Lote/Casa/Chácara. Os tipos
  // vêm da org do PRÓPRIO empreendimento (regra #5) — com o topo em outra org, o "Lote" dela não viria.
  const [estrutura, setEstrutura] = React.useState<EstruturaDoTipo>('TORRES');
  React.useEffect(() => {
    const orgDoRegistro = e.organization_id || organizationId || undefined;
    empreendimentoTypeService.list(orgDoRegistro)
      .then(types => {
        setTipoNameMap(Object.fromEntries(types.map(t => [t.slug, t.name])));
        setEstrutura(estruturaDoTipo(types, e.tipo, orgDoRegistro));
      })
      .catch(() => { setTipoNameMap({}); setEstrutura('TORRES'); });
  }, [organizationId, e.organization_id, e.tipo]);

  // "Todas as organizações" não bloqueia a leitura — a org sai da própria entidade
  // aberta, não do topo (CLAUDE.md regra #5).
  const effectiveOrgId = e.organization_id || organizationId || undefined;

  // Aba "Características Adicionais" (só existe quando há ao menos 1 característica
  // do catálogo aplicável ao tipo deste empreendimento — ver services/empreendimentoUnitCharacteristicService.ts).
  const [caracteristicas, setCaracteristicas] = React.useState<EmpreendimentoUnitCharacteristic[]>([]);
  React.useEffect(() => {
    if (!effectiveOrgId) { setCaracteristicas([]); return; }
    empreendimentoUnitCharacteristicService.listCharacteristics(effectiveOrgId, { tipo: e.tipo })
      .then(setCaracteristicas)
      .catch(() => setCaracteristicas([]));
  }, [effectiveOrgId, e.tipo]);

  const tipoLabel = e.tipo ? (tipoNameMap[e.tipo] || FALLBACK_TIPO_LABELS[e.tipo] || e.tipo) : undefined;

  const criarEstudoDeAreas = async () => {
    const ok = await confirmar({
      title: 'Criar estudo de áreas?',
      message:
        'Cria um estudo da Planta Inteligente com os pavimentos, as unidades e as áreas privativas deste empreendimento como ambientes declarados (sem desenho), e o vincula a ele. Os Quadros NBR 12721 e as frações saem de lá.',
      confirmLabel: 'Criar estudo',
      variant: 'default',
    });
    if (!ok) return;
    setCriandoAreas(true);
    try {
      const r = await blueprintEstudoDoEmpreendimento.criar(e.id);
      onSynced?.();
      const abrir = await confirmar({
        title: 'Estudo de áreas criado',
        message: `${r.contagem.pavimentos} pavimento(s), ${r.contagem.unidades} unidade(s), ${r.contagem.ambientes} ambiente(s) declarado(s).\n\n${r.avisos.join('\n')}`,
        confirmLabel: 'Abrir na Planta',
        cancelLabel: 'Ficar aqui',
        variant: 'default',
      });
      if (abrir) abrirAreasNaPlanta(r.studyId);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Não foi possível criar o estudo de áreas.', 'error');
    } finally {
      setCriandoAreas(false);
    }
  };

  const handleGenerateMemorial = async () => {
    setGeneratingMemorial(true);
    try {
      // Áreas NBR 12721: a versão publicada do estudo da Planta ligado ao empreendimento (Fase 8).
      const [towers, areas] = await Promise.all([
        empreendimentoService.listTowers(e.id),
        e.blueprint_study_id ? nbr12721ExportService.documentoDoMemorial(e.blueprint_study_id) : Promise.resolve(null),
      ]);
      const motivoSemAreas = e.blueprint_study_id
        ? undefined
        : 'Este empreendimento ainda não tem estudo de áreas. Use "Criar estudo de áreas", publique a versão na Planta e aprove antes de emitir o memorial final.';
      generateIncorporationMemorialDraftPdf({ empreendimento: e, towers, areas, motivoSemAreas });
    } catch (err) {
      console.error('[EmpreendimentoDetail] erro ao gerar minuta do memorial:', err);
      notify('Erro ao gerar a minuta do memorial. Tente novamente.', 'error');
    } finally {
      setGeneratingMemorial(false);
    }
  };

  const espelhos = espelhosDoObjetivo(e.objetivo);
  // Aba do espelho que o Objetivo escondeu (trocado agora na Visão Geral): volta para a Visão Geral.
  const tabAtiva: Tab = (tab === 'comercial' && !espelhos.vendas) || (tab === 'locacoes' && !espelhos.locacoes) ? 'visao' : tab;
  // Trocar de aba ou voltar com a Visão Geral alterada e não salva pergunta antes (o formulário
  // desmonta ao sair dela). A pendência vem do registro global de `useUnsavedChanges`.
  const podeSair = async () => !haPendenciaDeSaida() || confirmar(CONFIRMAR_SAIDA);
  const setTab = async (t: Tab) => { if (t !== tabAtiva && await podeSair()) setTabBruto(t); };
  const voltar = async () => { if (await podeSair()) onBack(); };
  // O espelho para onde a aba Lote/Unidade leva: o de Vendas, ou o de Locações se o objetivo é Locação.
  // Serviço não tem espelho: sem destino, a unidade única não oferece o link.
  const abaDoEspelho: Tab | null = espelhos.vendas ? 'comercial' : espelhos.locacoes ? 'locacoes' : null;

  const tabs: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: 'visao', label: 'Visão Geral', icon: FileText },
    // Unidade única: a mesma aba (mesmo id), com o nome do que ela é.
    { id: 'torres', label: estrutura === 'LOTE' ? 'Lote' : ehUnidadeUnica(estrutura) ? 'Unidade' : 'Torres & Unidades', icon: Layers },
    // Só existe quando o catálogo (Configurações do Sistema → Características de
    // Unidade) tem ao menos 1 característica aplicável ao tipo deste empreendimento.
    ...(caracteristicas.length > 0 ? [{ id: 'caracteristicas' as Tab, label: 'Características Adicionais', icon: ListChecks }] : []),
    { id: 'regulatorio', label: 'Mapa Regulatório', icon: Map },
    // O Objetivo decide os espelhos (21/11/2026): Vendas esconde Locações, Locação esconde Vendas.
    ...(espelhos.vendas ? [{ id: 'comercial' as Tab, label: 'Espelho de Vendas', icon: ShoppingBag }] : []),
    ...(espelhos.locacoes ? [{ id: 'locacoes' as Tab, label: 'Espelho de Locações', icon: KeyRound }] : []),
    // Documentos legais (checklist) + arquivos do empreendimento. O arquivo mora
    // no GED (opura_documents.empreendimento_id); esta aba é uma vista dele.
    { id: 'documentos', label: 'Documentos', icon: FolderOpen },
    // Ocupações NÃO mora aqui: vive em Comercial › Condomínios, junto da ficha
    // do condomínio e da manutenção predial. O mesmo controle em dois caminhos
    // de navegação foi o que já aconteceu com "Sincronizar do Estudo" (ver o
    // comentário no header) — duas portas para o mesmo dado, dois estados.
    // As últimas são transversais (o que está pendurado / o que entra de fora / o que
    // aconteceu), não etapas do fluxo de dados — por isso ficam no fim do trilho. A
    // Sincronização vem logo depois de Vinculações desde 21/11/2026 (pedido do usuário).
    { id: 'vinculos', label: 'Vinculações', icon: Link2 },
    // A Curadoria (conflitos da sincronização) mora DENTRO desta aba desde 28/10/2026: o contador vem junto.
    { id: 'sync', label: 'Sincronização', icon: ArrowLeftRight, badge: pendingCuradoria },
    { id: 'historico', label: 'Histórico', icon: History },
  ];

  return (
    <div className="space-y-6">
      {/* Header — título SOLTO (§20 + seta §23.1), como as demais telas de detalhe. Até
          21/11/2026 era um card branco com ícone-bolha e h1 text-2xl; o usuário pediu o
          padrão do resto do app. Ações à direita do título, no tamanho compacto (§17), só a
          partir de xl: abaixo disso dividir a linha espremia nome e subtítulo (medido em 768). */}
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void voltar()}
              title="Voltar"
              className="flex items-center justify-center h-9 w-9 -ml-2 rounded-[6px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">{e.name}</h1>
              <span className={`whitespace-nowrap text-sm font-normal ${STATUS_TEXT_COLOR[e.status]}`}>
                {STATUS_LABELS[e.status]}
              </span>
              {tipoLabel && (
                <span className="whitespace-nowrap text-sm font-normal text-gray-500">
                  · {tipoLabel}
                </span>
              )}
            </div>
          </div>
          <p className="text-gray-500 text-sm mt-1.5 font-medium ml-12">
            {e.code ? `${e.code} · ` : ''}{e.spe_razao_social || e.developer_name || 'Sem SPE definida'}
          </p>
        </div>
        <div className="flex flex-wrap xl:flex-nowrap items-center gap-2 xl:justify-end shrink-0">
          {/* "Sincronizar do Estudo" NÃO mora aqui: a mesma ação já existe na aba Centro de
              Sincronização, onde ela tem contexto (divergências, última sync) e desabilita
              sozinha quando não há o que sincronizar. Ter as duas era o mesmo controle em
              dois lugares com estados diferentes — o do header ficava sempre aceso, mesmo
              sem divergência nenhuma (ui_ux_guia_unificado.md §6.4/§18). */}
          {e.imovib_study_id && onGoToStudy && (
            <button
              onClick={onGoToStudy}
              className="flex items-center gap-1.5 h-9 px-3.5 whitespace-nowrap shrink-0 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-[6px] font-medium text-[13px] transition-all active:scale-95"
            >
              <BarChart3 className="w-[15px] h-[15px]" /> Ver Estudo
            </button>
          )}
          {e.blueprint_study_id ? (
            <button
              onClick={() => abrirAreasNaPlanta(e.blueprint_study_id!)}
              title="Abre o estudo vinculado da Planta na tela Áreas NBR 12721 (Quadros I, II e IV-B e frações)"
              className="flex items-center gap-1.5 h-9 px-3.5 whitespace-nowrap shrink-0 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all active:scale-95"
            >
              <Scale className="w-4 h-4" /> Áreas NBR 12721
            </button>
          ) : (
            <button
              onClick={() => void criarEstudoDeAreas()}
              disabled={criandoAreas}
              title="Sem estudo da Planta vinculado: cria um estudo de áreas (sem desenho) a partir deste empreendimento"
              className="flex items-center gap-1.5 h-9 px-3.5 whitespace-nowrap shrink-0 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all active:scale-95 disabled:opacity-50"
            >
              <Scale className="w-4 h-4" /> {criandoAreas ? 'Criando…' : 'Criar estudo de áreas'}
            </button>
          )}
          <button
            onClick={handleGenerateMemorial}
            disabled={generatingMemorial}
            className="flex items-center gap-1.5 h-9 px-3.5 whitespace-nowrap shrink-0 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all active:scale-95 disabled:opacity-50"
          >
            <ScrollText className="w-4 h-4" /> {generatingMemorial ? 'Gerando...' : 'Minuta do Memorial'}
          </button>
        </div>
      </div>

      {/* Tabs — anatomia canônica §19.1: card branco externo + trilho bg-gray-50, aba ativa bg-white text-blue-600 shadow-sm, flex-wrap */}
      <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
        <div role="tablist" onKeyDown={moverEntreAbas} className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
          {tabs.map(t => (
            <button type="button" role="tab" aria-selected={tabAtiva === t.id} tabIndex={tabAtiva === t.id ? 0 : -1}
              key={t.id}
              onClick={() => void setTab(t.id)}
              className={`outline-none focus-visible:ring-2 focus-visible:ring-blue-500 px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                tabAtiva === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className="ml-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      {tabAtiva === 'visao' && (
        // Visão Geral = a ficha editável (21/11/2026) — o único lugar de edição do empreendimento.
        <EmpreendimentoForm
          modo="embutido"
          editing={e}
          organizationId={effectiveOrgId ?? organizationId}
          onSaved={onSaved}
          terreno={
            // Apartamento/sala (UNIDADE_AUTONOMA): o terreno é do prédio, não do empreendimento.
            !ehUnidadeUnica(estrutura) || temTerrenoProprio(estrutura)
              ? estrutura === 'LOTE'
                // No Lote o terreno É a unidade: salvar leva área e testada a ela, e isso mora na aba Lote.
                ? (
                  <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm flex flex-wrap items-center justify-between gap-3" data-testid="card-terreno">
                    <p className="text-sm text-gray-700">O terreno deste lote é editado na aba Lote, junto da unidade.</p>
                    <button type="button" onClick={() => void setTab('torres')} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-blue-600 hover:bg-blue-50 transition-all">
                      Abrir a aba Lote
                    </button>
                  </div>
                )
                : <TerrenoSecao empreendimentoId={e.id} empreendimento={e} onTerrenoSaved={onSynced} />
              : null
          }
        />
      )}

      {tabAtiva === 'torres' && (
        <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm">
          {ehUnidadeUnica(estrutura) ? (
            <UnidadeUnicaEditor
              key={refreshKey}
              empreendimentoId={e.id}
              organizationId={organizationId}
              empreendimento={e}
              estrutura={estrutura}
              nomeDoTipo={tipoLabel}
              onTerrenoSaved={onSynced}
              onAbrirEspelho={abaDoEspelho ? () => void setTab(abaDoEspelho) : undefined}
            />
          ) : (
            <TowerEditor
              key={refreshKey}
              empreendimentoId={e.id}
              organizationId={organizationId}
              empreendimento={e}
              onTerrenoSaved={onSynced}
            />
          )}
        </div>
      )}

      {tabAtiva === 'caracteristicas' && (
        <CaracteristicasAdicionaisTab
          empreendimento={e}
          organizationId={effectiveOrgId ?? organizationId}
          caracteristicas={caracteristicas}
          onManageCaracteristicas={onChangeView ? () => onChangeView('settings') : undefined}
          unidadeUnica={ehUnidadeUnica(estrutura)}
        />
      )}
      {tabAtiva === 'regulatorio' && (
        <MapaRegulatorioEditor empreendimentoId={e.id} organizationId={e.organization_id} />
      )}
      {tabAtiva === 'comercial' && (
        <EspelhoVendasTab empreendimento={e} estrutura={estrutura} />
      )}
      {tabAtiva === 'locacoes' && (
        <EspelhoLocacoesTab empreendimento={e} estrutura={estrutura} />
      )}
      {tabAtiva === 'sync' && (
        <div className="space-y-6">
          <SyncCenterTab
            key={refreshKey}
            empreendimento={e}
            // Sem bumpar o refreshKey: ele remontaria a aba e apagaria a mensagem do resultado.
            // O contador da Curadoria recarrega direto; o empreendimento, pelo pai.
            onChanged={() => { loadPendingCuradoria(); onSynced?.(); }}
          />
          {/* Curadoria (28/10/2026): os conflitos que os envios acima geram, para aprovar ou rejeitar. Só com algum. */}
          {(pendingCuradoria > 0 || totalCuradoria > 0) && (
            <section className="rounded-[10px] border border-gray-200 bg-white p-5 space-y-4" aria-label="Curadoria" data-testid="secao-curadoria">
              <SecaoTitulo
                icon={Inbox}
                titulo="Curadoria"
                resumo={pendingCuradoria > 0 ? `${pendingCuradoria} conflito(s) a decidir` : 'nenhum conflito pendente'}
              />
              <p className="text-xs text-gray-500">
                O que um envio acima encontrou diferente do cadastro não é trocado sozinho: aprove (usa o valor da origem) ou rejeite (mantém o do empreendimento).
              </p>
              <CuradoriaTab empreendimentoId={e.id} onChanged={() => setRefreshKey(k => k + 1)} />
            </section>
          )}
        </div>
      )}
      {tabAtiva === 'documentos' && (
        <DocumentosEmpreendimentoTab empreendimento={e} />
      )}
      {tabAtiva === 'vinculos' && (
        <VinculacoesTab
          key={refreshKey}
          empreendimento={e}
          organizationId={organizationId}
          onOpenProject={onOpenProject}
          onChangeView={onChangeView}
          onLinksChanged={() => { setRefreshKey(k => k + 1); onSynced?.(); }}
        />
      )}
      {tabAtiva === 'historico' && (
        <HistoricoTab key={refreshKey} empreendimentoId={e.id} organizationId={organizationId} />
      )}

      {notification && (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {notification.message}
        </div>
      )}
    </div>
  );
};

export default EmpreendimentoDetail;
