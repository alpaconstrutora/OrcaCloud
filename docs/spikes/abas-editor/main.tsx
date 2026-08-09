/**
 * Harness da barra de abas do editor de plantas.
 *
 * POR QUE ELE EXISTE. A aba "Versões" sumiu da tela e NENHUM teste pegou —
 * porque ela estava lá, no DOM, com o `role="tab"` e tudo. O que faltava era
 * ESPAÇO: com `flex-1` o conteúdo de cada aba não encolhe abaixo do próprio
 * tamanho, a barra transbordava os 320 px do painel e o `overflow-hidden` do
 * <aside> recortava a última.
 *
 * jsdom não faz layout: `getBoundingClientRect` devolve zero para tudo. Então
 * nenhum teste de componente pode enxergar recorte — só um navegador de verdade.
 *
 * Roda em dois modos: com `?antes=1` reproduz o layout velho (para conferir que
 * a medição REPROVA o que estava errado — senão ela não discrimina nada).
 */
// SEM ISTO A MEDIÇÃO NÃO MEDE NADA: as classes do Tailwind não existiriam, o
// painel viria com a largura natural do bloco e os dois modos dariam o mesmo
// número. Foi o que aconteceu na primeira execução.
import '../../../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Calculator, Coins, History, PencilRuler } from 'lucide-react';

const ABAS = [
  { icone: PencilRuler, rotulo: 'Ambientes' },
  { icone: Calculator, rotulo: 'Quantitativos' },
  { icone: Coins, rotulo: 'Orçamento' },
  { icone: History, rotulo: 'Versões' },
];

const antes = new URLSearchParams(location.search).has('antes');

function Painel({ largura, id }: { largura: string; id: string }) {
  return (
    <aside
      id={id}
      data-painel
      className={`flex ${largura} shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white`}
      style={{ height: 320 }}
    >
      <div
        className={
          antes
            ? 'flex shrink-0 border-b border-slate-200'
            : 'grid shrink-0 grid-cols-4 border-b border-slate-200'
        }
        role="tablist"
      >
        {ABAS.map(({ icone: Icone, rotulo }, i) => (
          <button
            key={rotulo}
            type="button"
            role="tab"
            data-aba
            aria-selected={i === 0}
            title={rotulo}
            className={
              antes
                ? `flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium ${
                    i === 0 ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'
                  }`
                : `flex min-w-0 flex-col items-center justify-center gap-0.5 border-b-2 px-1 py-1.5 text-[11px] font-medium ${
                    i === 0 ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'
                  }`
            }
          >
            <Icone className="h-3.5 w-3.5 shrink-0" />
            {antes ? rotulo : <span className="w-full truncate text-center">{rotulo}</span>}
          </button>
        ))}
      </div>
      <p className="px-4 py-3 text-xs text-slate-500">
        {antes ? 'ANTES — flex-1, 320 px' : 'DEPOIS — grid-cols-4, 384 px'}
      </p>
    </aside>
  );
}

createRoot(document.getElementById('raiz')!).render(
  <Painel largura={antes ? 'w-80' : 'w-96'} id="painel" />,
);
