import React from 'react';
import { X } from 'lucide-react';

/**
 * O DOCK de relatórios do editor de Planta Inteligente (F3 do plano
 * `docs/planos/2026-09-13-planta-ribbon-painel-enxuto-dock.md`).
 *
 * ─── POR QUE EMBAIXO, E NÃO NO PAINEL LATERAL ───────────────────────────────
 *
 * Quadro de cargas, Quantitativos, Orçamento, Conflitos, Versões, Medições e
 * Comentários são TABELAS e LISTAS. No painel lateral de 307 px elas brigavam
 * por largura (o quadro de cargas precisou de `table-fixed` e larguras por
 * coluna para a última coluna não sumir). Embaixo do canvas têm a largura da
 * área de desenho inteira — é o que o Revit faz com as schedules: vista, não
 * painel.
 *
 * UM relatório por vez. Dois empilhados repetiriam a rolagem interminável que
 * este dock veio substituir. Fechar é explícito (×) ou pelo mesmo botão do
 * ribbon que abriu.
 *
 * ─── ALTURA ARRASTÁVEL ──────────────────────────────────────────────────────
 *
 * Mesmo gesto da largura do painel (`LarguraDoPainel.tsx`): alça de 7 px,
 * azul no hover, duplo clique restaura, altura em `localStorage`, e o arraste
 * escreve no DOM e só commita no `mouseup` — um `setState` por `mousemove`
 * redesenharia o canvas a cada pixel.
 */
export const ALTURA_PADRAO = 300;
export const ALTURA_MIN = 160;
export const ALTURA_MAX = 720;
const CHAVE = 'blueprint:alturaDoDock';
const PASSO_TECLADO = 24;
const limitar = (px: number) => Math.max(ALTURA_MIN, Math.min(ALTURA_MAX, px));

export function useAlturaDoDock() {
  const [altura, setAltura] = React.useState<number>(() => {
    if (typeof window === 'undefined') return ALTURA_PADRAO;
    try {
      const guardada = localStorage.getItem(CHAVE);
      return guardada ? limitar(parseInt(guardada, 10) || ALTURA_PADRAO) : ALTURA_PADRAO;
    } catch {
      return ALTURA_PADRAO;
    }
  });
  const caixaRef = React.useRef<HTMLDivElement>(null);
  const arrasteRef = React.useRef<{ yInicial: number; alturaInicial: number } | null>(null);

  const gravar = React.useCallback((px: number) => {
    setAltura(px);
    try {
      localStorage.setItem(CHAVE, String(px));
    } catch {
      /* modo privado — a altura só não sobrevive à recarga */
    }
  }, []);

  const aoPegar = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      arrasteRef.current = { yInicial: e.clientY, alturaInicial: altura };
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [altura],
  );

  React.useEffect(() => {
    const aoMover = (e: MouseEvent) => {
      const a = arrasteRef.current;
      if (!a || !caixaRef.current) return;
      // O dock está EMBAIXO: arrastar para cima (delta negativo) o ALTEIA.
      caixaRef.current.style.height = `${limitar(a.alturaInicial - (e.clientY - a.yInicial))}px`;
    };
    const aoSoltar = () => {
      const a = arrasteRef.current;
      if (!a) return;
      arrasteRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const final = parseInt(caixaRef.current?.style.height ?? '', 10);
      gravar(Number.isFinite(final) ? final : a.alturaInicial);
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
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        gravar(limitar(altura + PASSO_TECLADO));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        gravar(limitar(altura - PASSO_TECLADO));
      } else if (e.key === 'Home') {
        e.preventDefault();
        gravar(ALTURA_PADRAO);
      }
    },
    [altura, gravar],
  );

  return { altura, caixaRef, aoPegar, aoTeclar, restaurar: () => gravar(ALTURA_PADRAO) };
}

export default function DockDeRelatorios({
  titulo,
  contagem,
  dock,
  onFechar,
  children,
}: {
  titulo: string;
  /** Número à direita do título (circuitos, conflitos…). `undefined` = sem. */
  contagem?: number;
  dock: ReturnType<typeof useAlturaDoDock>;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      ref={dock.caixaRef}
      role="region"
      aria-label={`Relatório: ${titulo}`}
      className="relative flex shrink-0 flex-col border-t border-slate-200 bg-white"
      style={{ height: dock.altura }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Altura do dock"
        aria-valuenow={dock.altura}
        aria-valuemin={ALTURA_MIN}
        aria-valuemax={ALTURA_MAX}
        tabIndex={0}
        onMouseDown={dock.aoPegar}
        onDoubleClick={dock.restaurar}
        onKeyDown={dock.aoTeclar}
        title="Arraste para redimensionar (duplo clique para restaurar o padrão)"
        className="group/alca absolute left-0 right-0 top-0 z-20 h-[7px] cursor-row-resize transition-colors hover:bg-blue-400/40 focus:outline-none focus-visible:bg-blue-500/60 active:bg-blue-500/60"
      >
        <div className="absolute left-1/4 right-1/4 top-0 h-px bg-gray-200 group-hover/alca:bg-blue-400" />
      </div>
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-1.5">
        <h2 className="text-sm font-medium text-slate-700">{titulo}</h2>
        {contagem !== undefined && (
          <span className="rounded-[6px] bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{contagem}</span>
        )}
        <button
          type="button"
          onClick={onFechar}
          title="Fechar o relatório"
          aria-label="Fechar o relatório"
          className="ml-auto rounded-[6px] p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}
