/**
 * SUB-REGIÃO DO TERRENO selecionada (21/09/2026, backlog P2 — P2.19): material,
 * nome, área e permeabilidade; excluir. Segue o molde dos painéis de peça
 * (núcleo, vaga): edita uma propriedade por vez pelo `onProps`.
 */
import React from 'react';
import { FICHA_DO_MATERIAL_DE_SUB_REGIAO, MATERIAIS_DE_SUB_REGIAO, MAX_NOME_DE_SUB_REGIAO, type MaterialDeSubRegiao, type SubRegiao } from '../../utils/blueprintKernel';
import { areaDaSubRegiaoM2 } from '../../utils/blueprintSubRegioes';
import IdentificadorDoElemento from './IdentificadorDoElemento';

interface Props {
  subRegiao: SubRegiao | null;
  onProps: (campos: { material?: MaterialDeSubRegiao; nome?: string | null }) => void;
  onExcluir: () => void;
}

export default function PainelSubRegiaoSelecionada({ subRegiao: s, onProps, onExcluir }: Props) {
  if (!s) return null;
  const ficha = FICHA_DO_MATERIAL_DE_SUB_REGIAO[s.material];
  const campo = 'rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800';
  return (
    <div className="border-b border-slate-200 px-4 py-3" data-testid="painel-subregiao">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-700">Sub-região do terreno</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {areaDaSubRegiaoM2(s).toFixed(2).replace('.', ',')} m² · {s.pontos.length} vértices ·{' '}
            <span className={ficha.permeavel ? 'text-emerald-700' : 'text-slate-600'} data-testid="subregiao-permeavel">{ficha.permeavel ? 'permeável' : 'impermeável'}</span>
          </p>
          <IdentificadorDoElemento uid={s.uid} familia="subRegiao" />
        </div>
        <button type="button" onClick={onExcluir} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700">
          Excluir
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500">
        <label className="flex flex-col gap-1">
          Material
          <select value={s.material} onChange={(e) => onProps({ material: e.target.value as MaterialDeSubRegiao })} aria-label="Material da sub-região" className={campo}>
            {MATERIAIS_DE_SUB_REGIAO.map((m) => (
              <option key={m} value={m}>
                {FICHA_DO_MATERIAL_DE_SUB_REGIAO[m].rotulo}
                {FICHA_DO_MATERIAL_DE_SUB_REGIAO[m].permeavel ? ' · permeável' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Nome
          <input key={`${s.id}-n`} defaultValue={s.nome ?? ''} maxLength={MAX_NOME_DE_SUB_REGIAO} placeholder={ficha.rotulo} aria-label="Nome da sub-região" onBlur={(e) => onProps({ nome: e.target.value || null })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">A área conta na taxa de permeabilidade (Dados do lote) e na medida "Sub-região do terreno" do orçamento.</p>
    </div>
  );
}
