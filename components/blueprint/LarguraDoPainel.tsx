import React from 'react';

/**
 * Largura arrastável do painel lateral do editor de Planta Inteligente.
 *
 * ─── POR QUE NÃO REUSEI `useResizableColumns` ───────────────────────────────
 *
 * O app já tem régua de redimensionamento (`components/ui/TableUtils.tsx`), mas
 * ela é de COLUNA DE TABELA: escreve em `<col data-col-key>` dentro de um
 * `<table>` e indexa por chave de coluna. Aqui há um alvo só, e ele não é
 * tabela. O que se reusa é o VOCABULÁRIO — alça de 7 px, `cursor-col-resize`,
 * azul no hover/ativo, duplo clique restaura o padrão, largura guardada em
 * `localStorage` — para o gesto ser o mesmo que o usuário já conhece das
 * tabelas, e não um segundo jeito de redimensionar coisas neste produto.
 *
 * ─── POR QUE A LARGURA É ESCRITA NO DOM DURANTE O ARRASTE ───────────────────
 *
 * Um `setState` por `mousemove` re-renderizaria o editor inteiro a cada pixel —
 * e a árvore inclui `BlueprintCanvas`, que redesenha a planta. O arraste mexe no
 * `style.width` do elemento e só COMMITA no `mouseup`. O canvas continua
 * acompanhando porque ele observa o container por `ResizeObserver`, que dispara
 * na mudança de estilo do mesmo jeito.
 *
 * ─── LIMITES ────────────────────────────────────────────────────────────────
 *
 * 240 px é onde a linha de pavimento (rádio + nome + cota + menu) ainda cabe sem
 * quebrar; abaixo disso o painel volta a esconder controle, que é o defeito
 * histórico desta coluna (ver `AbasDoPainel`). 560 px é teto porque a área de
 * desenho é o produto desta tela — o painel é referência, e já foi encolhido de
 * 384 para 307 px por esse motivo em 27/08/2026.
 */
export const LARGURA_PADRAO = 307;
export const LARGURA_MIN = 240;
export const LARGURA_MAX = 560;

const CHAVE = 'blueprint:larguraDoPainel';
/** Quanto cada seta do teclado move. Um passo grosso o bastante para ser útil. */
const PASSO_TECLADO = 16;

const limitar = (px: number) => Math.max(LARGURA_MIN, Math.min(LARGURA_MAX, px));

export function usePainelRedimensionavel() {
  const [largura, setLargura] = React.useState<number>(() => {
    if (typeof window === 'undefined') return LARGURA_PADRAO;
    try {
      const guardada = localStorage.getItem(CHAVE);
      // Limitado na LEITURA também: se um dia os limites mudarem, uma largura
      // gravada fora da nova faixa não pode ressuscitar por vir do storage.
      return guardada ? limitar(parseInt(guardada, 10) || LARGURA_PADRAO) : LARGURA_PADRAO;
    } catch {
      return LARGURA_PADRAO;
    }
  });

  const caixaRef = React.useRef<HTMLDivElement>(null);
  const arrasteRef = React.useRef<{ xInicial: number; larguraInicial: number } | null>(null);

  const gravar = React.useCallback((px: number) => {
    setLargura(px);
    try {
      localStorage.setItem(CHAVE, String(px));
    } catch {
      /* modo privado, cota estourada — a largura só não sobrevive à recarga */
    }
  }, []);

  const aoPegar = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      arrasteRef.current = { xInicial: e.clientX, larguraInicial: largura };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [largura],
  );

  React.useEffect(() => {
    const aoMover = (e: MouseEvent) => {
      const a = arrasteRef.current;
      if (!a || !caixaRef.current) return;
      // O painel está à DIREITA: arrastar para a esquerda (delta negativo) o
      // ALARGA. Somar o delta encolheria ao puxar para fora, que é o contrário
      // do que a mão espera.
      caixaRef.current.style.width = `${limitar(a.larguraInicial - (e.clientX - a.xInicial))}px`;
    };
    const aoSoltar = () => {
      const a = arrasteRef.current;
      if (!a) return;
      arrasteRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const final = parseInt(caixaRef.current?.style.width ?? '', 10);
      gravar(Number.isFinite(final) ? final : a.larguraInicial);
    };
    window.addEventListener('mousemove', aoMover);
    window.addEventListener('mouseup', aoSoltar);
    return () => {
      window.removeEventListener('mousemove', aoMover);
      window.removeEventListener('mouseup', aoSoltar);
    };
  }, [gravar]);

  const aoTeclar = React.useCallback(
    (e: React.KeyboardEvent) => {
      // Sem isto o painel só se ajusta com mouse. O editor foi construído para
      // ser navegável por teclado (é o que o comentário do `<aside>` afirma), e
      // uma alça que só o mouse alcança contradiz isso.
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        gravar(limitar(largura + PASSO_TECLADO));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        gravar(limitar(largura - PASSO_TECLADO));
      } else if (e.key === 'Home') {
        e.preventDefault();
        gravar(LARGURA_PADRAO);
      }
    },
    [largura, gravar],
  );

  const Puxador = React.useCallback(
    () => (
      <div
        // `separator` é o papel ARIA de divisor redimensionável entre duas
        // regiões, e `aria-orientation="vertical"` diz que ele corre na
        // vertical separando o que está à esquerda do que está à direita.
        role="separator"
        aria-orientation="vertical"
        aria-label="Largura do painel"
        aria-valuenow={largura}
        aria-valuemin={LARGURA_MIN}
        aria-valuemax={LARGURA_MAX}
        tabIndex={0}
        onMouseDown={aoPegar}
        onDoubleClick={() => gravar(LARGURA_PADRAO)}
        onKeyDown={aoTeclar}
        title="Arraste para redimensionar (duplo clique para restaurar o padrão)"
        className="group/puxador absolute bottom-0 left-0 top-0 z-20 w-[7px] cursor-col-resize transition-colors hover:bg-blue-400/40 focus:outline-none focus-visible:bg-blue-500/60 active:bg-blue-500/60"
      >
        <div className="absolute bottom-1/4 left-0 top-1/4 w-px bg-gray-200 group-hover/puxador:bg-blue-400" />
      </div>
    ),
    [largura, aoPegar, aoTeclar, gravar],
  );

  return { largura, caixaRef, Puxador };
}
