/**
 * A RESERVAÇÃO na gaveta de água (29/09/2026, E4.1): quem conta a população
 * (os ambientes pelo nome, ou a declarada), o consumo diário, o volume a
 * reservar e a comparação com a(s) caixa(s) do desenho — e as premissas, que
 * são do estudo.
 */
import React from 'react';
import type { DimensionamentoDaReservacao, HipotesesDeReservatorio } from '../../utils/blueprintReservacao';

interface Props {
  r: DimensionamentoDaReservacao;
  hip: HipotesesDeReservatorio;
  onHip: (h: HipotesesDeReservatorio) => void;
}

const litros = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} L`;
const campo = 'w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';

export default function PainelReservacao({ r, hip, onHip }: Props) {
  const cor =
    r.situacao === 'ATENDE'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : r.situacao === 'INSUFICIENTE' || r.situacao === 'SEM_VOLUME'
        ? 'border-red-200 bg-red-50 text-red-800'
        : 'border-amber-200 bg-amber-50 text-amber-800';
  const numero = (v: string, padrao: number, min: number) => {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? Math.max(min, n) : padrao;
  };
  return (
    <div className="space-y-2" data-testid="reservacao">
      <p className="text-xs font-semibold text-slate-700">Reservação</p>
      <p className={`rounded-md border px-3 py-1.5 text-xs ${cor}`} data-testid="reservacao-situacao">
        {r.texto}
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-600">
        <dt>População</dt>
        <dd className="tabular-nums">
          {r.populacao.pessoas} pessoa(s){r.populacao.declarada ? ' (declarada)' : r.populacao.ambientes.length ? ` — ${r.populacao.ambientes.map((a) => a.nome).join(', ')}` : ''}
        </dd>
        <dt>Consumo diário</dt>
        <dd className="tabular-nums">{litros(r.consumoDiarioL)}</dd>
        <dt>Volume a reservar</dt>
        <dd className="tabular-nums">
          {litros(r.volumeNecessarioL)}
          {r.volumeSugeridoL > 0 && ` (caixa de ${litros(r.volumeSugeridoL)})`}
        </dd>
        <dt>Volume no desenho</dt>
        <dd className="tabular-nums">{litros(r.declaradoL)}</dd>
      </dl>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
        <label className="flex items-center gap-1.5">
          Pessoas por dormitório
          <input type="number" min={1} step={1} value={hip.pessoasPorDormitorio} onChange={(e) => onHip({ ...hip, pessoasPorDormitorio: numero(e.target.value, 2, 1) })} aria-label="Pessoas por dormitório" className={campo} />
        </label>
        <label className="flex items-center gap-1.5">
          Per capita (L/dia)
          <input type="number" min={50} step={10} value={hip.perCapitaLDia} onChange={(e) => onHip({ ...hip, perCapitaLDia: numero(e.target.value, 200, 1) })} aria-label="Consumo per capita em litros por dia" className={campo} />
        </label>
        <label className="flex items-center gap-1.5">
          Dias de reserva
          <input type="number" min={1} step={0.5} value={hip.diasDeReserva} onChange={(e) => onHip({ ...hip, diasDeReserva: numero(e.target.value, 1, 1) })} aria-label="Dias de reserva" className={campo} />
        </label>
        <label className="flex items-center gap-1.5">
          População declarada
          <input type="number" min={0} step={1} value={hip.populacaoDeclarada} onChange={(e) => onHip({ ...hip, populacaoDeclarada: Math.round(numero(e.target.value, 0, 0)) })} aria-label="População declarada (0 = contar pelos dormitórios)" className={campo} />
        </label>
      </div>
      <p className="text-xs text-slate-500">
        População: 2 por dormitório ou suíte e 1 por dependência, pelo nome do ambiente; com a declarada acima de 0, vale ela. Reserva mínima da NBR 5626: o consumo de 24 h.
      </p>
    </div>
  );
}
