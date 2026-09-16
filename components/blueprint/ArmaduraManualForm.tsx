import React from 'react';
import type { Structural } from '../../utils/blueprintKernel';
import { BITOLAS_LONGITUDINAIS_MM, type ArmaduraDaPeca, type ArmaduraManual } from '../../utils/blueprintArmadura';

/**
 * LANÇAMENTO MANUAL DE ARMADURA (16/09/2026: *"implemente lançamento manual de
 * armadura"*). No painel da peça, o projetista troca o esquema automático pelo
 * seu: barras, bitolas e espaçamento. A peça passa a valer o que foi lançado
 * (origem "manual"), no 3D, na seção, nos Quantitativos e no orçamento; o que
 * ficar abaixo do mínimo da norma aparece como aviso. "Voltar ao automático"
 * apaga o lançamento e o esquema mínimo + taxa volta.
 *
 * Os campos mudam com a família (ver `ArmaduraManual`): pilar/estaca têm barras
 * + estribo/espiral; viga tem inferiores e superiores; laje só a malha; bloco a
 * malha nas duas direções + estribos. Ao entrar no manual, os valores nascem
 * do esquema AUTOMÁTICO atual — o projetista parte do mínimo e ajusta.
 */

const BITOLAS_TRANSVERSAIS_MM = [5, 6.3, 8, 10] as const;
const bit = (mm: number) => mm.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** O lançamento manual inicial: o que o esquema automático está usando agora. */
export function manualAPartirDoEsquema(a: ArmaduraDaPeca): ArmaduraManual {
  const long = a.camadas.find((c) => c.papel === 'longitudinal');
  const sup = a.camadas.find((c) => c.papel === 'superior');
  const malhas = a.camadas.filter((c) => c.papel === 'malha');
  const trans = a.camadas.find((c) => c.papel === 'estribo' || c.papel === 'espiral');
  if (a.kind === 'LAJE') {
    const m = malhas[0];
    return { nLongitudinal: 1, bitolaLongitudinalMm: m?.bitolaMm ?? 8, bitolaTransversalMm: m?.bitolaMm ?? 8, espacamentoTransversalCm: m?.espacamentoCm ?? 20 };
  }
  if (a.kind === 'BLOCO_COROAMENTO') {
    return {
      nLongitudinal: malhas[0]?.n ?? 3,
      nSuperior: malhas[1]?.n ?? 3,
      bitolaLongitudinalMm: malhas[0]?.bitolaMm ?? 12.5,
      bitolaTransversalMm: trans?.bitolaMm ?? 8,
      espacamentoTransversalCm: trans?.espacamentoCm ?? 20,
    };
  }
  return {
    nLongitudinal: long?.n ?? 4,
    bitolaLongitudinalMm: long?.bitolaMm ?? 10,
    ...(sup ? { nSuperior: sup.n, bitolaSuperiorMm: sup.bitolaMm } : {}),
    bitolaTransversalMm: trans?.bitolaMm ?? 5,
    espacamentoTransversalCm: trans?.espacamentoCm ?? 15,
  };
}

interface Props {
  estrutura: Structural;
  armadura: ArmaduraDaPeca;
  /** O lançamento manual em vigor, ou `null` (automático). */
  manual: ArmaduraManual | null;
  onManual: (spec: ArmaduraManual | null) => void;
}

const INPUT = 'w-14 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums text-slate-800';
const SELECT = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800';

export default function ArmaduraManualForm({ estrutura: s, armadura: a, manual, onManual }: Props) {
  const kind = s.kind;
  if (!manual) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span>Armadura automática (mínimos NBR 6118 + taxa).</span>
        <button
          type="button"
          onClick={() => onManual(manualAPartirDoEsquema(a))}
          className="rounded-[6px] border border-blue-300 bg-white px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
        >
          Lançar manualmente
        </button>
      </div>
    );
  }
  const set = (campo: Partial<ArmaduraManual>) => onManual({ ...manual, ...campo });
  const numero = (rotulo: string, valor: number, aplicar: (v: number) => void, ariaLabel: string, min = 1) => (
    <label className="flex items-center gap-1.5">
      {rotulo}
      <input
        type="number"
        min={min}
        step={1}
        value={valor}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min) aplicar(v);
        }}
        aria-label={ariaLabel}
        className={INPUT}
      />
    </label>
  );
  const bitola = (rotulo: string, valor: number, aplicar: (v: number) => void, ariaLabel: string, lista: readonly number[]) => (
    <label className="flex items-center gap-1.5">
      {rotulo}
      <select value={valor} onChange={(e) => aplicar(Number(e.target.value))} aria-label={ariaLabel} className={SELECT}>
        {(lista.includes(valor) ? lista : [valor, ...lista]).map((b) => (
          <option key={b} value={b}>
            Ø {bit(b)}
          </option>
        ))}
      </select>
    </label>
  );
  const transversal = kind === 'ESTACA' ? 'Espiral' : kind === 'LAJE' ? 'Malha' : 'Estribo';
  const passo = kind === 'ESTACA' ? 'passo' : 'c/';

  return (
    <div className="mt-2 rounded-md border border-blue-200 bg-blue-50/50 px-2 py-1.5 text-xs text-slate-700">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-blue-800">Armadura lançada manualmente</span>
        <button
          type="button"
          onClick={() => onManual(null)}
          className="rounded-[6px] border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          Voltar ao automático
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {kind === 'LAJE' ? null : kind === 'BLOCO_COROAMENTO' ? (
          <>
            {numero('Barras na largura', manual.nLongitudinal, (v) => set({ nLongitudinal: v }), 'Barras ao longo da largura')}
            {numero('na profundidade', manual.nSuperior ?? manual.nLongitudinal, (v) => set({ nSuperior: v }), 'Barras ao longo da profundidade')}
            {bitola('Ø', manual.bitolaLongitudinalMm, (v) => set({ bitolaLongitudinalMm: v }), 'Bitola da malha do bloco', BITOLAS_LONGITUDINAIS_MM)}
          </>
        ) : kind === 'VIGA' || kind === 'VIGA_FUNDACAO' ? (
          <>
            {numero('Inferiores', manual.nLongitudinal, (v) => set({ nLongitudinal: v }), 'Barras inferiores')}
            {bitola('Ø', manual.bitolaLongitudinalMm, (v) => set({ bitolaLongitudinalMm: v }), 'Bitola das barras inferiores', BITOLAS_LONGITUDINAIS_MM)}
            {numero('Superiores', manual.nSuperior ?? 2, (v) => set({ nSuperior: v }), 'Barras superiores')}
            {bitola('Ø', manual.bitolaSuperiorMm ?? manual.bitolaLongitudinalMm, (v) => set({ bitolaSuperiorMm: v }), 'Bitola das barras superiores', BITOLAS_LONGITUDINAIS_MM)}
          </>
        ) : (
          <>
            {numero('Barras', manual.nLongitudinal, (v) => set({ nLongitudinal: v }), 'Barras longitudinais')}
            {bitola('Ø', manual.bitolaLongitudinalMm, (v) => set({ bitolaLongitudinalMm: v }), 'Bitola das barras longitudinais', BITOLAS_LONGITUDINAIS_MM)}
          </>
        )}
        {bitola(
          transversal,
          manual.bitolaTransversalMm,
          (v) => set({ bitolaTransversalMm: v }),
          `Bitola — ${transversal.toLowerCase()}`,
          kind === 'LAJE' ? BITOLAS_LONGITUDINAIS_MM : BITOLAS_TRANSVERSAIS_MM,
        )}
        {numero(passo, manual.espacamentoTransversalCm, (v) => set({ espacamentoTransversalCm: v }), `Espaçamento — ${transversal.toLowerCase()} (cm)`)}
        <span className="text-slate-500">cm</span>
      </div>
      {a.avisos.filter((x) => /mínimo|acima do máximo/.test(x)).length > 0 && (
        <ul className="mt-1.5 list-disc pl-4 text-[11px] text-amber-800">
          {a.avisos
            .filter((x) => /mínimo|acima do máximo/.test(x))
            .map((x) => (
              <li key={x}>{x}</li>
            ))}
        </ul>
      )}
      <p className="mt-1 text-[10px] text-slate-500">Vale para o kg, o 3D, a seção, a planilha e o orçamento. O piso da taxa não se aplica à peça lançada à mão.</p>
    </div>
  );
}
