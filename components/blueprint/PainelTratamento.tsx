/**
 * TRATAMENTO INDIVIDUAL na gaveta de esgoto (29/09/2026, E7 do roadmap
 * hidrossanitário, NBR 7229/13969): onde não há rede pública — o
 * dimensionamento (tanque, filtro, sumidouro) pelas premissas do estudo, as
 * unidades que o lançamento põe em fila a partir da caixa de inspeção e a
 * conferência das que já estão no desenho.
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

interface Props {
  plano: PlanoDeTratamento;
  dim: DimensionamentoDoTratamento;
  unidades: readonly UnidadeVerificada[];
  hip: HipotesesDeTratamento;
  onHip: (h: HipotesesDeTratamento) => void;
  onLancar: () => void;
  onSelecionar: (ids: string[]) => void;
}

const m = (mm: number) => (mm / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n = (v: number, casas = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const campo = 'w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';
const ROTULO_DO_PADRAO: Record<PadraoDeResidencia, string> = { ALTO: 'Alto (160 L/dia)', MEDIO: 'Médio (130 L/dia)', BAIXO: 'Baixo (100 L/dia)' };

export default function PainelTratamento({ plano, dim, unidades, hip, onHip, onLancar, onSelecionar }: Props) {
  const podeLancar = plano.comandos.length > 0;
  const numero = (v: string, min: number, padrao: number) => {
    const x = Number(v.replace(',', '.'));
    return Number.isFinite(x) ? Math.max(min, x) : padrao;
  };
  return (
    <div className="space-y-2" data-testid="tratamento">
      <p className="text-xs font-semibold text-slate-700">Tratamento individual (sem rede pública)</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
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
          Mês mais frio (°C)
          <input type="number" step={1} value={hip.temperaturaC} onChange={(e) => onHip({ ...hip, temperaturaC: numero(e.target.value, -10, 18) })} aria-label="Temperatura média do mês mais frio em graus" className={campo} />
        </label>
        <label className="flex items-center gap-1.5">
          Limpeza (anos)
          <input type="number" min={1} max={5} step={1} value={hip.intervaloDeLimpezaAnos} onChange={(e) => onHip({ ...hip, intervaloDeLimpezaAnos: Math.min(5, Math.round(numero(e.target.value, 1, 1))) })} aria-label="Intervalo entre limpezas do tanque em anos" className={campo} />
        </label>
        <label className="flex items-center gap-1.5">
          Infiltração (L/m²·dia)
          <input type="number" min={1} step={5} value={hip.taxaDeInfiltracaoLM2Dia} onChange={(e) => onHip({ ...hip, taxaDeInfiltracaoLM2Dia: numero(e.target.value, 1, 50) })} aria-label="Taxa de infiltração do solo em litros por metro quadrado por dia" className={campo} />
        </label>
        <label className="flex items-center gap-1.5">
          ø sumidouro (mm)
          <input type="number" min={800} step={100} value={hip.diametroDoSumidouroMm} onChange={(e) => onHip({ ...hip, diametroDoSumidouroMm: numero(e.target.value, 800, 1500) })} aria-label="Diâmetro do sumidouro em milímetros" className={campo} />
        </label>
      </div>

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
      <button
        type="button"
        onClick={onLancar}
        disabled={!podeLancar}
        title={podeLancar ? undefined : (plano.motivo ?? 'Nada a lançar')}
        className="rounded-[6px] border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        data-testid="tratamento-lancar"
      >
        {plano.apagados > 0 ? 'Relançar tratamento' : 'Lançar tratamento'}
      </button>

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
      <p className="text-xs text-slate-500">
        Tabelas da NBR 7229 (C, Lf, T, K, profundidade útil) e da NBR 13969 (detenção do filtro) — confira na norma antes de emitir. A taxa de
        infiltração vem do ensaio do solo (NBR 13969, Anexo A).
      </p>
    </div>
  );
}
