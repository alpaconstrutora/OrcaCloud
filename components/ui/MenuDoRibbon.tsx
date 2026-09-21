/**
 * Menu de OPÇÕES do ribbon (§19.5): um botão do painel da aba que abre uma
 * lista de itens ligáveis — "Colunas" (quais colunas estão visíveis), "Níveis"
 * (quais níveis do resumo aparecem), "Natureza" (quais naturezas de tarefa).
 *
 * É o `BotaoDoRibbon` que, em vez de agir, pergunta. Gatilho com a roupa do
 * `blueprint/MenuExibir.tsx` (`aria-haspopup="menu"`, `aria-expanded`, aberto
 * em azul); a contagem opcional existe para o menu fechado não esconder o
 * estado — "por que a coluna sumiu?" não pode virar uma caçada dentro de um
 * menu fechado. Itens são `menuitemcheckbox` + `aria-checked`: cada clique
 * alterna um e o menu fica aberto, porque quem liga três colunas não quer
 * reabrir três vezes.
 *
 * Criado em 21/09/2026 para o Planejamento, substituindo três dropdowns
 * feitos à mão dentro do cabeçalho das grades (indigo, `font-bold`,
 * `rounded-xl`, `z-[200]`), cada um com a própria mecânica de fechar.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface ItemDoMenuDoRibbon {
  id: string;
  rotulo: string;
  marcado: boolean;
  /** Bolinha colorida antes do rótulo (a cor da natureza da tarefa). */
  cor?: string;
}

export default function MenuDoRibbon({
  icone: Icone,
  rotulo,
  itens,
  onAlternar,
  contagem,
  cabecalho,
  rodape,
  ajuda,
  ariaLabel,
}: {
  icone: React.ComponentType<{ className?: string }>;
  rotulo: string;
  itens: readonly ItemDoMenuDoRibbon[];
  onAlternar: (id: string) => void;
  /** Número no gatilho — colunas ocultas, filtros ligados. `0`/`undefined` não aparece. */
  contagem?: number;
  /** Linha em caixa alta no topo da lista ("Colunas visíveis"). */
  cabecalho?: string;
  /** Ações abaixo da lista ("Ver todas", "Focar Gantt"), separadas por uma linha. */
  rodape?: React.ReactNode;
  ajuda?: string;
  /** Nome do menu aberto; sem ele, usa o `rotulo`. */
  ariaLabel?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        title={ajuda}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
          aberto
            ? 'border-blue-600 bg-blue-50 text-blue-700'
            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        <Icone className="h-3.5 w-3.5" />
        {rotulo}
        {contagem ? (
          <span className="rounded bg-blue-600 px-1 text-[10px] font-semibold text-white">{contagem}</span>
        ) : null}
        <ChevronDown className="h-3 w-3" />
      </button>

      {aberto ? (
        <div
          role="menu"
          aria-label={ariaLabel ?? rotulo}
          // z-[70]: acima do cabeçalho fixo das grades (z-60) — ver MenuDeVistas.
          className="absolute left-0 top-full z-[70] mt-1 w-56 rounded-[10px] border border-slate-200 bg-white p-1 shadow-lg"
        >
          {cabecalho ? (
            <div className="px-2 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-slate-400">{cabecalho}</div>
          ) : null}
          <div className="max-h-72 overflow-y-auto">
            {itens.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={item.marcado}
                onClick={() => onAlternar(item.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                  item.marcado ? 'text-slate-700 hover:bg-blue-50' : 'text-slate-400 hover:bg-slate-50'
                }`}
              >
                <span className="w-3.5 shrink-0">
                  {item.marcado ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
                </span>
                {item.cor ? (
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.cor }} />
                ) : null}
                <span className="truncate">{item.rotulo}</span>
              </button>
            ))}
          </div>
          {rodape ? <div className="mt-1 flex flex-wrap gap-1 border-t border-slate-100 pt-1">{rodape}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
