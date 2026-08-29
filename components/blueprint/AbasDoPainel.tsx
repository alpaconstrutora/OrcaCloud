import React from 'react';

/**
 * Barra de abas do painel lateral do editor — anatomia do §19.1 do guia.
 *
 * Card branco, trilho `bg-gray-50` por dentro e aba ativa em `bg-white
 * text-blue-600 shadow-sm`. Não é o azul sólido do botão primário: aba ativa é
 * estado de NAVEGAÇÃO, não ação.
 *
 * ─── POR QUE `flex-wrap`, E POR QUE NÃO ERA GRADE ───────────────────────────
 *
 * Esta barra vive num `<aside>` de 384 px com `overflow-hidden`, e já perdeu
 * abas duas vezes: item de flex NÃO encolhe abaixo do próprio conteúdo
 * (`min-width: auto`), então a barra transbordava e o recorte comia a última.
 * A abas existiam no DOM, eram achadas por `getByRole`, e ninguém as via.
 *
 * A correção anterior foi `grid grid-cols-4`, que resolve o recorte fixando a
 * largura da coluna — mas as abas viraram cinco, e a quinta passou a ficar
 * sozinha numa segunda linha ocupando um quarto da largura. `flex-wrap`, que é
 * o que o guia pede, resolve as duas coisas: a linha quebra quando precisa e
 * cada aba ocupa o que o rótulo pede.
 *
 * Extraído do `BlueprintEditor` para poder ser MEDIDO — ver
 * `docs/spikes/medicoes/passeio.mjs`, que confere que nada ultrapassa a borda
 * do painel. jsdom não tem retângulo, e é o retângulo que denuncia este defeito.
 */
export interface Aba<T extends string> {
  id: T;
  rotulo: string;
}

export default function AbasDoPainel<T extends string>({
  abas,
  ativa,
  onEscolher,
}: {
  abas: readonly Aba<T>[];
  ativa: T;
  onEscolher: (id: T) => void;
}) {
  return (
    // Sem borda inferior própria: desde 29/08/2026 esta barra vive dentro de uma
    // `<SecaoAccordion>`, que já desenha o separador. As duas juntas davam um fio
    // duplo.
    <div className="bg-white px-3 pb-3">
      <div
        className="flex max-w-full flex-wrap items-center gap-1 rounded-[10px] border border-gray-100 bg-gray-50 p-1"
        role="tablist"
      >
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={ativa === a.id}
            onClick={() => onEscolher(a.id)}
            className={`h-7 whitespace-nowrap rounded-[6px] px-3 text-sm font-medium transition-all ${
              ativa === a.id
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-700 hover:text-gray-900'
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}
