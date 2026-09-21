/**
 * TRECHO DE RODAPÉ selecionado (21/09/2026, backlog P2 — P2.21): altura, item
 * do catálogo (biblioteca E7.4 quando houver), descrição, comprimento e área;
 * aceitar o sugerido; excluir. Molde do painel do guarda-corpo.
 */
import React from 'react';
import { MAX_ALTURA_DE_RODAPE_MM, type TrechoDeRodape } from '../../utils/blueprintKernel';
import { comprimentoDoRodape } from '../../utils/blueprintRodape';
import IdentificadorDoElemento from './IdentificadorDoElemento';
import type { Material } from '../../utils/blueprintMateriais';

interface Props {
  rodape: TrechoDeRodape | null;
  onProps: (campos: { alturaMm?: number; itemCode?: string; descricao?: string; sugerido?: boolean | null }) => void;
  onExcluir: () => void;
  materiais?: readonly Material[];
}

const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');

export default function PainelRodapeSelecionado({ rodape: r, onProps, onExcluir, materiais = [] }: Props) {
  if (!r) return null;
  const compMm = comprimentoDoRodape(r);
  const campo = 'rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800';
  // Rodapé é metro linear; acabamentos em m² (porcelanato, cerâmica) também servem. Bloco/concreto/isolamento, não.
  const lineares = materiais.filter((x) => x.unidade === 'm' || (x.unidade === 'm²' && x.funcao === 'ACABAMENTO'));
  return (
    <div className="border-b border-slate-200 px-4 py-3" data-testid="painel-rodape">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-700">Trecho de rodapé{r.sugerido ? ' · sugerido' : ''}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {m(compMm)} m · {r.alturaMm} mm · {((compMm * r.alturaMm) / 1e6).toFixed(2).replace('.', ',')} m² · {r.pontos.length - 1} trecho(s)
          </p>
          <IdentificadorDoElemento uid={r.uid} familia="rodape" />
        </div>
        <div className="flex items-center gap-1">
          {r.sugerido && (
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
          Altura (mm)
          <input type="number" key={`${r.id}-h`} defaultValue={r.alturaMm} min={1} max={MAX_ALTURA_DE_RODAPE_MM} step={5} aria-label="Altura do rodapé (mm)" onBlur={(e) => { const v = Math.round(Number(e.target.value)); if (v >= 1 && v <= MAX_ALTURA_DE_RODAPE_MM && v !== r.alturaMm) onProps({ alturaMm: v }); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Item do catálogo
          {lineares.length > 0 ? (
            <select value={r.itemCode} onChange={(e) => { const mat = lineares.find((x) => x.codigo === e.target.value); onProps({ itemCode: e.target.value, ...(mat ? { descricao: mat.nome } : {}) }); }} aria-label="Item do rodapé" className={campo}>
              <option value="">(sem vínculo)</option>
              {lineares.map((x) => (
                <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.nome}</option>
              ))}
            </select>
          ) : (
            <input key={`${r.id}-i`} defaultValue={r.itemCode} placeholder="SINAPI / interno" aria-label="Item do rodapé" onBlur={(e) => e.target.value !== r.itemCode && onProps({ itemCode: e.target.value.trim() })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
          )}
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          Descrição
          <input key={`${r.id}-d`} defaultValue={r.descricao} aria-label="Descrição do rodapé" onBlur={(e) => e.target.value !== r.descricao && onProps({ descricao: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Com trechos no desenho, o quantitativo de rodapé passa a ser a soma deles (não o perímetro dos ambientes).</p>
    </div>
  );
}
