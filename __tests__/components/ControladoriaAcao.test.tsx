// @vitest-environment jsdom
/**
 * Controladoria — números que levam à ação (plano
 * docs/planos/2026-11-14-controladoria-critica.md, passo 3; PRODUCT.md princípio 5).
 *
 * Antes: "Sem Classificação" era a última linha da DRE, com a orientação só num
 * `title`; a margem negativa do WIP não levava a lugar nenhum.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })), getSession: vi.fn(async () => ({ data: { session: null } })) } } }));
const svc = vi.hoisted(() => ({
    getDRESummary: vi.fn(), getDREByProject: vi.fn(), listObras: vi.fn(), getProjectWIP: vi.fn(),
}));
vi.mock('../../services/financialReportService', () => ({ financialReportService: svc }));
const sc = vi.hoisted(() => ({ listarSemClassificacao: vi.fn() }));
vi.mock('../../services/semClassificacaoService', async (orig) => ({ ...(await orig<object>()), ...sc }));
// A gaveta (Sheet) usa useConfirm, que exige o ConfirmProvider do app.
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
const toast = vi.hoisted(() => ({ showToast: () => {}, localToast: null }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => toast }));

import ControladoriaModule from '../../components/ControladoriaModule';
import { useStore } from '../../store/useStore';

const ano = new Date().getFullYear();
function resumo(semClassReal: number, semClassPrev = 0) {
    return {
        period_from: '', period_to: '', detail: [],
        lines: [{ linha: '(!) Sem Classificação', valor_realizado: semClassReal, valor_previsto: semClassPrev }],
        receita_bruta: 4000, receita_liquida: 4000, lucro_bruto: -2000, ebitda: -5021.18, resultado_liquido: -5021.18,
        margem_bruta_pct: -50, margem_ebitda_pct: -125.5, margem_liquida_pct: -125.5,
    };
}

beforeEach(() => {
    for (const f of [...Object.values(svc), sc.listarSemClassificacao]) f.mockReset();
    svc.getDREByProject.mockResolvedValue([]);
    svc.listObras.mockResolvedValue([{ project_id: 'obra-1', project_name: 'Garden', code: null }]);
    svc.getProjectWIP.mockResolvedValue([]);
    useStore.setState({ activeOrganizationId: 'org-1', activeEmpresaId: null, projectId: null, activeView: 'controladoria', managementTab: 'organizations' });
});

describe('DRE — Sem Classificação leva aos lançamentos', () => {
    it('aviso no topo com o valor; sem nada sem classificação, sem aviso', async () => {
        svc.getDRESummary.mockResolvedValueOnce(resumo(-7619.23, -31742.95));
        const { unmount } = render(<ControladoriaModule />);
        const aviso = await screen.findByText(/estão em lançamentos sem classificação e ficaram fora do resultado/);
        expect(aviso.textContent?.replace(/\s+/g, ' ')).toContain('-R$ 7.619,23');
        unmount();

        svc.getDRESummary.mockResolvedValueOnce(resumo(0, 0));
        render(<ControladoriaModule />);
        await screen.findAllByText('Receita Bruta');
        expect(screen.queryByRole('button', { name: 'Ver os lançamentos' })).toBeNull();
    });

    it('a gaveta lista os lançamentos, diz por que e como resolver, no MESMO escopo', async () => {
        svc.getDRESummary.mockResolvedValue(resumo(-648.40));
        sc.listarSemClassificacao.mockResolvedValue([{
            chave: 'it-1', id: 'it-1', data: `${ano}-03-10`, descricao: 'Adiantamento salarial — João',
            origem: 'Folha', categoria: 'Adiantamento', motivo: 'categoria_sem_grupo',
            valor: -648.40, status: 'CONCILIATED', realizado: true,
        }]);
        render(<ControladoriaModule />);
        fireEvent.click(await screen.findByRole('button', { name: 'Ver os lançamentos' }));

        const gaveta = await screen.findByRole('dialog');
        expect(await within(gaveta).findByText('Adiantamento salarial — João')).toBeTruthy();
        expect(within(gaveta).getByText('Categoria sem grupo da DRE')).toBeTruthy();
        expect(within(gaveta).getByText(/Defina o grupo nela/)).toBeTruthy();
        expect(sc.listarSemClassificacao).toHaveBeenCalledWith({
            organizationId: 'org-1', de: `${ano}-01-01`, ate: `${ano}-12-31`, regime: 'CAIXA', obraId: undefined,
        });
    });

    it('"Abrir Plano de Contas" leva à aba certa de Minha Organização', async () => {
        svc.getDRESummary.mockResolvedValue(resumo(-100));
        sc.listarSemClassificacao.mockResolvedValue([]);
        render(<ControladoriaModule />);
        fireEvent.click(await screen.findByRole('button', { name: 'Ver os lançamentos' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Abrir Plano de Contas' }));
        expect(useStore.getState().managementTab).toBe('plano_contas');
        expect(useStore.getState().activeView).toBe('organization');
    });

    it('a linha da tabela não usa mais código interno ("(!)", "(o)") nem glifo ⚠', async () => {
        svc.getDRESummary.mockResolvedValue({ ...resumo(-100), lines: [
            { linha: '(o) Amortização de Principal', valor_realizado: 10, valor_previsto: 0 },
            { linha: '(!) Sem Classificação', valor_realizado: -100, valor_previsto: 0 },
        ] });
        render(<ControladoriaModule />);
        expect(await screen.findByText('Amortização de principal (fora do resultado)')).toBeTruthy();
        expect(screen.getByText('Sem classificação (fora do resultado)')).toBeTruthy();
        expect(screen.queryByText(/⚠/)).toBeNull();
    });
});

describe('WIP — a obra leva à DRE dela', () => {
    it('clicar no nome da obra abre a aba DRE com a obra no filtro', async () => {
        svc.getDRESummary.mockResolvedValue(resumo(0));
        svc.getProjectWIP.mockResolvedValue([{
            project_id: 'obra-1', project_name: 'Garden', project_code: '017', empresa_id: null, empresa_nome: null,
            contrato_valor: 0, custo_incorrido: 6000, receita_reconhecida: 4000, custos_pendentes: 0,
            receitas_pendentes: 0, saldo_contrato: 0, margem_bruta: -2000, margem_pct: -50,
        }]);
        render(<ControladoriaModule />);
        fireEvent.click(await screen.findByRole('tab', { name: 'WIP' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Garden' }));

        expect(await screen.findByRole('heading', { level: 1, name: 'DRE' })).toBeTruthy();
        await waitFor(() => expect(svc.getDRESummary).toHaveBeenLastCalledWith('org-1', `${ano}-01-01`, `${ano}-12-31`, 'obra-1', 'CAIXA'));
        expect((screen.getByLabelText('Obra') as HTMLSelectElement).value).toBe('obra-1');
    });

    it('"Total (1 obra)" no singular; rótulos dizem que é caixa', async () => {
        svc.getDRESummary.mockResolvedValue(resumo(0));
        svc.getProjectWIP.mockResolvedValue([{
            project_id: 'obra-1', project_name: 'Garden', project_code: null, empresa_id: null, empresa_nome: null,
            contrato_valor: 0, custo_incorrido: 10, receita_reconhecida: 20, custos_pendentes: 0,
            receitas_pendentes: 0, saldo_contrato: 0, margem_bruta: 10, margem_pct: 50,
        }]);
        render(<ControladoriaModule />);
        fireEvent.click(await screen.findByRole('tab', { name: 'WIP' }));
        expect(await screen.findByText('Total (1 obra)')).toBeTruthy();
        expect(screen.getAllByText(/Receita recebida/i).length).toBeGreaterThan(0);
        expect(screen.queryByText(/Reconhecida/)).toBeNull();
    });
});
