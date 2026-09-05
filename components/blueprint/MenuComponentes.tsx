import React, { useEffect, useRef, useState } from 'react';
import {
  Blocks,
  ChevronDown,
  Circle,
  DoorOpen,
  Frame,
  Grid2x2,
  Hexagon,
  Layers,
  Minus,
  MoveHorizontal,
  RectangleHorizontal,
  RectangleVertical,
  SeparatorHorizontal,
  Square,
  SquareStack,
  Triangle,
  Footprints,
  TrendingUp,
} from 'lucide-react';
import {
  nomeDoTipoDeAbertura,
  nomeDoTipoEstrutural,
  type Opening,
  type StructuralKind,
  type TipoCirculacao,
} from '../../utils/blueprintKernel';
import type { BlueprintTool } from '../../hooks/useBlueprintEditor';

/**
 * COMPONENTES — tudo que o desenho constrói, num menu só.
 *
 * ─── POR QUE UM MENU, E NÃO ONZE BOTÕES ─────────────────────────────────────
 *
 * Decisão do usuário (31/08/2026): *"portas, janelas, vão, pilar, vigas, lajes
 * etc. vamos chamá-los de componentes"*, com a parede incluída.
 *
 * Antes eram DOIS lugares para a mesma pergunta ("o que eu vou colocar?"): os
 * botões Parede/Retângulo/Polígono/Abertura de um lado e o menu Estrutural do
 * outro, com um select de Tipo escondido na barra para escolher entre porta,
 * janela e vão. Quem procurava "janela" tinha de saber que ela morava dentro de
 * um select ao lado de um botão chamado "Abertura".
 *
 * Agora há um lugar só, e a barra perde cinco controles.
 *
 * ─── O GESTO CONTINUA SENDO DA FERRAMENTA ───────────────────────────────────
 *
 * `BlueprintTool` não mudou. O menu escolhe DUAS coisas — a ferramenta e o
 * subtipo — porque é isso que um componente é aqui: "parede em retângulo" é a
 * ferramenta `retangulo`; "janela" é a ferramenta `abertura` com
 * `tipoAbertura: 'window'`. Colapsar os dois num identificador só obrigaria o
 * canvas a desfazer o colapso em todo `switch` de gesto.
 *
 * ─── O QUE FICOU DE FORA, E POR QUÊ ─────────────────────────────────────────
 *
 * `Selecionar` é modo, não componente. `Juntar` CORRIGE, não constrói.
 * `Terreno` e `Divisa` são limite jurídico — o comentário da barra é explícito
 * em que o que sai dali não é construção. As três medições são afirmação sobre
 * a planta de fundo, e nem passam pelo kernel. Nenhum dos cinco é algo que a
 * obra levanta, então nenhum é componente.
 *
 * ─── UM ÍCONE POR ITEM, SEM REPETIR ─────────────────────────────────────────
 *
 * A primeira versão reusava três ícones ENTRE grupos: Janela e Pilar eram o
 * mesmo quadrado, Porta de correr e Viga o mesmo retângulo, Vão livre e Laje a
 * mesma moldura. Visto na tela em 31/08/2026 — e num menu de treze linhas que
 * existe para ser ESCANEADO, ícone repetido faz o olho parar e ler o texto, que
 * é exatamente o trabalho que o ícone deveria poupar.
 *
 * Os treze são distintos hoje. Ao acrescentar um componente, confira contra a
 * lista antes de escolher o ícone.
 */

/** Ferramenta + subtipo. É o par que define um componente. */
export type EscolhaComponente =
  | { tool: 'parede' | 'retangulo' | 'poligono' }
  | { tool: 'abertura'; abertura: Opening['kind'] }
  | { tool: 'estrutural'; estrutural: StructuralKind }
  | { tool: 'telhado' }
  | { tool: 'escada'; circulacao: TipoCirculacao };

interface ItemComponente {
  chave: string;
  rotulo: string;
  icone: React.ComponentType<{ className?: string }>;
  ajuda: string;
  escolha: EscolhaComponente;
}

/**
 * O catálogo, em grupos de leitura.
 *
 * A ordem é a da OBRA, de baixo para cima na sequência em que se levanta:
 * alvenaria e esquadria são o que se desenha o tempo todo e vêm primeiro;
 * estrutura e fundação, embaixo, porque são lançadas depois — e porque a
 * fundação é a única que fica abaixo do piso.
 */
const GRUPOS: { titulo: string; itens: ItemComponente[] }[] = [
  {
    titulo: 'Alvenaria',
    itens: [
      {
        chave: 'parede',
        rotulo: 'Parede',
        icone: Minus,
        ajuda: 'Traço a traço. A polilinha mitra os cantos sozinha.',
        escolha: { tool: 'parede' },
      },
      {
        chave: 'retangulo',
        rotulo: 'Parede em retângulo',
        icone: Square,
        ajuda: 'Dois cantos opostos — o gesto de fazer um cômodo.',
        escolha: { tool: 'retangulo' },
      },
      {
        chave: 'poligono',
        rotulo: 'Parede em polígono',
        icone: Hexagon,
        ajuda: 'Contorno fechado de N lados iguais, num gesto só.',
        escolha: { tool: 'poligono' },
      },
    ],
  },
  {
    titulo: 'Esquadrias',
    itens: [
      {
        chave: 'door',
        rotulo: nomeDoTipoDeAbertura('door'),
        icone: DoorOpen,
        ajuda: 'Clique sobre a parede. Nasce com peitoril zero e interrompe o rodapé.',
        escolha: { tool: 'abertura', abertura: 'door' },
      },
      {
        chave: 'sliding',
        rotulo: nomeDoTipoDeAbertura('sliding'),
        icone: MoveHorizontal,
        ajuda: 'A folha corre sobre a face ou dentro da parede — escolha na barra.',
        escolha: { tool: 'abertura', abertura: 'sliding' },
      },
      {
        chave: 'window',
        rotulo: nomeDoTipoDeAbertura('window'),
        icone: Grid2x2,
        ajuda: 'Nasce com peitoril; o rodapé passa por baixo dela.',
        escolha: { tool: 'abertura', abertura: 'window' },
      },
      {
        chave: 'passage',
        rotulo: nomeDoTipoDeAbertura('passage'),
        icone: Frame,
        ajuda:
          'Vão SEM esquadria — passagem, arco. Desconta parede e interrompe o rodapé, ' +
          'mas não entra em área de esquadrias.',
        escolha: { tool: 'abertura', abertura: 'passage' },
      },
    ],
  },
  {
    titulo: 'Estrutura',
    itens: [
      {
        chave: 'PILAR',
        rotulo: nomeDoTipoEstrutural('PILAR'),
        icone: RectangleVertical,
        ajuda: 'Um clique no centro. Desconta área de piso do ambiente onde estiver.',
        escolha: { tool: 'estrutural', estrutural: 'PILAR' },
      },
      {
        chave: 'VIGA',
        rotulo: nomeDoTipoEstrutural('VIGA'),
        icone: RectangleHorizontal,
        ajuda: 'Dois cliques, como a parede — o traço é o eixo. O orto vale aqui.',
        escolha: { tool: 'estrutural', estrutural: 'VIGA' },
      },
      {
        chave: 'LAJE',
        rotulo: nomeDoTipoEstrutural('LAJE'),
        icone: Layers,
        ajuda: 'Contorno que fecha voltando ao primeiro vértice. A espessura é a altura.',
        escolha: { tool: 'estrutural', estrutural: 'LAJE' },
      },
    ],
  },
  {
    titulo: 'Fundação',
    itens: [
      {
        chave: 'ESTACA',
        rotulo: nomeDoTipoEstrutural('ESTACA'),
        icone: Circle,
        ajuda: 'Um clique. Nasce redonda e abaixo do piso — a altura é a profundidade.',
        escolha: { tool: 'estrutural', estrutural: 'ESTACA' },
      },
      {
        chave: 'BLOCO_COROAMENTO',
        rotulo: nomeDoTipoEstrutural('BLOCO_COROAMENTO'),
        icone: SquareStack,
        ajuda: 'Um clique. O bloco que amarra as estacas sob o pilar, abaixo do piso.',
        escolha: { tool: 'estrutural', estrutural: 'BLOCO_COROAMENTO' },
      },
      {
        chave: 'VIGA_FUNDACAO',
        rotulo: nomeDoTipoEstrutural('VIGA_FUNDACAO'),
        icone: SeparatorHorizontal,
        ajuda: 'Dois cliques. Baldrame: mesma geometria da viga, cota abaixo do piso.',
        escolha: { tool: 'estrutural', estrutural: 'VIGA_FUNDACAO' },
      },
    ],
  },
  // COBERTURA por último: é o que se levanta por último na obra — e, na lista,
  // fica embaixo da fundação de propósito, porque a ordem aqui é a da sequência
  // de leitura de baixo para cima, não a da altura na edificação.
  {
    titulo: 'Cobertura',
    itens: [
      {
        chave: 'telhado',
        rotulo: 'Água de telhado',
        icone: Triangle,
        ajuda:
          'Contorno que fecha voltando ao primeiro vértice — inclua o beiral. Uma água por ' +
          'gesto; a inclinação e o lado do beiral se ajustam no painel.',
        escolha: { tool: 'telhado' },
      },
    ],
  },
  // CIRCULAÇÃO por último: é o que liga os pavimentos, e só faz sentido depois
  // que há mais de um. Na sequência de leitura de baixo para cima, ela vem
  // depois da cobertura porque é a única família que pertence a DOIS pisos.
  {
    titulo: 'Circulação',
    itens: [
      {
        chave: 'ESCADA',
        rotulo: 'Escada',
        icone: Footprints,
        ajuda:
          'O eixo do lance, com dois cliques (reto) ou mais (patamar em L ou U); duplo ' +
          'clique encerra. O número de degraus sai do desnível até o pavimento de cima — ' +
          'você escolhe o espelho que quer, e a escada fecha no piso.',
        escolha: { tool: 'escada', circulacao: 'ESCADA' },
      },
      {
        chave: 'RAMPA',
        rotulo: 'Rampa',
        icone: TrendingUp,
        ajuda:
          'O eixo da rampa, como a escada. A inclinação sai do desnível e do comprimento; ' +
          'acima de 8,33% o painel avisa.',
        escolha: { tool: 'escada', circulacao: 'RAMPA' },
      },
    ],
  },
];

/**
 * ─── O CATÁLOGO SAI DAQUI PARA QUEM MAIS PRECISA DELE ───────────────────────
 *
 * O painel "Componentes" (`PainelComponentes.tsx`) lista o que JÁ está desenhado
 * e precisa exatamente do mesmo par nome+ícone que este menu usa para OFERECER.
 * Se cada um tivesse a sua tabela, o item criado por "Porta de correr" apareceria
 * no gerenciador com outro ícone — e o comentário de cima ("um ícone por item,
 * sem repetir") viraria letra morta em metade da tela.
 *
 * A chave é a mesma que `itemAtivo` já usava: `tool` para parede, `Opening['kind']`
 * para esquadria, `StructuralKind` para estrutura e fundação.
 */
export type ChaveDeComponente = string;

export interface FichaDeComponente {
  rotulo: string;
  icone: React.ComponentType<{ className?: string }>;
  /** Título do grupo de leitura — "Alvenaria", "Esquadrias", "Estrutura", "Fundação". */
  grupo: string;
}

/** A ordem de leitura dos grupos, para quem lista sem repetir o arranjo. */
export const ORDEM_DOS_GRUPOS: string[] = GRUPOS.map((g) => g.titulo);

const FICHAS: Record<string, FichaDeComponente> = Object.fromEntries(
  GRUPOS.flatMap((g) =>
    g.itens.map((i) => [i.chave, { rotulo: i.rotulo, icone: i.icone, grupo: g.titulo }]),
  ),
);

/**
 * Nome, ícone e grupo de um componente pela chave. `null` quando a chave não é
 * de componente (divisa, medição) — quem chama decide o que fazer com isso, em
 * vez de receber um ícone genérico que mente sobre a família da peça.
 */
export function fichaDoComponente(chave: ChaveDeComponente): FichaDeComponente | null {
  return FICHAS[chave] ?? null;
}

/** As ferramentas que o menu governa. Fora desta lista, ele fica apagado. */
const TOOLS_DE_COMPONENTE: BlueprintTool[] = [
  'parede',
  'retangulo',
  'poligono',
  'abertura',
  'estrutural',
  'telhado',
  'escada',
];

interface Props {
  tool: BlueprintTool;
  tipoAbertura: Opening['kind'];
  tipoEstrutural: StructuralKind;
  /** Opcional pela razão de `aguas` no painel: chamadas antigas não a conhecem. */
  tipoCirculacao?: TipoCirculacao;
  onEscolher: (e: EscolhaComponente) => void;
}

/** Qual item do catálogo está ativo agora, se algum. */
function itemAtivo(
  tool: BlueprintTool,
  tipoAbertura: Opening['kind'],
  tipoEstrutural: StructuralKind,
  tipoCirculacao: TipoCirculacao,
): ItemComponente | null {
  if (!TOOLS_DE_COMPONENTE.includes(tool)) return null;
  const chave =
    tool === 'abertura'
      ? tipoAbertura
      : tool === 'estrutural'
        ? tipoEstrutural
        : tool === 'escada'
          ? tipoCirculacao
          : tool;
  return GRUPOS.flatMap((g) => g.itens).find((i) => i.chave === chave) ?? null;
}

export default function MenuComponentes({
  tool,
  tipoAbertura,
  tipoEstrutural,
  tipoCirculacao = 'ESCADA',
  onEscolher,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

  // `mousedown`, não `click`: com `click` o toggle do próprio botão dispara
  // depois do fechamento e o menu reabre. Mesma armadilha do `MenuExibir`.
  useEffect(() => {
    if (!aberto) return;
    function foraDaCaixa(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', foraDaCaixa);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  const ativo = itemAtivo(tool, tipoAbertura, tipoEstrutural, tipoCirculacao);
  const Icone = ativo?.icone ?? Blocks;

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        title="Parede, esquadria, estrutura, fundação e cobertura — tudo que o desenho constrói"
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
          ativo
            ? 'border-blue-600 bg-blue-600 text-white'
            : aberto
              ? 'border-blue-600 bg-blue-50 text-blue-700'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        <Icone className="h-3.5 w-3.5" />
        {/* Com um componente ativo o botão passa a DIZER QUAL. Menu fechado não
            pode esconder o estado — é a razão do contador em `MenuExibir`, aqui
            levada a um seletor: sem isso, "por que está saindo janela?" vira
            uma caçada dentro de um menu que ninguém abriu. */}
        {ativo ? ativo.rotulo : 'Componentes'}
        <ChevronDown className="h-3 w-3" />
      </button>

      {aberto ? (
        <div
          role="menu"
          aria-label="Componentes do desenho"
          className="absolute left-0 top-full z-30 mt-1 w-72 rounded-[10px] border border-slate-200 bg-white p-1 shadow-lg"
        >
          {GRUPOS.map((grupo, i) => (
            <div key={grupo.titulo}>
              <div
                className={`flex items-center gap-2 px-2 pb-0.5 ${i > 0 ? 'mt-1 pt-1.5' : 'pt-1'}`}
              >
                <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  {grupo.titulo}
                </span>
                <span className="h-px flex-1 bg-slate-100" />
              </div>
              {grupo.itens.map((item) => {
                const IconeItem = item.icone;
                const selecionado = ativo?.chave === item.chave;
                return (
                  <button
                    key={item.chave}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selecionado}
                    onClick={() => {
                      onEscolher(item.escolha);
                      setAberto(false);
                    }}
                    title={item.ajuda}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                      selecionado
                        ? 'bg-blue-50 font-medium text-blue-700'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <IconeItem className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.rotulo}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
