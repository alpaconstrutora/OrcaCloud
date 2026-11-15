// @vitest-environment jsdom
/**
 * Controladoria › DRE — os números na tela são SEMPRE os do filtro na tela
 * (plano docs/planos/2026-11-14-controladoria-critica.md, passo 1).
 *
 * Crítica de 14/11/2026: com o período em 2010–2010, a DRE mostrava R$ 663 mil de
 * receita — a resposta de uma carga anterior (digitar o ano passa por 0201…) chegou
 * depois da última e ficou na tela. Reproduzido 2× em produção.
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { DRESummary, DREProjectSummary } from '../../types/financial';

type Adiada<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function adiada<T>(): Adiada<T> {
    let resolve!: (v: T) => void, reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function resumo(receita: number, receitaLiquida = receita, resultado = 0): DRESummary {
    return {
        period_from: '', period_to: '', lines: [], detail: [],
        receita_bruta: receita, receita_liquida: receitaLiquida, lucro_bruto: resultado,
        ebitda: resultado, resultado_liquido: resultado,
        margem_bruta_pct: receitaLiquida > 0 ? resultado / receitaLiquida * 100 : null,
        margem_ebitda_pct: receitaLiquida > 0 ? resultado / receitaLiquida * 100 : null,
        margem_liquida_pct: receitaLiquida > 0 ? resultado / receitaLiquida * 100 : null,
    } as DRESummary;
}

const svc = vi.hoisted(() => ({
    getDRESummary: vi.fn(),
    getDREByProject: vi.fn(),
    listObras: vi.fn(),
}));
vi.mock('../../services/financialReportService', () => ({ financialReportService: svc }));
// showToast estável, como no app (useCallback em hooks/useToast.ts): uma função nova a
// cada render recriaria o `load` e dispararia cargas extras que o app não faz.
const toast = vi.hoisted(() => ({ showToast: () => {}, localToast: null }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => toast }));

import DREReport from '../../components/DREReport';

const ano = new Date().getFullYear();

beforeEach(() => {
    svc.getDRESummary.mockReset();
    svc.getDREByProject.mockReset().mockResolvedValue([]);
    svc.listObras.mockReset().mockResolvedValue([]);
});

describe('DRE — resposta fora de ordem', () => {
    it('a resposta antiga que chega por último NÃO substitui a do filtro atual', async () => {
        const antiga = adiada<DRESummary>();
        const atual = adiada<DRESummary>();
        svc.getDRESummary.mockReturnValueOnce(antiga.promise).mockReturnValueOnce(atual.promise);

        render(<DREReport organizationId="org-1" />);
        await waitFor(() => expect(svc.getDRESummary).toHaveBeenCalledTimes(1));

        fireEvent.change(screen.getByDisplayValue(`${ano}-01-01`), { target: { value: '2010-01-01' } });
        await waitFor(() => expect(svc.getDRESummary).toHaveBeenCalledTimes(2));

        await act(async () => { atual.resolve(resumo(222)); });
        await act(async () => { antiga.resolve(resumo(663388)); });

        expect(await screen.findAllByText('R$ 222,00')).not.toHaveLength(0);
        expect(screen.queryByText('R$ 663.388,00')).toBeNull();
    });
});

describe('DRE — período inválido não consulta', () => {
    it('início depois do fim: diz o motivo e não chama o banco', async () => {
        svc.getDRESummary.mockResolvedValue(resumo(100));
        render(<DREReport organizationId="org-1" />);
        await waitFor(() => expect(svc.getDRESummary).toHaveBeenCalledTimes(1));

        fireEvent.change(screen.getByDisplayValue(`${ano}-01-01`), { target: { value: `${ano + 1}-06-01` } });

        expect(await screen.findByText('A data inicial é depois da final.')).toBeTruthy();
        expect(svc.getDRESummary).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('R$ 100,00')).toBeNull();
    });
});

describe('DRE — falha', () => {
    it('mostra "Tentar de novo" no lugar dos números, e tentar de novo carrega', async () => {
        svc.getDRESummary.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(resumo(4000));
        render(<DREReport organizationId="org-1" />);

        const botao = await screen.findByRole('button', { name: 'Tentar de novo' });
        expect(screen.getByRole('alert').textContent).toContain('Não foi possível carregar a DRE');

        fireEvent.click(botao);
        expect(await screen.findAllByText('R$ 4.000,00')).not.toHaveLength(0);
        expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
    });
});

describe('DRE — margem', () => {
    it('sem receita líquida: "Margem: —" sem seta (nem cor de "piorou")', async () => {
        svc.getDRESummary.mockResolvedValue(resumo(0, 0, -5021.18));
        render(<DREReport organizationId="org-1" />);
        const margens = await screen.findAllByText('Margem: —');
        expect(margens).toHaveLength(3);
        for (const m of margens) expect(m.querySelector('svg')).toBeNull();
    });

    it('margem em pt-BR, com vírgula', async () => {
        svc.getDRESummary.mockResolvedValue(resumo(4000, 4000, -2000));
        render(<DREReport organizationId="org-1" />);
        expect(await screen.findAllByText(/Margem: -50,0%/)).toHaveLength(3);
    });
});

describe('DRE › Por Obra', () => {
    const linhas: DREProjectSummary[] = [
        { project_id: 'obra-1', project_name: 'Garden', receita: 4000, custo: 3002.90, margem: 997.10,
          receita_prev: 0, custo_prev: 0, receita_liquida: 4000, margem_pct: 24.9275 },
        { project_id: null, project_name: 'Sem obra', receita: 0, custo: 6018.28, margem: -6018.28,
          receita_prev: 0, custo_prev: 0, receita_liquida: 0, margem_pct: null },
    ];

    it('pede o "Por Obra" no MESMO regime da DRE', async () => {
        svc.getDRESummary.mockResolvedValue(resumo(4000, 4000, -5021.18));
        render(<DREReport organizationId="org-1" />);
        await waitFor(() => expect(svc.getDREByProject).toHaveBeenCalledWith('org-1', `${ano}-01-01`, `${ano}-12-31`, 'CAIXA'));

        fireEvent.change(screen.getByDisplayValue('Caixa'), { target: { value: 'COMPETENCIA' } });
        await waitFor(() => expect(svc.getDREByProject).toHaveBeenLastCalledWith('org-1', `${ano}-01-01`, `${ano}-12-31`, 'COMPETENCIA'));
    });

    it('"Sem obra" aparece, não abre DRE de obra, e o Total fecha com o Resultado Líquido', async () => {
        svc.getDRESummary.mockResolvedValue(resumo(4000, 4000, -5021.18));
        svc.getDREByProject.mockResolvedValue(linhas);
        render(<DREReport organizationId="org-1" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Por Obra' }));

        const semObra = (await screen.findByText('Sem obra')).closest('tr')!;
        expect(semObra.getAttribute('title')).not.toBe('Ver DRE desta obra');
        expect(semObra.className).not.toContain('cursor-pointer');

        const total = screen.getByText('Total').closest('tr')!;
        // Receita | Custos e despesas | Resultado | Margem %
        // Intl põe espaço rígido depois de "R$"; normaliza para comparar.
        const celulas = [...total.querySelectorAll('td')].map(td => td.textContent?.replace(/\s+/g, ' ').trim());
        expect(celulas).toEqual(['Total', 'R$ 4.000,00', 'R$ 9.021,18', '-R$ 5.021,18', '-125,5%']);
    });
});
