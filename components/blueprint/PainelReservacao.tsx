/**
 * A RESERVAÇÃO na gaveta de água (29/09/2026, E4.1): quem conta a população
 * (os ambientes pelo nome, ou a declarada), o consumo diário, o volume a
 * reservar e a comparação com a(s) caixa(s) do desenho — e as premissas, que
 * são do estudo.
 *
 * 14/10/2026: as premissas recolhidas abaixo do resultado; todas editáveis
 * (pessoas por dependência e a fração do inferior eram constantes escondidas);
 * campo numérico que só grava ao sair (apagar "Per capita" gravava 1 L/dia).
 */
import React from 'react';
import type { DimensionamentoDaReservacao, HipotesesDeReservatorio } from '../../utils/blueprintReservacao';
import BlocoDeHipoteses from './BlocoDeHipoteses';
import CampoNumericoDeHipotese from './CampoNumericoDeHipotese';

interface Props {
  r: DimensionamentoDaReservacao;
  hip: HipotesesDeReservatorio;
  onHip: (h: HipotesesDeReservatorio) => void;
}

const litros = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} L`;
const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export default function PainelReservacao({ r, hip, onHip }: Props) {
  const cor =
    r.situacao === 'ATENDE'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : r.situacao === 'INSUFICIENTE' || r.situacao === 'SEM_VOLUME'
        ? 'border-red-200 bg-red-50 text-red-800'
        : 'border-amber-200 bg-amber-50 text-amber-800';
  const fracaoPct = Math.round(hip.fracaoInferior * 100);
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
      <BlocoDeHipoteses
        id="reservacao"
        titulo="Hipóteses da reservação"
        resumo={[
          hip.populacaoDeclarada > 0 ? `${hip.populacaoDeclarada} pessoa(s) declaradas` : `${num(hip.pessoasPorDormitorio)} por dormitório`,
          `${num(hip.perCapitaLDia)} L/dia`,
          `${num(hip.diasDeReserva)} dia(s)`,
          `inferior ${fracaoPct} %`,
        ].join(' · ')}
        regras={
          <>
            <li data-testid="reservacao-regra-populacao">
              População: {num(hip.pessoasPorDormitorio)} por dormitório ou suíte e {num(hip.pessoasPorDependencia)} por dependência, pelo
              nome do ambiente; com a declarada acima de 0, vale ela.
            </li>
            <li>Reserva mínima da NBR 5626: o consumo de 24 h — vezes os dias de reserva.</li>
            <li>Com reservatório inferior, ele guarda {fracaoPct} % do volume e o superior o resto.</li>
          </>
        }
      >
        <label className="flex items-center gap-1.5">
          Pessoas por dormitório
          <CampoNumericoDeHipotese value={hip.pessoasPorDormitorio} onCommit={(v) => onHip({ ...hip, pessoasPorDormitorio: v })} min={1} max={10} step={1} casas={1} aria-label="Pessoas por dormitório" />
        </label>
        <label className="flex items-center gap-1.5">
          Por dependência
          <CampoNumericoDeHipotese value={hip.pessoasPorDependencia} onCommit={(v) => onHip({ ...hip, pessoasPorDependencia: v })} min={0} max={10} step={1} casas={1} aria-label="Pessoas por dependência" />
        </label>
        <label className="flex items-center gap-1.5">
          Per capita (L/dia)
          <CampoNumericoDeHipotese value={hip.perCapitaLDia} onCommit={(v) => onHip({ ...hip, perCapitaLDia: v })} min={50} max={1000} step={10} aria-label="Consumo per capita em litros por dia" />
        </label>
        <label className="flex items-center gap-1.5">
          Dias de reserva
          <CampoNumericoDeHipotese value={hip.diasDeReserva} onCommit={(v) => onHip({ ...hip, diasDeReserva: v })} min={1} max={5} step={0.5} casas={1} aria-label="Dias de reserva" />
        </label>
        <label className="flex items-center gap-1.5">
          População declarada
          <CampoNumericoDeHipotese value={hip.populacaoDeclarada} onCommit={(v) => onHip({ ...hip, populacaoDeclarada: v })} min={0} max={100000} step={1} aria-label="População declarada (0 = contar pelos dormitórios)" />
        </label>
        <label className="flex items-center gap-1.5">
          No inferior
          <CampoNumericoDeHipotese
            value={fracaoPct}
            onCommit={(v) => onHip({ ...hip, fracaoInferior: v / 100 })}
            min={0}
            max={100}
            step={5}
            aria-label="Fração do volume no reservatório inferior em por cento"
            title="Só vale com reservatório inferior no desenho: a parte do volume que fica embaixo (padrão do sistema: 60 % embaixo, 40 % em cima)"
          />
          %
        </label>
      </BlocoDeHipoteses>
    </div>
  );
}
