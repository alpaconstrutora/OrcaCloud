import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Circle,
  Frame,
  Minus,
  RectangleHorizontal,
  Square,
  SquareStack,
} from 'lucide-react';
import { nomeDoTipoEstrutural, type StructuralKind } from '../../utils/blueprintKernel';

/**
 * Os seis elementos de estrutura, num menu só.
 *
 * ─── POR QUE MENU, E NÃO SEIS BOTÕES NA BARRA ───────────────────────────────
 *
 * Escolha do usuário (30/08/2026). A barra já carrega o seletor de vista, onze
 * ferramentas, os selects de espessura e alinhamento, os controles de fundo e o
 * orto — e já quebra linha por isso (`flex-wrap`, com o comentário em
 * `BlueprintEditor` contando que duas abas sumiram ali). Somar seis botões a
 * levaria a três linhas, e uma barra de três linhas deixa de ser barra: o
 * Desfazer/Refazer desce para o fim da última.
 *
 * É o mesmo raciocínio que criou o `MenuExibir`, e este componente é irmão dele
 * de propósito — popover, fecha em clique fora e em Esc, lista declarativa.
 * Popover e não modal, por `UI_PATTERNS.md`: a escolha é reversível e o desenho
 * atrás precisa continuar visível.
 *
 * ─── O BOTÃO MOSTRA O TIPO ATIVO ────────────────────────────────────────────
 *
 * Com a ferramenta ligada, o rótulo do botão vira o nome da peça. Menu fechado
 * não pode esconder estado — é a razão do contador de `MenuExibir`, aqui levada
 * a um seletor: sem isso, "por que está saindo viga?" viraria uma caçada dentro
 * de um menu que ninguém abriu.
 */

interface Props {
  /** `true` quando a ferramenta `estrutural` está ativa. */
  ativa: boolean;
  kind: StructuralKind;
  /** Escolhe o tipo E liga a ferramenta — o menu é um gesto só. */
  onEscolher: (kind: StructuralKind) => void;
}

/**
 * A ordem da LEITURA, não a do código: superestrutura de cima para baixo
 * (pilar → viga → laje), depois fundação (estaca → bloco → viga baldrame). É a
 * ordem em que se constrói ao contrário, que é como o projetista lê a prancha.
 */
const ITENS: {
  kind: StructuralKind;
  icone: React.ComponentType<{ className?: string }>;
  ajuda: string;
}[] = [
  {
    kind: 'PILAR',
    icone: Square,
    ajuda: 'Um clique no centro. Seção retangular ou redonda, altura livre.',
  },
  {
    kind: 'VIGA',
    icone: RectangleHorizontal,
    ajuda: 'Dois cliques, como a parede — o traço é o eixo. O orto vale aqui.',
  },
  {
    kind: 'LAJE',
    icone: Frame,
    ajuda: 'Contorno que fecha voltando ao primeiro vértice. A espessura é a altura.',
  },
  {
    kind: 'ESTACA',
    icone: Circle,
    ajuda: 'Um clique. Nasce redonda e abaixo do piso — a altura é a profundidade.',
  },
  {
    kind: 'BLOCO_COROAMENTO',
    icone: SquareStack,
    ajuda: 'Um clique. O bloco que amarra as estacas sob o pilar, abaixo do piso.',
  },
  {
    kind: 'VIGA_FUNDACAO',
    icone: Minus,
    ajuda: 'Dois cliques. Baldrame: mesma geometria da viga, cota abaixo do piso.',
  },
];

/** O que fica abaixo do piso. Só serve para a divisória do menu. */
const DE_FUNDACAO = new Set<StructuralKind>(['ESTACA', 'BLOCO_COROAMENTO', 'VIGA_FUNDACAO']);

export default function MenuEstrutural({ ativa, kind, onEscolher }: Props) {
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

  const atual = ITENS.find((i) => i.kind === kind) ?? ITENS[0];
  const IconeAtual = atual.icone;

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        title="Pilar, viga, laje, estaca, bloco de coroamento e viga de fundação"
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
          ativa
            ? 'border-blue-600 bg-blue-600 text-white'
            : aberto
              ? 'border-blue-600 bg-blue-50 text-blue-700'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        <IconeAtual className="h-3.5 w-3.5" />
        {/* Ligada, o botão passa a dizer QUAL peça sai do próximo clique. */}
        {ativa ? nomeDoTipoEstrutural(kind) : 'Estrutural'}
        <ChevronDown className="h-3 w-3" />
      </button>

      {aberto ? (
        <div
          role="menu"
          aria-label="Elementos estruturais"
          className="absolute left-0 top-full z-30 mt-1 w-64 rounded-[10px] border border-slate-200 bg-white p-1 shadow-lg"
        >
          {ITENS.map((item, i) => {
            const Icone = item.icone;
            const selecionado = ativa && item.kind === kind;
            // Divisória no PRIMEIRO item de fundação — daí para baixo é o que
            // fica abaixo do piso. Derivada do conjunto, e não de um índice
            // fixo: reordenar `ITENS` não pode deixar o rótulo no lugar errado.
            const abreFundacao =
              DE_FUNDACAO.has(item.kind) && !DE_FUNDACAO.has(ITENS[i - 1]?.kind);
            return (
              <div key={item.kind}>
                {abreFundacao ? (
                  <div className="my-1 flex items-center gap-2 px-2 pt-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Fundação
                    </span>
                    <span className="h-px flex-1 bg-slate-100" />
                  </div>
                ) : null}
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={selecionado}
                  onClick={() => {
                    onEscolher(item.kind);
                    setAberto(false);
                  }}
                  title={item.ajuda}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                    selecionado
                      ? 'bg-blue-50 font-medium text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icone className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{nomeDoTipoEstrutural(item.kind)}</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
