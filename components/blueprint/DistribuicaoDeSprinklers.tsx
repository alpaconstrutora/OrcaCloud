/**
 * INCÊNDIO — a distribuição automática de sprinklers (01/10/2026, E5.3 do
 * roadmap de incêndio): escolhe o ambiente, compara as alternativas LADO A LADO
 * (desenho, contagem, espaçamentos, comprimento dos ramais) e lança a
 * escolhida num lote só. Tudo derivado (`blueprintDistribuicaoSprinklers`);
 * nada grava até o clique.
 */
import React, { useState } from 'react';
import type { ObjectId, Point } from '../../utils/blueprintKernel';
import type { AlternativaDeDistribuicao, PlanoDeSprinklers } from '../../utils/blueprintDistribuicaoSprinklers';
import { ROTULO_DO_TRACADO, type TipoDeTracado } from '../../utils/blueprintRedeDeSprinklers';

export interface PropsDaDistribuicao {
  ambientes: { id: ObjectId; nome: string; areaM2: number }[];
  spaceId: ObjectId | null;
  onSpace: (id: ObjectId | null) => void;
  /** O contorno do ambiente escolhido, para o desenho das alternativas. */
  contorno: Point[] | null;
  plano: PlanoDeSprinklers | null;
  /** E5.4: `tracado` = a tubulação junto (espinha pela ponta/centro ou grelha); `null` = só os sprinklers. */
  onLancar: (alt: AlternativaDeDistribuicao, tracado: TipoDeTracado | null) => void;
}

const n = (v: number, casas = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** O desenho pequeno de uma alternativa: o ambiente, os ramais e os sprinklers. */
function Miniatura({ contorno, alt }: { contorno: Point[]; alt: AlternativaDeDistribuicao }) {
  const xs = contorno.map((p) => p.x);
  const ys = contorno.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0 || 1;
  const h = Math.max(...ys) - y0 || 1;
  const m = Math.max(w, h) * 0.04;
  // y da planta cresce para cima; o do SVG, para baixo.
  const Y = (y: number) => y0 + h - (y - y0);
  return (
    <svg viewBox={`${x0 - m} ${y0 - m} ${w + 2 * m} ${h + 2 * m}`} className="h-24 w-full" role="img" aria-label={`Desenho: ${alt.rotulo}`}>
      <polygon points={contorno.map((p) => `${p.x},${Y(p.y)}`).join(' ')} fill="#f8fafc" stroke="#64748b" strokeWidth={Math.max(w, h) / 150} />
      {alt.ramais.map((r, i) => (
        <line key={i} x1={r.a.x} y1={Y(r.a.y)} x2={r.b.x} y2={Y(r.b.y)} stroke="#ea580c" strokeWidth={Math.max(w, h) / 200} />
      ))}
      {alt.pontos.map((p, i) => (
        <circle key={i} cx={p.x} cy={Y(p.y)} r={Math.max(w, h) / 70} fill="#ffffff" stroke="#c2410c" strokeWidth={Math.max(w, h) / 250} />
      ))}
    </svg>
  );
}

export default function DistribuicaoDeSprinklers({ ambientes, spaceId, onSpace, contorno, plano, onLancar }: PropsDaDistribuicao) {
  const [chave, setChave] = useState<string | null>(null);
  const [tracado, setTracado] = useState<TipoDeTracado | ''>('PONTA');
  const alts = plano?.alternativas ?? [];
  const escolhida = alts.find((a) => a.chave === chave) ?? alts[0] ?? null;
  const motivo = !spaceId ? 'escolha o ambiente' : plano?.motivo ?? (escolhida ? null : 'sem alternativa');
  return (
    <div className="mt-2" data-testid="sprinklers-distribuicao">
      <h5 className="text-xs font-semibold text-slate-700">Distribuição automática</h5>
      <label className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-600">
        <span>Ambiente</span>
        <select
          value={spaceId ?? ''}
          onChange={(e) => {
            setChave(null);
            onSpace(e.target.value || null);
          }}
          aria-label="Ambiente a distribuir"
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
        >
          <option value="">Escolha…</option>
          {ambientes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome} ({n(a.areaM2, 0)} m²)
            </option>
          ))}
        </select>
      </label>
      {plano?.motivo && <p className="mt-1 text-xs text-red-700">{plano.motivo}.</p>}
      {alts.length > 0 && contorno && (
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Alternativas de distribuição">
          {alts.map((a) => {
            const ativa = escolhida?.chave === a.chave;
            return (
              <button
                key={a.chave}
                type="button"
                role="radio"
                aria-checked={ativa}
                onClick={() => setChave(a.chave)}
                className={`rounded-md border p-1.5 text-left text-[11px] ${ativa ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                data-testid={`alternativa-${a.chave}`}
              >
                <Miniatura contorno={contorno} alt={a} />
                <div className="font-medium text-slate-700">{a.rotulo}</div>
                <div className="tabular-nums text-slate-600">
                  {a.contagem} sprinklers · {n(a.espacamentoNoRamalMm / 1000, 2)} × {n(a.espacamentoEntreRamaisMm / 1000, 2)} m
                </div>
                <div className="tabular-nums text-slate-500">
                  {n(a.areaPorSprinklerM2, 1)} m² cada · ramais {n(a.comprimentoDosRamaisM, 1)} m
                  {a.deslocadosPorViga > 0 && ` · ${a.deslocadosPorViga} fora da viga`}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <label className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600">
        <span>Tubulação</span>
        <select value={tracado} onChange={(e) => setTracado(e.target.value as TipoDeTracado | '')} aria-label="Tubulação dos sprinklers" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
          <option value="">Só os sprinklers</option>
          {(Object.keys(ROTULO_DO_TRACADO) as TipoDeTracado[]).map((t) => (
            <option key={t} value={t}>{ROTULO_DO_TRACADO[t]}</option>
          ))}
        </select>
      </label>
      {tracado && <p className="mt-1 text-[11px] text-slate-500">O geral liga ao nó mais próximo da rede de incêndio do pavimento; DN pelo método das tabelas (na grelha, ponto de partida — ajuste pelo cálculo).</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500">
          {plano && !plano.motivo ? `Defletor a ${n(plano.cotaMm / 1000, 2)} m do piso.` : ''} Espaçamentos do spray padrão — CONFERIR NA NORMA.
        </span>
        <button
          type="button"
          disabled={!!motivo}
          title={motivo ?? 'Um lote só — Ctrl+Z desfaz'}
          onClick={() => escolhida && onLancar(escolhida, tracado || null)}
          className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {escolhida && !motivo ? `Lançar ${escolhida.contagem} sprinklers` : 'Lançar sprinklers'}
        </button>
      </div>
    </div>
  );
}
