// @vitest-environment jsdom
/**
 * Controladoria, 2ª crítica — 3ª publicação (pedido de 15/11/2026: "incluir nas
 * próximas etapas" o que a crítica registrou e tinha ficado fora):
 * comparativo com o mesmo período do ano anterior, atalhos de período, Por Obra
 * com o filtro de obra, "Adiantamento" duplicado no Balancete, eixo do Fluxo, abas
 * com ativação manual, aria-controls nos grupos.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })), getSession: vi.fn(async () => ({ data: { session: null } })) } } }));
const svc = vi.hoisted(() => ({ getDRESummary: vi.fn(), getDREByProject: vi.fn(), listObras: vi.fn(), getBalancete: vi.fn() }));
vi.mock('../../services/financialReportService', () => ({ financialReportService: svc }));
const toast = vi.hoisted(() => ({ showToast: () => {}, localToast: null }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => toast }));

import ControladoriaModule from '../../components/ControladoriaModule';
import BalanceteReport from '../../components/BalanceteReport';
import { TabsBar } from '../../components/ui/TabsBar';
import { useEscopoControladoria } from '../../components/controladoria/escopo';
import { useStore } from '../../store/useStore';
import { menosUmAno, nomeDoAnoAnterior, atalhosDePeriodo, anoCorrente } from '../../utils/periodoControladoria';
import { formatBRLCompacto } from '../../components/controladoria/indicadores';

const norm = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
const ano = new Date().getFullYear();

function resumo(receita: number, resultado: number) {
    return {
        period_from: '', period_to: '',
        lines: [
            { linha: 'Receita Bruta', valor_realizado: receita, valor_previsto: 0 },
            { linha: '= Receita Líquida', valor_realizado: receita, valor_previsto: 0 },
            { linha: '= Resultado Líquido', valor_realizado: resultado, valor_previsto: 0 },
        ],
        detail: [{ dre_group: 'RECEITA_BRUTA', category_name: 'Venda de Imóveis', net: receita, pending_credit: 0, pending_debit: 0 }],
        receita_bruta: receita, receita_liquida: receita, lucro_bruto: resultado, ebitda: resultado, resultado_liquido: resultado,
        margem_bruta_pct: null, margem_ebitda_pct: null, margem_liquida_pct: null,
    };
}

beforeEach(() => {
    for (const f of Object.values(svc)) f.mockReset();
    // Este ano: receita 1.200; ano anterior: 1.000 (o pedido de comparação vem com o ano − 1).
    svc.getDRESummary.mockImplementation(async (_org: unknown, de: string) => (de.startsWith(String(ano - 1)) ? resumo(1000, 100) : resumo(1200, 300)));
    svc.getDREByProject.mockResolvedValue([
        { project_id: 'o1', project_name: 'Garden', receita: 1200, custo: 0, margem: 1200, receita_prev: 0, custo_prev: 0, receita_liquida: 1200, margem_pct: 100 },
        { project_id: 'o2', project_name: 'Alfa', receita: 0, custo: 0, margem: 0, receita_prev: 0, custo_prev: 0, receita_liquida: 0, margem_pct: null },
        { project_id: null, project_name: 'Sem obra', receita: 0, custo: 0, margem: 0, receita_prev: 0, custo_prev: 0, receita_liquida: 0, margem_pct: null },
    ]);
    svc.listObras.mockResolvedValue([{ project_id: 'o1', project_name: 'Garden', code: null }, { project_id: 'o2', project_name: 'Alfa', code: null }]);
    useStore.setState({ activeOrganizationId: 'org-1', activeEmpresaId: null, projectId: null, activeView: 'controladoria' });
});

describe('comparativo com o mesmo período do ano anterior', () => {
    it('pede o ano anterior e mostra a variação nos cards e a coluna no Resumo', async () => {
        render(<ControladoriaModule />);
        await waitFor(() => expect(svc.getDRESummary).toHaveBeenCalledWith('org-1', `${ano - 1}-01-01`, `${ano - 1}-12-31`, undefined, 'CAIXA'));
        // Receita 1.000 → 1.200 = +20,0%; resultado 100 → 300 = +200,0%
        expect(await screen.findByText('+20,0%')).toBeTruthy();
        expect(screen.getAllByText(`vs. ${ano - 1}`).length).toBe(4);
        expect(screen.getByRole('columnheader', { name: String(ano - 1) })).toBeTruthy();
        const receita = screen.getByText('= Receita Líquida').closest('tr')!.querySelectorAll('td');
        expect(norm(receita[receita.length - 2].textContent)).toBe('R$ 1.000,00');
    });

    it('se o ano anterior falhar, a DRE abre igual — só sem o "vs."', async () => {
        svc.getDRESummary.mockImplementation(async (_org: unknown, de: string) => {
            if (de.startsWith(String(ano - 1))) throw new Error('fora do ar');
            return resumo(1200, 300);
        });
        render(<ControladoriaModule />);
        expect(await screen.findByText('Resultado líquido')).toBeTruthy();
        expect(screen.queryByText(`vs. ${ano - 1}`)).toBeNull();
        expect(screen.queryByRole('columnheader', { name: String(ano - 1) })).toBeNull();
    });

    it('regras do período de comparação', () => {
        expect(menosUmAno('2024-02-29')).toBe('2023-02-28');
        expect(nomeDoAnoAnterior('2026-01-01', '2026-12-31')).toBe('2025');
        expect(nomeDoAnoAnterior('2026-03-01', '2026-03-31')).toBe('mesmo período de 2025');
        expect(nomeDoAnoAnterior('2025-11-01', '2026-02-28')).toBe('um ano antes');
    });
});

describe('atalhos de período', () => {
    it('Mês · Mês anterior · Trimestre · Ano', () => {
        const [mes, ant, tri, a] = atalhosDePeriodo(new Date(2026, 10, 15));
        expect([mes.de, mes.ate]).toEqual(['2026-11-01', '2026-11-30']);
        expect([ant.de, ant.ate]).toEqual(['2026-10-01', '2026-10-31']);
        expect([tri.de, tri.ate]).toEqual(['2026-10-01', '2026-12-31']);
        expect([a.de, a.ate]).toEqual(['2026-01-01', '2026-12-31']);
        const [, dezembro] = atalhosDePeriodo(new Date(2026, 0, 10));
        expect([dezembro.de, dezembro.ate]).toEqual(['2025-12-01', '2025-12-31']);
        const [fev] = atalhosDePeriodo(new Date(2028, 1, 3));
        expect(fev.ate).toBe('2028-02-29');
    });

    it('o atalho escreve as duas datas e diz qual está valendo', async () => {
        render(<ControladoriaModule />);
        const grupo = await screen.findByRole('group', { name: 'Atalhos de período' });
        const esteAno = screen.getByRole('button', { name: 'Ano' });
        expect(esteAno.getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: 'Mês' }));
        const mes = atalhosDePeriodo()[0];
        expect((screen.getByLabelText('De') as HTMLInputElement).value).toBe(mes.de);
        expect((screen.getByLabelText('Até') as HTMLInputElement).value).toBe(mes.ate);
        expect(screen.getByRole('button', { name: 'Mês' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: 'Mês' }).getAttribute('title')).toMatch(/^Este mês: \d{2}\/\d{2}\/\d{4} a /);
        expect(esteAno.getAttribute('aria-pressed')).toBe('false');
        expect(grupo).toBeTruthy();
        expect(anoCorrente().de).toBe(`${ano}-01-01`);
    });
});

describe('DRE — Por Obra e Por Categoria', () => {
    it('Por Obra respeita a obra escolhida na barra', async () => {
        render(<ControladoriaModule />);
        await screen.findByText('Resultado líquido');
        await waitFor(() => expect(screen.getByRole('option', { name: 'Garden' })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Obra'), { target: { value: 'o1' } });
        fireEvent.click(await screen.findByRole('button', { name: 'Por Obra' }));
        expect(await screen.findByText('Garden', { selector: 'button, span' })).toBeTruthy();
        expect(screen.queryByText('Alfa', { selector: 'button, span' })).toBeNull();
        expect(screen.queryByText('Sem obra', { selector: 'button, span' })).toBeNull();
    });

    it('o grupo diz ao leitor de tela quais linhas abre (aria-controls)', async () => {
        render(<ControladoriaModule />);
        fireEvent.click(await screen.findByRole('button', { name: 'Por Categoria' }));
        const grupo = await screen.findByRole('button', { name: /Receita Bruta/ });
        expect(grupo.getAttribute('aria-controls')).toBeNull();
        fireEvent.click(grupo);
        const ids = grupo.getAttribute('aria-controls')!.split(' ');
        expect(ids.length).toBe(1);
        expect(norm(document.getElementById(ids[0])!.textContent)).toContain('Venda de Imóveis');
    });
});

describe('abas da Controladoria — ativação manual', () => {
    it('a seta só leva o foco; a aba muda ao escolher', () => {
        const onChange = vi.fn();
        render(<TabsBar tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} value="a" onChange={onChange} ativacao="manual" />);
        const a = screen.getByRole('tab', { name: 'A' });
        a.focus();
        fireEvent.keyDown(a, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'B' }));
        expect(onChange).not.toHaveBeenCalled();
    });

    it('sem a opção, continua automática (as outras ~70 telas)', () => {
        const onChange = vi.fn();
        render(<TabsBar tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} value="a" onChange={onChange} />);
        const a = screen.getByRole('tab', { name: 'A' });
        a.focus();
        fireEvent.keyDown(a, { key: 'ArrowRight' });
        expect(onChange).toHaveBeenCalledWith('b');
    });
});

describe('Balancete e Fluxo', () => {
    it('categoria só pelo nome diz que está fora do plano (não parece duplicada)', async () => {
        svc.getBalancete.mockResolvedValue([
            { category_id: 'c1', category_name: 'Adiantamento', dre_group: 'SEM_CLASSIFICACAO', nature: 'EXPENSE', sort_order: 99, creditos: 0, debitos: 100, saldo_liquido: -100, n_transacoes: 1, n_partes_juros: 0 },
            { category_id: null, category_name: 'Adiantamento', dre_group: 'SEM_CLASSIFICACAO', nature: 'EXPENSE', sort_order: 99, creditos: 0, debitos: 50, saldo_liquido: -50, n_transacoes: 4, n_partes_juros: 0 },
        ]);
        function Tela() {
            const escopo = useEscopoControladoria('org-1');
            return <BalanceteReport organizationId="org-1" escopo={escopo} />;
        }
        render(<Tela />);
        // Os grupos do Balancete abrem expandidos.
        expect((await screen.findAllByText((_, el) => el?.tagName === 'TD' && norm(el.textContent).startsWith('Adiantamento'))).length).toBe(2);
        expect(screen.getAllByText('Fora do plano de contas da organização do lançamento').length).toBe(1);
    });

    it('eixo do Fluxo: uma casa abaixo de 10 mil', () => {
        expect(formatBRLCompacto(2500)).toBe('R$ 2,5 mil');
        expect(formatBRLCompacto(3750)).toBe('R$ 3,8 mil');
        expect(formatBRLCompacto(25000)).toBe('R$ 25 mil');
        expect(formatBRLCompacto(-1_250_000)).toBe('-R$ 1,3 mi');
    });
});
