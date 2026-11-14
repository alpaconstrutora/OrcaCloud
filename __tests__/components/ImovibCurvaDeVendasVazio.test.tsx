// @vitest-environment jsdom
/**
 * Gráfico da curva de vendas sem vendas: a mensagem diz a causa certa
 * (pendência das Fases 1/2 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import ImovibCurvaDeVendasCard from '../../components/ImovibCurvaDeVendasCard';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';
import { computeImovibMath } from '../../utils/imovibMotor';
import { baseStudy } from '../fixtures/imovibEstudos';

const tela = (over: Record<string, unknown>) => {
    const study = { ...baseStudy(over), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' } as never;
    render(
        <ImovibEdicaoProvider value={{ pode: true, motivo: '' }}>
            <ImovibCurvaDeVendasCard study={study} math={computeImovibMath(study) as never} salvar={vi.fn()} />
        </ImovibEdicaoProvider>,
    );
};

describe('curva de vendas sem vendas', () => {
    it('VSO 0%: culpa a VSO, não o preço', () => {
        tela({ sales_curve_type: 'vso', sales_vso_percent: 0 });
        expect(screen.getByText(/VSO de 0%/)).toBeTruthy();
        expect(screen.queryByText(/informe o preço/)).toBeNull();
    });

    it('permuta de 100%: diz que não sobra VGV para vender', () => {
        tela({ swap_physical_percent: 100 });
        expect(screen.getByText(/permuta/i)).toBeTruthy();
        expect(screen.queryByText(/VSO de 0%/)).toBeNull();
    });

    it('sem preço: pede o preço', () => {
        tela({ blocks: [] , capex_simplified_area_sqm: 0, price_per_sqm: 0 });
        expect(screen.getByText(/informe o preço/)).toBeTruthy();
    });
});

describe('curva de vendas com vendas', () => {
    it('gráfico com role=img e os números no nome (§28)', () => {
        tela({});
        expect(screen.getByRole('img', { name: /Vendas por mês: R\$/ })).toBeTruthy();
    });
});
