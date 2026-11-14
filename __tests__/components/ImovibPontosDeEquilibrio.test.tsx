// @vitest-environment jsdom
/** Pontos de equilíbrio: margem-alvo vazia (pendência da Fase 2 do plano 2026-11-11). */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import ImovibPontosDeEquilibrioCard from '../../components/ImovibPontosDeEquilibrioCard';
import { baseStudy } from '../fixtures/imovibEstudos';

describe('margem-alvo', () => {
    it('vazia pede a margem em vez de dizer "Não existe"', async () => {
        const user = userEvent.setup();
        render(<ImovibPontosDeEquilibrioCard study={baseStudy() as never} />);
        await user.clear(screen.getByLabelText('Margem-alvo sobre o VGV (%)'));
        expect(screen.getByText('Informe a margem-alvo')).toBeTruthy();
        expect(screen.queryByText(/Não existe/)).toBeNull();
    });

    it('avisa o pai a cada margem digitada (o Excel usa a mesma)', async () => {
        const user = userEvent.setup();
        const onMargemAlvo = vi.fn();
        render(<ImovibPontosDeEquilibrioCard study={baseStudy() as never} margemAlvo="15" onMargemAlvo={onMargemAlvo} />);
        await user.type(screen.getByLabelText('Margem-alvo sobre o VGV (%)'), '0');
        expect(onMargemAlvo).toHaveBeenLastCalledWith('150');
    });
});
