import React from 'react';
import { ArrowLeftRight, Eye } from 'lucide-react';
import type { Corte } from '../../utils/blueprintKernel';
import IdentificadorDoElemento from './IdentificadorDoElemento';

/**
 * Caixa "Corte selecionado" do painel lateral.
 *
 * Irmã de `PainelAguaSelecionada`, extraída pela mesma razão: pegar a linha
 * exige clique no CANVAS, que é opaco em jsdom.
 *
 * ─── TRÊS COISAS, E SÓ ELAS ─────────────────────────────────────────────────
 *
 * A letra, o lado para onde se olha e o atalho para ver o desenho. A GEOMETRIA
 * da linha não tem campo: ela se ajusta arrastando as pontas na planta, que é
 * onde se enxerga por onde o plano passa. Um par de campos de coordenada aqui
 * seria a única forma de mover um corte sem ver o que ele atravessa.
 */
interface Props {
  corte: Corte | null;
  onProps: (campos: { olharPara?: 'ESQUERDA' | 'DIREITA'; rotulo?: string }) => void;
  onVer: () => void;
  onExcluir: () => void;
}

export default function PainelCorteSelecionado({ corte, onProps, onVer, onExcluir }: Props) {
  if (!corte) return null;

  const comprimentoM = Math.hypot(corte.b.x - corte.a.x, corte.b.y - corte.a.y) / 1000;

  return (
    <div className="border-b border-slate-200 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-700">Corte {corte.rotulo}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Linha de {comprimentoM.toFixed(2).replace('.', ',')} m · olhando para a{' '}
            {corte.olharPara === 'ESQUERDA' ? 'esquerda' : 'direita'} de quem a traçou.
          </p>
          <IdentificadorDoElemento uid={corte.uid} familia="section" />
        </div>
        <button
          type="button"
          onClick={onExcluir}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700"
        >
          Excluir
        </button>
      </div>

      <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
        Letra
        <input
          type="text"
          key={`${corte.id}-rotulo`}
          defaultValue={corte.rotulo}
          maxLength={4}
          aria-label="Letra da marca do corte, como na prancha"
          onBlur={(e) => onProps({ rotulo: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="w-14 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
        />
      </label>

      {/* INVERTER, e não um select de lado: a pergunta é binária e o usuário não
          pensa em "esquerda de a→b" — ele olha as setas no desenho e quer o
          outro lado. O botão faz exatamente isso, e as setas confirmam. */}
      <button
        type="button"
        onClick={() =>
          onProps({ olharPara: corte.olharPara === 'ESQUERDA' ? 'DIREITA' : 'ESQUERDA' })
        }
        title="Vira o corte para o outro lado. As setas na planta acompanham."
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
        Inverter o lado
      </button>

      <button
        type="button"
        onClick={onVer}
        className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
      >
        <Eye className="h-3.5 w-3.5" />
        Ver o corte {corte.rotulo}
      </button>
    </div>
  );
}
