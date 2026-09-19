/**
 * SELETOR DE MATERIAL (19/09/2026, E7.4): a biblioteca da organização num
 * `<select>` ao lado do botão do catálogo. Escolher um material grava o
 * CÓDIGO dele (e a descrição-cache) onde a camada/rodapé/guarda-corpo já
 * guardava o `itemCode`; "Catálogo…" continua abrindo o SINAPI/base própria
 * para quem quer um código que a biblioteca ainda não tem. O código atual que
 * não está na biblioteca aparece como opção própria ("87879 · fora da
 * biblioteca") — nunca some nem é trocado em silêncio.
 */
import React from 'react';
import type { Material } from '../../utils/blueprintMateriais';

interface Props {
  materiais: readonly Material[];
  /** O `itemCode` atual (`''` = sem vínculo). */
  atual: string;
  onEscolher: (m: Material) => void;
  /** Abre o catálogo (SINAPI / base própria). */
  onCatalogo?: () => void;
  onLimpar?: () => void;
  ariaLabel: string;
  /** Só materiais cotados nestas unidades (ex.: rodapé em m/m²). Ausente = todos. */
  unidades?: readonly string[];
  className?: string;
}

const norm = (u: string) => u.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s.]/g, '').replace('²', '2').replace('³', '3');

export default function SeletorDeMaterial({ materiais, atual, onEscolher, onCatalogo, onLimpar, ariaLabel, unidades, className = '' }: Props) {
  const aceitas = unidades ? new Set(unidades.map(norm)) : null;
  const lista = materiais.filter((m) => !aceitas || aceitas.has(norm(m.unidade)));
  const naBiblioteca = lista.some((m) => m.codigo === atual);
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <select
        value={atual}
        onChange={(e) => {
          const m = lista.find((x) => x.codigo === e.target.value);
          if (m) onEscolher(m);
          else if (e.target.value === '' && onLimpar) onLimpar();
        }}
        aria-label={ariaLabel}
        className={`h-7 max-w-[14rem] rounded-[6px] border px-1.5 text-xs ${atual ? 'border-slate-300 bg-white text-slate-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}
        title={atual ? `Código ${atual}` : 'Sem material — não entra no orçamento'}
      >
        <option value="">{lista.length ? 'Material…' : 'Biblioteca vazia'}</option>
        {atual && !naBiblioteca && <option value={atual}>{atual} · fora da biblioteca</option>}
        {lista.map((m) => (
          <option key={m.id} value={m.codigo}>
            {m.nome} · {m.unidade}{m.custo ? ` · R$ ${m.custo.toFixed(2).replace('.', ',')}` : ''}
          </option>
        ))}
      </select>
      {onCatalogo && (
        <button type="button" onClick={onCatalogo} className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50" title="Escolher no catálogo SINAPI / base própria">
          Catálogo…
        </button>
      )}
    </span>
  );
}
