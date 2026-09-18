/**
 * A FICHA da peça selecionada (18/09/2026, E1.5): só leitura, recolhida por
 * padrão (o painel de edição vem primeiro), com "Copiar ficha" para levar o
 * texto a um e-mail ou a uma reunião. O conteúdo é de `fichaDoElemento`.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ClipboardCopy, Check } from 'lucide-react';
import { fichaComoTexto, type Ficha } from '../../utils/blueprintFicha';

export default function FichaDoElemento({ ficha }: { ficha: Ficha | null }) {
  const [aberta, setAberta] = useState(false);
  const [copiada, setCopiada] = useState(false);
  if (!ficha) return null;
  async function copiar() {
    try {
      await navigator.clipboard.writeText(fichaComoTexto(ficha!));
      setCopiada(true);
      setTimeout(() => setCopiada(false), 1500);
    } catch {
      /* sem clipboard (http, permissão): o botão só não confirma */
    }
  }
  return (
    <div className="mt-3 rounded-[10px] border border-slate-200 bg-white" data-testid="ficha-do-elemento">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button type="button" onClick={() => setAberta((v) => !v)} aria-expanded={aberta} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-semibold text-slate-600">
          {aberta ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">Ficha · {ficha.titulo}</span>
          <span className="shrink-0 text-[10px] font-normal text-slate-400">{ficha.secoes.length === 1 ? "1 seção" : `${ficha.secoes.length} seções`}</span>
        </button>
        <button
          type="button"
          onClick={() => void copiar()}
          title="Copia a ficha como texto"
          aria-label="Copiar ficha"
          className="flex h-7 shrink-0 items-center gap-1 rounded-[6px] border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 hover:border-blue-300 hover:text-blue-600"
        >
          {copiada ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
          {copiada ? 'Copiada' : 'Copiar'}
        </button>
      </div>
      {aberta && (
        <div className="space-y-2 border-t border-slate-100 px-3 py-2">
          {ficha.secoes.map((s) => (
            <div key={s.titulo}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{s.titulo}</p>
              <dl className="mt-0.5 space-y-0.5">
                {s.linhas.map((l, i) => (
                  <div key={`${l.rotulo}-${i}`} className="flex items-baseline justify-between gap-3 text-[11px]">
                    <dt className="shrink-0 text-slate-500">
                      {l.rotulo}
                      {l.marca === 'formula' && <span className="ml-1 text-slate-400">ƒ</span>}
                    </dt>
                    <dd className={`min-w-0 truncate text-right font-medium ${l.marca === 'violada' ? 'text-amber-700' : 'text-slate-800'}`} title={l.valor}>
                      {l.valor}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
