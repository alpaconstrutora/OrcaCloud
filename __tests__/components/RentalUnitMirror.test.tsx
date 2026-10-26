// @vitest-environment jsdom
/**
 * Espelho das unidades (Locações › Análise, overdrive 26/10/2026) — o que um
 * usuário de teclado e um leitor de tela precisam conseguir fazer.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RentalUnitMirror from '../../components/rentals/RentalUnitMirror';
import type { RentalAnalysisScope } from '../../lib/rentalByEmpreendimento';
import type { UnitMirrorCell } from '../../lib/rentalUnitMirror';

const cel = (id: string, floor: number, extra: Partial<UnitMirrorCell> = {}): UnitMirrorCell => ({
    id, parentId: 'predio', name: `Sala - ${id}`, label: id, block: 'TORRE A', floor,
    status: 'rented', vacantDays: null, vacancyApproximate: false, contracted: 1000, base: 1000,
    privateArea: 40, overdue: 0, overdue90: 0, overdueByContract: [], contractUnits: 1, expiresWithin90: false,
    ...extra,
});

const units = [
    cel('301', 3, { overdue: 500, overdue90: 500 }),
    cel('302', 3),
    cel('201', 2, { status: 'available', vacantDays: 120, contracted: 0 }),
    cel('202', 2),
];

const scope = { empreendimentoId: 'emp', name: 'Galeria', units, unitsCount: 4, rentedCount: 3 } as unknown as RentalAnalysisScope;

const montar = (over: Partial<React.ComponentProps<typeof RentalUnitMirror>> = {}) => {
    const props = {
        scope, rows: [scope], isAll: false, leitura: 'operacao' as const, destaque: 'nenhum' as const,
        onDestaque: vi.fn(), onSelectEmpreendimento: vi.fn(), onOpenUnit: vi.fn(), ...over,
    };
    render(<RentalUnitMirror {...props} />);
    return props;
};

describe('RentalUnitMirror', () => {
    it('cada unidade é um botão com a frase inteira (status, dias de vaga, atraso)', () => {
        montar();
        expect(screen.getByRole('button', { name: /Sala - 301 .*em atraso R\$\s?500/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Sala - 201 .*vaga há 120 dias/ })).toBeTruthy();
    });

    it('destaque sem nenhuma unidade fica desligado e diz por quê', () => {
        montar();
        const vence = screen.getByRole('radio', { name: /Vencem em 90 dias/ });
        expect(vence).toBeDisabled();
        expect(vence.getAttribute('title')).toMatch(/Nenhum contrato vence/);
        expect(screen.getByRole('radio', { name: /Vagas há > 90 dias 1/ })).not.toBeDisabled();
    });

    it('Tab entra uma vez; setas andam pela unidade e pelo andar', () => {
        montar();
        const c301 = screen.getByRole('button', { name: /Sala - 301/ });
        expect(c301.tabIndex).toBe(0);
        expect(screen.getByRole('button', { name: /Sala - 302/ }).tabIndex).toBe(-1);
        c301.focus();
        fireEvent.keyDown(c301, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(screen.getByRole('button', { name: /Sala - 302/ }));
        fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(screen.getByRole('button', { name: /Sala - 202/ }));
    });

    it('clique numa unidade abre a torre dela', () => {
        const p = montar();
        fireEvent.click(screen.getByRole('button', { name: /Sala - 202/ }));
        expect(p.onOpenUnit).toHaveBeenCalledWith(expect.objectContaining({ id: '202', parentId: 'predio' }));
    });

    it('em "Todos", o prédio é um botão que recorta a aba', () => {
        const p = montar({ isAll: true });
        fireEvent.click(screen.getByRole('button', { name: /Galeria: 3 de 4 unidades alugadas, 1 com atraso/ }));
        expect(p.onSelectEmpreendimento).toHaveBeenCalledWith('emp');
    });

    it('destaque que ficou sem unidade volta a "nenhum" sozinho', () => {
        const p = montar({ destaque: 'vence90' });
        expect(p.onDestaque).toHaveBeenCalledWith('nenhum');
    });
});
