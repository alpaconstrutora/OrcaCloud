import React, { useEffect, useMemo } from 'react';
import { Plus, Minus, Maximize2 } from 'lucide-react';
import type { P2PEdge, P2PGroup, P2PStage, P2PTemplateAtivo } from '../../services/p2pFlowService';
import { posicoesDosNos, caixaDoGrupo, tamanhoDoDesenho, caminhoOrtogonal } from '../../utils/p2pLayout';
import { usePanZoom } from '../../hooks/usePanZoom';
import { P2PNodeCard } from './P2PNodeCard';
import { P2PEdges } from './P2PEdges';
import { P2PEdgeLabel } from './P2PEdgeLabel';

export type P2PSelecao = { tipo: 'no'; id: string } | { tipo: 'aresta'; id: string } | null;

/** Piso da vista inicial: a 0,7 o texto de 14px do cartão ainda se lê (~10px). */
const ESCALA_LEGIVEL = 0.7;

/**
 * O desenho do fluxo (§31 do guia): fundo pontilhado que acompanha pan/zoom,
 * caixas dos grupos, linhas (SVG), rótulos (HTML) e cartões (HTML), tudo numa
 * camada com `transform`. Drawers e modais NÃO entram aqui: `Sheet`/`Modal`
 * são `fixed` sem portal e, dentro de um ancestral com `transform`, nasceriam
 * presos e escalados no canvas.
 */
export function P2PCanvas({
  stages, edges, groups, selecao, modoEscolher, onCancelarModo,
  onSelectNode, onOpenNode, onNavigate, onSelectEdge, onEscolherAresta, onNovoGatilho, onEditarTemplate,
}: {
  stages: P2PStage[];
  edges: P2PEdge[];
  groups: P2PGroup[];
  selecao: P2PSelecao;
  modoEscolher: boolean;
  onCancelarModo: () => void;
  onSelectNode: (id: string) => void;
  onOpenNode: (id: string) => void;
  onNavigate: (view: string) => void;
  onSelectEdge: (edge: P2PEdge) => void;
  onEscolherAresta: (edge: P2PEdge) => void;
  onNovoGatilho: (edge: P2PEdge) => void;
  onEditarTemplate: (tpl: P2PTemplateAtivo, edge: P2PEdge) => void;
}) {
  const posicoes = useMemo(() => posicoesDosNos(stages.map(s => s.id)), [stages]);
  const tamanho = useMemo(() => tamanhoDoDesenho(posicoes), [posicoes]);
  const { vista, ref, zoomIn, zoomOut, enquadrar, onPointerDown, onPointerMove, onPointerUp, min, max } = usePanZoom<HTMLDivElement>();

  // Vista inicial (e ao mudar o tamanho da área): legível, alinhada ao início
  // do fluxo — caber inteiro num canvas de ~700px dava 35% (medido em
  // 16/10/2026). "Enquadrar" (botão) mostra tudo. `ResizeObserver` não existe
  // no jsdom: lá fica a vista neutra (escala 1), que é o que o teste vê.
  useEffect(() => {
    if (stages.length === 0) return;
    enquadrar(tamanho, ESCALA_LEGIVEL);
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => enquadrar(tamanho, ESCALA_LEGIVEL));
    ro.observe(el);
    return () => ro.disconnect();
  }, [enquadrar, ref, stages.length, tamanho]);

  useEffect(() => {
    if (!modoEscolher) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelarModo(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [modoEscolher, onCancelarModo]);

  const selecionadaId = selecao?.tipo === 'aresta' ? selecao.id : null;
  const noSelecionado = selecao?.tipo === 'no' ? selecao.id : null;
  const pct = Math.round(vista.escala * 100);

  return (
    <div
      ref={ref}
      data-canvas
      className={`relative h-[560px] overflow-hidden select-none bg-white ${modoEscolher ? 'cursor-copy' : 'cursor-grab active:cursor-grabbing'}`}
      style={{
        touchAction: 'none',
        backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
        backgroundSize: `${20 * vista.escala}px ${20 * vista.escala}px`,
        backgroundPosition: `${vista.dx}px ${vista.dy}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        data-camada
        className="absolute left-0 top-0"
        style={{ width: tamanho.w, height: tamanho.h, transform: `translate(${vista.dx}px, ${vista.dy}px) scale(${vista.escala})`, transformOrigin: '0 0' }}
      >
        {groups.map(g => {
          const caixa = caixaDoGrupo(g.nodeIds, posicoes);
          if (!caixa) return null;
          return (
            <div
              key={g.id}
              data-group={g.id}
              className="absolute rounded-[10px] border-2 border-dashed border-slate-200"
              style={{ left: caixa.x, top: caixa.y, width: caixa.w, height: caixa.h }}
            >
              <span className="absolute -top-3 left-3 h-6 px-2 rounded-[6px] border border-gray-200 bg-white text-[11px] font-medium text-gray-600 shadow-sm leading-6">
                {g.label}
              </span>
            </div>
          );
        })}

        <P2PEdges
          edges={edges}
          posicoes={posicoes}
          tamanho={tamanho}
          selecionadaId={selecionadaId}
          modoEscolher={modoEscolher}
          onSelect={onSelectEdge}
          onEscolher={onEscolherAresta}
        />

        {edges.map(edge => {
          const a = posicoes[edge.from];
          const b = posicoes[edge.to];
          if (!a || !b) return null;
          return (
            <P2PEdgeLabel
              key={edge.id}
              edge={edge}
              meio={caminhoOrtogonal(a, b).meio}
              selecionada={edge.id === selecionadaId}
              modoEscolher={modoEscolher}
              onSelect={onSelectEdge}
              onEscolher={onEscolherAresta}
              onNovoGatilho={onNovoGatilho}
              onEditarTemplate={onEditarTemplate}
            />
          );
        })}

        {stages.map(stage => (
          <P2PNodeCard
            key={stage.id}
            stage={stage}
            pos={posicoes[stage.id]}
            selected={noSelecionado === stage.id}
            onOpen={() => { onSelectNode(stage.id); onOpenNode(stage.id); }}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      {modoEscolher && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 h-9 px-3 flex items-center gap-2 rounded-[6px] border border-blue-200 bg-blue-50 text-sm text-blue-700 shadow-sm">
          Clique na transição que o novo gatilho vai conduzir
          <button type="button" onClick={onCancelarModo} className="text-xs font-medium underline hover:text-blue-900">Cancelar (Esc)</button>
        </div>
      )}

      {/* Controles de zoom — canto inferior esquerdo, como num editor de fluxo */}
      <div data-no-pan className="absolute bottom-3 left-3 flex flex-col rounded-[6px] border border-gray-200 bg-white shadow-sm overflow-hidden">
        <button type="button" title="Aproximar" onClick={zoomIn} disabled={vista.escala >= max}
          className="h-8 w-8 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40">
          <Plus className="w-4 h-4" />
        </button>
        <span className="h-6 flex items-center justify-center text-[11px] text-gray-500 border-y border-gray-100 tabular-nums" title="Zoom">{pct}%</span>
        <button type="button" title="Afastar" onClick={zoomOut} disabled={vista.escala <= min}
          className="h-8 w-8 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40">
          <Minus className="w-4 h-4" />
        </button>
        <button type="button" title="Enquadrar o fluxo inteiro" onClick={() => enquadrar(tamanho)}
          className="h-8 w-8 flex items-center justify-center text-gray-600 hover:bg-gray-50 border-t border-gray-100">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
