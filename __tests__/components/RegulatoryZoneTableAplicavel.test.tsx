// @vitest-environment jsdom
/**
 * Tabela de zonas — coluna "Aplicável" (plano docs/planos/2026-10-26-zona-aplicavel-do-empreendimento.md).
 *
 * Pedido: "como seleciono um item do mapa regulatorio?". A tabela do empreendimento ganha
 * uma 1ª coluna de rádio; a do cadastro da cidade (sem a prop) fica como era. E o select
 * de macroárea/zona passa a mostrar o valor gravado fora da lista (Cambuí tem "ZM1",
 * "ZV - Eixo Vert.", "Industrialização e Desenvolvimento Econômico" — saíam "—").
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import RegulatoryZoneTable from '../../components/RegulatoryZoneTable';

const ZONAS = [
    { id: 'z1', macroarea: 'Urbanização Consolidada', zona: 'ZEPEC 2', ca_basico: '3' },
    { id: 'z2', macroarea: 'Industrialização e Desenvolvimento Econômico', zona: 'ZV - Eixo Vert.' },
];

const montar = (extra: Partial<React.ComponentProps<typeof RegulatoryZoneTable>> = {}) => render(
    <RegulatoryZoneTable
        tableId={`t-${Math.random()}`}
        title="Mapa Regulatório"
        subtitle="sub"
        zones={ZONAS}
        loading={false}
        adding={false}
        savingId={null}
        onAdd={() => {}}
        onUpdate={() => {}}
        onDelete={() => {}}
        {...extra}
    />,
);

beforeEach(() => { localStorage.clear(); });

describe('RegulatoryZoneTable — zona aplicável', () => {
    it('sem a prop (cadastro da cidade): nenhuma coluna "Aplicável"', () => {
        montar();
        expect(screen.queryByRole('columnheader', { name: /Aplicável/ })).toBeNull();
        expect(screen.queryAllByRole('radio')).toHaveLength(0);
    });

    it('com a prop: um rádio por zona, o marcado vem marcado e o cabeçalho diz qual é', () => {
        montar({ aplicavel: { zonaId: 'z1', onMarcar: vi.fn() } });
        const radios = screen.getAllByRole('radio');
        expect(radios).toHaveLength(2);
        expect((radios[0] as HTMLInputElement).checked).toBe(true);
        expect((radios[1] as HTMLInputElement).checked).toBe(false);
        expect(screen.getByText(/Zona aplicável:/).textContent).toMatch(/ZEPEC 2 · Urbanização Consolidada/);
    });

    it('clicar no rádio de outra zona marca ela', () => {
        const onMarcar = vi.fn();
        montar({ aplicavel: { zonaId: 'z1', onMarcar } });
        fireEvent.click(screen.getAllByRole('radio')[1]);
        expect(onMarcar).toHaveBeenCalledWith('z2');
    });

    it('nenhuma marcada: o cabeçalho diz como marcar', () => {
        montar({ aplicavel: { zonaId: null, onMarcar: vi.fn() } });
        expect(screen.getByText(/Nenhuma zona marcada como aplicável/)).toBeTruthy();
    });

    it('a marcada tem botão para desmarcar', () => {
        const onMarcar = vi.fn();
        montar({ aplicavel: { zonaId: 'z1', onMarcar } });
        fireEvent.click(screen.getByRole('button', { name: /Desmarcar/ }));
        expect(onMarcar).toHaveBeenCalledWith(null);
    });

    it('só leitura: rádio travado', () => {
        montar({ aplicavel: { zonaId: 'z1', onMarcar: vi.fn() }, somenteLeitura: 'Sem permissão' });
        for (const r of screen.getAllByRole('radio')) expect((r as HTMLInputElement).disabled).toBe(true);
    });
});

describe('RegulatoryZoneTable — valor fora da lista de opções', () => {
    it('o select mostra o valor gravado, não "—"', () => {
        montar();
        const linha = screen.getAllByRole('row')[2]; // [0] cabeçalho, [1] z1, [2] z2
        const selects = within(linha).getAllByRole('combobox') as HTMLSelectElement[];
        expect(selects[0].value).toBe('Industrialização e Desenvolvimento Econômico');
        expect(selects[1].value).toBe('ZV - Eixo Vert.');
    });
});
