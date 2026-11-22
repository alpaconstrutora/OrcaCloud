// @vitest-environment jsdom
/**
 * Aba "Capacidade de pagamento" (CreditRoomCapacity).
 *
 * O que estes testes protegem:
 *  - versão schema 1 (sem `capacidade`) abre sem erro nos dois acentos, com a frase do estado vazio;
 *  - "dado ausente ≠ zero": DSCR sem serviço da dívida aparece como "—";
 *  - o Base do teste de estresse é o número CONGELADO — o banco nunca vê dois valores máximos.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConfirmProvider } from '../components/ui/confirm';
import { formatMoney } from '../components/ui/Format';
import CreditRoomCapacity from '../components/credit/CreditRoomCapacity';
import type { CreditRoomVersion } from '../types/creditRoom';
import { buildSnapshot, computeIndicators, type SnapshotCapacidade } from '../utils/creditRoomSnapshot';
import { PARAMETROS_CAPACIDADE_PADRAO, type SerieMes } from '../utils/creditCapacity';

const serie = (over: Partial<SerieMes> = {}): SerieMes[] => Array.from({ length: 12 }, (_, k) => ({
    mes: `2026-${String(k + 1).padStart(2, '0')}`, vendas: 6000, alugueis: 4000, despesa_operacional: 500,
    renda_liquida: 9500, servico_atual: 5000, servico_novo: 1000, folga: 3500, dscr: 1.58, ...over,
}));

const capacidade = (s: SerieMes[], valorMaximo = 123_400): SnapshotCapacidade => ({
    fonte: 'creditCapacity', data_base: '2026-09-07',
    parametros: PARAMETROS_CAPACIDADE_PADRAO, base: 'CONTRATADA', serie: s,
    recebido_12m: [], vencido_na_data_base: 0, a_vencer_mes_corrente: 0, estoque: null,
    capacidade_maxima: { parcela_maxima: 4_000, valor_maximo: valorMaximo },
    alertas: [], por_organizacao: [],
});

const versao = (cap: SnapshotCapacidade | null, noi = true): CreditRoomVersion => {
    const snapshot = buildSnapshot({
        dataBase: '2026-09-07',
        operacao: {
            requestedAmount: 5_000_000, modality: 'Financiamento',
            eligibleFlows: { noi, receivables: true, operating_cash: false },
            guarantees: [], equityCommitted: 0, equityContributed: 0,
        },
        documentVersionIds: [],
        ...(cap ? { capacidade: cap } : {}),
    });
    return {
        id: 'v1', organizationId: 'o1', creditRoomId: 'r1', versionNo: 1, dataBase: '2026-09-07',
        snapshot, indicators: computeIndicators(snapshot), documentVersionIds: [], frozenAt: '2026-09-07T12:00:00Z',
    };
};

const abrir = (v: CreditRoomVersion, accent: 'indigo' | 'portal' = 'indigo') =>
    render(<ConfirmProvider><CreditRoomCapacity version={v} accent={accent} /></ConfirmProvider>);

describe('CreditRoomCapacity', () => {
    it.each(['indigo', 'portal'] as const)('versão schema 1 (sem capacidade) mostra o estado vazio — %s', accent => {
        abrir(versao(null), accent);
        expect(screen.getByText(/versão congelada antes da capacidade de pagamento/i)).toBeInTheDocument();
        expect(screen.queryByText('Mês a mês')).toBeNull();
    });

    it('DSCR sem serviço da dívida em nenhum mês aparece como "—", não como zero', () => {
        abrir(versao(capacidade(serie({ servico_atual: 0, servico_novo: 0, dscr: null, folga: 9500 }))));
        const kpi = screen.getAllByText('DSCR mínimo 12m')[0].closest('button');
        expect(kpi).not.toBeNull();
        expect(within(kpi as HTMLElement).getByText('—')).toBeInTheDocument();
        expect(kpi).not.toHaveTextContent('0,00×');
    });

    it('o Base do estresse é o valor máximo CONGELADO (não o recalculado)', () => {
        // 123.400 não sai da série de teste: se o painel recalculasse o Base, mostraria outro número.
        abrir(versao(capacidade(serie(), 123_400)));
        // formatMoney usa espaço não separável; o testing-library normaliza o texto da tela.
        const congelado = formatMoney(123_400).replace(/\s/g, ' ');
        // KPI + painel de estresse no Base = dois lugares, o mesmo número.
        expect(screen.getAllByText(congelado).length).toBeGreaterThanOrEqual(2);

        fireEvent.click(screen.getByRole('button', { name: 'Severo' }));
        expect(screen.getAllByText(/vs\. Base/).length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole('button', { name: 'Base' }));
        expect(screen.getAllByText(congelado).length).toBeGreaterThanOrEqual(2);
        expect(screen.getAllByText(/Cenário Base/).length).toBeGreaterThan(0);
    });

    it('série vazia: o estresse mostra "—", não R$ 0,00', () => {
        abrir(versao(capacidade([], 0)));
        expect(screen.getByText(/sem série não há o que estressar/)).toBeInTheDocument();
        const painel = screen.getByText('Valor máximo (sobre a dívida atual)', { selector: 'dt' }).closest('div') as HTMLElement;
        expect(painel).toHaveTextContent('—');
    });

    it('campo que o fluxo inelegível torna inócuo fica desligado, com o motivo, e não vira "personalizado"', () => {
        abrir(versao(capacidade(serie()), false));
        const vacancia = screen.getByLabelText('Vacância (%)');
        expect(vacancia).toBeDisabled();
        expect(screen.getByText(/aluguéis não entram no DSCR/)).toBeInTheDocument();
        expect(screen.getByLabelText('Inadimplência (%)')).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: 'Moderado' }));
        expect(screen.getByRole('button', { name: 'Moderado' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByText(/Cenário personalizado/)).toBeNull();
    });

    it.each(['indigo', 'portal'] as const)('com operação pedida: DSCR é pós-operação e o valor máximo é "sobre a dívida atual", com o pedido comparado — %s', accent => {
        // pedido R$ 5.000.000 (versao()) > máximo 123.400 → "acima do máximo"
        abrir(versao(capacidade(serie(), 123_400)), accent);
        expect(screen.getAllByText(/DSCR mínimo 12m \(pós-operação\)/).length).toBeGreaterThan(0);
        expect(screen.getByText(/com a operação pedida de/)).toBeInTheDocument();
        expect(screen.getByText(/sobre a dívida atual · parcela máx\./)).toBeInTheDocument();
        expect(screen.getByText(/pedido .*5\.000\.000,00 — acima do máximo/)).toBeInTheDocument();
    });

    it('pedido dentro do máximo diz "dentro do máximo"', () => {
        abrir(versao(capacidade(serie(), 9_000_000)));
        expect(screen.getByText(/— dentro do máximo/)).toBeInTheDocument();
    });

    it('sem serviço da operação em nenhum mês: o DSCR não diz "pós-operação"', () => {
        abrir(versao(capacidade(serie({ servico_novo: 0 }))));
        expect(screen.queryByText(/pós-operação/)).toBeNull();
        expect(screen.queryByText(/com a operação pedida/)).toBeNull();
        expect(screen.getAllByText('DSCR mínimo 12m').length).toBeGreaterThan(0);
    });

    it('série vazia: o KPI do valor máximo mostra "—", não R$ 0,00', () => {
        abrir(versao(capacidade([], 0)));
        const kpi = screen.getByText('Valor máximo do empréstimo').closest('button') as HTMLElement;
        expect(kpi).toHaveTextContent('—');
        expect(kpi).not.toHaveTextContent('R$');
    });

    it('portal: DSCR abaixo do exigido e folga negativa dizem isso em texto', () => {
        abrir(versao(capacidade(serie({ renda_liquida: 4000, folga: -2000, dscr: 0.67 }))), 'portal');
        expect(screen.getByText(/abaixo dos 1,30× exigidos/)).toBeInTheDocument();
        expect(screen.getByText(/mês no vermelho/)).toBeInTheDocument();
    });
});
