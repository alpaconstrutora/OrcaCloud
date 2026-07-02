import React from 'react';
import { GitBranch } from 'lucide-react';
import { HierarchyNode, ItemScheduleDetails } from '../../types';
import { SchedulingEngine } from '../../utils/schedulingEngine';

interface NetworkDiagramViewProps {
    hierarchy: HierarchyNode[];
}

const CARD_W = 176;
const CARD_H = 68;
const COL_GAP = 96;
const ROW_GAP = 18;
const PADDING = 32;

function flattenLeaves(nodes: HierarchyNode[]): HierarchyNode[] {
    const acc: HierarchyNode[] = [];
    const walk = (n: HierarchyNode) => {
        if (n.type === 'item') acc.push(n);
        (n.children || []).forEach(walk);
    };
    nodes.forEach(walk);
    return acc;
}

const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
};

/**
 * Diagrama de rede (PERT): nós = tarefas, arestas = dependências, caminho crítico
 * destacado. Layout puramente calculado (sem medir DOM) — rank = maior caminho
 * a partir de uma tarefa sem predecessoras (dentro do conjunto visível).
 */
const NetworkDiagramView: React.FC<NetworkDiagramViewProps> = ({ hierarchy }) => {
    const leaves = React.useMemo(() => flattenLeaves(hierarchy).filter(n => n.schedule), [hierarchy]);

    const { columns, edges, error, width, height } = React.useMemo(() => {
        if (leaves.length === 0) {
            return { columns: [] as HierarchyNode[][], edges: [] as { from: string; to: string; critical: boolean }[], error: null as string | null, width: 0, height: 0 };
        }

        const idSet = new Set(leaves.map(l => l.id));
        const tasks: ItemScheduleDetails[] = leaves.map(l => ({
            id: l.id,
            duration: l.schedule?.duration ?? 0,
            predecessors: (l.schedule?.predecessors || []).filter(p => idSet.has(p.id)),
        }));

        let topoOrder: string[];
        try {
            topoOrder = SchedulingEngine.getTopologicalOrder(tasks);
        } catch {
            return { columns: [], edges: [], error: 'Dependência circular detectada — não é possível desenhar o diagrama.', width: 0, height: 0 };
        }

        // rank = maior caminho (em nº de predecessores) a partir de uma tarefa-raiz
        const rank = new Map<string, number>();
        const predsById = new Map(tasks.map(t => [t.id, t.predecessors]));
        topoOrder.forEach(id => {
            const preds = predsById.get(id) || [];
            const r = preds.reduce((max, p) => Math.max(max, (rank.get(p.id) ?? 0) + 1), 0);
            rank.set(id, r);
        });

        const nodeById = new Map(leaves.map(l => [l.id, l]));
        const maxRank = Math.max(0, ...Array.from(rank.values()));
        const cols: HierarchyNode[][] = Array.from({ length: maxRank + 1 }, () => []);
        topoOrder.forEach(id => {
            const node = nodeById.get(id);
            if (node) cols[rank.get(id) ?? 0].push(node);
        });

        const edgeList: { from: string; to: string; critical: boolean }[] = [];
        tasks.forEach(t => {
            (t.predecessors || []).forEach(p => {
                const from = nodeById.get(p.id);
                const to = nodeById.get(t.id);
                edgeList.push({ from: p.id, to: t.id, critical: !!(from?.isCritical && to?.isCritical) });
            });
        });

        const w = PADDING * 2 + cols.length * CARD_W + Math.max(0, cols.length - 1) * COL_GAP;
        const maxRows = Math.max(1, ...cols.map(c => c.length));
        const h = PADDING * 2 + maxRows * CARD_H + Math.max(0, maxRows - 1) * ROW_GAP;

        return { columns: cols, edges: edgeList, error: null, width: w, height: h };
    }, [leaves]);

    if (leaves.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 flex flex-col items-center justify-center text-center gap-2">
                <GitBranch className="w-8 h-8 text-gray-300" />
                <p className="text-sm font-bold text-gray-400">Nenhuma tarefa programada para exibir no diagrama de rede.</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-16 flex flex-col items-center justify-center text-center gap-2">
                <GitBranch className="w-8 h-8 text-red-300" />
                <p className="text-sm font-bold text-red-500">{error}</p>
            </div>
        );
    }

    // Posição de cada nó (centro vertical por coluna)
    const pos = new Map<string, { x: number; y: number }>();
    columns.forEach((col, colIdx) => {
        const colHeight = col.length * CARD_H + Math.max(0, col.length - 1) * ROW_GAP;
        const startY = PADDING + (height - PADDING * 2 - colHeight) / 2;
        col.forEach((node, rowIdx) => {
            pos.set(node.id, {
                x: PADDING + colIdx * (CARD_W + COL_GAP),
                y: startY + rowIdx * (CARD_H + ROW_GAP),
            });
        });
    });

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 overflow-auto">
            <div className="flex items-center gap-2 mb-3 px-2">
                <GitBranch className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-black text-gray-700 uppercase tracking-wide">Diagrama de Rede (PERT)</span>
                <span className="ml-auto flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 inline-block" /> caminho crítico</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-gray-300 inline-block" /> dependência</span>
                </span>
            </div>
            <svg width={width} height={height} className="min-w-full">
                <g>
                    {edges.map((e, i) => {
                        const from = pos.get(e.from);
                        const to = pos.get(e.to);
                        if (!from || !to) return null;
                        const x1 = from.x + CARD_W;
                        const y1 = from.y + CARD_H / 2;
                        const x2 = to.x;
                        const y2 = to.y + CARD_H / 2;
                        const midX = (x1 + x2) / 2;
                        return (
                            <path
                                key={i}
                                d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                                fill="none"
                                stroke={e.critical ? '#ef4444' : '#d1d5db'}
                                strokeWidth={e.critical ? 2 : 1.5}
                                markerEnd="url(#arrow)"
                            />
                        );
                    })}
                </g>
                <defs>
                    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca3af" />
                    </marker>
                </defs>
                <g>
                    {leaves.map(node => {
                        const p = pos.get(node.id);
                        if (!p) return null;
                        const sched = node.schedule;
                        return (
                            <g key={node.id} transform={`translate(${p.x}, ${p.y})`}>
                                <rect
                                    width={CARD_W}
                                    height={CARD_H}
                                    rx={10}
                                    fill={node.isCritical ? '#fef2f2' : '#f9fafb'}
                                    stroke={node.isCritical ? '#ef4444' : '#e5e7eb'}
                                    strokeWidth={node.isCritical ? 1.5 : 1}
                                />
                                <text x={10} y={18} className="text-[10px] font-black" fill={node.isCritical ? '#b91c1c' : '#374151'}>
                                    {node.wbsCode || ''} {node.isMilestone ? '◆' : ''}
                                </text>
                                <title>{node.name}</title>
                                <text x={10} y={33} fontSize={10} fontWeight={700} fill="#111827">
                                    {node.name.length > 24 ? `${node.name.slice(0, 24)}…` : node.name}
                                </text>
                                <text x={10} y={48} fontSize={9} fill="#6b7280">
                                    {fmtDate(sched?.earlyStart)} → {fmtDate(sched?.earlyFinish)}
                                </text>
                                <text x={10} y={60} fontSize={9} fill="#9ca3af">
                                    Folga: {sched?.totalFloat ?? '—'}d
                                </text>
                            </g>
                        );
                    })}
                </g>
            </svg>
        </div>
    );
};

export default NetworkDiagramView;
