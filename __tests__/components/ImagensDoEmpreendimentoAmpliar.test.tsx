// @vitest-environment jsdom
// "Imagens do empreendimento" ampliam ao clicar (24/11/2026). ApresentacaoDaOportunidade é a MESMA tela para o
// gestor (Oportunidades › Detalhes) e para o investidor (Portal do Investidor › Oportunidades › Apresentação).
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ApresentacaoDaOportunidade from '../../components/investor/ApresentacaoDaOportunidade';

const op = {
    title: 'Garden 01',
    status: 'viabilidade',
    opportunity_type: 'incorporacao',
    captacaoReal: { meta: null },
    fotos: [
        { url: 'https://exemplo.test/planta-1.jpg', legenda: 'Planta — Tipo 1' },
        { url: 'https://exemplo.test/planta-2.jpg', legenda: 'Planta — Tipo 2' },
    ],
} as any;

describe('Imagens do empreendimento — ampliar', () => {
    it('clicar na imagem abre o visualizador nela; setas trocam; Esc fecha', () => {
        render(<ApresentacaoDaOportunidade op={op} semSimulador />);
        expect(screen.queryByRole('dialog')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Ampliar Planta — Tipo 2' }));
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect((screen.getByTestId('visualizador-imagem') as HTMLImageElement).src).toBe('https://exemplo.test/planta-2.jpg');
        expect(screen.getByTestId('visualizador-posicao').textContent).toContain('2 de 2');

        fireEvent.keyDown(window, { key: 'ArrowRight' });
        expect((screen.getByTestId('visualizador-imagem') as HTMLImageElement).src).toBe('https://exemplo.test/planta-1.jpg');
        fireEvent.click(screen.getByRole('button', { name: 'Imagem anterior' }));
        expect(screen.getByTestId('visualizador-posicao').textContent).toContain('2 de 2');

        expect(screen.getByRole('link', { name: /Tamanho real/ }).getAttribute('href')).toBe('https://exemplo.test/planta-2.jpg');

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('botão Fechar fecha', () => {
        render(<ApresentacaoDaOportunidade op={op} semSimulador />);
        fireEvent.click(screen.getByRole('button', { name: 'Ampliar Planta — Tipo 1' }));
        fireEvent.click(screen.getByRole('button', { name: 'Fechar a imagem' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
