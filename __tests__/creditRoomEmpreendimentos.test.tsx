// @vitest-environment jsdom
/**
 * Aba "Empreendimentos e contratos" (CreditRoomEmpreendimentos).
 *
 * O que estes testes protegem:
 *  - versão schema 1 (sem `empreendimentos`/`contratos`) abre sem erro nos dois acentos, com a frase do estado vazio;
 *  - a carteira aparece pelo `rotulo` mascarado — nome de cliente nunca vai à tela;
 *  - o filtro Venda/Locação estreita as linhas (app: popover; portal: abas);
 *  - contrato sem parcelas geradas diz isso em texto e não afirma R$ 0,00;
 *  - cartão sem capa diz "sem foto cadastrada"; clicar no cartão abre o painel com os contratos dele.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConfirmProvider } from '../components/ui/confirm';
import CreditRoomEmpreendimentos from '../components/credit/CreditRoomEmpreendimentos';
import type { CreditRoomVersion } from '../types/creditRoom';
import {
    buildSnapshot, computeIndicators, type SnapshotContrato, type SnapshotEmpreendimentoItem,
} from '../utils/creditRoomSnapshot';

const emp = (over: Partial<SnapshotEmpreendimentoItem>): SnapshotEmpreendimentoItem => ({
    id: 'e1', nome: 'Residencial Aurora', organization_id: 'o1', cidade: 'Goiânia', uf: 'GO', objetivo: 'MISTO',
    unidades_total: 40, vendidas: 20, alugadas: 5, disponiveis: 15,
    vgv_total: 8_000_000, vgv_vendido: 4_000_000, vgv_disponivel: 3_000_000, renda_mensal: 12_500,
    capa: 'https://exemplo.test/aurora.jpg',
    fotos: [{ url: 'https://exemplo.test/aurora-1.jpg', legenda: 'Fachada' }],
    ...over,
});

const contrato = (over: Partial<SnapshotContrato>): SnapshotContrato => ({
    rotulo: 'Venda 01', tipo: 'VENDA', contract_id: 'c1', organization_id: 'o1', empreendimento_id: 'e1', unidade: '101',
    valor_contrato: 500_000, parcela_mensal: 4_000, saldo_a_receber: 300_000, vencido: 0,
    primeiro_vencimento: '2025-01-10', ultimo_vencimento: '2030-12-10', status: 'EM_DIA', tem_parcelas: true,
    ...over,
});

const EMPS = [
    emp({}),
    emp({ id: 'e2', nome: 'Edifício Bela Vista', capa: null, fotos: [], objetivo: 'LOCACAO' }),
];
const CONTRATOS = [
    // Campo a mais, como se o nome do cliente tivesse vazado para dentro do snapshot: a tela não o conhece.
    { ...contrato({}), nome_cliente: 'Maria da Silva' } as SnapshotContrato,
    contrato({ rotulo: 'Venda 02', contract_id: 'c2', empreendimento_id: null, unidade: '202', vencido: 1_500, status: 'EM_ATRASO' }),
    contrato({
        rotulo: 'Locação 01', tipo: 'LOCACAO', contract_id: 'c3', empreendimento_id: 'e2', unidade: 'Sala 3',
        valor_contrato: 0, parcela_mensal: 3_200, saldo_a_receber: 0, vencido: 0,
        primeiro_vencimento: null, ultimo_vencimento: null, status: 'SEM_PARCELAS', tem_parcelas: false,
    }),
];

const versao = (blocos: { empreendimentos?: SnapshotEmpreendimentoItem[] | null; contratos?: SnapshotContrato[] | null }): CreditRoomVersion => {
    const snapshot = buildSnapshot({
        dataBase: '2026-09-07',
        operacao: {
            requestedAmount: 5_000_000, modality: 'Financiamento',
            eligibleFlows: { noi: true, receivables: true, operating_cash: false },
            guarantees: [], equityCommitted: 0, equityContributed: 0,
        },
        documentVersionIds: [],
        ...blocos,
    });
    return {
        id: 'v1', organizationId: 'o1', creditRoomId: 'r1', versionNo: 1, dataBase: '2026-09-07',
        snapshot, indicators: computeIndicators(snapshot), documentVersionIds: [], frozenAt: '2026-09-07T12:00:00Z',
    };
};

const abrir = (v: CreditRoomVersion, accent: 'indigo' | 'portal' = 'indigo') =>
    render(<ConfirmProvider><CreditRoomEmpreendimentos version={v} accent={accent} /></ConfirmProvider>);

describe('CreditRoomEmpreendimentos', () => {
    beforeEach(() => { localStorage.clear(); });

    it.each(['indigo', 'portal'] as const)('versão schema 1 (sem os blocos) mostra o estado vazio — %s', accent => {
        abrir(versao({}), accent);
        expect(screen.getByText(/versão congelada antes da capacidade de pagamento/i)).toBeInTheDocument();
        expect(screen.queryByText('Contratos')).toBeNull();
        if (accent === 'portal') expect(screen.getByText(/peça à empresa que congele uma nova/)).toBeInTheDocument();
    });

    it.each(['indigo', 'portal'] as const)('mostra os rótulos mascarados e nunca o nome do cliente — %s', accent => {
        abrir(versao({ empreendimentos: EMPS, contratos: CONTRATOS }), accent);
        for (const r of ['Venda 01', 'Venda 02', 'Locação 01']) expect(screen.getAllByText(r).length).toBeGreaterThan(0);
        expect(screen.queryByText(/Maria/)).toBeNull();
        // Contrato sem empreendimento no snapshot: "—", não o nome de outro.
        expect(screen.getAllByText('Residencial Aurora').length).toBeGreaterThan(0);
    });

    it('cartão sem capa diz "sem foto cadastrada"; com capa tem a imagem com o nome', () => {
        const { container } = abrir(versao({ empreendimentos: EMPS, contratos: CONTRATOS }));
        expect(screen.getAllByText('sem foto cadastrada')).toHaveLength(1);
        // alt vazio: o botão do cartão já carrega o nome, e ele seria lido duas vezes.
        const img = container.querySelector('img[src="https://exemplo.test/aurora.jpg"]');
        expect(img).not.toBeNull();
        expect(img).toHaveAttribute('alt', '');
        expect(img).toHaveAttribute('loading', 'lazy');
        expect(screen.getByRole('button', { name: /Residencial Aurora/ })).toBeInTheDocument();
    });

    it('app: o filtro Venda/Locação estreita as linhas', () => {
        abrir(versao({ empreendimentos: EMPS, contratos: CONTRATOS }));
        const tabela = screen.getByRole('table');
        expect(within(tabela).getByText('Locação 01')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^Tipo/ }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: /Vendas/ }));
        expect(within(tabela).queryByText('Locação 01')).toBeNull();
        expect(within(tabela).getByText('Venda 01')).toBeInTheDocument();
        expect(within(tabela).getByText('Venda 02')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^Tipo/ }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: /Locações/ }));
        expect(within(tabela).queryByText('Venda 01')).toBeNull();
        expect(within(tabela).getByText('Locação 01')).toBeInTheDocument();
    });

    it('portal: as abas Todos/Vendas/Locações trazem a contagem e estreitam as linhas', () => {
        abrir(versao({ empreendimentos: EMPS, contratos: CONTRATOS }), 'portal');
        const tabela = screen.getByRole('table', { name: 'Contratos da carteira' });
        expect(screen.getByRole('button', { name: /Vendas\s*2/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Locações\s*1/ })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Locações/ }));
        expect(within(tabela).queryByText('Venda 01')).toBeNull();
        expect(within(tabela).getByText('Locação 01')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
        expect(within(tabela).getByText('Venda 01')).toBeInTheDocument();
    });

    it.each(['indigo', 'portal'] as const)('locação sem títulos gerados: aluguel pelo contrato, sem alerta e sem R$ 0,00 — %s', accent => {
        abrir(versao({ empreendimentos: EMPS, contratos: CONTRATOS }), accent);
        const linha = screen.getByText('Locação 01').closest('tr') as HTMLElement;
        expect(within(linha).getByText(/aluguel pelo contrato/i)).toBeInTheDocument();
        expect(within(linha).queryByText(/sem parcelas geradas/i)).toBeNull();
        // No app é texto comum, não âmbar.
        if (accent === 'indigo') expect(within(linha).getByText(/aluguel pelo contrato/i).className).not.toMatch(/amber/);
        // Valor, saldo e vencido não foram calculados: "—" (o aluguel de R$ 3.200 é dado real e aparece).
        expect(within(linha).getAllByText('—').length).toBeGreaterThanOrEqual(3);
        expect(linha.textContent).not.toMatch(/R\$\s0,00/);
        expect(linha).toHaveTextContent('3.200,00');
    });

    it.each(['indigo', 'portal'] as const)('só locações sem parcelas: o rodapé de totais mostra "—", não R$ 0,00 — %s', accent => {
        abrir(versao({ empreendimentos: EMPS, contratos: [CONTRATOS[2]] }), accent);
        const rodape = screen.getByText('Total').closest('tr') as HTMLElement;
        expect(rodape.textContent).not.toMatch(/R\$\s0,00/);
        expect(within(rodape).getAllByText('—').length).toBe(3);
        // Tudo é locação: o total do aluguel mensal é dado real.
        expect(rodape).toHaveTextContent('3.200,00');
    });

    it.each(['indigo', 'portal'] as const)('com contratos calculados o rodapé soma só os que têm parcelas — %s', accent => {
        abrir(versao({ empreendimentos: EMPS, contratos: CONTRATOS }), accent);
        const rodape = screen.getByText('Total').closest('tr') as HTMLElement;
        expect(rodape).toHaveTextContent('1.000.000,00'); // valor: 500 mil × 2 vendas
        expect(rodape).toHaveTextContent('1.500,00'); // vencido
        expect(within(rodape).queryByText('—')).toBeNull();
    });

    it('ramo defensivo: venda sem parcelas geradas continua em âmbar "sem parcelas geradas"', () => {
        const venda = contrato({
            rotulo: 'Venda 09', contract_id: 'c9', valor_contrato: 0, parcela_mensal: 0, saldo_a_receber: 0,
            primeiro_vencimento: null, ultimo_vencimento: null, status: 'SEM_PARCELAS', tem_parcelas: false,
        });
        abrir(versao({ empreendimentos: EMPS, contratos: [venda] }));
        const el = screen.getByText(/sem parcelas geradas/i);
        expect(el.className).toMatch(/amber/);
    });

    it('clicar no cartão abre o painel com as fotos e só os contratos daquele empreendimento', () => {
        abrir(versao({ empreendimentos: EMPS, contratos: CONTRATOS }));
        fireEvent.click(screen.getByRole('button', { name: /Residencial Aurora/ }));
        const painel = screen.getByRole('dialog');
        expect(within(painel).getByAltText('Fachada')).toBeInTheDocument();
        const tabela = within(painel).getByRole('table', { name: 'Contratos do empreendimento' });
        expect(within(tabela).getByText('Venda 01')).toBeInTheDocument();
        expect(within(tabela).queryByText('Venda 02')).toBeNull();
        expect(within(tabela).queryByText('Locação 01')).toBeNull();
    });

    it('só um dos blocos ausente: o outro abre e o ausente explica', () => {
        abrir(versao({ empreendimentos: null, contratos: CONTRATOS }));
        expect(screen.getByText(/Esta versão não traz os empreendimentos/)).toBeInTheDocument();
        expect(screen.getAllByText('Venda 01').length).toBeGreaterThan(0);
    });

    it('listas vazias (não ausentes) dizem que não há nada, sem pedir nova versão', () => {
        abrir(versao({ empreendimentos: [], contratos: [] }));
        expect(screen.getByText(/Nenhum empreendimento na carteira/)).toBeInTheDocument();
        expect(screen.getByText(/Nenhum contrato na carteira/)).toBeInTheDocument();
        expect(screen.queryByText(/congele uma nova/)).toBeNull();
    });
});
