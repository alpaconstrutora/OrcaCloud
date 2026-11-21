// @vitest-environment jsdom
/**
 * Engenharia › Planejamento — data editável da grade (`CampoDataDaGrade`, 21/11/2026 —
 * *"Padronizar fonte. Exemplo data de inicio e data de termino com tamanhos diferentes."*).
 *
 * O que interessa provar: a célula mostra a data como TEXTO em `text-xs` (o mesmo das
 * outras células — antes o `<input type="date">` saía em 14px com o ano de 4 dígitos) e
 * a troca pelo campo nativo continua chegando ao `onChange`.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CampoDataDaGrade from '../../components/schedule/CampoDataDaGrade';

afterEach(cleanup);

describe('CampoDataDaGrade', () => {
    it('mostra o texto formatado em text-xs e o campo nativo fica invisível', () => {
        render(<CampoDataDaGrade value="2026-08-01" texto="01/08/26" onChange={() => {}} />);
        const texto = screen.getByText('01/08/26');
        expect(texto.className).toContain('text-xs');
        const campo = screen.getByLabelText('Alterar data') as HTMLInputElement;
        expect(campo.type).toBe('date');
        expect(campo.value).toBe('2026-08-01');
        expect(campo.className).toContain('opacity-0');
    });

    it('a troca no campo nativo chega ao onChange com YYYY-MM-DD', () => {
        const onChange = vi.fn();
        render(<CampoDataDaGrade value="2026-08-01" texto="01/08/26" onChange={onChange} />);
        fireEvent.change(screen.getByLabelText('Alterar data'), { target: { value: '2026-08-15' } });
        expect(onChange).toHaveBeenCalledWith('2026-08-15');
    });

    it('sem data mostra "-"', () => {
        render(<CampoDataDaGrade value="" texto="" onChange={() => {}} />);
        expect(screen.getByText('-')).toBeTruthy();
    });
});
