// @vitest-environment jsdom
/**
 * Controladoria — acessibilidade AA pelo teclado e pelo leitor de tela (plano
 * docs/planos/2026-11-14-controladoria-critica.md, passo 5; PRODUCT.md: "WCAG AA
 * com teclado completo — inclusive linha de tabela clicável e alternadores").
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })), getSession: vi.fn(async () => ({ data: { session: null } })) } } }));
const svc = vi.hoisted(() => ({
    getDRESummary: vi.fn(), getDREByProject: vi.fn(), listObras: vi.fn(), getProjectWIP: vi.fn(),
}));
vi.mock('../../services/financialReportService', () => ({ financialReportService: svc }));
const toast = vi.hoisted(() => ({ showToast: () => {}, localToast: null }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => toast }));

import ControladoriaModule from '../../components/ControladoriaModule';
import { useStore } from '../../store/useStore';

const ano = new Date().getFullYear();
const resumo = {
    period_from: '', period_to: '', lines: [],
    detail: [{ dre_group: 'RECEITA_BRUTA', category_name: 'Venda de Imóveis', net: 4000, pending_credit: 0, pending_debit: 0 }],
    receita_bruta: 4000, receita_liquida: 4000, lucro_bruto: 4000, ebitda: 4000, resultado_liquido: 4000,
    margem_bruta_pct: 100, margem_ebitda_pct: 100, margem_liquida_pct: 100,
};
const wip = (id: string, nome: string, recebido: number) => ({
    project_id: id, project_name: nome, project_code: null, empresa_id: null, empresa_nome: null,
    contrato_valor: 0, custo_incorrido: 0, receita_reconhecida: recebido, custos_pendentes: 0,
    receitas_pendentes: 0, saldo_contrato: 0, margem_bruta: recebido, margem_pct: 100,
});

beforeEach(() => {
    for (const f of Object.values(svc)) f.mockReset();
    svc.getDRESummary.mockResolvedValue(resumo);
    svc.getDREByProject.mockResolvedValue([
        { project_id: 'obra-1', project_name: 'Garden', receita: 4000, custo: 0, margem: 4000, receita_prev: 0, custo_prev: 0, receita_liquida: 4000, margem_pct: 100 },
        { project_id: null, project_name: 'Sem obra', receita: 0, custo: 0, margem: 0, receita_prev: 0, custo_prev: 0, receita_liquida: 0, margem_pct: null },
    ]);
    svc.listObras.mockResolvedValue([{ project_id: 'obra-1', project_name: 'Garden', code: null }]);
    svc.getProjectWIP.mockResolvedValue([wip('a', 'Alfa', 100), wip('b', 'Beta', 900)]);
    useStore.setState({ activeOrganizationId: 'org-1', activeEmpresaId: null, projectId: null });
});

describe('DRE — tudo que o mouse faz, o teclado faz', () => {
    it('Resumo / Por Categoria / Por Obra dizem qual está ativo (não só pela cor)', async () => {
        render(<ControladoriaModule />);
        const resumoBtn = await screen.findByRole('button', { name: 'Resumo' });
        expect(resumoBtn.getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: 'Por Obra' }).getAttribute('aria-pressed')).toBe('false');
    });

    it('Por Categoria: o grupo abre com Enter e diz se está aberto', async () => {
        render(<ControladoriaModule />);
        fireEvent.click(await screen.findByRole('button', { name: 'Por Categoria' }));
        const grupo = await screen.findByRole('button', { name: /Receita Bruta/ });
        expect(grupo.getAttribute('aria-expanded')).toBe('false');
        grupo.focus();
        await userEvent.keyboard('{Enter}');
        expect(grupo.getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByText('Venda de Imóveis')).toBeTruthy();
    });

    it('Por Obra: a obra abre a DRE dela pelo teclado; "Sem obra" não é botão', async () => {
        render(<ControladoriaModule />);
        fireEvent.click(await screen.findByRole('button', { name: 'Por Obra' }));
        const obra = await screen.findByRole('button', { name: 'Ver a DRE de Garden' });
        expect(screen.queryByRole('button', { name: /Sem obra/ })).toBeNull();
        obra.focus();
        await userEvent.keyboard('{Enter}');
        await waitFor(() => expect(svc.getDRESummary).toHaveBeenCalledWith('org-1', `${ano}-01-01`, `${ano}-12-31`, 'obra-1', 'CAIXA'));
    });

    it('o botão de ajustar colunas tem nome acessível', async () => {
        render(<ControladoriaModule />);
        expect(await screen.findByRole('button', { name: 'Ajustar largura das colunas ao conteúdo' })).toBeTruthy();
    });
});

describe('WIP — ordenar pelo teclado, com a ordem anunciada', () => {
    it('cabeçalho é botão, aria-sort acompanha, e Enter troca a ordem', async () => {
        render(<ControladoriaModule />);
        fireEvent.click(await screen.findByRole('tab', { name: 'WIP' }));
        const ordenarRecebida = await screen.findByRole('button', { name: 'Ordenar por Receita recebida' });
        const th = ordenarRecebida.closest('th')!;
        expect(th.getAttribute('aria-sort')).toBe('descending');

        const linhas = () => within(screen.getByRole('table')).getAllByRole('row').slice(1, 3).map(r => r.textContent);
        expect(linhas()[0]).toContain('Beta');

        ordenarRecebida.focus();
        await userEvent.keyboard('{Enter}');
        expect(th.getAttribute('aria-sort')).toBe('ascending');
        // O cabeçalho não é remontado ao ordenar: o foco do teclado continua nele.
        expect(document.activeElement).toBe(ordenarRecebida);
        expect(linhas()[0]).toContain('Alfa');
        expect(screen.queryByText('↕')).toBeNull();
    });
});
