// @vitest-environment jsdom
/**
 * Aviso de Premissas abre a sub-aba que corrige (pendência da Fase 5 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): antes abria sempre em Identificação.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import ImovibAvisosBanner from '../../components/ImovibAvisosBanner';
import { computeImovibMath } from '../../utils/imovibMotor';
import { baseStudy, rubrica } from '../fixtures/imovibEstudos';

describe('aviso → sub-aba de Premissas', () => {
    it('o motor diz a sub-aba dos avisos de cronograma e de terreno', () => {
        const r = computeImovibMath(baseStudy({
            construction_start_month: 1,
            land_payment_schedule: [{ month: 1, percent: 50 }],
            capex_items: [{ ...rubrica('2. Projetos e Consultorias', 'Projeto', 'currency', 100_000, 'obra'), timing: 'pre_obra' }],
        }));
        expect(r.avisos.find(a => a.codigo === 'pre_obra_sem_meses')?.subAba).toBe('cronograma');
        expect(r.avisos.find(a => a.codigo === 'terreno_nao_soma_100')?.subAba).toBe('terreno');
    });

    it('o botão "Corrigir" leva a aba e a sub-aba', async () => {
        const user = userEvent.setup();
        const onIrPara = vi.fn();
        render(<ImovibAvisosBanner avisos={[{ codigo: 'pre_obra_sem_meses', mensagem: 'x', aba: 'premises', subAba: 'cronograma' }]} onIrPara={onIrPara} />);
        await user.click(screen.getByRole('button', { name: /Corrigir em Premissas › Cronograma/ }));
        expect(onIrPara).toHaveBeenCalledWith('premises', 'cronograma');
    });
});
