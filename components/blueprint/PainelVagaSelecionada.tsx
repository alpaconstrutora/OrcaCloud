/**
 * A VAGA selecionada (19/09/2026, E2.5): tipo (com as medidas do tipo), número,
 * medidas, giro, e "aceitar" quando é sugerida. Molde: `PainelNucleoSelecionado`.
 */
import React from 'react';
import type { TipoDeVaga, Vaga } from '../../utils/blueprintKernel';
import { ROTULO_DO_TIPO_DE_VAGA, TIPOS_DE_VAGA } from '../../utils/blueprintKernel';
import IdentificadorDoElemento from './IdentificadorDoElemento';

interface Props {
  vaga: Vaga | null;
  onProps: (campos: { tipo?: TipoDeVaga; numero?: string | null; larguraMm?: number; comprimentoMm?: number; rotacaoGraus?: number; sugerida?: boolean | null }) => void;
  onExcluir: () => void;
}

const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');

export default function PainelVagaSelecionada({ vaga, onProps, onExcluir }: Props) {
  if (!vaga) return null;
  const campo = 'rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800';
  return (
    <div className="border-b border-slate-200 px-4 py-3" data-testid="painel-vaga">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-700">
            Vaga {vaga.numero ? `${vaga.numero} · ` : ''}
            {ROTULO_DO_TIPO_DE_VAGA[vaga.tipo]}
            {vaga.sugerida ? ' · sugerida' : ''}
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {m(vaga.larguraMm)} × {m(vaga.comprimentoMm)} m · giro {vaga.rotacaoGraus}° · {((vaga.larguraMm * vaga.comprimentoMm) / 1_000_000).toFixed(2).replace('.', ',')} m²
          </p>
          <IdentificadorDoElemento uid={vaga.uid} familia="vaga" />
        </div>
        <div className="flex items-center gap-1">
          {vaga.sugerida && (
            <button type="button" onClick={() => onProps({ sugerida: false })} className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700">
              Aceitar
            </button>
          )}
          <button type="button" onClick={onExcluir} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700">
            Excluir
          </button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500">
        <label className="flex flex-col gap-1">
          Tipo
          <select value={vaga.tipo} onChange={(e) => onProps({ tipo: e.target.value as TipoDeVaga })} aria-label="Tipo da vaga" className={campo}>
            {TIPOS_DE_VAGA.map((t) => (
              <option key={t} value={t}>{ROTULO_DO_TIPO_DE_VAGA[t]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Número
          <input type="text" key={`${vaga.id}-n`} defaultValue={vaga.numero ?? ''} maxLength={12} aria-label="Número da vaga" onBlur={(e) => onProps({ numero: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Largura (mm)
          <input type="number" step={50} key={`${vaga.id}-l-${vaga.larguraMm}`} defaultValue={vaga.larguraMm} aria-label="Largura da vaga (mm)" onBlur={(e) => Number(e.target.value) > 0 && onProps({ larguraMm: Number(e.target.value) })} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Comprimento (mm)
          <input type="number" step={50} key={`${vaga.id}-c-${vaga.comprimentoMm}`} defaultValue={vaga.comprimentoMm} aria-label="Comprimento da vaga (mm)" onBlur={(e) => Number(e.target.value) > 0 && onProps({ comprimentoMm: Number(e.target.value) })} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Giro (°)
          <input type="number" step={15} key={`${vaga.id}-g-${vaga.rotacaoGraus}`} defaultValue={vaga.rotacaoGraus} aria-label="Giro da vaga (graus)" onBlur={(e) => onProps({ rotacaoGraus: Number(e.target.value) || 0 })} className={campo} />
        </label>
      </div>
    </div>
  );
}
