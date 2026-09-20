/**
 * MINIATURA de planta em SVG (19/09/2026, E6.1). Só leitura, sem Konva: paredes
 * com a espessura real, vãos como recorte (porta com o arco, janela com a
 * linha dupla), ambientes com nome e área, divisas do lote tracejadas. Recebe
 * o `viewBox` de fora para que duas miniaturas lado a lado fiquem na MESMA
 * escala e enquadramento — é isso que "canvases sincronizados" significa na
 * comparação de alternativas. Y do desenho é para cima; o SVG inverte.
 */
import React, { useMemo } from 'react';
import type { BlueprintModel, ObjectId, Point } from '../../utils/blueprintKernel';
import { wallLength } from '../../utils/blueprintKernel';

export interface CaixaDaMiniatura {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A caixa que contém paredes e divisas de um ou mais modelos (todos os pavimentos), com folga. */
export function caixaDosModelos(modelos: readonly BlueprintModel[], folgaMm = 1000): CaixaDaMiniatura | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const ver = (p: Point) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const m of modelos) {
    for (const w of m.walls) {
      ver(w.a);
      ver(w.b);
    }
    for (const b of m.boundaries) {
      ver(b.a);
      ver(b.b);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX: minX - folgaMm, minY: minY - folgaMm, maxX: maxX + folgaMm, maxY: maxY + folgaMm };
}

interface Props {
  model: BlueprintModel;
  levelId: ObjectId | null;
  caixa: CaixaDaMiniatura;
  /** uids a realçar (mudanças do diff) — laranja. */
  destaque?: ReadonlySet<string>;
  titulo?: string;
  altura?: number;
  /** FASES DE REFORMA (E10.2): ids que NÃO se desenham (o filtro antes/depois). */
  ocultos?: ReadonlySet<string>;
  /** id → fase, para colorir: existente cinza, a demolir vermelho tracejado. Ausente = tudo novo. */
  fases?: ReadonlyMap<string, 'EXISTENTE' | 'DEMOLIR' | 'NOVO'>;
}

export default function MiniPlanta({ model, levelId, caixa, destaque, titulo, altura = 320, ocultos, fases }: Props) {
  const w = caixa.maxX - caixa.minX;
  const h = caixa.maxY - caixa.minY;
  const Y = (y: number) => caixa.maxY - y; // inverte
  const nivel = levelId ?? model.levels[0]?.id ?? null;
  const paredes = useMemo(() => model.walls.filter((x) => x.levelId === nivel && !ocultos?.has(x.id)), [model, nivel, ocultos]);
  const espacos = useMemo(() => model.spaces.filter((s) => s.levelId === nivel && s.ring.length >= 3), [model, nivel]);
  const divisas = useMemo(() => model.boundaries.filter((b) => b.kind === 'TERRENO'), [model]);
  const aberturas = useMemo(() => model.openings.filter((o) => !ocultos?.has(o.id) && paredes.some((p) => p.id === o.wallId)), [model, paredes, ocultos]);
  const corDaParede = (p: { id: string; uid: string }) => {
    if (destaque?.has(p.uid)) return '#ea580c';
    const fase = fases?.get(p.id);
    return fase === 'EXISTENTE' ? '#94a3b8' : fase === 'DEMOLIR' ? '#dc2626' : '#1e293b';
  };
  const traco = Math.max(w, h) / 600; // ~1 px na largura típica
  const fonte = Math.max(w, h) / 45;

  return (
    <figure className="m-0 rounded-[6px] border border-slate-200 bg-white" data-testid="mini-planta">
      {titulo && <figcaption className="border-b border-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{titulo}</figcaption>}
      <svg viewBox={`${caixa.minX} 0 ${w} ${h}`} width="100%" height={altura} role="img" aria-label={titulo ?? 'Planta'}>
        {espacos.map((s) => (
          <g key={s.id}>
            <polygon points={s.ring.map((p) => `${p.x},${Y(p.y)}`).join(' ')} fill={destaque?.has(s.labelUid ?? '') ? '#fed7aa' : '#f1f5f9'} stroke="none" />
            {s.name && (
              <text x={s.ring.reduce((a, p) => a + p.x, 0) / s.ring.length} y={Y(s.ring.reduce((a, p) => a + p.y, 0) / s.ring.length)} fontSize={fonte} textAnchor="middle" fill="#334155">
                {s.name}
              </text>
            )}
          </g>
        ))}
        {divisas.map((b) => (
          <line key={b.id} x1={b.a.x} y1={Y(b.a.y)} x2={b.b.x} y2={Y(b.b.y)} stroke="#0d9488" strokeWidth={traco * 1.5} strokeDasharray={`${traco * 8} ${traco * 5}`} />
        ))}
        {paredes.map((p) => (
          <line key={p.id} x1={p.a.x} y1={Y(p.a.y)} x2={p.b.x} y2={Y(p.b.y)} stroke={corDaParede(p)} strokeWidth={p.thicknessMm} strokeLinecap="butt" strokeDasharray={fases?.get(p.id) === 'DEMOLIR' ? `${p.thicknessMm * 1.5} ${p.thicknessMm}` : undefined} data-fase={fases?.get(p.id) ?? undefined} />
        ))}
        {aberturas.map((o) => {
          const p = paredes.find((x) => x.id === o.wallId)!;
          const L = wallLength(p) || 1;
          const ux = (p.b.x - p.a.x) / L;
          const uy = (p.b.y - p.a.y) / L;
          const a = { x: p.a.x + ux * o.offsetMm, y: p.a.y + uy * o.offsetMm };
          const b = { x: a.x + ux * o.widthMm, y: a.y + uy * o.widthMm };
          const cor = destaque?.has(o.uid) ? '#ea580c' : o.kind === 'window' ? '#2563eb' : '#64748b';
          return (
            <g key={o.id}>
              <line x1={a.x} y1={Y(a.y)} x2={b.x} y2={Y(b.y)} stroke="#ffffff" strokeWidth={p.thicknessMm + traco} />
              <line x1={a.x} y1={Y(a.y)} x2={b.x} y2={Y(b.y)} stroke={cor} strokeWidth={o.kind === 'window' ? traco * 3 : traco * 1.5} />
              {o.kind === 'door' && (
                <path d={`M ${b.x} ${Y(b.y)} A ${o.widthMm} ${o.widthMm} 0 0 ${o.swingReversed ? 1 : 0} ${a.x - uy * o.widthMm * (o.swingReversed ? 1 : -1)} ${Y(a.y + ux * o.widthMm * (o.swingReversed ? 1 : -1))}`} fill="none" stroke={cor} strokeWidth={traco} />
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
