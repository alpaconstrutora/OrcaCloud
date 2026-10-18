/**
 * Painel do MURO selecionado (18/10/2026, kernel 0.104.0 — F26 da casa automática): tipo, altura, espessura, mureta,
 * rótulo; comprimento e faces derivados; os PORTÕES (tipo, posição ao longo do muro, largura) com acrescentar e tirar.
 */
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  ALTURA_PADRAO_DA_MURETA_MM,
  LARGURA_PADRAO_DO_PORTAO_MM,
  ROTULO_DO_TIPO_DE_MURO,
  ROTULO_DO_TIPO_DE_PORTAO,
  TIPOS_DE_MURO,
  TIPOS_DE_PORTAO,
  areasDoMuro,
  comprimentoDoMuro,
  type BlueprintModel,
  type Muro,
  type PortaoDoMuro,
  type TipoDeMuro,
  type TipoDePortao,
} from '../../utils/blueprintKernel';
import { cmParaMm, mmParaCm } from '../../utils/blueprintMedidaCm';
import IdentificadorDoElemento from './IdentificadorDoElemento';

interface Props {
  model: BlueprintModel;
  muro: Muro | null;
  onProps: (campos: { tipo?: TipoDeMuro; alturaMm?: number; espessuraMm?: number; alturaDaMuretaMm?: number; portoes?: PortaoDoMuro[]; rotulo?: string | null }) => void;
  onExcluir: () => void;
}

const m2 = (v: number) => v.toFixed(2).replace('.', ',');
const metros = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');

/** O primeiro vão livre do percurso onde cabe um portão desta largura (a 30 cm das pontas e dos outros), ou null. */
export function lugarParaPortao(muro: Pick<Muro, 'pontos' | 'portoes'>, larguraMm: number): number | null {
  const L = Math.floor(comprimentoDoMuro(muro));
  const folga = 300;
  let inicio = folga;
  for (const g of muro.portoes) {
    if (g.offsetMm - folga - inicio >= larguraMm) return inicio;
    inicio = g.offsetMm + g.larguraMm + folga;
  }
  return L - folga - inicio >= larguraMm ? inicio : null;
}

export default function PainelMuroSelecionado({ model, muro: mu, onProps, onExcluir }: Props) {
  if (!mu) return null;
  const campo = 'rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800';
  const L = comprimentoDoMuro(mu);
  const a = areasDoMuro(model, mu);
  const noTerreno = !!mu.cotasDaBaseMm;
  const trocarPortao = (i: number, campos: Partial<PortaoDoMuro>) => onProps({ portoes: mu.portoes.map((g, k) => (k === i ? { ...g, ...campos } : g)) });
  const novoTipo: TipoDePortao = mu.portoes.some((g) => g.tipo === 'PEDESTRE') ? 'GARAGEM' : 'PEDESTRE';
  const lugar = lugarParaPortao(mu, LARGURA_PADRAO_DO_PORTAO_MM[novoTipo]);
  const semLugar = lugar === null ? `Não cabe outro ${ROTULO_DO_TIPO_DE_PORTAO[novoTipo].toLowerCase()} de ${metros(LARGURA_PADRAO_DO_PORTAO_MM[novoTipo])} m neste muro (a 30 cm das pontas e dos outros portões).` : undefined;
  return (
    <div className="border-b border-slate-200 px-4 py-3" data-testid="painel-muro">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-700">{mu.rotulo || ROTULO_DO_TIPO_DE_MURO[mu.tipo]}</h3>
          <p className="mt-0.5 text-[11px] text-slate-600">
            {metros(L)} m · h {metros(mu.alturaMm)} m
            {a.alvenariaM2 > 0 ? ` · alvenaria ${m2(a.alvenariaM2)} m²` : ''}
            {a.gradeM2 > 0 ? ` · grade ${m2(a.gradeM2)} m²` : ''} · {mu.portoes.length} portão(ões) · base {noTerreno ? 'no terreno' : 'no piso do pavimento'}
          </p>
          <IdentificadorDoElemento uid={mu.uid} familia="muro" />
        </div>
        <button type="button" onClick={onExcluir} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700">
          Excluir
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500">
        <label className="flex flex-col gap-1">
          Tipo
          <select value={mu.tipo} onChange={(e) => onProps({ tipo: e.target.value as TipoDeMuro })} aria-label="Tipo do muro" className={campo}>
            {TIPOS_DE_MURO.map((t) => (
              <option key={t} value={t}>{ROTULO_DO_TIPO_DE_MURO[t]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Altura (cm)
          <input type="number" key={`${mu.id}-h-${mu.alturaMm}`} defaultValue={mmParaCm(mu.alturaMm)} min={10} step={1} aria-label="Altura do muro (cm)" onBlur={(e) => Number(e.target.value) > 0 && onProps({ alturaMm: cmParaMm(Number(e.target.value)) })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Espessura (cm)
          <input type="number" key={`${mu.id}-e-${mu.espessuraMm}`} defaultValue={mmParaCm(mu.espessuraMm)} min={1} step={1} aria-label="Espessura do muro (cm)" onBlur={(e) => Number(e.target.value) > 0 && onProps({ espessuraMm: cmParaMm(Number(e.target.value)) })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
        </label>
        {mu.tipo === 'MURETA_COM_GRADE' ? (
          <label className="flex flex-col gap-1">
            Mureta (cm)
            <input type="number" key={`${mu.id}-m-${mu.alturaDaMuretaMm}`} defaultValue={mmParaCm(mu.alturaDaMuretaMm ?? ALTURA_PADRAO_DA_MURETA_MM)} min={1} step={1} aria-label="Altura da mureta (cm)" onBlur={(e) => Number(e.target.value) > 0 && onProps({ alturaDaMuretaMm: cmParaMm(Number(e.target.value)) })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            Rótulo
            <input type="text" key={`${mu.id}-r`} defaultValue={mu.rotulo ?? ''} maxLength={40} placeholder={ROTULO_DO_TIPO_DE_MURO[mu.tipo]} aria-label="Rótulo do muro" onBlur={(e) => onProps({ rotulo: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
          </label>
        )}
        {mu.tipo === 'MURETA_COM_GRADE' && (
          <label className="col-span-2 flex flex-col gap-1">
            Rótulo
            <input type="text" key={`${mu.id}-r2`} defaultValue={mu.rotulo ?? ''} maxLength={40} placeholder={ROTULO_DO_TIPO_DE_MURO[mu.tipo]} aria-label="Rótulo do muro" onBlur={(e) => onProps({ rotulo: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
          </label>
        )}
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-slate-700">Portões</h4>
          <button
            type="button"
            disabled={lugar === null}
            title={semLugar ?? `Acrescentar um ${ROTULO_DO_TIPO_DE_PORTAO[novoTipo].toLowerCase()} de ${metros(LARGURA_PADRAO_DO_PORTAO_MM[novoTipo])} m`}
            onClick={() => lugar !== null && onProps({ portoes: [...mu.portoes, { tipo: novoTipo, offsetMm: lugar, larguraMm: LARGURA_PADRAO_DO_PORTAO_MM[novoTipo] }] })}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-3 w-3" /> Portão
          </button>
        </div>
        {semLugar && <p className="mt-1 text-[11px] text-slate-600">{semLugar}</p>}
        {mu.portoes.length === 0 ? (
          <p className="mt-1 text-[11px] text-slate-600">Sem portão — o muro é fechado de ponta a ponta.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {mu.portoes.map((g, i) => (
              <li key={`${i}-${g.offsetMm}`} className="grid grid-cols-[1fr_5rem_5rem_auto] items-center gap-1 text-xs">
                <select value={g.tipo} onChange={(e) => trocarPortao(i, { tipo: e.target.value as TipoDePortao })} aria-label={`Tipo do portão ${i + 1}`} className={campo}>
                  {TIPOS_DE_PORTAO.map((t) => (
                    <option key={t} value={t}>{ROTULO_DO_TIPO_DE_PORTAO[t]}</option>
                  ))}
                </select>
                <input type="number" key={`${mu.id}-p${i}-o-${g.offsetMm}`} defaultValue={(g.offsetMm / 1000).toFixed(2)} min={0} step={0.05} title="Distância do início do muro ao portão (m)" aria-label={`Posição do portão ${i + 1} (m)`} onBlur={(e) => Number(e.target.value) >= 0 && trocarPortao(i, { offsetMm: Math.round(Number(e.target.value) * 1000) })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
                <input type="number" key={`${mu.id}-p${i}-l-${g.larguraMm}`} defaultValue={(g.larguraMm / 1000).toFixed(2)} min={0.5} step={0.05} title="Largura do vão (m)" aria-label={`Largura do portão ${i + 1} (m)`} onBlur={(e) => Number(e.target.value) > 0 && trocarPortao(i, { larguraMm: Math.round(Number(e.target.value) * 1000) })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
                <button type="button" onClick={() => onProps({ portoes: mu.portoes.filter((_, k) => k !== i) })} aria-label={`Tirar o portão ${i + 1}`} title="Tirar o portão" className="rounded-md p-1 text-slate-500 hover:bg-red-50 hover:text-red-700">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[10px] font-normal text-slate-500">Posição e largura em metros, ao longo do muro a partir do primeiro vértice.</p>
      </div>
    </div>
  );
}
