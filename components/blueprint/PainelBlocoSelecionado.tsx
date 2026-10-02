/**
 * O BLOCO DE MASSA selecionado (Estudo de Massa, M1): nome, uso, pavimentos,
 * piso a piso e cota da base — e o que o motor diz dele (projeção, construída,
 * computável, altura, pavimentos fora do envelope/acima do gabarito).
 * Molde: `PainelVagaSelecionada`.
 */
import React from 'react';
import type { Bloco, UsoDoBloco } from '../../utils/blueprintKernel';
import { MAX_PAVIMENTOS_DO_BLOCO, ROTULO_DO_USO_DO_BLOCO, USOS_DO_BLOCO } from '../../utils/blueprintKernel';
import type { MedidaDoBloco } from '../../utils/blueprintMassa';
import IdentificadorDoElemento from './IdentificadorDoElemento';

interface Props {
  bloco: Bloco | null;
  /** A medida do motor para este bloco; null quando ainda não calculada. */
  medida: MedidaDoBloco | null;
  onProps: (campos: { nome?: string; uso?: UsoDoBloco; pavimentos?: number; peDireitoMm?: number; cotaBaseMm?: number }) => void;
  onExcluir: () => void;
  onAbrirEstudo: () => void;
}

const n2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PainelBlocoSelecionado({ bloco, medida, onProps, onExcluir, onAbrirEstudo }: Props) {
  if (!bloco) return null;
  const campo = 'rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800';
  const foraDoEnvelope = medida?.pisos.filter((p) => p.cabe === false) ?? [];
  const acimaDoGabarito = medida?.pisos.filter((p) => p.acimaDoGabarito) ?? [];
  return (
    <div className="border-b border-slate-200 px-4 py-3" data-testid="painel-bloco">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-700">
            Bloco de massa · {bloco.nome}
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {ROTULO_DO_USO_DO_BLOCO[bloco.uso]} · {bloco.pavimentos} pav × {n2(bloco.peDireitoMm / 1000)} m
            {medida ? ` · ${n2(medida.projecaoM2)} m² de projeção · ${n2(medida.areaConstruidaM2)} m² construídos` : ''}
          </p>
          <IdentificadorDoElemento uid={bloco.uid} familia="bloco" />
        </div>
        <button type="button" onClick={onExcluir} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700">
          Excluir
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500">
        <label className="col-span-2 flex flex-col gap-1">
          Nome
          <input
            type="text"
            key={`${bloco.id}-nome-${bloco.nome}`}
            defaultValue={bloco.nome}
            maxLength={40}
            aria-label="Nome do bloco"
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== bloco.nome && onProps({ nome: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-1">
          Uso
          <select value={bloco.uso} onChange={(e) => onProps({ uso: e.target.value as UsoDoBloco })} aria-label="Uso do bloco" className={campo}>
            {USOS_DO_BLOCO.map((u) => (
              <option key={u} value={u}>{ROTULO_DO_USO_DO_BLOCO[u]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Pavimentos
          <input
            type="number"
            min={1}
            max={MAX_PAVIMENTOS_DO_BLOCO}
            step={1}
            key={`${bloco.id}-pav-${bloco.pavimentos}`}
            defaultValue={bloco.pavimentos}
            aria-label="Número de pavimentos do bloco"
            onBlur={(e) => {
              const v = Math.round(Number(e.target.value));
              if (v >= 1 && v <= MAX_PAVIMENTOS_DO_BLOCO && v !== bloco.pavimentos) onProps({ pavimentos: v });
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-1">
          Piso a piso (m)
          <input
            type="number"
            min={2}
            max={15}
            step={0.05}
            key={`${bloco.id}-pd-${bloco.peDireitoMm}`}
            defaultValue={bloco.peDireitoMm / 1000}
            aria-label="Piso a piso do bloco (m)"
            onBlur={(e) => {
              const mm = Math.round(Number(e.target.value) * 1000);
              if (mm >= 2000 && mm <= 15000 && mm !== bloco.peDireitoMm) onProps({ peDireitoMm: mm });
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-1" title="Relativa ao pavimento em que o bloco foi desenhado. Negativa = subsolo; a torre sobre um podium de 3 pavimentos de 3 m começa em 9.">
          Cota da base (m)
          <input
            type="number"
            step={0.05}
            key={`${bloco.id}-cota-${bloco.cotaBaseMm}`}
            defaultValue={bloco.cotaBaseMm / 1000}
            aria-label="Cota da base do bloco (m)"
            onBlur={(e) => {
              const mm = Math.round(Number(e.target.value) * 1000);
              if (Number.isFinite(mm) && mm !== bloco.cotaBaseMm) onProps({ cotaBaseMm: mm });
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={campo}
          />
        </label>
      </div>

      {medida && (
        <ul className="mt-2 space-y-0.5 text-[11px]" data-testid="conferencia-do-bloco">
          <li className="text-slate-600">
            Topo a {n2(medida.topoMm / 1000)} m · computável {n2(medida.areaComputavelM2)} m²
            {medida.apoiadoEm ? ' · apoiado em outro bloco (o gabarito conta os pavimentos de baixo)' : ''}
          </li>
          {foraDoEnvelope.length > 0 ? (
            <li className="text-red-700">
              Fora do envelope: {foraDoEnvelope.map((p) => `${p.indice}º`).join(', ')}
              {foraDoEnvelope.some((p) => p.subsolo) ? ' (no subsolo, confere-se só o lote)' : ''}
            </li>
          ) : medida.pisos.some((p) => p.cabe === null) ? (
            <li className="text-slate-500">Sem lote fechado: o envelope não pôde ser conferido.</li>
          ) : (
            <li className="text-emerald-700">Todos os pavimentos cabem no envelope.</li>
          )}
          {acimaDoGabarito.length > 0 && <li className="text-red-700">Acima do gabarito: {acimaDoGabarito.map((p) => p.motivoDoGabarito).filter(Boolean)[0]} ({acimaDoGabarito.length} pav.)</li>}
        </ul>
      )}
      <button type="button" onClick={onAbrirEstudo} className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800">
        Ver o estudo de massa
      </button>
    </div>
  );
}
