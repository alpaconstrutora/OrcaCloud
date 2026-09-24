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
  recolhido,
  onRecolher,
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
  /**
   * RIBBON RECOLHIDO (24/09/2026): só a fileira das abas fica; o acesso rápido
   * e o painel da aba somem. Pedido do usuário com print — *"o menubar está com
   * 4 linhas. Ocupando muito da tela"*. Sem isto, nem os menus (que tiram uma
   * fileira) devolvem a tela de quem está conferindo o traçado num notebook.
   */
  recolhido?: boolean;
  /** Sem esta prop o controle de recolher não aparece — quem não guarda o estado não oferece o gesto. */
  onRecolher?: (v: boolean) => void;
  ariaLabel: string;
  /** O painel da aba ativa: `GrupoDoRibbon`s. */
  children: React.ReactNode;
}) {
  return (
    <div role="toolbar" aria-label={ariaLabel} className="border-b border-slate-200 bg-white">
      <div className={`flex flex-wrap items-center gap-2 px-4 pt-1.5 ${recolhido ? 'pb-1.5' : ''}`}>
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
                /* Recolhido, o clique na aba TRAZ o painel de volta: sem isto o
                   clique não faz nada visível e o usuário acha que travou. */
                onClick={() => {
                  onEscolher(a.id);
                  if (recolhido) onRecolher?.(false);
                }}
                /* Duplo clique recolhe — o gesto do Revit e do Office. Só recolhe
                   (nunca abre): estando recolhido, o primeiro clique já abriu. */
                onDoubleClick={() => {
                  if (!recolhido) onRecolher?.(true);
                }}
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
        {/* O gesto EXPLÍCITO de recolher. O duplo clique na aba faz o mesmo, mas
            duplo clique não se descobre olhando — este botão é o que se vê. */}
        {onRecolher && (
          <button
            type="button"
            onClick={() => onRecolher(!recolhido)}
            aria-expanded={!recolhido}
            aria-label={recolhido ? 'Mostrar a faixa de comandos' : 'Recolher a faixa de comandos'}
            title={
              recolhido
                ? 'Mostrar a faixa de comandos'
                : 'Recolher a faixa de comandos e devolver a altura ao desenho (duplo clique na aba faz o mesmo)'
            }
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d={recolhido ? 'M6 9l6 6 6-6' : 'M18 15l-6-6-6 6'} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {direita && <div className="ml-auto flex items-center gap-1">{direita}</div>}
      </div>
      {!recolhido && acessoRapido && <div className="px-4 pt-1.5">{acessoRapido}</div>}

      {/* O painel da aba. `flex-wrap`: em tela estreita os grupos descem de
          linha em vez de sumir — foi assim que duas abas já sumiram da barra
          antiga. `items-stretch` para as divisórias dos grupos irem até embaixo. */}
      {!recolhido && (
        <div className="flex flex-wrap items-stretch gap-x-3 gap-y-2 px-4 py-1.5">{children}</div>
      )}
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

/**
 * Um GRUPO DE COMANDOS que vira um botão com menu ▾.
 *
 * ─── POR QUE ─────────────────────────────────────────────────────────────────
 *
 * Pedido do usuário em 24/09/2026, com print: *"o menubar está com 4 linhas.
 * Ocupando muito da tela. Sugeria agrupamentos"*. Medido na janela do print
 * (1660×780), o canvas ficava com 243 px de 780 — 31% da tela para desenhar.
 *
 * A aba Arquitetura sozinha tinha 20 comandos em quatro grupos (Estrutural,
 * Reforma, Acabamentos, Vistas) que ocupavam DUAS fileiras. Aqui cada grupo
 * desses vira um botão só; os comandos continuam os mesmos, com o mesmo rótulo,
 * a mesma contagem e a mesma ajuda — um clique a mais para chegar neles.
 *
 * ⚠️ O que NÃO entra aqui: o grupo "Construir" (Selecionar, Mover, Componentes,
 * Mobiliário, Juntar). É o que se usa a cada minuto de desenho; esconder atrás
 * de um clique o gesto mais repetido do editor seria trocar altura por atrito.
 *
 * `contagem` é a PENDÊNCIA do grupo, não a soma das contagens de dentro: os
 * números dos itens são de naturezas diferentes (400 rodapés sugeridos × 90
 * esquadrias sem tipo), e somá-los daria um número que não significa nada.
 */
export function MenuDoRibbon({
  rotulo,
  icone: Icone,
  contagem,
  ajuda,
  children,
}: {
  rotulo: string;
  icone: React.ComponentType<{ className?: string }>;
  /** Pendência do grupo — some quando é zero. */
  contagem?: number;
  ajuda?: string;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = React.useState(false);
  const caixaRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  return (
    <div ref={caixaRef} className="relative">
      <button
        type="button"
        data-menu-do-ribbon={rotulo}
        aria-haspopup="true"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        title={ajuda}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
          aberto ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        <Icone className="h-4 w-4" />
        {rotulo}
        {contagem !== undefined && contagem > 0 && (
          <span className="rounded-[6px] bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">{contagem}</span>
        )}
        <ChevronDownDoRibbon />
      </button>
      {aberto && (
        /* z-[70]: acima da grade e do canvas — o mesmo teto dos outros menus do
           ribbon. Fecha ao clicar num comando: quem escolheu já terminou aqui. */
        <div
          aria-label={rotulo}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button')) setAberto(false);
          }}
          className="absolute left-0 z-[70] mt-1 flex min-w-[16rem] flex-col items-stretch gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** A setinha do menu. Inline para o Ribbon não depender de biblioteca de ícone. */
function ChevronDownDoRibbon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3 opacity-60">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
