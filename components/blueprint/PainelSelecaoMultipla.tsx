import React, { useState } from 'react';
import { Move, Trash2 } from 'lucide-react';
import { wallLength, type Wall } from '../../utils/blueprintKernel';
import type { FormaMedida } from '../../utils/blueprintMedicoes';

/**
 * Caixa "N selecionados" do painel de Ambientes.
 *
 * Ocupa o lugar de `PainelParedeSelecionada` quando a seleção tem mais de um
 * item. As operações daquele painel — dividir, unir, espessura, comprimento —
 * são de cardinalidade 1 por definição, e aplicá-las a um conjunto exigiria
 * escolher um item arbitrário. Some, e no lugar aparece o que faz sentido para
 * um conjunto: quanto ele mede, para onde ele anda e como se apaga tudo.
 *
 * O deslocamento por número existe porque o arraste depende da mão: "2 metros
 * para a esquerda" é uma medida de projeto, não uma mira.
 */

/** Lê "2,5" ou "-2.5" como número. `null` se não for número. */
function lerNumero(texto: string): number | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '') return null;
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

interface Props {
  paredes: Wall[];
  /** Divisas de terreno na seleção. Contam à parte: não têm espessura nem custo. */
  limites: number;
  /** Aberturas selecionadas DIRETAMENTE — as hospedadas andam com a parede. */
  aberturas: number;
  medicoes: FormaMedida[];
  /** Desloca a seleção inteira. Recebe milímetros, como todo o resto do kernel. */
  onMover: (deltaXmm: number, deltaYmm: number) => void;
  onExcluir: () => void;
  /** Modo em vigor, só para o texto dizer o que vai acontecer nas junções. */
  modo: 'MANTER' | 'SOLTAR';
}

export default function PainelSelecaoMultipla({
  paredes,
  limites,
  aberturas,
  medicoes,
  onMover,
  onExcluir,
  modo,
}: Props) {
  const [dx, setDx] = useState('0');
  const [dy, setDy] = useState('0');

  const comprimentoTotal = paredes.reduce((soma, w) => soma + wallLength(w), 0);
  const partes = [
    paredes.length > 0 ? `${paredes.length} parede${paredes.length > 1 ? 's' : ''}` : null,
    limites > 0 ? `${limites} divisa${limites > 1 ? 's' : ''}` : null,
    aberturas > 0 ? `${aberturas} abertura${aberturas > 1 ? 's' : ''}` : null,
    medicoes.length > 0 ? `${medicoes.length} medição(ões)` : null,
  ].filter(Boolean);

  function aplicar() {
    const x = lerNumero(dx);
    const y = lerNumero(dy);
    if (x === null || y === null) return;
    // Metros na tela, milímetros no kernel — a conversão vive na borda.
    onMover(Math.round(x * 1000), Math.round(y * 1000));
    setDx('0');
    setDy('0');
  }

  return (
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Seleção múltipla
      </h3>

      <p className="mt-1 text-xs text-slate-600">
        {partes.join(' · ')}
        {paredes.length > 0 ? (
          <>
            {' · '}
            {(comprimentoTotal / 1000).toFixed(2).replace('.', ',')} m de parede
          </>
        ) : null}
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Δx
          <input
            type="text"
            inputMode="decimal"
            value={dx}
            onChange={(e) => setDx(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && aplicar()}
            aria-label="Deslocamento horizontal em metros"
            className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
          />
          m
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Δy
          <input
            type="text"
            inputMode="decimal"
            value={dy}
            onChange={(e) => setDy(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && aplicar()}
            aria-label="Deslocamento vertical em metros"
            className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
          />
          m
        </label>

        <button
          type="button"
          onClick={aplicar}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50"
        >
          <Move className="h-3.5 w-3.5" />
          Mover
        </button>

        <button
          type="button"
          onClick={onExcluir}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-700 transition-colors hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Excluir
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {modo === 'MANTER'
          ? 'Manter junções: o que estava preso ao bloco acompanha, mudando de comprimento sem sair do esquadro.'
          : 'Soltar: o bloco anda inteiro e desencosta das paredes não selecionadas.'}
        {medicoes.length > 0 ? ' Desfazer reverte só as paredes — medição grava direto.' : ''}
      </p>
    </div>
  );
}
