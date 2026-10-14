/**
 * TRATAMENTO INDIVIDUAL na gaveta de esgoto (29/09/2026, E7 do roadmap
 * hidrossanitário, NBR 7229/13969): onde não há rede pública — o
 * dimensionamento (tanque, filtro, sumidouro) pelas premissas do estudo, as
 * unidades que o lançamento põe em fila a partir da caixa de inspeção e a
 * conferência das que já estão no desenho.
 *
 * 14/10/2026: o resultado vem antes das premissas, que ficam recolhidas (como
 * nas outras gavetas); campo numérico que só grava ao sair — apagar a
 * infiltração gravava 1 L/m²·dia (sumidouro gigante), o mês mais frio 0 °C e o
 * diâmetro do sumidouro 800 mm.
 *
 * 14/10/2026 (destino do esgoto): só aparece com o destino "tratamento
 * individual", e sem botão próprio — o "Lançar" do rodapé passou a lançar o
 * tratamento (caixa → tanque → filtro → sumidouro, num lote).
 */
import React from 'react';
import { FICHA_DO_PONTO_HIDRAULICO } from '../../utils/blueprintHidraulica';
import {
  PADROES_DE_RESIDENCIA,
  type DimensionamentoDoTratamento,
  type HipotesesDeTratamento,
  type PadraoDeResidencia,
  type PlanoDeTratamento,
  type UnidadeVerificada,
} from '../../utils/blueprintTratamento';
import BlocoDeHipoteses from './BlocoDeHipoteses';
import CampoNumericoDeHipotese from './CampoNumericoDeHipotese';

interface Props {
  plano: PlanoDeTratamento;
  dim: DimensionamentoDoTratamento;
  unidades: readonly UnidadeVerificada[];
  hip: HipotesesDeTratamento;
  onHip: (h: HipotesesDeTratamento) => void;
  onSelecionar: (ids: string[]) => void;
}

const m = (mm: number) => (mm / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n = (v: number, casas = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const ROTULO_DO_PADRAO: Record<PadraoDeResidencia, string> = { ALTO: 'Alto (160 L/dia)', MEDIO: 'Médio (130 L/dia)', BAIXO: 'Baixo (100 L/dia)' };

export default function PainelTratamento({ plano, dim, unidades, hip, onHip, onSelecionar }: Props) {
  return (
    <div className="space-y-2" data-testid="tratamento">
      <p className="text-xs font-semibold text-slate-700">Tratamento individual (sem rede pública)</p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-600" data-testid="tratamento-dimensionamento">
        <dt>População · contribuição</dt>
        <dd className="tabular-nums">{dim.pessoas} pessoa(s) · {n(dim.contribuicaoDiariaL)} L/dia</dd>
        <dt>Tanque séptico</dt>
        <dd className="tabular-nums">
          V = 1000 + N(C·T + K·Lf) = {n(dim.tanque.volumeL)} L → {m(dim.tanque.comprimentoMm)} × {m(dim.tanque.larguraMm)} m, h útil {m(dim.tanque.profundidadeUtilMm)} m
        </dd>
        <dt>Filtro anaeróbio</dt>
        <dd className="tabular-nums">Vu = 1,6·N·C·T = {n(dim.filtro.volumeUtilL)} L → ø {m(dim.filtro.diametroMm)} m, leito {m(dim.filtro.leitoMm)} m</dd>
        <dt>Sumidouro</dt>
        <dd className="tabular-nums">A = N·C/Ci = {n(dim.sumidouro.areaM2, 2)} m² → ø {m(dim.sumidouro.diametroMm)} m, h útil {m(dim.sumidouro.alturaUtilMm)} m</dd>
      </dl>
      {dim.avisos.map((a) => (
        <p key={a} className="text-xs text-amber-700">{a}</p>
      ))}

      {plano.motivo ? (
        <p className="text-xs text-slate-500" data-testid="tratamento-motivo">{plano.motivo}</p>
      ) : (
        <ul className="space-y-0.5 text-xs text-slate-600" data-testid="tratamento-unidades">
          {plano.unidades.map((u) => (
            <li key={u.tipo}>
              <span className="font-medium text-slate-700">{FICHA_DO_PONTO_HIDRAULICO[u.tipo].rotulo}</span>{' '}
              <span className="tabular-nums">
                {u.tipo === 'TANQUE_SEPTICO' ? `${m(u.medidas.comprimentoMm)} × ${m(u.medidas.larguraMm)} m` : `ø ${m(u.medidas.larguraMm)} m`}, altura {m(u.medidas.alturaMm)} m · tubo a {m(u.cotaMm)} m
              </span>
            </li>
          ))}
        </ul>
      )}
      {unidades.length > 0 && (
        <ul className="space-y-0.5 text-xs" data-testid="tratamento-verificacao">
          {unidades.map((u) => (
            <li key={u.terminalId} className={u.atende ? 'text-slate-600' : 'text-red-700'}>
              <button type="button" onClick={() => onSelecionar([u.terminalId])} className="text-left hover:underline">
                {FICHA_DO_PONTO_HIDRAULICO[u.tipo].rotulo}: tem {n(u.tem, u.unidade === 'L' ? 0 : 2)} {u.unidade}, precisa {n(u.precisa, u.unidade === 'L' ? 0 : 2)} {u.unidade}
                {u.atende ? '' : ' — insuficiente'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <BlocoDeHipoteses
        id="tratamento"
        titulo="Hipóteses do tratamento"
        resumo={[
          `padrão ${ROTULO_DO_PADRAO[hip.padrao].split(' ')[0].toLowerCase()}`,
          hip.comFiltro ? 'com filtro' : 'sem filtro',
          `${n(hip.temperaturaC)} °C`,
          `infiltração ${n(hip.taxaDeInfiltracaoLM2Dia)} L/m²·dia`,
        ].join(' · ')}
        regras={
          <li>
            Tabelas da NBR 7229 (C, Lf, T, K, profundidade útil) e da NBR 13969 (detenção do filtro) — confira na norma antes de emitir. A
            taxa de infiltração vem do ensaio do solo (NBR 13969, Anexo A).
          </li>
        }
      >
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={hip.comFiltro} onChange={(e) => onHip({ ...hip, comFiltro: e.target.checked })} aria-label="Com filtro anaeróbio entre o tanque e o sumidouro" />
          Filtro anaeróbio (NBR 13969)
        </label>
        <label className="flex items-center gap-1.5">
          Padrão
          <select value={hip.padrao} onChange={(e) => onHip({ ...hip, padrao: e.target.value as PadraoDeResidencia })} aria-label="Padrão da residência" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
            {PADROES_DE_RESIDENCIA.map((p) => (
              <option key={p} value={p}>{ROTULO_DO_PADRAO[p]}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          Mês mais frio
          <CampoNumericoDeHipotese value={hip.temperaturaC} onCommit={(v) => onHip({ ...hip, temperaturaC: v })} min={-10} max={40} step={1} aria-label="Temperatura média do mês mais frio em graus" />
          °C
        </label>
        <label className="flex items-center gap-1.5">
          Limpeza a cada
          <CampoNumericoDeHipotese value={hip.intervaloDeLimpezaAnos} onCommit={(v) => onHip({ ...hip, intervaloDeLimpezaAnos: v })} min={1} max={5} step={1} aria-label="Intervalo entre limpezas do tanque em anos" />
          ano(s)
        </label>
        <label className="flex items-center gap-1.5">
          Infiltração
          <CampoNumericoDeHipotese value={hip.taxaDeInfiltracaoLM2Dia} onCommit={(v) => onHip({ ...hip, taxaDeInfiltracaoLM2Dia: v })} min={1} max={500} step={5} aria-label="Taxa de infiltração do solo em litros por metro quadrado por dia" />
          L/m²·dia
        </label>
        <label className="flex items-center gap-1.5">
          ø sumidouro
          <CampoNumericoDeHipotese value={hip.diametroDoSumidouroMm} onCommit={(v) => onHip({ ...hip, diametroDoSumidouroMm: v })} min={800} max={5000} step={100} aria-label="Diâmetro do sumidouro em milímetros" />
          mm
        </label>
      </BlocoDeHipoteses>
    </div>
  );
}
