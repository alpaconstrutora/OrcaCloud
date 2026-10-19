// @vitest-environment jsdom
/**
 * HierarchicalSelect › `manterOrdem` (19/10/2026): catálogo sem código cuja ordem tem sentido
 * (campos do .docx) não pode virar ordem alfabética; sem a prop, nada muda para quem já usa.
 * Plano: docs/planos/2026-10-19-modelos-mapeamento-gaveta.md
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import HierarchicalSelect, { HierarchicalSelectItem } from '../../components/HierarchicalSelect';
import { ConfirmProvider } from '../../components/ui/confirm';

const ITENS: HierarchicalSelectItem[] = [
    { id: 'g:z', name: 'Zeta grupo', selecionavel: false },
    { id: 'z.nome', name: 'Nome', parentId: 'g:z', parentName: 'Zeta grupo' },
    { id: 'z.cpf', name: 'CPF', parentId: 'g:z', parentName: 'Zeta grupo' },
    { id: 'g:a', name: 'Alfa grupo', selecionavel: false },
    { id: 'a.nome', name: 'Bairro', parentId: 'g:a', parentName: 'Alfa grupo' },
];

const ordemNaTela = (manterOrdem: boolean) => {
    const { unmount } = render(
        <ConfirmProvider>
            <HierarchicalSelect items={ITENS} value="" onChange={() => {}} panelVariant="drawer" manterOrdem={manterOrdem} placeholder="—" />
        </ConfirmProvider>,
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByTitle('Expandir todos os grupos'));
    const nomes = ['Zeta grupo', 'Nome', 'CPF', 'Alfa grupo', 'Bairro']
        .map(n => ({ n, y: [...document.body.querySelectorAll('span')].findIndex(s => s.textContent === n) }))
        .sort((a, b) => a.y - b.y).map(x => x.n);
    unmount();
    return nomes;
};

describe('HierarchicalSelect › manterOrdem', () => {
    it('com a prop: a ordem em que os itens chegaram', () => {
        expect(ordemNaTela(true)).toEqual(['Zeta grupo', 'Nome', 'CPF', 'Alfa grupo', 'Bairro']);
    });

    it('sem a prop: ordem alfabética de sempre (nenhum uso existente muda)', () => {
        expect(ordemNaTela(false)).toEqual(['Alfa grupo', 'Bairro', 'Zeta grupo', 'CPF', 'Nome']);
    });
});
