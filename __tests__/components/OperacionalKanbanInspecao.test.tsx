// @vitest-environment jsdom
/**
 * Qualidade SiAC, fase 2 — Task 5: soltar uma OE em "Aprovada"/"Reprovada" no Kanban
 * (docs/planos/2026-11-26-qualidade-siac-fase2-implementacao.md, Task 5; decisão (d) do controlador).
 *
 * O banco recusa `approved`/`rejected` sem a validação que só a RPC "Aprovar inspeção" grava — então o
 * Kanban NÃO chama `transition`: abre a OE na aba Inspeção e avisa "Use Aprovar inspeção na tela da OE".
 * As demais colunas seguem chamando `transition` como antes.
 *
 * O arrastar do dnd-kit não roda no jsdom: o `DndContext` simulado guarda o `onDragEnd` e o teste o
 * chama com o par (cartão, coluna) — é exatamente o que o dnd-kit entrega ao soltar.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const dnd: { onDragEnd?: (e: unknown) => unknown } = {};
vi.mock('@dnd-kit/core', () => ({
    DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (e: unknown) => unknown }) => {
        dnd.onDragEnd = onDragEnd;
        return <>{children}</>;
    },
    DragOverlay: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    PointerSensor: function PointerSensor() { /* simulado */ },
    TouchSensor: function TouchSensor() { /* simulado */ },
    useSensor: () => ({}),
    useSensors: () => [],
    useDroppable: () => ({ setNodeRef: () => undefined }),
    useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => undefined, transform: null }),
}));
vi.mock('@dnd-kit/utilities', () => ({ CSS: { Translate: { toString: () => undefined } } }));

const OES = [
    { id: 'wo-insp', code: 'OE-1', title: 'Alvenaria', phase: null, type: 'own', status: 'pending_inspection', priority: 'normal',
        planned_start_date: null, planned_end_date: null, completion_pct: 100, planned_cost: null, actual_total_cost: 0, team_id: null },
    { id: 'wo-exec', code: 'OE-2', title: 'Reboco', phase: null, type: 'own', status: 'in_progress', priority: 'normal',
        planned_start_date: null, planned_end_date: null, completion_pct: 100, planned_cost: null, actual_total_cost: 0, team_id: null },
];
vi.mock('../../lib/supabase', () => {
    const q: Record<string, unknown> = {};
    Object.assign(q, {
        select: () => q, eq: () => q, order: () => q,
        then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: OES, error: null }).then(ok),
    });
    return { supabase: { from: () => q } };
});

const transition = vi.fn();
vi.mock('../../services/workOrderService', () => ({
    workOrderService: { transition: (...a: unknown[]) => transition(...a) },
}));

import OperacionalKanban from '../../components/OperacionalKanban';

const soltar = async (cartao: string, coluna: string) => {
    await act(async () => { await dnd.onDragEnd?.({ active: { id: cartao }, over: { id: coluna } }); });
};

beforeEach(() => {
    vi.clearAllMocks();
    transition.mockResolvedValue(undefined);
});

describe('OperacionalKanban — inspeção não se aprova arrastando', () => {
    it.each(['approved', 'rejected'])('soltar em %s não chama transition: abre a OE na aba Inspeção e avisa', async (coluna) => {
        const onViewDetail = vi.fn();
        render(<OperacionalKanban projectId="obra-1" orgId="org-spe" onViewDetail={onViewDetail} onCreateNew={vi.fn()} />);
        await screen.findByText('Alvenaria');
        await soltar('wo-insp', coluna);
        expect(transition).not.toHaveBeenCalled();
        expect(onViewDetail).toHaveBeenCalledWith('wo-insp', 'inspecao');
        expect(await screen.findByText('Use Aprovar inspeção na tela da OE')).toBeTruthy();
    });

    it('as outras colunas seguem chamando transition', async () => {
        const onViewDetail = vi.fn();
        render(<OperacionalKanban projectId="obra-1" orgId="org-spe" onViewDetail={onViewDetail} onCreateNew={vi.fn()} />);
        await screen.findByText('Reboco');
        await soltar('wo-exec', 'pending_inspection');
        expect(transition).toHaveBeenCalledWith('wo-exec', 'pending_inspection');
        expect(onViewDetail).not.toHaveBeenCalled();
    });
});
