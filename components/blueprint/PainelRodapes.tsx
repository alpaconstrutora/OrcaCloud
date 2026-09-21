/**
 * RODAPÉS DO PAVIMENTO (21/09/2026, backlog P2 — P2.21): o gerador — cada
 * ambiente vira trechos SUGERIDOS ao pé das paredes, descontadas as portas —
 * mais o que já existe e o total. Molde do painel de guarda-corpos.
 */
import React from 'react';
import type { ObjectId, TrechoDeRodape } from '../../utils/blueprintKernel';
import { comprimentoDoRodape, type HipotesesDeRodape, type ResultadoDaSugestaoDeRodape, type SugestaoDeRodape } from '../../utils/blueprintRodape';

interface Props {
  nomeDoPavimento: string;
  pecas: TrechoDeRodape[];
  sugestao: ResultadoDaSugestaoDeRodape;
  hipoteses: HipotesesDeRodape;
  onHipoteses: (h: HipotesesDeRodape) => void;
  onLancar: (quais: SugestaoDeRodape[]) => void;
  onAceitarTodos: () => void;
  onLimparSugeridos: () => void;
  onSelecionar: (id: ObjectId) => void;
}

const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');

export default function PainelRodapes({ nomeDoPavimento, pecas, sugestao, hipoteses, onHipoteses, onLancar, onAceitarTodos, onLimparSugeridos, onSelecionar }: Props) {
  const campo = 'h-8 rounded-[6px] border border-slate-300 bg-white px-2 text-xs text-slate-800';
  const porAmbiente = new Map<string, { nome: string; sugestoes: SugestaoDeRodape[]; metros: number }>();
  for (const s of sugestao.sugestoes) {
    const atual = porAmbiente.get(s.spaceId) ?? { nome: s.nomeDoAmbiente, sugestoes: [], metros: 0 };
    atual.sugestoes.push(s);
    atual.metros += s.comprimentoMm / 1000;
    porAmbiente.set(s.spaceId, atual);
  }
  const sugeridos = pecas.filter((p) => p.sugerido);
  const metros = pecas.reduce((s, p) => s + comprimentoDoRodape(p), 0) / 1000;
  return (
    <div className="space-y-4" data-testid="tarefa-rodapes">
      <div className="rounded-[10px] border border-slate-200 bg-white p-3 text-xs text-slate-700">
        <p>
          <strong>{nomeDoPavimento}</strong> — {pecas.length} trecho(s) de rodapé desenhado(s), {m(metros * 1000)} m{sugeridos.length ? ` (${sugeridos.length} sugerido(s))` : ''}.
          {pecas.length > 0 ? ' O quantitativo já soma os trechos, não o perímetro dos ambientes.' : ' Sem trecho, o quantitativo usa o perímetro dos ambientes menos as portas (E7.2).'}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Altura padrão (mm)
            <input type="number" min={1} max={500} step={5} value={hipoteses.alturaMm} onChange={(e) => onHipoteses({ ...hipoteses, alturaMm: Math.max(1, Math.round(Number(e.target.value) || 0)) })} aria-label="Altura padrão do rodapé sugerido" className={campo} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Item padrão
            <input value={hipoteses.itemCode} onChange={(e) => onHipoteses({ ...hipoteses, itemCode: e.target.value })} aria-label="Item padrão do rodapé sugerido" placeholder="SINAPI / interno" className={campo} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Descrição padrão
            <input value={hipoteses.descricao} onChange={(e) => onHipoteses({ ...hipoteses, descricao: e.target.value })} aria-label="Descrição padrão do rodapé sugerido" className={campo} />
          </label>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">O ambiente que declarou rodapé (E7.2) usa a altura e o item dele; o que declarou "sem rodapé" é pulado; o que já tem trecho não recebe outro.</p>
      </div>

      <div className="rounded-[10px] border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Sugestões ({sugestao.sugestoes.length} trecho(s) em {porAmbiente.size} ambiente(s))</h4>
          <button type="button" disabled={sugestao.sugestoes.length === 0} onClick={() => onLancar(sugestao.sugestoes)} className="h-8 rounded-[6px] bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50" data-testid="lancar-rodapes">
            Lançar todos
          </button>
        </div>
        {porAmbiente.size === 0 ? (
          <p className="mt-2 text-xs text-slate-500">Nada a sugerir: todo ambiente do pavimento já tem trecho ou declarou "sem rodapé".</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-xs">
            {[...porAmbiente.entries()].map(([spaceId, a]) => (
              <li key={spaceId} className="flex items-center justify-between gap-2 py-1.5">
                <span>
                  <strong>{a.nome}</strong> · {a.sugestoes.length} trecho(s) · {m(a.metros * 1000)} m
                </span>
                <button type="button" onClick={() => onLancar(a.sugestoes)} className="h-7 rounded-[6px] border border-slate-300 bg-white px-2 text-xs text-slate-700 hover:bg-slate-50">
                  Lançar
                </button>
              </li>
            ))}
          </ul>
        )}
        {sugestao.pulados.length > 0 && (
          <p className="mt-2 text-[11px] text-slate-500">Pulados: {sugestao.pulados.map((p) => `${p.nome} (${p.motivo})`).join(' · ')}</p>
        )}
      </div>

      {pecas.length > 0 && (
        <div className="rounded-[10px] border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Trechos no pavimento</h4>
            <span className="flex items-center gap-2">
              {sugeridos.length > 0 && (
                <>
                  <button type="button" onClick={onAceitarTodos} className="h-7 rounded-[6px] border border-blue-600 bg-white px-2 text-xs text-blue-700 hover:bg-blue-50" data-testid="aceitar-rodapes">
                    Aceitar {sugeridos.length} sugerido(s)
                  </button>
                  <button type="button" onClick={onLimparSugeridos} className="h-7 rounded-[6px] border border-slate-300 bg-white px-2 text-xs text-slate-700 hover:bg-slate-50">
                    Limpar sugeridos
                  </button>
                </>
              )}
            </span>
          </div>
          <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-auto text-xs">
            {pecas.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onSelecionar(p.id)} className="flex w-full items-center justify-between gap-2 py-1.5 text-left hover:bg-slate-50">
                  <span>
                    {p.descricao || 'Rodapé'}{p.itemCode ? ` · ${p.itemCode}` : ''} · {p.alturaMm} mm{p.sugerido ? ' · sugerido' : ''}
                  </span>
                  <span className="tabular-nums text-slate-600">{m(comprimentoDoRodape(p))} m</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
