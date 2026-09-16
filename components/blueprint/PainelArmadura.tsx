import React from 'react';
import { nomeDoTipoEstrutural } from '../../utils/blueprintKernel';
import {
  BITOLAS_DE_ESTRIBO_MM,
  BITOLAS_LONGITUDINAIS_MM,
  CLASSES_DE_AGRESSIVIDADE,
  FCKS_MPA,
  HIPOTESES_ARMADURA_PADRAO,
  PERDAS_PCT,
  TRECHOS_ARMADOS_DA_ESTACA_M,
  familiaDaPeca,
  tipoDeAco,
  type ArmaduraQuantificada,
  type HipotesesDeArmadura,
} from '../../utils/blueprintArmadura';

/**
 * GAVETA "ARMADURA" — o pré-quantitativo de aço da planta (16/09/2026).
 *
 * Pedido: *"implementar armadura em vigas, lajes, pilares, blocos e estacas"*.
 * Aqui moram as HIPÓTESES (do estudo, gravadas no banco) e a leitura do que
 * elas produzem: kg por família e por peça, com o esquema de cada uma e a
 * origem do número (esquema mínimo ou piso da taxa). O que se edita aqui muda
 * o painel da peça, os Quantitativos, a planilha e o orçamento — é a mesma
 * conta (`armaduraDoModelo`).
 *
 * Tudo aqui é pré-quantitativo: mínimos da NBR 6118 + taxa de referência. Não
 * dimensiona (não há esforço) nem detalha (não há lista de barras). Dito no
 * topo, para ninguém levar o número para a obra.
 */

const kg = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const m3 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const bit = (mm: number) => mm.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

interface Props {
  hipoteses: HipotesesDeArmadura;
  onHipoteses: (h: HipotesesDeArmadura) => void;
  armadura: ArmaduraQuantificada;
  /** Selecionar a peça no desenho a partir da linha. */
  onSelecionarPeca?: (id: string) => void;
  carregando?: boolean;
  persistenciaIndisponivel?: boolean;
}

const SELECT = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs';
const INPUT = 'w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';

export default function PainelArmadura({ hipoteses: h, onHipoteses, armadura, onSelecionarPeca, carregando, persistenciaIndisponivel }: Props) {
  const set = (campo: Partial<HipotesesDeArmadura>) => onHipoteses({ ...h, ...campo });
  const t = armadura.totais;
  const familias: { nome: string; chave: ReturnType<typeof familiaDaPeca>; kg: number; taxa: number }[] = [
    { nome: 'Pilares', chave: 'PILAR', kg: t.pilarKg, taxa: t.taxaPilarKgM3 },
    { nome: 'Vigas', chave: 'VIGA', kg: t.vigaKg, taxa: t.taxaVigaKgM3 },
    { nome: 'Lajes', chave: 'LAJE', kg: t.lajeKg, taxa: t.taxaLajeKgM3 },
    { nome: 'Fundação (estacas, blocos, baldrames)', chave: 'FUNDACAO', kg: t.fundacaoKg, taxa: t.taxaFundacaoKgM3 },
  ];
  const pecasDe = (chave: ReturnType<typeof familiaDaPeca>) => armadura.pecas.filter((p) => familiaDaPeca(p.kind) === chave);
  const volumeDe = (chave: ReturnType<typeof familiaDaPeca>) => pecasDe(chave).reduce((a, p) => a + p.volumeConcretoM3, 0);

  const bitolaSelect = (rotulo: string, campo: keyof HipotesesDeArmadura) => (
    <label className="flex items-center gap-2">
      {rotulo}
      <select
        value={h[campo] as number}
        onChange={(e) => set({ [campo]: Number(e.target.value) } as Partial<HipotesesDeArmadura>)}
        aria-label={`Bitola longitudinal — ${rotulo.toLowerCase()}`}
        className={SELECT}
      >
        {BITOLAS_LONGITUDINAIS_MM.map((b) => (
          <option key={b} value={b}>
            Ø {bit(b)} mm
          </option>
        ))}
      </select>
    </label>
  );
  const taxaInput = (rotulo: string, campo: keyof HipotesesDeArmadura) => (
    <label className="flex items-center gap-2">
      {rotulo}
      <input
        type="number"
        min={0}
        step={5}
        value={h[campo] as number}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= 0) set({ [campo]: v } as Partial<HipotesesDeArmadura>);
        }}
        aria-label={`Taxa de referência — ${rotulo.toLowerCase()}`}
        className={INPUT}
      />
      kg/m³
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <p className="font-semibold text-slate-700">Hipóteses da armadura</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>
            <strong>Esquema pelos mínimos da NBR 6118</strong>, peça a peça: pilar 0,4 % Ac e ≥ 4 barras, estribos a min(20 cm, menor
            lado, 12 Ø); viga ρmin {(0.15).toLocaleString('pt-BR')} % (sobe acima de fck 30), estribos pela taxa mínima e 0,6 d; laje malha
            inferior nas duas direções; bloco malha inferior + estribos; estaca 0,5 % Ac no trecho armado + espiral. Perda de{' '}
            {h.perdaPct} % sobre o esquema.
          </li>
          <li>
            <strong>Piso por taxa de referência</strong> (kg/m³ por família): quando o mínimo dá menos aço que a taxa, vale a taxa — a
            linha diz qual dos dois mandou. Taxa 0 desliga o piso.
          </li>
          <li>
            fck {h.fckMpa} MPa · CAA {h.caa} (cobrimento pela tabela 7.2) · estribos Ø {bit(h.bitolaEstriboMm)} ({tipoDeAco(h.bitolaEstriboMm)}); demais
            barras CA-50.
          </li>
          <li>
            <strong>Não dimensiona nem detalha</strong>: sem esforço, sem verificação, sem lista de barras. Negativos de laje e tirantes
            de bloco não estão no esquema — o piso da taxa cobre. A armadura definitiva é do responsável técnico.
          </li>
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2">
            fck
            <select value={h.fckMpa} onChange={(e) => set({ fckMpa: Number(e.target.value) })} aria-label="fck do concreto" className={SELECT}>
              {FCKS_MPA.map((f) => (
                <option key={f} value={f}>
                  {f} MPa
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            CAA
            <select value={h.caa} onChange={(e) => set({ caa: e.target.value as HipotesesDeArmadura['caa'] })} aria-label="Classe de agressividade ambiental" className={SELECT}>
              {CLASSES_DE_AGRESSIVIDADE.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Perda
            <select value={h.perdaPct} onChange={(e) => set({ perdaPct: Number(e.target.value) })} aria-label="Perda e emendas" className={SELECT}>
              {PERDAS_PCT.map((p) => (
                <option key={p} value={p}>
                  {p} %
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Estribo
            <select value={h.bitolaEstriboMm} onChange={(e) => set({ bitolaEstriboMm: Number(e.target.value) })} aria-label="Bitola do estribo" className={SELECT}>
              {BITOLAS_DE_ESTRIBO_MM.map((b) => (
                <option key={b} value={b}>
                  Ø {bit(b)} · {tipoDeAco(b)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Trecho armado da estaca
            <select
              value={h.trechoArmadoDaEstacaM == null ? 'TOTAL' : String(h.trechoArmadoDaEstacaM)}
              onChange={(e) => set({ trechoArmadoDaEstacaM: e.target.value === 'TOTAL' ? null : Number(e.target.value) })}
              aria-label="Trecho armado da estaca"
              className={SELECT}
            >
              {TRECHOS_ARMADOS_DA_ESTACA_M.map((v) => (
                <option key={v ?? 'TOTAL'} value={v == null ? 'TOTAL' : String(v)}>
                  {v == null ? 'todo o comprimento' : `${v} m`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {bitolaSelect('Pilar', 'bitolaPilarMm')}
          {bitolaSelect('Viga', 'bitolaVigaMm')}
          {bitolaSelect('Laje', 'bitolaLajeMm')}
          {bitolaSelect('Bloco', 'bitolaBlocoMm')}
          {bitolaSelect('Estaca', 'bitolaEstacaMm')}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {taxaInput('Pilar', 'taxaPilarKgM3')}
          {taxaInput('Viga', 'taxaVigaKgM3')}
          {taxaInput('Laje', 'taxaLajeKgM3')}
          {taxaInput('Bloco', 'taxaBlocoKgM3')}
          {taxaInput('Estaca', 'taxaEstacaKgM3')}
          <button
            type="button"
            onClick={() => onHipoteses(HIPOTESES_ARMADURA_PADRAO)}
            className="rounded-[6px] border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Voltar ao padrão
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {carregando
            ? 'Carregando as hipóteses do estudo…'
            : persistenciaIndisponivel
              ? 'Sem persistência (migration ausente): as hipóteses valem só nesta sessão.'
              : 'Gravadas no estudo — quem abrir esta planta vê o mesmo aço, e o orçamento usa estas hipóteses.'}
        </p>
      </div>

      {armadura.pecas.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma peça estrutural na planta — lance pilares, vigas, lajes ou fundações para ver o aço.</p>
      ) : (
        <>
          <table className="w-full table-fixed text-xs" aria-label="Aço por família">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1.5 pr-2 font-medium">Família</th>
                <th className="w-16 py-1.5 pr-2 text-right font-medium">Peças</th>
                <th className="w-24 py-1.5 pr-2 text-right font-medium">Concreto (m³)</th>
                <th className="w-24 py-1.5 pr-2 text-right font-medium">Aço (kg)</th>
                <th className="w-20 py-1.5 text-right font-medium">kg/m³</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {familias
                .filter((f) => pecasDe(f.chave).length > 0)
                .map((f) => (
                  <tr key={f.chave}>
                    <td className="py-1.5 pr-2 font-medium text-slate-700">{f.nome}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">{pecasDe(f.chave).length}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">{m3(volumeDe(f.chave))}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums font-medium text-slate-800">{kg(f.kg)}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600">{kg(f.taxa)}</td>
                  </tr>
                ))}
              <tr className="border-t border-slate-300">
                <td className="py-1.5 pr-2 font-semibold text-slate-800">Total</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">{armadura.pecas.length}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">{m3(armadura.pecas.reduce((a, p) => a + p.volumeConcretoM3, 0))}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums font-semibold text-slate-800">{kg(t.totalKg)}</td>
                <td className="py-1.5 text-right text-[11px] text-slate-500">
                  CA-50 {kg(t.ca50Kg)} · CA-60 {kg(t.ca60Kg)}
                </td>
              </tr>
            </tbody>
          </table>

          <table className="w-full table-fixed text-xs" aria-label="Aço por peça">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="w-24 py-1.5 pr-2 font-medium">Peça</th>
                <th className="py-1.5 pr-2 font-medium">Esquema (mínimos NBR 6118)</th>
                <th className="w-20 py-1.5 pr-2 text-right font-medium">Aço (kg)</th>
                <th className="w-24 py-1.5 text-right font-medium">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {armadura.pecas.map((p) => (
                <tr key={p.structuralId}>
                  <td className="py-1.5 pr-2 font-medium text-slate-700">
                    {onSelecionarPeca ? (
                      <button type="button" onClick={() => onSelecionarPeca(p.structuralId)} className="text-left text-blue-700 underline-offset-2 hover:underline">
                        {p.rotulo || nomeDoTipoEstrutural(p.kind)}
                      </button>
                    ) : (
                      p.rotulo || nomeDoTipoEstrutural(p.kind)
                    )}
                    <span className="block text-[11px] font-normal text-slate-400">{nomeDoTipoEstrutural(p.kind)}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-slate-600">
                    {p.descricao}
                    {p.avisos.length > 0 && <span className="block text-[11px] text-amber-800">{p.avisos.join(' · ')}</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-medium text-slate-800">
                    {kg(p.kg)}
                    <span className="block text-[11px] font-normal text-slate-400">{kg(p.taxaEfetivaKgM3)} kg/m³</span>
                  </td>
                  <td className="py-1.5 text-right text-[11px] text-slate-500">{p.origem === 'TAXA' ? 'taxa de referência' : 'esquema mínimo'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
