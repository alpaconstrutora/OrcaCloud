/**
 * AQUECEDOR DE PASSAGEM na gaveta de água (29/09/2026, E8.1 do roadmap
 * hidrossanitário): a vazão simultânea da rede quente, a capacidade nominal
 * que ela pede com o ΔT das premissas, o modelo e a pressão na entrada.
 */
import React from 'react';
import type { AquecedorDimensionado, HipotesesDeAquecedor } from '../../utils/blueprintAquecedor';

interface Props {
  aquecedores: readonly AquecedorDimensionado[];
  hip: HipotesesDeAquecedor;
  onHip: (h: HipotesesDeAquecedor) => void;
  onSelecionar: (ids: string[]) => void;
}

const n = (v: number, casas = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const campo = 'w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';

export default function PainelAquecedor({ aquecedores, hip, onHip, onSelecionar }: Props) {
  const numero = (v: string, padrao: number) => {
    const x = Number(v.replace(',', '.'));
    return Number.isFinite(x) ? x : padrao;
  };
  return (
    <div className="space-y-2" data-testid="aquecedor">
      <p className="text-xs font-semibold text-slate-700">Aquecedor de passagem</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
        <label className="flex items-center gap-1.5">
          Uso (°C)
          <input type="number" step={1} value={hip.temperaturaDeUsoC} onChange={(e) => onHip({ ...hip, temperaturaDeUsoC: numero(e.target.value, 40) })} aria-label="Temperatura de uso da água quente em graus" className={campo} />
        </label>
        <label className="flex items-center gap-1.5">
          Água fria (°C)
          <input type="number" step={1} value={hip.temperaturaDaAguaFriaC} onChange={(e) => onHip({ ...hip, temperaturaDaAguaFriaC: numero(e.target.value, 20) })} aria-label="Temperatura da água fria em graus" className={campo} />
        </label>
        <label className="flex items-center gap-1.5">
          Pressão mínima (kPa)
          <input type="number" min={0} step={5} value={hip.pressaoMinimaKpa} onChange={(e) => onHip({ ...hip, pressaoMinimaKpa: Math.max(0, numero(e.target.value, 20)) })} aria-label="Pressão mínima na entrada do aquecedor em kPa" className={campo} />
        </label>
      </div>
      {aquecedores.map((a, i) => (
        <div key={a.aquecedorId} className={`rounded-md border px-3 py-1.5 text-xs ${a.atende ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`} data-testid="aquecedor-resultado">
          <button type="button" onClick={() => onSelecionar([a.aquecedorId])} className="font-semibold hover:underline">
            Aquecedor {aquecedores.length > 1 ? i + 1 : ''}
          </button>{' '}
          <span className="tabular-nums">
            {a.pontos} ponto(s), ΣP {n(a.somaDePesos, 2)} → Q = {n(a.vazaoLMin)} L/min; ΔT {n(a.deltaTC, 0)} °C pede {n(a.capacidadeNecessariaLMin)} L/min nominais →{' '}
            {a.modeloLMin != null ? `aquecedor de ${a.modeloLMin} L/min` : 'nenhum da lista'}; entrada{' '}
            {a.pressaoNaEntradaKpa != null ? `${n(a.pressaoNaEntradaKpa)} kPa (mín. ${n(hip.pressaoMinimaKpa, 0)})` : 'não avaliada'}.
          </span>
          {a.avisos.map((x) => (
            <span key={x} className="block text-amber-800">{x}</span>
          ))}
        </div>
      ))}
      <p className="text-xs text-slate-500">
        Vazão simultânea pelos pesos da NBR 5626 (Q = 0,3·√ΣP). A capacidade nominal do aquecedor de passagem é a vazão que ele aquece 20 °C;
        a lista (15 a 43 L/min) são as faixas comerciais — o modelo é do catálogo do fabricante.
      </p>
    </div>
  );
}
