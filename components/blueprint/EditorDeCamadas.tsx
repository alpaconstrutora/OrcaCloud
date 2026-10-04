/**
 * EDITOR DE CAMADAS — a lista compacta de camadas (espessura, função, descrição,
 * material) com subir/descer/excluir. Nasceu dentro de `PainelAcabamentos`
 * (piso e forro, E7.2) e saiu para arquivo próprio em 04/10/2026 (E1.2 da
 * climatização), quando a cobertura e a laje passaram a ter camadas também: um
 * editor só, três lugares.
 *
 * Quem o usa decide a ORDEM que a lista representa (`rotuloDaOrdem`) e o que
 * fazer quando o usuário pede o catálogo (`onEscolherMaterial`).
 */
import React from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type { CamadaParede, FuncaoCamada } from '../../utils/blueprintKernel';
import { FUNCOES_DE_CAMADA } from '../../utils/blueprintKernel';
import SeletorDeMaterial from './SeletorDeMaterial';
import type { Material } from '../../utils/blueprintMateriais';

export const ROTULO_DA_FUNCAO_DE_CAMADA: Record<FuncaoCamada, string> = { ESTRUTURAL: 'Estrutural', VEDACAO: 'Vedação', REVESTIMENTO: 'Revestimento', ISOLAMENTO: 'Isolamento', ACABAMENTO: 'Acabamento', CAMARA_AR: 'Câmara de ar' };

const campo = 'h-7 rounded-[6px] border border-slate-300 bg-white px-1.5 text-xs text-slate-800';

export default function EditorDeCamadas({ chave, camadas, rotuloDaOrdem, onMudar, onEscolherMaterial, materiais }: {
  chave: string;
  camadas: CamadaParede[];
  rotuloDaOrdem: string;
  onMudar: (camadas: CamadaParede[]) => void;
  onEscolherMaterial: (indice: number) => void;
  materiais: readonly Material[];
}) {
  if (camadas.length === 0) return <p className="mt-1 text-[11px] text-slate-400">Sem camadas — escolha um preset, um tipo salvo ou adicione uma camada.</p>;
  const trocar = (i: number, parte: Partial<CamadaParede>) => onMudar(camadas.map((c, k) => (k === i ? { ...c, ...parte } : c)));
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= camadas.length) return;
    const novo = [...camadas];
    [novo[i], novo[j]] = [novo[j], novo[i]];
    onMudar(novo);
  };
  const total = camadas.reduce((s, c) => s + c.espessuraMm, 0);
  return (
    <div className="mt-1">
      <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">Camadas ({rotuloDaOrdem}) · {total} mm</p>
      <ul className="space-y-1">
        {camadas.map((c, i) => (
          <li key={`${chave}-${i}`} className="flex flex-wrap items-center gap-1.5">
            <span className="w-4 text-right text-[10px] text-slate-400">{i + 1}</span>
            <input type="number" min={1} step={1} defaultValue={c.espessuraMm} aria-label={`Espessura da camada ${i + 1} (mm)`} onBlur={(e) => { const v = Math.round(Number(e.target.value)); if (v > 0 && v !== c.espessuraMm) trocar(i, { espessuraMm: v }); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={`${campo} w-14 text-right`} />
            <span className="text-[10px] text-slate-400">mm</span>
            <select value={c.funcao} onChange={(e) => trocar(i, { funcao: e.target.value as FuncaoCamada })} aria-label={`Função da camada ${i + 1}`} className={campo}>
              {FUNCOES_DE_CAMADA.map((f) => <option key={f} value={f}>{ROTULO_DA_FUNCAO_DE_CAMADA[f]}</option>)}
            </select>
            <input type="text" defaultValue={c.descricao} placeholder="Descrição" aria-label={`Descrição da camada ${i + 1}`} onBlur={(e) => e.target.value !== c.descricao && trocar(i, { descricao: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={`${campo} w-40`} />
            {materiais.length > 0 ? (
              <SeletorDeMaterial materiais={materiais} atual={c.itemCode} onEscolher={(m) => trocar(i, { itemCode: m.codigo, descricao: m.nome, ...(m.funcao ? { funcao: m.funcao } : {}) })} onCatalogo={() => onEscolherMaterial(i)} onLimpar={() => trocar(i, { itemCode: '' })} ariaLabel={`Material da camada ${i + 1}`} />
            ) : (
              <button type="button" onClick={() => onEscolherMaterial(i)} className={`rounded border px-1.5 py-0.5 text-[11px] ${c.itemCode ? 'border-slate-300 text-slate-700' : 'border-amber-300 bg-amber-50 text-amber-900'}`} aria-label={`Material da camada ${i + 1}`} title={c.itemCode ? 'Trocar o item de catálogo' : 'Sem item de catálogo — não entra no orçamento'}>
                {c.itemCode ? `Item ${c.itemCode}` : 'Escolher material'}
              </button>
            )}
            {c.itemCode && materiais.length === 0 && (
              <button type="button" onClick={() => trocar(i, { itemCode: '' })} className="text-[10px] text-slate-400 hover:text-slate-600" aria-label={`Limpar material da camada ${i + 1}`}>limpar</button>
            )}
            <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label={`Subir camada ${i + 1}`}><ArrowUp className="h-3 w-3" /></button>
            <button type="button" onClick={() => mover(i, 1)} disabled={i === camadas.length - 1} className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label={`Descer camada ${i + 1}`}><ArrowDown className="h-3 w-3" /></button>
            <button type="button" onClick={() => onMudar(camadas.filter((_x, k) => k !== i))} className="rounded p-0.5 text-slate-400 hover:text-red-700" aria-label={`Excluir camada ${i + 1}`}><Trash2 className="h-3 w-3" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
