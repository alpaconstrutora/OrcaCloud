// @vitest-environment jsdom
/**
 * Testes de componente para BudgetPickerModal.tsx — valida as 2 correções do Bug Audit:
 *
 * Correção 5: Campo `is_custom` substituído por `source: 'Própria'` e `isOverride: true`
 * Correção 6: Campos `unitCost`/`totalCost` removidos; `as BudgetEntry` cast eliminado
 *
 * Foco: verificar que onSelect recebe um BudgetEntry conforme a interface,
 * sem campos extras e com os campos corretos de SinapiItem.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import BudgetPickerModal from '../../components/BudgetPickerModal';
import { SinapiType } from '../../types';
import type { BudgetEntry, SinapiItem } from '../../types';

// ─── Mock de MaterialSelectionModal (controlável) ─────────────────────────────

// Guarda a referência ao onSelect do MaterialSelectionModal para disparar manualmente
let capturedMaterialOnSelect: ((selected: any[]) => void) | null = null;

vi.mock('../../components/MaterialSelectionModal', () => ({
    default: ({ isOpen, onSelect, item }: any) => {
        if (!isOpen) return null;
        capturedMaterialOnSelect = onSelect;
        return (
            <div data-testid="material-modal">
                <span data-testid="material-modal-item-code">{item?.code}</span>
                <button
                    data-testid="material-select-btn"
                    onClick={() => onSelect([{
                        code: 'INS-001',
                        description: 'Areia média',
                        unit: 'kg',
                        price: 12.5,
                        type: SinapiType.INPUT,
                        quantity: 10,
                        category: 'Material',
                        selectedQuantity: 5,
                    }])}
                >
                    Selecionar
                </button>
            </div>
        );
    },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeInputEntry = (): BudgetEntry => ({
    id: 'entry-input',
    sinapiItem: {
        code: 'INS-100',
        description: 'Cimento Portland',
        unit: 'kg',
        price: 8.5,
        type: SinapiType.INPUT,
        category: 'Material',
    },
    quantity: 10,
    phase: '01.01.',
    group: '01.',
});

const makeCompositionEntry = (): BudgetEntry => ({
    id: 'entry-comp',
    sinapiItem: {
        code: 'COMP-200',
        description: 'Alvenaria de Tijolo',
        unit: 'm²',
        price: 85.0,
        type: SinapiType.COMPOSITION,
        category: 'Serviço',
        composition: [
            { code: 'INS-001', description: 'Areia média', unit: 'kg', price: 12.5, type: SinapiType.INPUT, quantity: 10 },
        ],
    },
    quantity: 50,
    phase: '01.01.',
    group: '01.',
});

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('BudgetPickerModal — seleção de insumo simples (INPUT)', () => {
    beforeEach(() => {
        capturedMaterialOnSelect = null;
        vi.clearAllMocks();
    });

    it('renderiza itens do orçamento', () => {
        render(
            <BudgetPickerModal
                isOpen
                onClose={vi.fn()}
                onSelect={vi.fn()}
                budget={[makeInputEntry()]}
            />
        );
        expect(screen.getByText(/Cimento Portland/i)).toBeDefined();
    });

    it('chama onSelect com BudgetEntry correto ao clicar em item INPUT', () => {
        const onSelect = vi.fn();
        render(
            <BudgetPickerModal
                isOpen
                onClose={vi.fn()}
                onSelect={onSelect}
                budget={[makeInputEntry()]}
            />
        );

        fireEvent.click(screen.getByText(/Cimento Portland/i).closest('button')!);
        expect(onSelect).toHaveBeenCalledTimes(1);
        const received: BudgetEntry = onSelect.mock.calls[0][0];
        expect(received.id).toBe('entry-input');
        expect(received.sinapiItem.code).toBe('INS-100');
    });

    it('não exibe modal de materiais para item INPUT', () => {
        render(
            <BudgetPickerModal
                isOpen
                onClose={vi.fn()}
                onSelect={vi.fn()}
                budget={[makeInputEntry()]}
            />
        );
        expect(screen.queryByTestId('material-modal')).toBeNull();
    });
});

describe('BudgetPickerModal — seleção de insumo de COMPOSIÇÃO', () => {
    beforeEach(() => {
        capturedMaterialOnSelect = null;
        vi.clearAllMocks();
    });

    it('abre MaterialSelectionModal ao clicar em item COMPOSIÇÃO', async () => {
        render(
            <BudgetPickerModal
                isOpen
                onClose={vi.fn()}
                onSelect={vi.fn()}
                budget={[makeCompositionEntry()]}
            />
        );

        fireEvent.click(screen.getByText(/Alvenaria de Tijolo/i).closest('button')!);
        await waitFor(() => expect(screen.queryByTestId('material-modal')).not.toBeNull());
    });

    // ── Correção 5 & 6 ──────────────────────────────────────────────────────

    it('[Correção 5] sinapiItem NÃO tem campo is_custom (foi substituído por source/isOverride)', async () => {
        const onSelect = vi.fn();
        render(
            <BudgetPickerModal
                isOpen
                onClose={vi.fn()}
                onSelect={onSelect}
                budget={[makeCompositionEntry()]}
            />
        );

        fireEvent.click(screen.getByText(/Alvenaria de Tijolo/i).closest('button')!);
        await waitFor(() => screen.getByTestId('material-select-btn'));
        fireEvent.click(screen.getByTestId('material-select-btn'));

        expect(onSelect).toHaveBeenCalled();
        const received: any = onSelect.mock.calls[0][0];

        expect(received.sinapiItem).not.toHaveProperty('is_custom');
    });

    it('[Correção 5] sinapiItem tem source="Própria" e isOverride=true', async () => {
        const onSelect = vi.fn();
        render(
            <BudgetPickerModal
                isOpen
                onClose={vi.fn()}
                onSelect={onSelect}
                budget={[makeCompositionEntry()]}
            />
        );

        fireEvent.click(screen.getByText(/Alvenaria de Tijolo/i).closest('button')!);
        await waitFor(() => screen.getByTestId('material-select-btn'));
        fireEvent.click(screen.getByTestId('material-select-btn'));

        const received: BudgetEntry = onSelect.mock.calls[0][0];
        expect(received.sinapiItem.source).toBe('Própria');
        expect(received.sinapiItem.isOverride).toBe(true);
    });

    it('[Correção 6] BudgetEntry NÃO tem campos unitCost nem totalCost', async () => {
        const onSelect = vi.fn();
        render(
            <BudgetPickerModal
                isOpen
                onClose={vi.fn()}
                onSelect={onSelect}
                budget={[makeCompositionEntry()]}
            />
        );

        fireEvent.click(screen.getByText(/Alvenaria de Tijolo/i).closest('button')!);
        await waitFor(() => screen.getByTestId('material-select-btn'));
        fireEvent.click(screen.getByTestId('material-select-btn'));

        const received: any = onSelect.mock.calls[0][0];
        expect(received).not.toHaveProperty('unitCost');
        expect(received).not.toHaveProperty('totalCost');
    });

    it('[Correção 6] BudgetEntry tem apenas campos válidos da interface', async () => {
        const onSelect = vi.fn();
        render(
            <BudgetPickerModal
                isOpen
                onClose={vi.fn()}
                onSelect={onSelect}
                budget={[makeCompositionEntry()]}
            />
        );

        fireEvent.click(screen.getByText(/Alvenaria de Tijolo/i).closest('button')!);
        await waitFor(() => screen.getByTestId('material-select-btn'));
        fireEvent.click(screen.getByTestId('material-select-btn'));

        const received: BudgetEntry = onSelect.mock.calls[0][0];

        // Campos obrigatórios da interface BudgetEntry
        expect(received).toHaveProperty('id');
        expect(received).toHaveProperty('sinapiItem');
        expect(received).toHaveProperty('quantity');
        expect(received).toHaveProperty('phase');
        expect(received).toHaveProperty('group');

        // sinapiItem deve ter os campos corretos do insumo selecionado
        expect(received.sinapiItem.code).toBe('INS-001');
        expect(received.sinapiItem.description).toBe('Areia média');
        expect(received.sinapiItem.unit).toBe('kg');
        expect(received.sinapiItem.price).toBe(12.5);
        expect(received.sinapiItem.type).toBe(SinapiType.INPUT);
        expect(received.quantity).toBe(5); // selectedQuantity do mock
    });

    it('[Correção 6] price no sinapiItem usa insumo.price, não campo legado', async () => {
        const onSelect = vi.fn();
        render(
            <BudgetPickerModal
                isOpen
                onClose={vi.fn()}
                onSelect={onSelect}
                budget={[makeCompositionEntry()]}
            />
        );

        fireEvent.click(screen.getByText(/Alvenaria de Tijolo/i).closest('button')!);
        await waitFor(() => screen.getByTestId('material-select-btn'));
        fireEvent.click(screen.getByTestId('material-select-btn'));

        const received: BudgetEntry = onSelect.mock.calls[0][0];
        expect(received.sinapiItem.price).toBe(12.5);
    });

    it('fecha o picker após selecionar insumo de composição', async () => {
        const onClose = vi.fn();
        render(
            <BudgetPickerModal
                isOpen
                onClose={onClose}
                onSelect={vi.fn()}
                budget={[makeCompositionEntry()]}
            />
        );

        fireEvent.click(screen.getByText(/Alvenaria de Tijolo/i).closest('button')!);
        await waitFor(() => screen.getByTestId('material-select-btn'));
        fireEvent.click(screen.getByTestId('material-select-btn'));

        expect(onClose).toHaveBeenCalled();
    });
});

describe('BudgetPickerModal — filtro de busca', () => {
    it('filtra itens por descrição', () => {
        render(
            <BudgetPickerModal
                isOpen
                onClose={vi.fn()}
                onSelect={vi.fn()}
                budget={[makeInputEntry(), makeCompositionEntry()]}
            />
        );

        const searchInput = screen.getByPlaceholderText(/buscar/i);
        fireEvent.change(searchInput, { target: { value: 'cimento' } });

        expect(screen.getByText(/Cimento Portland/i)).toBeDefined();
        expect(screen.queryByText(/Alvenaria/i)).toBeNull();
    });

    it('exibe mensagem quando nenhum item é encontrado', () => {
        render(
            <BudgetPickerModal
                isOpen
                onClose={vi.fn()}
                onSelect={vi.fn()}
                budget={[makeInputEntry()]}
            />
        );

        fireEvent.change(screen.getByPlaceholderText(/buscar/i), {
            target: { value: 'xyzxyz' },
        });

        expect(screen.getByText(/nenhum item encontrado/i)).toBeDefined();
    });

    it('não renderiza quando isOpen=false', () => {
        const { container } = render(
            <BudgetPickerModal
                isOpen={false}
                onClose={vi.fn()}
                onSelect={vi.fn()}
                budget={[makeInputEntry()]}
            />
        );
        expect(container.firstChild).toBeNull();
    });
});
