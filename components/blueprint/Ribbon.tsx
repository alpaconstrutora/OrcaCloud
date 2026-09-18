import React from 'react';

/**
 * O RIBBON do editor de Planta Inteligente — abas por disciplina, no estilo do
 * Revit (pedido do usuário em 13/09/2026: *"organizar em menubar no estilo do
 * revit"*).
 *
 * ─── POR QUE ABAS, E NÃO UMA BARRA SÓ ───────────────────────────────────────
 *
 * A barra de ferramentas tinha ~25 controles numa linha que quebrava em duas ou
 * três, e o painel lateral empilhava 15 seções de quatro naturezas diferentes
 * (navegação, propriedades, comandos e relatórios). O ribbon separa os COMANDOS
 * por disciplina — Arquitetura, Terreno, Instalações, Inserir, Analisar, Vista —
 * e devolve ao painel lateral só o que é dele: navegador e propriedades.
 *
 * ─── AS TRÊS LINHAS ─────────────────────────────────────────────────────────
 *
 *   1. abas — com o slot `esquerda` (o seletor de vista, que se usa o tempo
 *      todo e por isso NÃO mora dentro de uma aba) e o slot `direita` (o acesso
 *      rápido: desfazer, refazer, copiar, colar, excluir — sempre visíveis, a
 *      Quick Access Toolbar do Revit);
 *   2. o painel da aba ativa — `role="toolbar"`, grupos com rótulo embaixo
 *      (`GrupoDoRibbon`), como os panels do Revit;
 *   3. a barra de opções da ferramenta (`BarraDeOpcoes`) — a Options Bar: só
 *      o que a ferramenta ATIVA pergunta (espessura, largura, orto…). Vive fora
 *      deste componente porque é o editor quem sabe o que cada ferramenta pede.
 *
 * ─── ABA VAZIA NÃO APARECE ──────────────────────────────────────────────────
 *
 * As abas vêm de fora já filtradas pela vista: em elevação, corte e 3D só há o
 * que se pode fazer ali. A aba persistida que deixou de existir cai na primeira
 * — é o chamador que resolve isso (`abaEfetiva`), para o estado salvo não
 * apontar para uma aba fantasma.
 *
 * O `role="toolbar"` envolve as DUAS linhas (abas e painel), e não só o painel: quem procura "a barra de ferramentas do editor" espera achar o
 * seletor de vista e o desfazer dentro dela — é o que os testes já fazem.
 *
 * Vocabulário do trilho de abas: §19.1 do `docs/ui_ux_guia_unificado.md`
 * (trilho `bg-gray-50`, aba ativa `bg-white text-blue-600 shadow-sm`, `h-7`).
 */
export interface AbaDoRibbon<Id extends string = string> {
  id: Id;
  rotulo: string;
  /** Aba de CONTEXTO (a "Modificar" do Revit): destacada, aparece e some com a seleção. */
  contextual?: boolean;
}

/**
 * A aba persistida se ainda existir; senão a `preferida` (a que faz sentido no
 * estado novo — "Vista" ao sair da planta baixa); senão, a primeira.
 */
export function abaEfetiva<Id extends string>(
  abas: readonly AbaDoRibbon<Id>[],
  salva: Id,
  preferida?: Id,
): Id {
  const existe = (id: Id | undefined) => id !== undefined && abas.some((a) => a.id === id);
  if (existe(salva)) return salva;
  if (existe(preferida)) return preferida as Id;
  return abas[0].id;
}

export default function Ribbon<Id extends string>({
  abas,
  ativa,
  onEscolher,
  esquerda,
  direita,
  acessoRapido,
  ariaLabel,
  children,
}: {
  abas: readonly AbaDoRibbon<Id>[];
  ativa: Id;
  onEscolher: (id: Id) => void;
  /** Antes das abas — o seletor de vista. */
  esquerda?: React.ReactNode;
  /** Depois das abas, encostado à direita. */
  direita?: React.ReactNode;
  /**
   * O ACESSO RÁPIDO (17/09/2026): linha PRÓPRIA sob as abas, alinhada à
   * esquerda. Antes ia no slot `direita` e, com 27 botões, caía torto na
   * segunda linha (*"o toolbar de botões está deslocado… alinhe à esquerda"*).
   */
  acessoRapido?: React.ReactNode;
  ariaLabel: string;
  /** O painel da aba ativa: `GrupoDoRibbon`s. */
  children: React.ReactNode;
}) {
  return (
    <div role="toolbar" aria-label={ariaLabel} className="border-b border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-1.5">
        {esquerda}
        <div
          role="tablist"
          aria-label="Abas de ferramentas"
          className="flex max-w-full flex-wrap items-center gap-1 rounded-[10px] border border-gray-100 bg-gray-50 p-1"
        >
          {abas.map((a) => {
            const selecionada = a.id === ativa;
            return (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={selecionada}
                onClick={() => onEscolher(a.id)}
                className={`h-7 whitespace-nowrap rounded-[6px] px-3 text-sm font-medium transition-all ${
                  selecionada
                    ? a.contextual
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'bg-white text-blue-600 shadow-sm'
                    : a.contextual
                      ? 'text-emerald-700 hover:text-emerald-800'
                      : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                {a.rotulo}
              </button>
            );
          })}
        </div>
        {direita && <div className="ml-auto flex items-center gap-1">{direita}</div>}
      </div>
      {acessoRapido && <div className="px-4 pt-1.5">{acessoRapido}</div>}

      {/* O painel da aba. `flex-wrap`: em tela estreita os grupos descem de
          linha em vez de sumir — foi assim que duas abas já sumiram da barra
          antiga. `items-stretch` para as divisórias dos grupos irem até embaixo. */}
      <div className="flex flex-wrap items-stretch gap-x-3 gap-y-2 px-4 py-1.5">{children}</div>
    </div>
  );
}

/**
 * Um grupo do painel: os controles em cima, o rótulo em caixa alta embaixo —
 * o "panel" do ribbon do Revit. A divisória à direita separa do grupo seguinte;
 * o último não tem.
 */
export function GrupoDoRibbon({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className="flex flex-col justify-between gap-0.5 border-r border-slate-200 pr-3 last:border-r-0 last:pr-0"
    >
      <div className="flex flex-wrap items-center gap-1">{children}</div>
      <span className="text-[10px] uppercase tracking-wide text-slate-400">{rotulo}</span>
    </div>
  );
}

/**
 * Botão do ribbon que ABRE algo (uma tarefa no painel, um relatório no dock),
 * em vez de escolher uma ferramenta. Mesma roupa da `Ferramenta` do editor —
 * o olho não precisa distinguir "ferramenta" de "comando" pela cor — mas com
 * `aria-pressed`, porque o que ele abre fica aberto até ser fechado.
 */
export function BotaoDoRibbon({
  icone: Icone,
  rotulo,
  ativo,
  onClick,
  contagem,
  ajuda,
  disabled,
  perigo,
}: {
  icone: React.ComponentType<{ className?: string }>;
  rotulo: string;
  /** `undefined` = ação pontual (sem `aria-pressed`): excluir, dividir, copiar. */
  ativo?: boolean;
  onClick: () => void;
  /** Número depois do rótulo — conflitos, circuitos, formas medidas. */
  contagem?: number;
  ajuda?: string;
  disabled?: boolean;
  /** Ação destrutiva (Excluir): vermelha, como o `ActionIconButton kind="delete"`. */
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      title={ajuda}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        ativo
          ? 'bg-blue-600 text-white'
          : perigo
            ? 'text-red-600 hover:bg-red-50'
            : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icone className="h-4 w-4" />
      {rotulo}
      {contagem !== undefined && (
        <span
          className={`rounded-[6px] px-1.5 py-0.5 text-[10px] ${
            ativo ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {contagem}
        </span>
      )}
    </button>
  );
}

/**
 * A barra de opções da ferramenta ativa — a Options Bar do Revit.
 *
 * Uma linha fina, cinza, com o NOME da ferramenta à esquerda: é ela que responde
 * "por que está saindo janela?" quando o ribbon está noutra aba. Sempre presente
 * na planta baixa, mesmo quando a ferramenta não tem opção nenhuma: uma barra
 * que aparece e some a cada troca de ferramenta faria o canvas pular de altura.
 */
export function BarraDeOpcoes({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div
      role="region"
      aria-label="Opções da ferramenta"
      className="flex min-h-[34px] flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-1"
    >
      <span className="text-xs font-semibold text-slate-600">{rotulo}</span>
      {children}
    </div>
  );
}
