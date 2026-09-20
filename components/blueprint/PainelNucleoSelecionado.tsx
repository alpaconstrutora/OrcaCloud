/**
 * O NÚCLEO VERTICAL selecionado (19/09/2026, E2.4): shaft ou elevador —
 * tipo, rótulo, de/até que pavimento, e no elevador as medidas (poço, casa de
 * máquinas, capacidade) com a FICHA por capacidade para aplicar. Molde:
 * `PainelEixoSelecionado`. Apresentacional: o kernel decide.
 */
import React from 'react';
import type { BlueprintModel, DisciplinaDeRede, Nucleo, TipoDeNucleo } from '../../utils/blueprintKernel';
import { DISCIPLINAS, medirNucleo, nomeDoTipoDeNucleo, pavimentosDoNucleo } from '../../utils/blueprintKernel';
import { ROTULO_DA_DISCIPLINA } from '../../utils/blueprintRede';
import { FICHA_DO_ELEVADOR, caixaDoNucleo, fichaPorCapacidade } from '../../utils/blueprintNucleoVertical';
import IdentificadorDoElemento from './IdentificadorDoElemento';

interface Props {
  model: BlueprintModel;
  nucleo: Nucleo | null;
  onProps: (campos: { tipo?: TipoDeNucleo; ateLevelId?: string | null; rotulo?: string | null; disciplina?: DisciplinaDeRede | null; pocoMm?: number | null; casaDeMaquinasMm?: number | null; capacidade?: number | null }) => void;
  onExcluir: () => void;
}

const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');

export default function PainelNucleoSelecionado({ model, nucleo, onProps, onExcluir }: Props) {
  if (!nucleo) return null;
  const med = medirNucleo(model, nucleo);
  const pavimentos = pavimentosDoNucleo(model, nucleo);
  const partida = model.levels.find((l) => l.id === nucleo.levelId);
  const acima = model.levels.filter((l) => partida && l.elevationMm >= partida.elevationMm && l.id !== partida.id).sort((a, b) => a.elevationMm - b.elevationMm);
  const caixa = caixaDoNucleo(nucleo);
  const ficha = fichaPorCapacidade(nucleo.capacidade);
  const elevador = nucleo.tipo === 'ELEVADOR';
  const campo = 'rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800';

  return (
    <div className="border-b border-slate-200 px-4 py-3" data-testid="painel-nucleo">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-700">
            {nomeDoTipoDeNucleo(nucleo.tipo)}
            {nucleo.rotulo ? ` ${nucleo.rotulo}` : ''}
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {m(caixa.larguraMm)} × {m(caixa.profundidadeMm)} m · {(med.areaMm2 / 1_000_000).toFixed(2).replace('.', ',')} m² · {med.pavimentos} pavimento(s) · {m(med.alturaMm)} m
            {elevador && med.alturaTotalMm !== med.alturaMm ? ` (${m(med.alturaTotalMm)} m com poço e casa de máquinas)` : ''} · fura {med.lajesFuradas} laje(s)
          </p>
          <IdentificadorDoElemento uid={nucleo.uid} familia="nucleo" />
        </div>
        <button type="button" onClick={onExcluir} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700">
          Excluir
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500">
        <label className="flex flex-col gap-1">
          Tipo
          <select value={nucleo.tipo} onChange={(e) => onProps({ tipo: e.target.value as TipoDeNucleo })} aria-label="Tipo do núcleo vertical" className={campo}>
            <option value="SHAFT">Shaft</option>
            <option value="ELEVADOR">Elevador</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Rótulo
          <input
            type="text"
            key={`${nucleo.id}-rotulo`}
            defaultValue={nucleo.rotulo ?? ''}
            placeholder={elevador ? 'E1' : 'S1'}
            aria-label="Rótulo do núcleo vertical"
            onBlur={(e) => onProps({ rotulo: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-1">
          De
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-normal text-slate-700">{partida?.name ?? '?'}</span>
        </label>
        <label className="flex flex-col gap-1">
          Até
          <select value={nucleo.ateLevelId ?? ''} onChange={(e) => onProps({ ateLevelId: e.target.value || null })} aria-label="Pavimento de chegada do núcleo vertical" className={campo}>
            <option value="">O mais alto ({pavimentos[pavimentos.length - 1]?.name ?? '?'})</option>
            {acima.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        {!elevador && (
          <label className="flex flex-col gap-1">
            Disciplina
            {/* E11.1: o shaft MECÂNICO é a prumada de dutos/linhas frigorígenas; geral = água, esgoto e elétrica. */}
            <select value={nucleo.disciplina ?? ''} onChange={(e) => onProps({ disciplina: (e.target.value || null) as DisciplinaDeRede | null })} aria-label="Disciplina do shaft" className={campo}>
              <option value="">Geral</option>
              {DISCIPLINAS.map((d) => (
                <option key={d} value={d}>{ROTULO_DA_DISCIPLINA[d]}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {elevador && (
        <div className="mt-3 rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2" data-testid="ficha-do-elevador">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700">Medidas do elevador</p>
            <select
              value=""
              onChange={(e) => {
                const f = FICHA_DO_ELEVADOR.find((x) => x.capacidade === Number(e.target.value));
                if (f) onProps({ capacidade: f.capacidade, pocoMm: f.pocoMm, casaDeMaquinasMm: f.casaDeMaquinasMm });
              }}
              aria-label="Aplicar ficha do elevador por capacidade"
              className={campo}
            >
              <option value="">Aplicar ficha…</option>
              {FICHA_DO_ELEVADOR.map((f) => (
                <option key={f.capacidade} value={f.capacidade}>
                  {f.capacidade} pass. · {f.cargaKg} kg · caixa {m(f.caixaMm[0])} × {m(f.caixaMm[1])}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs font-semibold text-slate-500">
            <label className="flex flex-col gap-1">
              Passageiros
              <input type="number" min={1} key={`${nucleo.id}-cap-${nucleo.capacidade ?? ''}`} defaultValue={nucleo.capacidade ?? ''} aria-label="Capacidade do elevador (passageiros)" onBlur={(e) => onProps({ capacidade: e.target.value === '' ? null : Number(e.target.value) })} className={campo} />
            </label>
            <label className="flex flex-col gap-1">
              Poço (mm)
              <input type="number" step={50} key={`${nucleo.id}-poco-${nucleo.pocoMm ?? ''}`} defaultValue={nucleo.pocoMm ?? ''} aria-label="Profundidade do poço (mm)" onBlur={(e) => onProps({ pocoMm: e.target.value === '' ? null : Number(e.target.value) })} className={campo} />
            </label>
            <label className="flex flex-col gap-1">
              Casa de máq. (mm)
              <input type="number" step={50} key={`${nucleo.id}-cm-${nucleo.casaDeMaquinasMm ?? ''}`} defaultValue={nucleo.casaDeMaquinasMm ?? ''} aria-label="Altura da casa de máquinas (mm)" onBlur={(e) => onProps({ casaDeMaquinasMm: e.target.value === '' ? null : Number(e.target.value) })} className={campo} />
            </label>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {ficha
              ? `Ficha de ${ficha.capacidade} passageiros: cabina ${m(ficha.cabinaMm[0])} × ${m(ficha.cabinaMm[1])} m, caixa ${m(ficha.caixaMm[0])} × ${m(ficha.caixaMm[1])} m${caixa.larguraMm < ficha.caixaMm[0] || caixa.profundidadeMm < ficha.caixaMm[1] ? ' — a caixa desenhada é MENOR que a da ficha' : ''}.${ficha.observacao ? ` ${ficha.observacao}.` : ''}`
              : 'Ordem de grandeza de catálogo (NBR NM 207 / NBR 5665); confirmar com o fabricante.'}
          </p>
        </div>
      )}
    </div>
  );
}
