import React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Box,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardList,
  FileDown,
  FileText,
  FileUp,
  History,
  Layers,
  LayoutDashboard,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  Percent,
  Plus,
  Rows3,
  Save,
  Scale,
  Trash2,
  Wallet,
} from 'lucide-react';
import Ribbon, { BotaoDoAcessoRapido, BotaoDoRibbon, GrupoDoRibbon, abaEfetiva } from './blueprint/Ribbon';
import AcessoRapido, { GrupoDoAcessoRapido } from './blueprint/AcessoRapido';
import { usePersistedState } from './ui/TableUtils';
import { KpiCard } from './ui/KpiCard';
import ActionIconButton from './ui/ActionIconButton';
import Button from './ui/Button';

/**
 * O RIBBON do Orçamento Analítico (21/11/2026) — o mesmo da Planta Inteligente e
 * do Planejamento (`schedule/ScheduleHeader.tsx`), a pedido do usuário: *"engenharia
 * > orçamentos: implemente menu e botões como foi implementado em incorporação >
 * planta inteligente"*. Plano: `docs/planos/2026-11-21-orcamento-ribbon.md`.
 *
 * Substituiu a linha de título com os KPIs (§20.4) e a barra de menus Exibir ▾ ·
 * Versões ▾ · Ferramentas ▾ · Gerenciar EAP ▾ (§5.3). Decisões do usuário:
 * o título sai (fica `sr-only`, como no Planejamento) e os KPIs vão para o slot
 * `direita` em `KpiCard size="xs"`; os comandos em 4 abas — Estrutura, Orçamento,
 * Análise, Vista.
 *
 * Só desenho e roteamento de cliques: todo estado do orçamento e todo handler vêm
 * do `BudgetEditor`. O que mora aqui é a preferência do ribbon (aba, recolhido,
 * ordem do acesso rápido), em chaves `orcamento:*`.
 */

const ABAS_DO_ORCAMENTO = [
  { id: 'estrutura', rotulo: 'Estrutura' },
  { id: 'orcamento', rotulo: 'Orçamento' },
  { id: 'analise', rotulo: 'Análise' },
  { id: 'vista', rotulo: 'Vista' },
] as const;
type AbaDoOrcamento = (typeof ABAS_DO_ORCAMENTO)[number]['id'];

/** Ordem padrão dos grupos do acesso rápido; a do usuário fica em `orcamento:ordemDoAcessoRapido`. */
const ORDEM_PADRAO_DO_ACESSO_RAPIDO = ['expandir', 'analise', 'arquivo'];

const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface BudgetRibbonProps {
  /** Nome do orçamento e base de preço — o que o subtítulo dizia. */
  nome?: string;
  rotuloBasePreco: string;
  onBack?: () => void;

  /** Estado do orçamento (chips à direita). */
  isLocked: boolean;
  versaoAtiva?: { item: string | number; description: string } | null;
  totalComBdi: number;
  custoDireto: number;
  bdi: number;
  bdiZerado: boolean;
  /** Pendências técnicas; `itens` = 0 esconde o indicador. */
  pendencias: { itens: number; semMemoria: number; semClasse: number };
  onAbrirPendencias: () => void;
  onNovoGrupo: () => void;

  /** Aba Estrutura. */
  onExpandirTudo: () => void;
  onRecolherTudo: () => void;
  onModelosEap: () => void;
  onImportarEap: () => void;
  onExportarEap: () => void;
  onLimparEap: () => void;

  /** Aba Orçamento. */
  onBdi: (bdi: number) => void;
  nVersoes: number;
  historicoVisivel: boolean;
  onAlternarHistorico: () => void;
  onSalvarVersao: () => void;
  /** Ausente = não dá para gerar contrato (sem projeto, org ou itens): o grupo some. */
  contrato?: { gerando: boolean; onGerar: () => void };

  /** Aba Análise. */
  onParametrico: () => void;
  onCurvaAbc?: () => void;
  onOrcadoRealizado: () => void;

  /** Aba Vista. */
  cpuViewMode: 'inline' | 'modal';
  onCpuViewMode: (modo: 'inline' | 'modal') => void;
  mostrarNaturezas: boolean;
  onAlternarNaturezas: () => void;

  telaCheia: boolean;
  onAlternarTelaCheia: () => void;
}

export default function BudgetRibbon(p: BudgetRibbonProps) {
  const [abaSalva, setAbaSalva] = usePersistedState<AbaDoOrcamento>('orcamento:abaDoRibbon', 'estrutura');
  const aba = abaEfetiva(ABAS_DO_ORCAMENTO, abaSalva);
  const [recolhido, setRecolhido] = usePersistedState<boolean>('orcamento:ribbonRecolhido', false);
  const [ordem, setOrdem] = usePersistedState<string[]>('orcamento:ordemDoAcessoRapido', ORDEM_PADRAO_DO_ACESSO_RAPIDO);

  const nome = p.nome || 'Orçamento';
  const tituloDaPendencia = `Memória técnica pendente: ${p.pendencias.semMemoria} item(s) sem memória de cálculo e ${p.pendencias.semClasse} item(s) sem classe de precisão. Clique para abrir o painel de pendências técnicas.`;
  const ajudaDoCurvaAbc = 'Curva ABC: os itens que mais pesam no preço';

  /** Os grupos do acesso rápido — sempre à vista, em qualquer aba. */
  const grupos: GrupoDoAcessoRapido[] = [
    {
      id: 'expandir',
      // Não "Estrutura": é o nome do grupo da aba Estrutura, e dois `role=group`
      // com o mesmo nome confundem leitor de tela (mesma escolha do Planejamento).
      rotulo: 'Expandir e recolher',
      botoes: (
        <>
          <BotaoDoAcessoRapido icone={ChevronsUpDown} rotulo="Expandir tudo (só o que tem itens)" onClick={p.onExpandirTudo} />
          <BotaoDoAcessoRapido icone={ChevronsDownUp} rotulo="Recolher tudo" onClick={p.onRecolherTudo} />
        </>
      ),
    },
    {
      id: 'analise',
      rotulo: 'Análises',
      botoes: (
        <>
          <BotaoDoAcessoRapido icone={Box} rotulo="Paramétrico" onClick={p.onParametrico} />
          {p.onCurvaAbc && <BotaoDoAcessoRapido icone={LayoutDashboard} rotulo={ajudaDoCurvaAbc} onClick={p.onCurvaAbc} />}
          <BotaoDoAcessoRapido icone={Scale} rotulo="Controle orçado × realizado" onClick={p.onOrcadoRealizado} />
          <BotaoDoAcessoRapido icone={ClipboardList} rotulo="Painel de pendências técnicas" onClick={p.onAbrirPendencias} />
        </>
      ),
    },
    {
      id: 'arquivo',
      rotulo: 'Arquivo',
      botoes: (
        <>
          <BotaoDoAcessoRapido icone={FileUp} rotulo="Importar EAP" onClick={p.onImportarEap} />
          <BotaoDoAcessoRapido icone={FileDown} rotulo="Exportar EAP (Excel)" onClick={p.onExportarEap} />
          {/* Tela cheia no acesso rápido, como na Planta e no Planejamento: à vista em
              qualquer aba e com a faixa recolhida — é por aqui que se SAI do modo. */}
          <BotaoDoAcessoRapido
            icone={p.telaCheia ? Minimize2 : Maximize2}
            rotulo={p.telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
            onClick={p.onAlternarTelaCheia}
            ativo={p.telaCheia}
          />
        </>
      ),
    },
  ];

  return (
    // Card de cromo (§19.1/§19.5) — sem `overflow-hidden`; o `border-b` do ribbon sai,
    // porque nada fica abaixo dele dentro do card.
    <div className="rounded-[10px] border border-gray-100 bg-white shadow-sm [&>[role=toolbar]]:border-b-0">
      <Ribbon
        abas={ABAS_DO_ORCAMENTO}
        ativa={aba}
        onEscolher={setAbaSalva}
        recolhido={recolhido}
        onRecolher={setRecolhido}
        ariaLabel="Ferramentas do orçamento"
        acessoRapido={
          <AcessoRapido
            ordem={Array.isArray(ordem) ? ordem : []}
            onOrdem={setOrdem}
            grupos={grupos}
            /* Qual orçamento e com que base de preço — era o subtítulo (2ª crítica:
               "SINAPI de quando, de onde, com ou sem desoneração?"). No fim da linha,
               como as contagens da Planta. */
            cauda={
              <p className="text-xs text-gray-500 whitespace-nowrap">
                {p.nome && <span className="font-medium text-gray-900">{p.nome}</span>}
                {p.nome && <span aria-hidden="true"> · </span>}
                <span title="Base de preço do orçamento: competência, UF e encargos usados na busca de itens e na atualização de competência SINAPI">{p.rotuloBasePreco}</span>
              </p>
            }
          />
        }
        esquerda={
          <>
            {p.onBack && (
              <button
                type="button"
                onClick={p.onBack}
                title={`Voltar para Orçamentos — ${nome}`}
                aria-label={`Voltar para Orçamentos — ${nome}`}
                className="shrink-0 rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            {/* Some da tela, não do app: leitor de tela precisa de um título de nível 1. */}
            <h1 className="sr-only">Orçamento Analítico — {nome}</h1>
          </>
        }
        direita={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {p.isLocked && (
              <div className="flex items-center gap-2 h-9 px-3 bg-amber-50 text-amber-700 rounded-[6px] border border-amber-200 text-sm font-medium" title="Orçamento fechado: só consulta">
                <AlertTriangle className="w-4 h-4" />
                Fechado
              </div>
            )}
            {p.versaoAtiva && (
              <div className="flex items-center gap-1.5 h-9 px-2.5 bg-amber-50 border border-amber-200 rounded-[6px]" title={`Versão ativa: ${p.versaoAtiva.description}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                <span className="text-sm font-medium text-amber-800 max-w-[140px] truncate">v{p.versaoAtiva.item} · {p.versaoAtiva.description}</span>
              </div>
            )}
            {/* KPIs (§4.6): Preço Final é o total de que os outros dois são a decomposição
                (Custo Direto + BDI) — quebra de simetria pela cor (§4.2). */}
            <KpiCard size="xs" label="Preço Final" value={reais(p.totalComBdi)} icon={<Banknote className="w-4 h-4" />} color="emerald" title={`Preço Final = Custo Direto + BDI · ${p.rotuloBasePreco}`} />
            <KpiCard size="xs" label="Custo Direto" value={reais(p.custoDireto)} icon={<Wallet className="w-4 h-4" />} color="gray" />
            <KpiCard
              size="xs"
              label={`BDI (${p.bdi}%)`}
              value={`+ ${reais(p.totalComBdi - p.custoDireto)}`}
              sub={p.bdiZerado ? 'BDI zerado: Preço Final = Custo Direto' : undefined}
              title={p.bdiZerado ? 'O BDI global está em 0%. Itens sem BDI próprio entram sem lucro, impostos e despesas indiretas. Confira se é intencional.' : undefined}
              icon={p.bdiZerado ? <AlertTriangle className="w-4 h-4" /> : <Percent className="w-4 h-4" />}
              color={p.bdiZerado ? 'amber' : 'blue'}
            />
            {p.pendencias.itens > 0 && (
              <div className="relative shrink-0">
                <ActionIconButton
                  kind="view"
                  icon={<ClipboardList className="w-4 h-4" />}
                  title={tituloDaPendencia}
                  aria-label="Abrir painel de pendências técnicas"
                  onClick={p.onAbrirPendencias}
                  className="flex h-9 w-9 items-center justify-center"
                />
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-700 text-white text-[10px] font-bold flex items-center justify-center pointer-events-none">
                  {p.pendencias.itens}
                </span>
              </div>
            )}
            {/* Ação primária (§17, h-9). */}
            <Button onClick={p.onNovoGrupo} className="gap-2 text-button whitespace-nowrap">
              <Plus className="w-4 h-4 stroke-[3]" />
              Novo grupo
            </Button>
          </div>
        }
      >
        {aba === 'estrutura' && (
          <>
            <GrupoDoRibbon rotulo="Estrutura">
              <BotaoDoRibbon icone={ChevronsUpDown} rotulo="Expandir" onClick={p.onExpandirTudo} ajuda="Abre só os grupos, etapas e subetapas que têm itens" />
              <BotaoDoRibbon icone={ChevronsDownUp} rotulo="Recolher" onClick={p.onRecolherTudo} ajuda="Recolhe todos os níveis" />
            </GrupoDoRibbon>
            <GrupoDoRibbon rotulo="Modelos">
              <BotaoDoRibbon icone={Save} rotulo="Modelos de EAP" onClick={p.onModelosEap} ajuda="Salvar a EAP como modelo ou aplicar um modelo" />
            </GrupoDoRibbon>
            {/* Não "Arquivo": é o nome do grupo do acesso rápido (dois `role=group` iguais). */}
            <GrupoDoRibbon rotulo="Importar e exportar">
              <BotaoDoRibbon icone={FileUp} rotulo="Importar EAP" onClick={p.onImportarEap} />
              <BotaoDoRibbon icone={FileText} rotulo="Exportar EAP" onClick={p.onExportarEap} ajuda="Baixa a EAP em Excel" />
            </GrupoDoRibbon>
            <GrupoDoRibbon rotulo="Zerar">
              <BotaoDoRibbon icone={Trash2} rotulo="Limpar toda EAP" perigo onClick={p.onLimparEap} ajuda="Apaga a estrutura de etapas inteira (pede confirmação)" />
            </GrupoDoRibbon>
          </>
        )}

        {aba === 'orcamento' && (
          <>
            <GrupoDoRibbon rotulo="Preço">
              <label
                className={`flex items-center gap-2 h-7 pl-2.5 pr-1 rounded-[6px] border bg-white ${p.bdiZerado ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`}
                title={
                  p.isLocked
                    ? 'Orçamento fechado: o BDI não pode ser alterado'
                    : p.bdiZerado
                      ? 'BDI global em 0%: o Preço Final sai igual ao Custo Direto. Confira se é intencional.'
                      : 'BDI global: vale para todo item sem BDI próprio e define o Preço Final'
                }
              >
                <span className="text-xs font-medium text-gray-700 whitespace-nowrap">BDI global (%)</span>
                <input
                  type="number"
                  value={p.bdi}
                  disabled={p.isLocked}
                  onChange={(e) => p.onBdi(Number(e.target.value))}
                  className="w-16 h-6 rounded-[4px] border border-gray-200 bg-white text-center text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:cursor-not-allowed"
                />
              </label>
            </GrupoDoRibbon>
            <GrupoDoRibbon rotulo="Versões">
              <BotaoDoRibbon
                icone={History}
                rotulo="Histórico"
                ativo={p.historicoVisivel}
                contagem={p.nVersoes}
                onClick={p.onAlternarHistorico}
                ajuda={p.historicoVisivel ? 'Ocultar o histórico de versões' : 'Ver o histórico de versões salvas'}
              />
              <BotaoDoRibbon icone={Save} rotulo="Salvar versão" onClick={p.onSalvarVersao} ajuda="Salvar uma nova versão (snapshot) deste orçamento" />
            </GrupoDoRibbon>
            {p.contrato && (
              <GrupoDoRibbon rotulo="Contrato">
                <BotaoDoRibbon
                  icone={p.contrato.gerando ? Loader2 : FileText}
                  rotulo={p.contrato.gerando ? 'Gerando contrato…' : 'Gerar contrato'}
                  disabled={p.contrato.gerando}
                  onClick={p.contrato.onGerar}
                  ajuda={p.contrato.gerando ? 'O contrato está sendo gerado — aguarde' : 'Gera o contrato a partir deste orçamento'}
                />
              </GrupoDoRibbon>
            )}
          </>
        )}

        {aba === 'analise' && (
          <GrupoDoRibbon rotulo="Análise">
            <BotaoDoRibbon icone={Box} rotulo="Paramétrico" onClick={p.onParametrico} ajuda="Estimativa paramétrica a partir deste orçamento" />
            {p.onCurvaAbc && <BotaoDoRibbon icone={LayoutDashboard} rotulo="Curva ABC" onClick={p.onCurvaAbc} ajuda={ajudaDoCurvaAbc} />}
            <BotaoDoRibbon icone={Scale} rotulo="Orçado × realizado" onClick={p.onOrcadoRealizado} ajuda="Controle orçado × realizado por etapa" />
            <BotaoDoRibbon
              icone={ClipboardList}
              rotulo="Pendências técnicas"
              contagem={p.pendencias.itens > 0 ? p.pendencias.itens : undefined}
              onClick={p.onAbrirPendencias}
              ajuda="Itens sem memória de cálculo ou sem classe de precisão"
            />
          </GrupoDoRibbon>
        )}

        {aba === 'vista' && (
          <>
            <GrupoDoRibbon rotulo="Composição (CPU)">
              <BotaoDoRibbon icone={Layers} rotulo="Abaixo do item" ativo={p.cpuViewMode === 'inline'} onClick={() => p.onCpuViewMode('inline')} ajuda="Abre a composição de preço logo abaixo da linha do item" />
              <BotaoDoRibbon icone={Monitor} rotulo="Em janela" ativo={p.cpuViewMode === 'modal'} onClick={() => p.onCpuViewMode('modal')} ajuda="Abre a composição de preço numa janela" />
            </GrupoDoRibbon>
            <GrupoDoRibbon rotulo="Colunas">
              <BotaoDoRibbon icone={Rows3} rotulo="Mão de obra, material e equipamento" ativo={p.mostrarNaturezas} onClick={p.onAlternarNaturezas} ajuda="Colunas de mão de obra, material e equipamento" />
            </GrupoDoRibbon>
            {/* O ajuste de largura das colunas NÃO vem para cá: o §6.1.2 o quer na régua da
                tabela, ao lado das colunas que ele mede. */}
          </>
        )}
      </Ribbon>
    </div>
  );
}
