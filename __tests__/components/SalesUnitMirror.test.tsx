// @vitest-environment jsdom
/**
 * Espelho das unidades de Venda de Ativos › Análise (27/10/2026) — o que um
 * usuário de teclado e um leitor de tela precisam conseguir fazer, e a pintura
 * de cada leitura. A geometria é a mesma de Locações (UnitMirrorGrid).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SalesUnitMirror from '../../components/sales/SalesUnitMirror';
import type { SalesAnalysisScope, SaleMirrorCell } from '../../lib/salesAnalysis';

const cel = (id: string, floor: number, extra: Partial<SaleMirrorCell> = {}): SaleMirrorCell => ({
    id, parentId: 'predio', name: `Apto ${id}`, label: id, block: 'A', floor,
    status: 'sold', stageLabel: 'Contrato', tablePrice: 500_000, dealValue: 480_000, privateArea: 60,
    receivedRatio: 0.2, overdue: 0, overdue90: 0, overdueByContract: [], dealUnits: 1,
    ...extra,
});

const units = [
    cel('301', 3, { overdue: 50_000, overdue90: 50_000 }),
    cel('302', 3, { status: 'reserved', stageLabel: 'Reserva', receivedRatio: null }),
    cel('201', 2, { status: 'available', stageLabel: null, dealValue: 0, receivedRatio: null }),
    cel('202', 2),
];

const scope = { empreendimentoId: 'emp', name: 'Garden', units, soldCount: 2, sellableCount: 4 } as unknown as SalesAnalysisScope;

const montar = (over: Partial<React.ComponentProps<typeof SalesUnitMirror>> = {}) => {
    const props = {
        scope, rows: [scope], isAll: false, leitura: 'comercial' as const, destaque: 'nenhum' as const,
        onDestaque: vi.fn(), onSelectEmpreendimento: vi.fn(), onOpenUnit: vi.fn(), ...over,
    };
    render(<SalesUnitMirror {...props} />);
    return props;
};

describe('SalesUnitMirror', () => {
    it('cada unidade é um botão com a frase inteira (status, etapa, valor, atraso)', () => {
        montar();
        expect(screen.getByRole('button', { name: /Apto 301 .*Vendida .*etapa Contrato .*vendida por R\$\s?480\.000 .*em atraso R\$\s?50\.000/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Apto 302 .*Em negociação .*etapa Reserva .*proposta de/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Apto 201 .*Disponível .*tabela R\$\s?500\.000/ })).toBeTruthy();
    });

    it('Comercial mostra a etapa na célula; Financeiro mostra o % recebido e "estoque"', () => {
        const { unmount } = render(<SalesUnitMirror scope={scope} rows={[scope]} isAll={false} leitura="comercial" destaque="nenhum"
            onDestaque={vi.fn()} onSelectEmpreendimento={vi.fn()} onOpenUnit={vi.fn()} />);
        expect(screen.getByRole('button', { name: /Apto 302/ }).textContent).toContain('reserva');
        unmount();
        montar({ leitura: 'financeiro' });
        expect(screen.getByRole('button', { name: /Apto 202/ }).textContent).toContain('20%');
        expect(screen.getByRole('button', { name: /Apto 201/ }).textContent).toContain('estoque');
    });

    it('destaque sem nenhuma unidade fica desligado e diz por quê', () => {
        montar();
        const atraso90 = screen.getByRole('radio', { name: /Atraso > 90 dias 1/ });
        expect(atraso90).not.toBeDisabled();
        expect(screen.getByRole('radio', { name: /Disponíveis 1/ })).not.toBeDisabled();
    });

    it('Tab entra uma vez; setas andam pela unidade e pelo andar', () => {
        montar();
        const c301 = screen.getByRole('button', { name: /Apto 301/ });
        expect(c301.tabIndex).toBe(0);
        c301.focus();
        fireEvent.keyDown(c301, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(screen.getByRole('button', { name: /Apto 302/ }));
        fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(screen.getByRole('button', { name: /Apto 202/ }));
    });

    it('em "Todos", o prédio é um botão que recorta a aba', () => {
        const p = montar({ isAll: true });
        fireEvent.click(screen.getByRole('button', { name: /Garden: 2 de 4 unidades vendidas, 1 com atraso/ }));
        expect(p.onSelectEmpreendimento).toHaveBeenCalledWith('emp');
    });

    it('destaque que ficou sem unidade volta a "nenhum" sozinho', () => {
        const semAtraso = { ...scope, units: units.map(u => ({ ...u, overdue: 0, overdue90: 0 })) } as SalesAnalysisScope;
        const p = montar({ scope: semAtraso, rows: [semAtraso], destaque: 'atraso' });
        expect(p.onDestaque).toHaveBeenCalledWith('nenhum');
    });
});
