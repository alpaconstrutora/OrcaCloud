// @vitest-environment jsdom
/**
 * Simulação de parâmetros na aba Capacidade da PRÉVIA interna.
 *
 * O que estes testes protegem:
 *  - mexer num parâmetro recalcula o valor máximo na hora, em memória (nenhum serviço é chamado);
 *  - "Salvar no room" entrega ao pai os parâmetros do CADASTRO com os campos editados (prazo/carência da operação ficam como estavam);
 *  - "Voltar aos do room" desfaz; sem mudança ou com valor inválido o botão fica desligado e diz o motivo;
 *  - prazo/carência da operação aparecem travados com o motivo do formulário;
 *  - com proposta vinculada (servicoNovoSimulado false) o serviço novo NÃO é refeito, e o aviso aparece;
 *  - o painel não existe em versão liberada nem no portal do credor;
 *  - série inteira em zero mostra a frase em vez do gráfico zerado (§28.5).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../components/ui/confirm';
import { formatMoney } from '../components/ui/Format';
import CreditRoomCapacity from '../components/credit/CreditRoomCapacity';
import { MOTIVO_PRAZO_DA_OPERACAO } from '../components/credit/camposDoRoom';
import type { SimulacaoDaCapacidade } from '../components/credit/CreditRoomSimulacao';
import type { CreditRoom, CreditRoomVersion } from '../types/creditRoom';
import { buildSnapshot, computeIndicators, type SnapshotCapacidade } from '../utils/creditRoomSnapshot';
import { PARAMETROS_CAPACIDADE_PADRAO, type SerieMes } from '../utils/creditCapacity';
import { ID_DA_PREVIA } from '../utils/creditRoomPrevia';

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

const versao = (cap: SnapshotCapacidade, id = ID_DA_PREVIA): CreditRoomVersion => {
    const snapshot = buildSnapshot({
        dataBase: '2026-09-07',
        operacao: {
            requestedAmount: 5_000_000, modality: 'Financiamento',
            eligibleFlows: { noi: true, receivables: true, operating_cash: false },
            guarantees: [], equityCommitted: 0, equityContributed: 0,
        },
        documentVersionIds: [],
        capacidade: cap,
    });
    return {
        id, organizationId: 'o1', creditRoomId: 'r1', versionNo: id === ID_DA_PREVIA ? 0 : 1, dataBase: '2026-09-07',
        snapshot, indicators: computeIndicators(snapshot), documentVersionIds: [], frozenAt: '2026-09-07T12:00:00Z',
    };
};

const room = (over: Partial<CreditRoom> = {}) => ({
    id: 'r1', organizationId: 'o1', requestedAmount: 5_000_000,
    parametrosCapacidade: PARAMETROS_CAPACIDADE_PADRAO, ...over,
}) as unknown as CreditRoom;

const simulacaoDe = (over: Partial<SimulacaoDaCapacidade> = {}): SimulacaoDaCapacidade => ({
    room: room(), servicoNovoSimulado: true, onSalvar: vi.fn().mockResolvedValue(undefined), ...over,
});

const abrir = (v: CreditRoomVersion, simulacao?: SimulacaoDaCapacidade, accent: 'indigo' | 'portal' = 'indigo') =>
    render(<ConfirmProvider><CreditRoomCapacity version={v} accent={accent} simulacao={simulacao} /></ConfirmProvider>);

const dinheiro = (v: number) => formatMoney(v).replace(/\s/g, ' ');
const campo = (rotulo: string) => screen.getByLabelText(rotulo) as HTMLInputElement | HTMLSelectElement;
const kpi = (rotulo: RegExp | string) => (screen.getAllByText(rotulo)[0].closest('button') as HTMLElement).textContent?.replace(/\s/g, ' ') ?? '';
const valorMaximoDoKpi = () => kpi('Valor máximo do empréstimo');
const botaoSalvar = () => screen.getByRole('button', { name: 'Salvar no room' }) as HTMLButtonElement;

describe('CreditRoomCapacity — simulação de parâmetros', () => {
    it('mexer na taxa recalcula o valor máximo na hora, marca "simulado — não salvo" e não grava nada', () => {
        const onSalvar = vi.fn();
        abrir(versao(capacidade(serie())), simulacaoDe({ onSalvar }));
        expect(valorMaximoDoKpi()).toContain(dinheiro(123_400));
        expect(screen.queryByText('simulado — não salvo')).toBeNull();

        fireEvent.change(campo('Taxa mensal (%)'), { target: { value: '3' } });

        expect(screen.getByText('simulado — não salvo')).toBeInTheDocument();
        expect(valorMaximoDoKpi()).not.toContain(dinheiro(123_400));
        // O Base do estresse acompanha a simulação (nada está congelado na prévia).
        expect(screen.queryByText(/congelad/i)).toBeNull();
        expect(onSalvar).not.toHaveBeenCalled();
    });

    it('"Voltar aos do room" desfaz a simulação', () => {
        abrir(versao(capacidade(serie())), simulacaoDe());
        fireEvent.change(campo('Taxa mensal (%)'), { target: { value: '3' } });
        expect(valorMaximoDoKpi()).not.toContain(dinheiro(123_400));

        fireEvent.click(screen.getByRole('button', { name: 'Voltar aos do room' }));

        expect(valorMaximoDoKpi()).toContain(dinheiro(123_400));
        expect(screen.queryByText('simulado — não salvo')).toBeNull();
        expect(campo('Taxa mensal (%)').value).toBe(String(PARAMETROS_CAPACIDADE_PADRAO.taxa_mensal_pct));
    });

    it('"Salvar no room" entrega ao pai os parâmetros do cadastro com os campos editados', async () => {
        const onSalvar = vi.fn().mockResolvedValue(undefined);
        abrir(versao(capacidade(serie())), simulacaoDe({ onSalvar }));
        fireEvent.change(campo('Taxa mensal (%)'), { target: { value: '2.5' } });
        fireEvent.change(campo('Sistema de amortização'), { target: { value: 'SAC' } });
        fireEvent.change(campo('Haircut do estoque (%)'), { target: { value: '40' } });
        fireEvent.change(campo('DSCR mínimo'), { target: { value: '1.5' } });

        fireEvent.click(botaoSalvar());

        await waitFor(() => expect(onSalvar).toHaveBeenCalledTimes(1));
        // Horizonte e despesa (que a simulação não mexe) seguem os do cadastro.
        expect(onSalvar).toHaveBeenCalledWith({
            ...PARAMETROS_CAPACIDADE_PADRAO, taxa_mensal_pct: 2.5, sistema: 'SAC', haircut_estoque_pct: 40, dscr_minimo: 1.5,
        });
    });

    it('erro ao salvar aparece na tela e a simulação continua', async () => {
        const onSalvar = vi.fn().mockRejectedValue(new Error('Sem permissão para salvar.'));
        abrir(versao(capacidade(serie())), simulacaoDe({ onSalvar }));
        fireEvent.change(campo('Taxa mensal (%)'), { target: { value: '2.5' } });
        fireEvent.click(botaoSalvar());
        expect(await screen.findByText('Sem permissão para salvar.')).toBeInTheDocument();
        expect(screen.getByText('simulado — não salvo')).toBeInTheDocument();
    });

    it('sem mudança "Salvar no room" fica desligado e diz o motivo; valor inválido também, sem recalcular', () => {
        abrir(versao(capacidade(serie())), simulacaoDe());
        expect(botaoSalvar()).toBeDisabled();
        expect(botaoSalvar()).toHaveAttribute('title', 'Nada mudou em relação aos parâmetros do room.');

        // Taxa vazia: dívida sem juros seria otimista — recusa, e a aba segue com os parâmetros do room.
        fireEvent.change(campo('Taxa mensal (%)'), { target: { value: '' } });
        expect(botaoSalvar()).toBeDisabled();
        expect(botaoSalvar().getAttribute('title')).toMatch(/taxa mensal da capacidade/);
        expect(valorMaximoDoKpi()).toContain(dinheiro(123_400));
        expect(screen.getByRole('alert')).toHaveTextContent(/até você corrigir/);
    });

    it('prazo e carência que vêm da operação ficam travados com o motivo, e não vão ao cadastro', async () => {
        const onSalvar = vi.fn().mockResolvedValue(undefined);
        abrir(versao(capacidade(serie())), simulacaoDe({ onSalvar, room: room({ termMonths: 48, graceMonths: 6 }) }));
        const prazo = campo('Prazo (meses)');
        expect(prazo).toBeDisabled();
        expect(prazo.value).toBe('48');
        expect(prazo).toHaveAttribute('title', MOTIVO_PRAZO_DA_OPERACAO);
        expect(campo('Carência (meses)')).toBeDisabled();
        expect(campo('Carência (meses)').value).toBe('6');

        fireEvent.change(campo('Taxa mensal (%)'), { target: { value: '2' } });
        fireEvent.click(botaoSalvar());
        await waitFor(() => expect(onSalvar).toHaveBeenCalledTimes(1));
        // 60/0 do cadastro, não 48/6 da operação.
        expect(onSalvar).toHaveBeenCalledWith({ ...PARAMETROS_CAPACIDADE_PADRAO, taxa_mensal_pct: 2 });
    });

    it('prazo e carência do cadastro (sem operação) são editáveis e a carência inválida é recusada', () => {
        abrir(versao(capacidade(serie())), simulacaoDe());
        expect(campo('Prazo (meses)')).not.toBeDisabled();
        fireEvent.change(campo('Carência (meses)'), { target: { value: '60' } });
        expect(botaoSalvar()).toBeDisabled();
        expect(botaoSalvar().getAttribute('title')).toMatch(/carência da capacidade \(60 meses\)/);
    });

    it('serviço novo simulado: o DSCR muda com a taxa; com proposta vinculada o serviço novo NÃO é refeito e o aviso aparece', () => {
        const dscr = () => kpi(/^DSCR mínimo 12m/);

        const { unmount } = abrir(versao(capacidade(serie())), simulacaoDe({ servicoNovoSimulado: true }));
        const antes = dscr();
        expect(screen.queryByText(/A parcela nova vem da proposta de dívida vinculada/)).toBeNull();
        fireEvent.change(campo('Taxa mensal (%)'), { target: { value: '5' } });
        expect(dscr()).not.toBe(antes);
        unmount();

        abrir(versao(capacidade(serie())), simulacaoDe({ servicoNovoSimulado: false }));
        const antesProposta = dscr();
        expect(screen.getByText('A parcela nova vem da proposta de dívida vinculada — taxa, prazo, carência e sistema mudam só o valor máximo.')).toBeInTheDocument();
        fireEvent.change(campo('Taxa mensal (%)'), { target: { value: '5' } });
        expect(dscr()).toBe(antesProposta);
        // ...mas o valor máximo reconta com a taxa simulada.
        expect(valorMaximoDoKpi()).not.toContain(dinheiro(123_400));
    });

    it('o painel não existe em versão liberada nem no portal do credor', () => {
        const { unmount } = abrir(versao(capacidade(serie()), 'v1'), simulacaoDe());
        expect(screen.queryByText('Simular parâmetros')).toBeNull();
        unmount();

        abrir(versao(capacidade(serie())), simulacaoDe(), 'portal');
        expect(screen.queryByText('Simular parâmetros')).toBeNull();
    });

    it('sem a prop `simulacao` (prévia sem contexto) também não há painel', () => {
        abrir(versao(capacidade(serie())));
        expect(screen.queryByText('Simular parâmetros')).toBeNull();
    });

    it('prévia nova (outra versão) descarta a simulação', () => {
        const sim = simulacaoDe();
        const { rerender } = abrir(versao(capacidade(serie())), sim);
        fireEvent.change(campo('Taxa mensal (%)'), { target: { value: '3' } });
        expect(screen.getByText('simulado — não salvo')).toBeInTheDocument();

        rerender(<ConfirmProvider><CreditRoomCapacity version={versao(capacidade(serie()))} accent="indigo" simulacao={sim} /></ConfirmProvider>);
        expect(screen.queryByText('simulado — não salvo')).toBeNull();
    });
});

describe('CreditRoomCapacity — série toda em zero', () => {
    const zerada = () => capacidade(serie({
        vendas: 0, alugueis: 0, despesa_operacional: 0, renda_liquida: 0, servico_atual: 0, servico_novo: 0, folga: 0, dscr: null,
    }), 0);

    it('mostra a frase em vez do gráfico (sem eixo "R$ 0" repetido)', () => {
        abrir(versao(zerada()), simulacaoDe());
        expect(screen.getByText('Nenhuma renda elegível nem serviço da dívida no horizonte desta prévia.')).toBeInTheDocument();
        expect(screen.queryByRole('img', { name: /Renda contratada e serviço da dívida por mês/ })).toBeNull();
    });

    it('versão liberada diz "desta versão"', () => {
        abrir(versao(zerada(), 'v1'));
        expect(screen.getByText('Nenhuma renda elegível nem serviço da dívida no horizonte desta versão.')).toBeInTheDocument();
    });

    it('com serviço da dívida o gráfico continua', () => {
        abrir(versao(capacidade(serie({ vendas: 0, alugueis: 0, renda_liquida: 0, despesa_operacional: 0, servico_atual: 3000, servico_novo: 0, folga: -3000, dscr: 0 }))));
        expect(screen.queryByText(/Nenhuma renda elegível nem serviço/)).toBeNull();
        expect(screen.getByRole('img', { name: /Renda contratada e serviço da dívida por mês/ })).toBeInTheDocument();
    });
});
