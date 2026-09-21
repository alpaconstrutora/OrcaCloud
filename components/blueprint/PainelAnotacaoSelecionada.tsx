/**
 * Painel da ANOTAÇÃO selecionada (19/09/2026, E8.1): texto (multilinha),
 * altura do texto (mm do modelo), traço, padrão de hachura, giro do texto,
 * cor; a cota angular mostra o ângulo derivado; vértices editáveis um a um.
 */
import React from 'react';
import {
  anguloDaCota,
  PADROES_DE_HACHURA,
  ROTULO_DO_TIPO_DE_ANOTACAO,
  TRACOS_DA_ANOTACAO,
  type Anotacao,
  type PadraoDeHachura,
  type TracoDaAnotacao,
} from '../../utils/blueprintKernel';
import IdentificadorDoElemento from './IdentificadorDoElemento';

interface Props {
  anotacao: Anotacao | null;
  onProps: (campos: { pontos?: { x: number; y: number }[]; texto?: string | null; alturaMm?: number; traco?: TracoDaAnotacao; hachura?: PadraoDeHachura | null; rotacaoGraus?: number; cor?: string | null; revisao?: { numero: number; data: string } }) => void;
  onExcluir: () => void;
}

const ROTULO_TRACO: Record<TracoDaAnotacao, string> = { CONTINUO: 'Contínuo', TRACEJADO: 'Tracejado', PONTILHADO: 'Pontilhado' };
const ROTULO_HACHURA: Record<PadraoDeHachura, string> = { DIAGONAL: 'Diagonal 45°', CRUZADA: 'Cruzada', PONTOS: 'Pontos', SOLIDA: 'Sólida (translúcida)' };
const nomeDaVista = (a: Anotacao) => (a.vista.tipo === 'PLANTA' ? 'planta' : a.vista.tipo === 'CORTE' ? 'corte' : `elevação ${a.vista.direcao.toLowerCase().replace('_', ' ')}`);

export default function PainelAnotacaoSelecionada({ anotacao: a, onProps, onExcluir }: Props) {
  if (!a) return null;
  const campo = 'rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800';
  const temTexto = a.tipo === 'TEXTO' || a.tipo === 'LEADER' || a.tipo === 'HACHURA' || a.tipo === 'NUVEM';
  const angulo = anguloDaCota(a);
  return (
    <div className="border-b border-slate-200 px-4 py-3" data-testid="painel-anotacao">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-700">{ROTULO_DO_TIPO_DE_ANOTACAO[a.tipo]}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            na {nomeDaVista(a)} · {a.pontos.length} ponto(s) · texto {a.alturaMm} mm
            {angulo != null && <> · <strong data-testid="angulo-da-cota">{angulo.toFixed(1).replace('.', ',')}°</strong> (derivado)</>}
          </p>
          <IdentificadorDoElemento uid={a.uid} familia="anotacao" />
        </div>
        <button type="button" onClick={onExcluir} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700">
          Excluir
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500">
        {a.tipo === 'NUVEM' && a.revisao && (
          <>
            <label className="flex flex-col gap-1">
              Revisão nº
              <input type="number" key={`${a.id}-rn`} defaultValue={a.revisao.numero} min={1} step={1} aria-label="Número da revisão da nuvem" onBlur={(e) => Number(e.target.value) >= 1 && onProps({ revisao: { numero: Math.round(Number(e.target.value)), data: a.revisao!.data } })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} data-testid="nuvem-revisao-numero" />
            </label>
            <label className="flex flex-col gap-1">
              Data da revisão
              <input type="date" key={`${a.id}-rd`} defaultValue={a.revisao.data} aria-label="Data da revisão da nuvem" onBlur={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && onProps({ revisao: { numero: a.revisao!.numero, data: e.target.value } })} className={campo} data-testid="nuvem-revisao-data" />
            </label>
          </>
        )}
        {temTexto && (
          <label className="col-span-2 flex flex-col gap-1">
            {a.tipo === 'NUVEM' ? 'Descrição da alteração (sai na tabela de revisões)' : `Texto${a.tipo === 'HACHURA' ? ' (rótulo, opcional)' : ''}`}
            <textarea key={`${a.id}-t`} defaultValue={a.texto ?? ''} rows={2} maxLength={500} aria-label="Texto da anotação" onBlur={(e) => onProps({ texto: e.target.value })} className={`${campo} resize-y`} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          Altura do texto (mm)
          <input type="number" key={`${a.id}-h`} defaultValue={a.alturaMm} min={50} step={50} aria-label="Altura do texto da anotação (mm)" onBlur={(e) => Number(e.target.value) > 0 && onProps({ alturaMm: Number(e.target.value) })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Traço
          <select value={a.traco} onChange={(e) => onProps({ traco: e.target.value as TracoDaAnotacao })} aria-label="Traço da anotação" className={campo}>
            {TRACOS_DA_ANOTACAO.map((t) => (
              <option key={t} value={t}>{ROTULO_TRACO[t]}</option>
            ))}
          </select>
        </label>
        {a.tipo === 'HACHURA' && (
          <label className="flex flex-col gap-1">
            Padrão
            <select value={a.hachura ?? 'DIAGONAL'} onChange={(e) => onProps({ hachura: e.target.value as PadraoDeHachura })} aria-label="Padrão da hachura" className={campo}>
              {PADROES_DE_HACHURA.map((h) => (
                <option key={h} value={h}>{ROTULO_HACHURA[h]}</option>
              ))}
            </select>
          </label>
        )}
        {a.tipo === 'TEXTO' && (
          <label className="flex flex-col gap-1">
            Giro (°)
            <select value={a.rotacaoGraus} onChange={(e) => onProps({ rotacaoGraus: Number(e.target.value) })} aria-label="Giro do texto" className={campo}>
              {[0, 90, 180, 270].map((g) => (
                <option key={g} value={g}>{g}°</option>
              ))}
              {![0, 90, 180, 270].includes(a.rotacaoGraus) && <option value={a.rotacaoGraus}>{a.rotacaoGraus}°</option>}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          Cor
          <span className="flex items-center gap-2">
            <input type="color" value={a.cor ?? '#b45309'} onChange={(e) => onProps({ cor: e.target.value })} aria-label="Cor da anotação" className="h-7 w-10 rounded border border-slate-300" />
            {a.cor && (
              <button type="button" onClick={() => onProps({ cor: null })} className="text-[11px] font-normal text-slate-500 underline-offset-2 hover:underline">padrão</button>
            )}
          </span>
        </label>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-[11px] font-medium text-slate-500">Vértices ({a.pontos.length})</summary>
        <ul className="mt-1 space-y-1">
          {a.pontos.map((p, i) => (
            <li key={`${a.id}-${i}`} className="flex items-center gap-1 text-[11px] text-slate-600">
              <span className="w-4 text-right text-slate-400">{i + 1}</span>
              <input type="number" defaultValue={p.x} step={10} aria-label={`X do vértice ${i + 1}`} onBlur={(e) => onProps({ pontos: a.pontos.map((q, k) => (k === i ? { x: Number(e.target.value), y: q.y } : q)) })} className={`${campo} w-24`} />
              <input type="number" defaultValue={p.y} step={10} aria-label={`Y do vértice ${i + 1}`} onBlur={(e) => onProps({ pontos: a.pontos.map((q, k) => (k === i ? { x: q.x, y: Number(e.target.value) } : q)) })} className={`${campo} w-24`} />
              <span className="text-slate-400">mm</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
