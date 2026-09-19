/**
 * Painel do GUARDA-CORPO / CORRIMÃO selecionado (19/09/2026, E7.3): tipo,
 * altura, material, item de catálogo, rótulo; comprimento e área derivados; a
 * conferência NBR 14718 / 9050 em aviso. "Aceitar" confirma o sugerido.
 */
import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  comprimentoDoGuardaCorpo,
  MATERIAIS_DE_GUARDA_CORPO,
  ROTULO_DO_MATERIAL_DE_GUARDA_CORPO,
  ROTULO_DO_TIPO_DE_GUARDA_CORPO,
  TIPOS_DE_GUARDA_CORPO,
  type GuardaCorpo,
  type MaterialDeGuardaCorpo,
  type TipoDeGuardaCorpo,
} from '../../utils/blueprintKernel';
import { conferirGuardaCorpo } from '../../utils/blueprintGuardaCorpo';
import DatabasePickerModal from '../DatabasePickerModal';
import IdentificadorDoElemento from './IdentificadorDoElemento';

interface Props {
  guardaCorpo: GuardaCorpo | null;
  onProps: (campos: { tipo?: TipoDeGuardaCorpo; alturaMm?: number; material?: MaterialDeGuardaCorpo; itemCode?: string; descricao?: string; rotulo?: string | null; sugerido?: boolean | null }) => void;
  onExcluir: () => void;
}

const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');

export default function PainelGuardaCorpoSelecionado({ guardaCorpo: g, onProps, onExcluir }: Props) {
  const [escolhendoItem, setEscolhendoItem] = useState(false);
  if (!g) return null;
  const campo = 'rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800';
  const compMm = comprimentoDoGuardaCorpo(g);
  const avisos = conferirGuardaCorpo(g);
  return (
    <div className="border-b border-slate-200 px-4 py-3" data-testid="painel-guarda-corpo">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-700">
            {g.rotulo || ROTULO_DO_TIPO_DE_GUARDA_CORPO[g.tipo]}
            {g.sugerido ? ' · sugerido' : ''}
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {ROTULO_DO_MATERIAL_DE_GUARDA_CORPO[g.material]} · {m(compMm)} m · h {m(g.alturaMm)} m · {((compMm * g.alturaMm) / 1e6).toFixed(2).replace('.', ',')} m² · {g.pontos.length - 1} trecho(s)
          </p>
          <IdentificadorDoElemento uid={g.uid} familia="guardaCorpo" />
        </div>
        <div className="flex items-center gap-1">
          {g.sugerido && (
            <button type="button" onClick={() => onProps({ sugerido: false })} className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700">
              Aceitar
            </button>
          )}
          <button type="button" onClick={onExcluir} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700">
            Excluir
          </button>
        </div>
      </div>
      {avisos.length > 0 && (
        <ul className="mt-2 space-y-0.5" data-testid="avisos-do-guarda-corpo">
          {avisos.map((a, i) => (
            <li key={i} className={`flex items-start gap-1 text-[11px] ${a.gravidade === 'ERRO' ? 'text-red-700' : 'text-amber-800'}`}>
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {a.norma}: {a.texto}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500">
        <label className="flex flex-col gap-1">
          Tipo
          <select value={g.tipo} onChange={(e) => onProps({ tipo: e.target.value as TipoDeGuardaCorpo })} aria-label="Tipo do guarda-corpo" className={campo}>
            {TIPOS_DE_GUARDA_CORPO.map((t) => (
              <option key={t} value={t}>{ROTULO_DO_TIPO_DE_GUARDA_CORPO[t]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Altura (mm)
          <input type="number" key={`${g.id}-h`} defaultValue={g.alturaMm} min={100} step={10} aria-label="Altura do guarda-corpo (mm)" onBlur={(e) => Number(e.target.value) > 0 && onProps({ alturaMm: Number(e.target.value) })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Material
          <select value={g.material} onChange={(e) => onProps({ material: e.target.value as MaterialDeGuardaCorpo })} aria-label="Material do guarda-corpo" className={campo}>
            {MATERIAIS_DE_GUARDA_CORPO.map((x) => (
              <option key={x} value={x}>{ROTULO_DO_MATERIAL_DE_GUARDA_CORPO[x]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Rótulo
          <input type="text" key={`${g.id}-r`} defaultValue={g.rotulo ?? ''} maxLength={40} placeholder={ROTULO_DO_TIPO_DE_GUARDA_CORPO[g.tipo]} aria-label="Rótulo do guarda-corpo" onBlur={(e) => onProps({ rotulo: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
        </label>
        <div className="col-span-2 flex flex-col gap-1">
          Item de catálogo
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setEscolhendoItem(true)} className={`rounded border px-2 py-1 text-xs font-normal ${g.itemCode ? 'border-slate-300 text-slate-700' : 'border-amber-300 bg-amber-50 text-amber-900'}`} aria-label="Item de catálogo do guarda-corpo" data-testid="item-do-guarda-corpo">
              {g.itemCode ? `${g.itemCode} · ${g.descricao || 'sem descrição'}` : 'Escolher material no catálogo (m ou m²)'}
            </button>
            {g.itemCode && (
              <button type="button" onClick={() => onProps({ itemCode: '', descricao: '' })} className="text-[11px] font-normal text-slate-400 hover:text-slate-600">limpar</button>
            )}
          </div>
          <p className="text-[10px] font-normal text-slate-400">Sem item, a peça entra pelo de-para (comprimento/área de guarda-corpo); com item, sai direto por material.</p>
        </div>
      </div>
      <DatabasePickerModal
        isOpen={escolhendoItem}
        onClose={() => setEscolhendoItem(false)}
        title="Item do guarda-corpo / corrimão"
        subtitle="SINAPI ou base própria. Item em m leva o comprimento; em m² leva comprimento × altura."
        onSelect={(item) => {
          onProps({ itemCode: item.code, descricao: item.description });
          setEscolhendoItem(false);
        }}
      />
    </div>
  );
}
