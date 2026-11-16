// @vitest-environment jsdom
/**
 * Controladoria, 2ª crítica (15/11/2026) — publicação 2:
 *  - tabelas com cor por ESTADO, não por sinal (§4.5): SPE, Balancete, Diário, WIP;
 *  - a gaveta "sem classificação" abre o título de origem e o atalho abre só eles;
 *  - campo desligado diz "Não se aplica" e o motivo chega ao leitor de tela;
 *  - CSV que o Excel em português abre direto.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })), getSession: vi.fn(async () => ({ data: { session: null } })) } } }));
const svc = vi.hoisted(() => ({
    getDRESPESummary: vi.fn(), getBalancete: vi.fn(), getProjectWIP: vi.fn(), listObras: vi.fn(),
}));
vi.mock('../../services/financialReportService', () => ({ financialReportService: svc }));
const diario = vi.hoisted(() => ({ listJournalEntries: vi.fn() }));
vi.mock('../../services/diarioService', () => diario);
const semClass = vi.hoisted(() => ({ listarSemClassificacao: vi.fn() }));
vi.mock('../../services/semClassificacaoService', async (orig) => ({
    ...(await orig<typeof import('../../services/semClassificacaoService')>()),
    listarSemClassificacao: semClass.listarSemClassificacao,
}));
const toast = vi.hoisted(() => ({ showToast: () => {}, localToast: null }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => toast }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import DRESPEReport from '../../components/DRESPEReport';
import BalanceteReport from '../../components/BalanceteReport';
import DiarioReport from '../../components/DiarioReport';
import WIPReport from '../../components/WIPReport';
import { AvisoSemClassificacao } from '../../components/controladoria/SemClassificacao';
import { useEscopoControladoria } from '../../components/controladoria/escopo';
import { BarraDeEscopo } from '../../components/controladoria/BarraDeEscopo';
import { montarCSV, arquivoCSV } from '../../components/controladoria/csv';
import { tituloDoLancamento } from '../../services/semClassificacaoService';
import { useStore } from '../../store/useStore';

const norm = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
const vermelho = (el: Element) => /text-red/.test(el.className);
const colorido = (el: Element) => /text-(red|emerald|green|indigo|blue)-/.test(el.className);

function Com({ aba }: { aba: 'spe' | 'balancete' | 'diario' | 'wip' }) {
    const escopo = useEscopoControladoria('org-1');
    if (aba === 'spe') return <DRESPEReport organizationId="org-1" escopo={escopo} />;
    if (aba === 'balancete') return <BalanceteReport organizationId="org-1" escopo={escopo} />;
    if (aba === 'diario') return <DiarioReport organizationId="org-1" escopo={escopo} />;
    return <WIPReport organizationId="org-1" escopo={escopo} />;
}

beforeEach(() => {
    for (const f of [...Object.values(svc), diario.listJournalEntries, semClass.listarSemClassificacao]) f.mockReset();
    svc.listObras.mockResolvedValue([]);
    useStore.setState({ activeOrganizationId: 'org-1', activeEmpresaId: null, projectId: null, activeView: 'controladoria', viewFocus: null });
});

describe('cor por estado nas tabelas', () => {
    it('DRE por SPE: custo negativo é neutro; vermelho só no total abaixo do limiar; sem seta na margem', async () => {
        svc.getDRESPESummary.mockResolvedValue([{
            empresa_id: 'e1', empresa_nome: 'SPE Garden', receita_bruta: 4000, deducoes: 0, receita_liquida: 4000,
            custos_diretos: -6000, lucro_bruto: -2000, despesas_operacionais: -1000, ebitda: -3000,
            resultado_financeiro: 0, impostos: 0, resultado_liquido: -3000, n_transacoes: 3,
            margem_bruta_pct: -50, margem_ebitda_pct: -75, margem_liquida_pct: -75,
        }]);
        render(<Com aba="spe" />);
        const custo = (await screen.findByText('(-) Custos Diretos')).closest('tr')!.querySelectorAll('td')[1];
        expect(norm(custo.textContent)).toBe('-R$ 6.000,00');
        expect(custo.querySelector('span')!.className).not.toMatch(/text-red/);
        const lucro = screen.getByText('= Lucro Bruto').closest('tr')!.querySelectorAll('td')[1];
        expect(vermelho(lucro.querySelector('span')!)).toBe(true);
        expect(lucro.querySelector('svg')).toBeNull();
        const receita = screen.getByText('= Receita Líquida').closest('tr')!.querySelectorAll('td')[1];
        expect(colorido(receita.querySelector('span')!)).toBe(false);
    });

    it('Balancete: saldo devedor ou credor não é verde nem vermelho', async () => {
        svc.getBalancete.mockResolvedValue([
            { category_id: 'c1', category_name: 'Venda de Imóveis', dre_group: 'RECEITA_BRUTA', nature: 'REVENUE', sort_order: 1, creditos: 4000, debitos: 0, saldo_liquido: 4000, n_transacoes: 1, n_partes_juros: 0 },
            { category_id: 'c2', category_name: 'Mão de Obra', dre_group: 'CUSTO_OBRA', nature: 'EXPENSE', sort_order: 2, creditos: 0, debitos: 6000, saldo_liquido: -6000, n_transacoes: 1, n_partes_juros: 0 },
        ]);
        render(<Com aba="balancete" />);
        await screen.findAllByText('-R$ 6.000,00');
        const saldos = screen.getAllByText(/R\$ (4|6)\.000,00/).filter(el => el.tagName === 'TD');
        expect(saldos.length).toBeGreaterThan(0);
        for (const td of saldos) expect(colorido(td)).toBe(false);
    });

    it('Diário: contas neutras, valor à direita; sem "Débitos = créditos" quando não há lançamento', async () => {
        diario.listJournalEntries.mockResolvedValue([]);
        const { unmount } = render(<Com aba="diario" />);
        await screen.findByText('Lançamentos');
        expect(screen.queryByText('Débitos = créditos')).toBeNull();
        unmount();

        diario.listJournalEntries.mockResolvedValue([{
            journalEntryId: 'j1', organizationId: 'org-1', projectId: null, entryDate: '2026-03-10', description: 'Energia',
            sourceSystem: 'BOLETO', referenceId: null, debitAmount: 300, debitAccount: 'Energia', debitGroup: 'DESPESA_ADM',
            creditAmount: 300, creditAccount: 'Banco', creditGroup: 'ATIVO', status: 'CONCILIATED', createdAt: '',
        }]);
        render(<Com aba="diario" />);
        expect(await screen.findByText('Débitos = créditos')).toBeTruthy();
        const linha = screen.getByText('Banco').closest('tr')!;
        const tds = linha.querySelectorAll('td');
        for (const i of [2, 3, 4]) expect(colorido(tds[i])).toBe(false);
        expect(tds[5].className).toMatch(/text-right/);
        expect(tds[5].className).toMatch(/tabular-nums/);
        const th = screen.getByRole('columnheader', { name: 'Valor' });
        expect(th.className).toMatch(/text-right/);
    });

    it('WIP: sem seta na margem positiva; sem contrato, saldo de contrato é "—", não R$ 0,00', async () => {
        svc.getProjectWIP.mockResolvedValue([{
            project_id: 'p1', project_name: 'Garden', project_code: null, empresa_id: null, empresa_nome: null,
            contrato_valor: 0, custo_incorrido: 900, receita_reconhecida: 1000, custos_pendentes: 0,
            receitas_pendentes: 0, saldo_contrato: 0, margem_bruta: 100, margem_pct: 10,
        }]);
        render(<Com aba="wip" />);
        expect(await screen.findByText('Nenhuma obra com valor de contrato')).toBeTruthy();
        const card = screen.getByText('Saldo de contrato', { selector: ':not(th):not(th *)' }).closest('div')!.parentElement!;
        expect(norm(card.textContent)).not.toContain('R$ 0,00');
        const linha = screen.getAllByText('Garden').map(e => e.closest('tr')).find(Boolean)!;
        expect(linha.querySelectorAll('svg').length).toBe(0);
    });
});

describe('gaveta "sem classificação" leva ao título', () => {
    const itens = [
        { chave: 'a', id: 'a', data: '2026-03-01', descricao: 'Conta de luz', origem: 'Boleto', categoria: null, motivo: 'sem_categoria', valor: -300, status: 'CONCILIATED', realizado: true, titulo: 'pagar' },
        { chave: 'b', id: 'b', data: '2026-03-02', descricao: 'Aluguel recebido', origem: 'Contrato', categoria: null, motivo: 'sem_categoria', valor: 500, status: 'CONCILIATED', realizado: true, titulo: 'receber' },
        { chave: 'c', id: 'c', data: '2026-03-03', descricao: 'Material', origem: 'Pedido de compra', categoria: 'Material', motivo: 'categoria_inexistente', valor: -200, status: 'PENDING', realizado: false, titulo: 'pagar' },
        { chave: 'd', id: 'd', data: '2026-03-04', descricao: 'Contrapartida', origem: 'Lançamento manual', categoria: null, motivo: 'sem_categoria', valor: -50, status: 'CONCILIATED', realizado: true, titulo: null },
        { chave: 'e', id: 'e', data: '2026-03-05', descricao: 'INSS da folha', origem: 'Folha', categoria: null, motivo: 'sem_categoria', valor: -80, status: 'PENDING', realizado: false, titulo: 'tributo', darfId: 'darf-9' },
    ];
    function Aviso() {
        const escopo = useEscopoControladoria('org-1');
        return <AvisoSemClassificacao organizationId="org-1" escopo={escopo} realizado={-150} />;
    }

    it('a linha abre o título em Contas a Pagar / a Receber; contrapartida não é link', async () => {
        semClass.listarSemClassificacao.mockResolvedValue(itens);
        render(<Aviso />);
        fireEvent.click(screen.getByRole('button', { name: 'Ver os lançamentos' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Conta de luz' }));
        expect(useStore.getState().activeView).toBe('contas-a-pagar');
        expect(useStore.getState().viewFocus).toEqual({ ref: 'a', source: 'CONTA_PAGAR' });

        fireEvent.click(screen.getByRole('button', { name: 'Ver os lançamentos' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Aluguel recebido' }));
        expect(useStore.getState().activeView).toBe('contas-a-receber');
        expect(useStore.getState().viewFocus).toEqual({ ref: 'b', source: 'CONTA_RECEBER' });

        fireEvent.click(screen.getByRole('button', { name: 'Ver os lançamentos' }));
        await screen.findByText('Contrapartida');
        expect(screen.queryByRole('button', { name: 'Contrapartida' })).toBeNull();

        // Tributo fora de DARF enviado não está em Contas a Pagar: abre o DARF em Tributos.
        expect(screen.getByText(/1 é tributo fora de DARF enviado/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'INSS da folha' }));
        expect(useStore.getState().activeView).toBe('tributos-a-pagar');
        expect(useStore.getState().viewFocus).toEqual({ ref: 'darf-9', source: 'DARF' });
    });

    it('o atalho abre Contas a Pagar só com os títulos a pagar da lista', async () => {
        semClass.listarSemClassificacao.mockResolvedValue(itens);
        render(<Aviso />);
        fireEvent.click(screen.getByRole('button', { name: 'Ver os lançamentos' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Abrir os 2 títulos em Contas a Pagar' }));
        expect(useStore.getState().activeView).toBe('contas-a-pagar');
        expect(useStore.getState().viewFocus).toEqual({ ref: 'a,c', source: 'RECORTE_SEM_CLASSIFICACAO' });
    });

    it('tituloDoLancamento: saída → pagar (ou tributo, se Contas a Pagar esconde), entrada → receber, contrapartida → nenhum', () => {
        expect(tituloDoLancamento(-10, null)).toBe('pagar');
        expect(tituloDoLancamento(-10, null, true)).toBe('tributo');
        expect(tituloDoLancamento(10, 'NORMAL')).toBe('receber');
        expect(tituloDoLancamento(-10, 'CONTRA')).toBeNull();
    });
});

describe('campo desligado da barra de escopo', () => {
    function Barra({ periodo, regime }: { periodo: boolean; regime: string | null }) {
        const escopo = useEscopoControladoria('org-1');
        return <BarraDeEscopo escopo={escopo} aplica={{ periodo, regime, obra: null }} />;
    }

    it('WIP: "De" diz "Não se aplica" (não a data das outras abas) e o motivo chega ao leitor de tela', () => {
        render(<Barra periodo={false} regime="O WIP é posição de caixa." />);
        const de = screen.getByLabelText('De') as HTMLInputElement;
        expect(de.disabled).toBe(true);
        expect(de.value).toBe('Não se aplica');
        expect(de.getAttribute('aria-describedby')).toBeTruthy();
        expect(norm(document.getElementById(de.getAttribute('aria-describedby')!)!.textContent)).toMatch(/posição numa data/);
        expect(de.className).toMatch(/disabled:border-dashed/);

        const regime = screen.getByLabelText('Regime');
        expect(norm(document.getElementById(regime.getAttribute('aria-describedby')!)!.textContent)).toBe('O WIP é posição de caixa.');
    });

    it('campo que vale não carrega descrição de motivo', () => {
        render(<Barra periodo regime={null} />);
        expect((screen.getByLabelText('De') as HTMLInputElement).type).toBe('date');
        expect(screen.getByLabelText('De').getAttribute('aria-describedby')).toBeNull();
        expect(screen.getByLabelText('Regime').getAttribute('aria-describedby')).toBeNull();
    });
});

describe('CSV para o Excel em português', () => {
    it('";" entre colunas, vírgula decimal, BOM no arquivo', () => {
        expect(montarCSV(['Obra', 'Valor'], [['Garden; Alfa', 1234.567]])).toBe('"Obra";"Valor"\n"Garden; Alfa";1234,57');
        expect(arquivoCSV(['A'], [[1.5]]).charCodeAt(0)).toBe(0xfeff);
    });
});
