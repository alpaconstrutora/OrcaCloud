/**
 * AQUECEDOR DE PASSAGEM na gaveta de água (29/09/2026, E8.1 do roadmap
 * hidrossanitário): a vazão simultânea da rede quente, a capacidade nominal
 * que ela pede com o ΔT das premissas, o modelo e a pressão na entrada.
 *
 * 14/10/2026: o resultado vem antes das premissas (que ficam recolhidas, como
 * nos outros painéis); campo numérico que só grava ao sair — apagar uma
 * temperatura gravava 0 °C e superdimensionava o aquecedor.
 */
import React from 'react';
import type { AquecedorDimensionado, HipotesesDeAquecedor } from '../../utils/blueprintAquecedor';
import BlocoDeHipoteses from './BlocoDeHipoteses';
import CampoNumericoDeHipotese from './CampoNumericoDeHipotese';

interface Props {
  aquecedores: readonly AquecedorDimensionado[];
  hip: HipotesesDeAquecedor;
  onHip: (h: HipotesesDeAquecedor) => void;
  onSelecionar: (ids: string[]) => void;
}

const n = (v: number, casas = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const CAMPO = 'w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';

export default function PainelAquecedor({ aquecedores, hip, onHip, onSelecionar }: Props) {
  return (
    <div className="space-y-2" data-testid="aquecedor">
      <p className="text-xs font-semibold text-slate-700">Aquecedor de passagem</p>
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
      <BlocoDeHipoteses
        id="aquecedor"
        titulo="Hipóteses do aquecedor"
        resumo={[`uso ${n(hip.temperaturaDeUsoC, 0)} °C`, `fria ${n(hip.temperaturaDaAguaFriaC, 0)} °C`, `entrada ≥ ${n(hip.pressaoMinimaKpa, 0)} kPa`].join(' · ')}
        regras={
          <>
            <li>Vazão simultânea pelos pesos da NBR 5626 (Q = 0,3·√ΣP).</li>
            <li>
              A capacidade nominal do aquecedor de passagem é a vazão que ele aquece 20 °C; com ΔT de{' '}
              {n(Math.max(1, hip.temperaturaDeUsoC - hip.temperaturaDaAguaFriaC), 0)} °C (uso − fria), a vazão pedida é proporcional. A lista
              (15 a 43 L/min) são as faixas comerciais — o modelo é do catálogo do fabricante.
            </li>
          </>
        }
      >
        <label className="flex items-center gap-1.5">
          Uso
          <CampoNumericoDeHipotese value={hip.temperaturaDeUsoC} onCommit={(v) => onHip({ ...hip, temperaturaDeUsoC: v })} min={25} max={80} step={1} aria-label="Temperatura de uso da água quente em graus" className={CAMPO} />
          °C
        </label>
        <label className="flex items-center gap-1.5">
          Água fria
          <CampoNumericoDeHipotese value={hip.temperaturaDaAguaFriaC} onCommit={(v) => onHip({ ...hip, temperaturaDaAguaFriaC: v })} min={0} max={40} step={1} aria-label="Temperatura da água fria em graus" className={CAMPO} />
          °C
        </label>
        <label className="flex items-center gap-1.5">
          Pressão mínima na entrada
          <CampoNumericoDeHipotese value={hip.pressaoMinimaKpa} onCommit={(v) => onHip({ ...hip, pressaoMinimaKpa: v })} min={0} max={200} step={5} aria-label="Pressão mínima na entrada do aquecedor em kPa" className={CAMPO} />
          kPa
        </label>
      </BlocoDeHipoteses>
    </div>
  );
}
