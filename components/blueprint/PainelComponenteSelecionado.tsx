/**
 * O COMPONENTE selecionado (19/09/2026, E7.1): tipo do catálogo (com as
 * medidas do tipo), família, rótulo, medidas, giro, "aceitar" quando é
 * sugerido (mobiliário automático da E6.3), o ponto hidráulico ligado (louças)
 * e o tipo de elemento (E1.1 — custo, fabricante, código). Molde:
 * `PainelVagaSelecionada`.
 */
import React from 'react';
import type { Componente, FamiliaDeComponente, Terminal, TipoDeComponente } from '../../utils/blueprintKernel';
import { CATALOGO_DE_COMPONENTES, FAMILIAS_DE_COMPONENTE, ROTULO_DA_FAMILIA_DE_COMPONENTE, TIPOS_DE_COMPONENTE } from '../../utils/blueprintKernel';
import { ROTULO_DO_PONTO_HIDRAULICO } from '../../utils/blueprintHidraulica';
import IdentificadorDoElemento from './IdentificadorDoElemento';

interface Props {
  componente: Componente | null;
  /** O terminal hidráulico do mesmo lugar, quando a louça o pede e ele existe. */
  pontoLigado: Terminal | null;
  onProps: (campos: { tipoId?: TipoDeComponente; familia?: FamiliaDeComponente; rotulo?: string | null; larguraMm?: number; profundidadeMm?: number; alturaMm?: number; rotacaoGraus?: number; sugerido?: boolean | null }) => void;
  onExcluir: () => void;
  onSelecionarPonto?: (terminalId: string) => void;
  /** Slot para o SeletorDeTipo (E1.1) — o editor o monta com a família COMPONENTE. */
  seletorDeTipo?: React.ReactNode;
}

const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');

export default function PainelComponenteSelecionado({ componente: c, pontoLigado, onProps, onExcluir, onSelecionarPonto, seletorDeTipo }: Props) {
  if (!c) return null;
  const ficha = CATALOGO_DE_COMPONENTES[c.tipoId];
  const campo = 'rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800';
  return (
    <div className="border-b border-slate-200 px-4 py-3" data-testid="painel-componente">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-700">
            {c.rotulo || ficha.rotulo}
            {c.sugerido ? ' · sugerido' : ''}
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {ROTULO_DA_FAMILIA_DE_COMPONENTE[c.familia]} · {m(c.larguraMm)} × {m(c.profundidadeMm)} × {m(c.alturaMm)} m · giro {c.rotacaoGraus}°
          </p>
          <IdentificadorDoElemento uid={c.uid} familia="componente" />
        </div>
        <div className="flex items-center gap-1">
          {c.sugerido && (
            <button type="button" onClick={() => onProps({ sugerido: false })} className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700">
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
          <select value={c.tipoId} onChange={(e) => onProps({ tipoId: e.target.value as TipoDeComponente })} aria-label="Tipo do componente" className={campo}>
            {TIPOS_DE_COMPONENTE.map((t) => (
              <option key={t} value={t}>{CATALOGO_DE_COMPONENTES[t].rotulo}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Família
          <select value={c.familia} onChange={(e) => onProps({ familia: e.target.value as FamiliaDeComponente })} aria-label="Família do componente" className={campo}>
            {FAMILIAS_DE_COMPONENTE.map((f) => (
              <option key={f} value={f}>{ROTULO_DA_FAMILIA_DE_COMPONENTE[f]}</option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          Rótulo
          <input type="text" key={`${c.id}-r`} defaultValue={c.rotulo ?? ''} maxLength={40} placeholder={ficha.rotulo} aria-label="Rótulo do componente" onBlur={(e) => onProps({ rotulo: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Largura (mm)
          <input type="number" key={`${c.id}-l`} defaultValue={c.larguraMm} min={50} step={50} aria-label="Largura do componente (mm)" onBlur={(e) => Number(e.target.value) > 0 && onProps({ larguraMm: Number(e.target.value) })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Profundidade (mm)
          <input type="number" key={`${c.id}-p`} defaultValue={c.profundidadeMm} min={50} step={50} aria-label="Profundidade do componente (mm)" onBlur={(e) => Number(e.target.value) > 0 && onProps({ profundidadeMm: Number(e.target.value) })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Altura (mm)
          <input type="number" key={`${c.id}-a`} defaultValue={c.alturaMm} min={50} step={50} aria-label="Altura do componente (mm)" onBlur={(e) => Number(e.target.value) > 0 && onProps({ alturaMm: Number(e.target.value) })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Giro (°)
          <select value={c.rotacaoGraus} onChange={(e) => onProps({ rotacaoGraus: Number(e.target.value) })} aria-label="Giro do componente" className={campo}>
            {[0, 90, 180, 270].map((g) => (
              <option key={g} value={g}>{g}°</option>
            ))}
            {![0, 90, 180, 270].includes(c.rotacaoGraus) && <option value={c.rotacaoGraus}>{c.rotacaoGraus}°</option>}
          </select>
        </label>
      </div>
      {ficha.ligaAoPonto && (
        <p className="mt-2 text-[11px] text-slate-600" data-testid="ponto-ligado">
          Ponto hidráulico ({ROTULO_DO_PONTO_HIDRAULICO[ficha.ligaAoPonto]}):{' '}
          {pontoLigado ? (
            <button type="button" onClick={() => onSelecionarPonto?.(pontoLigado.id)} className="font-medium text-blue-700 hover:underline">
              ligado — a {Math.round(Math.hypot(pontoLigado.at.x - c.at.x, pontoLigado.at.y - c.at.y))} mm
            </button>
          ) : (
            <span className="text-amber-800">nenhum a até 0,60 m — lance o ponto (Hidráulica) ou aproxime a peça</span>
          )}
        </p>
      )}
      {seletorDeTipo && <div className="mt-2">{seletorDeTipo}</div>}
    </div>
  );
}
