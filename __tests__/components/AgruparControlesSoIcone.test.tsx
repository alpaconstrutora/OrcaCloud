// @vitest-environment jsdom
/**
 * "Ordem dos grupos" só com o ícone (`direcaoSoIcone`) — Conciliação › Pendentes, pedido de
 * 23/11/2026 ("remover o texto do botão ordem dos grupos"). Sem texto, o sentido mora no
 * `title`/`aria-label`; sem agrupamento, desligado e dizendo o porquê (§6.12).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { AgruparControles, MOTIVO_SEM_ORDEM_DOS_GRUPOS } from '../../components/ui/Agrupamento';

function montar(campo: 'none' | 'categoria', direcao: 'asc' | 'desc', onDirecao = vi.fn()) {
    render(
        <AgruparControles
            opcoes={[{ value: 'categoria', label: 'Categoria' }]}
            campo={campo}
            onCampo={vi.fn()}
            direcao={direcao}
            onDirecao={onDirecao}
            direcaoSoIcone
            chavesDosGrupos={[]}
            algumRecolhido={false}
            onAlternarTodos={vi.fn()}
            title="Agrupar os extratos"
        />,
    );
    return onDirecao;
}

describe('AgruparControles › ordem dos grupos só com ícone', () => {
    it('é um botão sem texto; o sentido fica no title e no nome acessível', () => {
        montar('categoria', 'asc');
        const botao = screen.getByRole('button', { name: 'Ordem dos grupos: Crescente' });
        expect(botao.textContent).toBe('');
        expect(botao.getAttribute('title')).toContain('Crescente');
        expect(screen.queryByText('Crescente')).toBeNull();
    });

    it('clique inverte o sentido', () => {
        const asc = montar('categoria', 'asc');
        fireEvent.click(screen.getByRole('button', { name: 'Ordem dos grupos: Crescente' }));
        expect(asc).toHaveBeenCalledWith('desc');
    });

    it('sem agrupamento fica desligado com o motivo', () => {
        montar('none', 'desc');
        const botao = screen.getByRole('button', { name: 'Ordem dos grupos: Decrescente' }) as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        expect(botao.getAttribute('title')).toBe(MOTIVO_SEM_ORDEM_DOS_GRUPOS);
    });
});
