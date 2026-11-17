import '@testing-library/jest-dom';
// @vitest-environment jsdom
/**
 * Central de Controle → tela "Bom dia" (docs/planos/2026-11-10-central-bom-dia.md, item 7).
 *
 * Trava os estados que o brief pediu:
 *   1. a saudação aparece SEM esperar o banco; os cartões ficam em esqueleto;
 *   2. dia zerado: "Nada esperando por você hoje." e a barra "Seu dia" cheia;
 *   3. uma fonte com erro derruba SÓ o cartão dela ("Não carregou");
 *   4. sem permissão para o módulo, o cartão some (mesma regra do menu);
 *   5. a fila traz só aprovações da minha alçada; o vencido vira o destaque;
 *   6. concluir tarefa atualiza a tela sem recarregar o painel (§22).
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

type Estado = Record<string, unknown>;
let estado: Estado;
vi.mock('../../store/useStore', () => ({
    useStore: (sel?: (s: Estado) => unknown) => (sel ? sel(estado) : estado),
}));

const bootstrap = vi.fn();
const fontesSeparadas = vi.fn();
vi.mock('../../services/centralControleService', async (importOriginal) => {
    const mod = await importOriginal<typeof import('../../services/centralControleService')>();
    return { ...mod, centralControleService: {
        bootstrap: (...a: unknown[]) => bootstrap(...a),
        fontesSeparadas: (...a: unknown[]) => fontesSeparadas(...a),
    } };
});
const reajustes = vi.fn();
vi.mock('../../services/contractIndexService', () => ({ contractIndexService: { listDueForReajuste: (...a: unknown[]) => reajustes(...a) } }));
vi.mock('../../services/financialApprovalService', () => ({ financialApprovalService: { listConfig: async () => [] } }));
const cashflow = vi.fn();
vi.mock('../../services/financialIntelligenceService', () => ({ financialIntelligenceService: { getCashflowProjection: (...a: unknown[]) => cashflow(...a) } }));
const atualizarTarefa = vi.fn();
vi.mock('../../services/taskService', () => ({ taskService: { update: (...a: unknown[]) => atualizarTarefa(...a) } }));
vi.mock('../../components/FinancialApprovalModule', () => ({
    ENTITY_TAG: { transaction: 'Transação', darf: 'DARF', contract: 'Contrato', purchase_order: 'Compra', process_step: 'Processo', blueprint_snapshot: 'Planta', purchase_request: 'Solicitação', doc_gen_documento: 'Ofício' },
    ApproveRejectModal: () => null,
}));

import CentralControle from '../../components/CentralControle';
import { memoriaDoPlanoB, PLANO_B_PEGAJOSO_MS } from '../../utils/planoBPegajoso';

const HOJE = '2026-11-11';

function meuDia(p: Record<string, unknown> = {}) {
    return {
        hoje: HOJE,
        tarefas: { pendentes: [], qtd_pendentes: 0, concluidas_hoje: 0 },
        contas_hoje: { pendentes: [], qtd_pendentes: 0, pagas_hoje: 0 },
        aprovacoes_hoje: 0,
        contas_7_dias: { atrasadas: { qtd: 0, valor: 0 }, vencem_em_2_dias: { qtd: 0, valor: 0 }, vencem_em_7_dias: { qtd: 0, valor: 0 } },
        conciliado: { conciliadas: 0, pendentes: 0, conciliadas_anterior: 0, pendentes_anterior: 0 },
        ...p,
    };
}

function painel(p: Record<string, unknown> = {}) {
    const ok = (data: unknown) => ({ ok: true, data });
    return {
        financial_alerts: ok([]),
        divergences: ok({ as_of: HOJE, counts: { value_mismatch: 0, bank_without_internal: 0, internal_without_bank: 0 } }),
        approval_summary: ok([]),
        bottlenecks: ok([]),
        action_queue: ok([]),
        scorecards: ok([]),
        meu_dia: ok(meuDia()),
        ...p,
    };
}

function aprovacao(id: string, p: Record<string, unknown> = {}) {
    return { entity: 'transaction', id, title: `Boleto ${id}`, amount: 500, approval_status: 'PENDENTE', approval_chain: [], approval_required_levels: 1, pode_aprovar: true, vez_de: [], ...p };
}

/** Plano B: as 6 fontes que a tela usa, uma promessa cada. Cada uma nasce na hora da
 *  chamada (fábrica), para uma rejeição não ficar sem dono antes de a tela pedir. */
const FONTES_DA_TELA = ['financial_alerts', 'divergences', 'bottlenecks', 'action_queue', 'scorecards', 'meu_dia'] as const;
type FonteDaTela = typeof FONTES_DA_TELA[number];
function fontes(p: Partial<Record<FonteDaTela, () => Promise<unknown>>> = {}) {
    const base = painel() as Record<string, { data: unknown }>;
    return Object.fromEntries(FONTES_DA_TELA.map(k => [k, p[k] ? p[k]!() : Promise.resolve(base[k].data)]));
}
const TIMEOUT = { code: '57014', message: 'canceling statement due to statement timeout' };
const caiu = () => Promise.reject(TIMEOUT);
const nunca = () => new Promise<never>(() => { /* nunca responde */ });

const montar = () => render(<CentralControle organizationId="o1" userEmail="ana@alpa.com.br" onNavigate={vi.fn()} />);

/** O <section> do cartão a partir do título. */
const cartao = (titulo: string) => screen.getByRole('heading', { name: titulo, level: 2 }).closest('section') as HTMLElement;

beforeEach(() => {
    bootstrap.mockReset();
    fontesSeparadas.mockReset();
    memoriaDoPlanoB.esquecer();
    reajustes.mockReset().mockResolvedValue([]);
    cashflow.mockReset().mockResolvedValue([{ data_ref: HOJE, cr_previsto: 0, db_previsto: 0, saldo_dia: 0, saldo_acum: 1000 }]);
    atualizarTarefa.mockReset().mockResolvedValue(undefined);
    estado = {
        currentProfile: { group: 'USUARIO', role: 'ADMINISTRADOR', email: 'ana@alpa.com.br' },
        organizations: [{ id: 'o1', name: 'Alpa', members: [{ email: 'ana@alpa.com.br', name: 'Ana Souza', role: 'admin' }] }],
        activeOrganizationId: 'o1',
        companies: [],
        activeEmpresaId: null,
        projectsLoading: false,
    };
});

describe('CentralControle · tela "Bom dia"', () => {
    it('saudação aparece sem esperar o banco; cartões em esqueleto', async () => {
        bootstrap.mockReturnValue(new Promise(() => { /* nunca responde */ }));
        montar();
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^(Bom dia|Boa tarde|Boa noite), Ana$/);
        await waitFor(() => expect(bootstrap).toHaveBeenCalled());
        expect(cartao('Minha fila')).toHaveAttribute('aria-busy', 'true');
        expect(cartao('Contas a pagar')).toHaveAttribute('aria-busy', 'true');
    });

    it('dia zerado: nada esperando e a barra "Seu dia" cheia', async () => {
        bootstrap.mockResolvedValue(painel());
        montar();
        expect(await screen.findByText('Nada esperando por você hoje.', { selector: 'p[aria-live] > span' })).toBeInTheDocument();
        expect(screen.getByText('Nada pendente')).toBeInTheDocument();
        expect(screen.getByText('100%')).toBeInTheDocument();
        // Abrir a tela com o dia já zerado não "fecha o dia" (a onda é da transição).
        expect(document.querySelector('.central-dia-fechado')).toBeNull();
    });

    it('fonte com erro derruba só o cartão dela', async () => {
        bootstrap.mockResolvedValue(painel({ scorecards: { ok: false, erro: 'timeout' } }));
        montar();
        await waitFor(() => expect(within(cartao('Obras')).getByText('Não carregou.')).toBeInTheDocument());
        expect(within(cartao('Obras')).getByRole('button', { name: /Tentar de novo/ })).toBeInTheDocument();
        expect(within(cartao('Contas a pagar')).queryByText('Não carregou.')).not.toBeInTheDocument();
        expect(within(cartao('Minha fila')).queryByText('Não carregou.')).not.toBeInTheDocument();
    });

    it('sem permissão para o módulo, o cartão some (mesma regra do menu)', async () => {
        estado = {
            ...estado,
            companies: [{ id: 'e1', modulos_habilitados: { obras: true, financeiro: false } }],
            activeEmpresaId: 'e1',
            organizations: [{ id: 'o1', name: 'Alpa', members: [{ email: 'ana@alpa.com.br', name: 'Ana', role: 'member', permissions: { canViewBudget: false } }] }],
        };
        bootstrap.mockResolvedValue(painel());
        montar();
        await screen.findByRole('heading', { name: 'Minha fila', level: 2 });
        for (const t of ['Contas a pagar', 'Caixa projetado', 'Obras', 'Extrato conciliado']) {
            expect(screen.queryByRole('heading', { name: t, level: 2 })).not.toBeInTheDocument();
        }
        expect(cashflow).not.toHaveBeenCalled();
    });

    it('fila: só aprovações da minha alçada; o vencido vira destaque', async () => {
        bootstrap.mockResolvedValue(painel({
            action_queue: { ok: true, data: [
                aprovacao('a1', { due_date: '2026-11-08' }),
                aprovacao('a2', { pode_aprovar: false, vez_de: ['Bruna'] }),
                aprovacao('a3', { approval_status: 'RASCUNHO' }),
            ] },
        }));
        montar();
        const fila = cartao('Minha fila');
        await waitFor(() => expect(within(fila).getByText(/Mais urgente/)).toBeInTheDocument());
        expect(within(fila).getByText('Boleto a1')).toBeInTheDocument();
        expect(within(fila).getByText('Vencido há 3 dias')).toBeInTheDocument();
        expect(within(fila).queryByText('Boleto a2')).not.toBeInTheDocument();
        expect(within(fila).queryByText('Boleto a3')).not.toBeInTheDocument();
        expect(screen.getByText('1 item precisa de você hoje: 1 aprovação.')).toBeInTheDocument();
        // "Ver as N da organização" conta as pendentes de TODAS as alçadas.
        expect(within(fila).getByRole('button', { name: 'Ver as 2 da organização' })).toBeInTheDocument();
    });

    it('concluir tarefa atualiza a tela sem recarregar o painel', async () => {
        bootstrap.mockResolvedValue(painel({
            meu_dia: { ok: true, data: meuDia({
                tarefas: {
                    pendentes: [{ id: 't1', org_id: 'o1', title: 'Ligar para o fornecedor', due_date: '2026-11-11T15:00:00Z', priority: 2, source_module: 'manual', source_ref: null }],
                    qtd_pendentes: 1, concluidas_hoje: 0,
                },
            }) },
        }));
        montar();
        const botao = await screen.findByRole('button', { name: 'Concluir tarefa' });
        await userEvent.click(botao);
        expect(atualizarTarefa).toHaveBeenCalledWith('t1', { status: 'done' });
        // Enquanto a linha recolhe, o botão trava: um segundo clique não grava de novo.
        expect(botao).toBeDisabled();
        expect(botao).toHaveTextContent('Concluída');
        await userEvent.click(botao);
        expect(atualizarTarefa).toHaveBeenCalledTimes(1);
        expect(await screen.findByText('Nada esperando por você hoje.', { selector: 'p[aria-live] > span' })).toBeInTheDocument();
        expect(screen.getByText('1 de 1 concluídos')).toBeInTheDocument();
        expect(bootstrap).toHaveBeenCalledTimes(1);
        // O último pendente saiu: "Seu dia" fecha (onda nos quadradinhos).
        expect(document.querySelector('.central-dia-fechado')).not.toBeNull();
    });

    it('o foco vai para o novo "Mais urgente" quando o anterior sai', async () => {
        const tarefa = (id: string, title: string, due_date: string) =>
            ({ id, org_id: 'o1', title, due_date, priority: 2, source_module: 'manual', source_ref: null });
        bootstrap.mockResolvedValue(painel({
            meu_dia: { ok: true, data: meuDia({
                tarefas: {
                    pendentes: [
                        tarefa('t1', 'Ligar para o fornecedor', '2026-11-09T15:00:00Z'),
                        tarefa('t2', 'Conferir medição', '2026-11-11T15:00:00Z'),
                    ],
                    qtd_pendentes: 2, concluidas_hoje: 0,
                },
            }) },
        }));
        montar();
        const fila = cartao('Minha fila');
        await waitFor(() => expect(within(fila).getByText('Ligar para o fornecedor')).toBeInTheDocument());
        await userEvent.click(within(fila).getByRole('button', { name: 'Concluir tarefa' }));
        await waitFor(() => expect(within(fila).getByText('Conferir medição')).toBeInTheDocument());
        await waitFor(() => expect(within(fila).queryByText('Ligar para o fornecedor')).not.toBeInTheDocument());
        // Sem isto o foco caía no <body> e quem usa teclado recomeçava do topo.
        await waitFor(() => expect(within(fila).getByRole('button', { name: 'Concluir tarefa' })).toHaveFocus());
    });

    it('Atualizar marca só o número que mudou; a primeira carga não marca nada', async () => {
        const contas = (atrasadas: number) => painel({ meu_dia: { ok: true, data: meuDia({
            contas_7_dias: { atrasadas: { qtd: atrasadas, valor: 100 }, vencem_em_2_dias: { qtd: 4, valor: 50 }, vencem_em_7_dias: { qtd: 0, valor: 0 } },
        }) } });
        bootstrap.mockResolvedValueOnce(contas(3)).mockResolvedValueOnce(contas(5));
        montar();
        const c = await waitFor(() => { const el = cartao('Contas a pagar'); expect(within(el).getByText('Atrasadas')).toBeInTheDocument(); return el; });
        expect(c.querySelector('.central-mudou')).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
        await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(2));
        // Atrasadas 3 → 5 e o total 7 → 9 mudaram; "vencem em 2 dias" (4) não.
        await waitFor(() => expect(c.querySelectorAll('.central-mudou')).toHaveLength(2));
        // O total é o NumeroQueSobe: o valor final está no aria-label.
        const marcados = Array.from(c.querySelectorAll('.central-mudou')).map(e => e.querySelector('[aria-label]')?.getAttribute('aria-label') ?? e.textContent);
        expect(marcados).toEqual(expect.arrayContaining(['9', '5']));
    });

    it('o caixa só é buscado depois que o bootstrap responde (não disputam o banco)', async () => {
        let responder!: (v: unknown) => void;
        bootstrap.mockReturnValue(new Promise(r => { responder = r; }));
        montar();
        await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1));
        // Bootstrap pendente: nada de caixa ainda.
        await new Promise(r => setTimeout(r, 50));
        expect(cashflow).not.toHaveBeenCalled();
        responder(painel());
        await waitFor(() => expect(cashflow).toHaveBeenCalledTimes(1));
        // Atualizar: de novo bootstrap primeiro, caixa depois.
        let responder2!: (v: unknown) => void;
        bootstrap.mockReturnValue(new Promise(r => { responder2 = r; }));
        await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
        await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(2));
        expect(cashflow).toHaveBeenCalledTimes(1);
        responder2(painel());
        await waitFor(() => expect(cashflow).toHaveBeenCalledTimes(2));
    });

    it('trocar o período do caixa mantém o gráfico anterior esmaecido até o novo chegar', async () => {
        // Quadros de animação atrasados (CI carregado, 14/11): a contagem visível do
        // NumeroQueSobe fica no meio do caminho; o valor final está no aria-label.
        const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
        bootstrap.mockResolvedValue(painel());
        montar();
        // Pelo aria-label (o valor final, sempre no DOM), não pelo texto visível, que é a
        // contagem animada e só chega ao valor depois dos quadros da animação.
        const c = await waitFor(() => { const el = cartao('Caixa projetado'); expect(within(el).getByLabelText('R$ 1.000')).toBeInTheDocument(); return el; });
        cashflow.mockReturnValue(new Promise(() => { /* período novo ainda carregando */ }));
        await userEvent.click(within(c).getByRole('button', { name: '60 dias' }));
        expect(c).toHaveAttribute('aria-busy', 'false');
        expect(within(c).getByLabelText('R$ 1.000').closest('[aria-busy="true"]')).not.toBeNull();
        raf.mockRestore();
    });
    // ── Plano B (docs/planos/2026-11-16-central-blocos-isolados.md, Tarefa 3) ──
    it('bootstrap respondendo: o plano B não é chamado', async () => {
        bootstrap.mockResolvedValue(painel());
        montar();
        expect(await screen.findByText('Nada esperando por você hoje.', { selector: 'p[aria-live] > span' })).toBeInTheDocument();
        expect(fontesSeparadas).not.toHaveBeenCalled();
    });

    it('chamada única cai: os cartões vêm pelas consultas separadas e só o bloco que caiu diz "Não carregou."', async () => {
        bootstrap.mockRejectedValue(TIMEOUT);
        fontesSeparadas.mockImplementation(() => fontes({ scorecards: caiu }));
        montar();
        await waitFor(() => expect(within(cartao('Obras')).getByText('Não carregou.')).toBeInTheDocument());
        expect(fontesSeparadas).toHaveBeenCalledWith('o1');
        expect(within(cartao('Obras')).getByRole('button', { name: /Tentar de novo/ })).toBeInTheDocument();
        await waitFor(() => expect(cartao('Contas a pagar')).toHaveAttribute('aria-busy', 'false'));
        expect(within(cartao('Contas a pagar')).queryByText('Não carregou.')).not.toBeInTheDocument();
        expect(within(cartao('Minha fila')).queryByText('Não carregou.')).not.toBeInTheDocument();
    });

    it('alerta lento não segura a Minha fila', async () => {
        bootstrap.mockRejectedValue(TIMEOUT);
        fontesSeparadas.mockImplementation(() => fontes({
            financial_alerts: nunca,
            action_queue: () => Promise.resolve([aprovacao('a1')]),
        }));
        montar();
        const fila = cartao('Minha fila');
        await waitFor(() => expect(within(fila).getByText('Boleto a1')).toBeInTheDocument());
        expect(fila).toHaveAttribute('aria-busy', 'false');
    });

    it('tudo cai: cada cartão diz "Não carregou." e o caixa é buscado', async () => {
        bootstrap.mockRejectedValue(TIMEOUT);
        fontesSeparadas.mockImplementation(() => fontes(Object.fromEntries(FONTES_DA_TELA.map(k => [k, caiu]))));
        montar();
        for (const t of ['Contas a pagar', 'Obras', 'Extrato conciliado']) {
            await waitFor(() => expect(within(cartao(t)).getByText('Não carregou.')).toBeInTheDocument());
        }
        // O `carregando` termina mesmo com tudo caído: o caixa não fica esperando a vez para sempre.
        await waitFor(() => expect(cashflow).toHaveBeenCalledTimes(1));
    });

    it('resposta atrasada da org anterior não pinta a tela da org nova', async () => {
        let responderFilaO1!: (v: unknown) => void;
        bootstrap.mockRejectedValueOnce(TIMEOUT).mockResolvedValueOnce(painel());
        fontesSeparadas.mockImplementation(() => fontes({
            action_queue: () => new Promise(r => { responderFilaO1 = r; }),
        }));
        const { rerender } = montar();
        await waitFor(() => expect(fontesSeparadas).toHaveBeenCalledWith('o1'));
        rerender(<CentralControle organizationId="o2" userEmail="ana@alpa.com.br" onNavigate={vi.fn()} />);
        await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(2));
        expect(await screen.findByText('Nada esperando por você hoje.', { selector: 'p[aria-live] > span' })).toBeInTheDocument();
        responderFilaO1([aprovacao('velha')]);
        await new Promise(r => setTimeout(r, 50));
        expect(screen.queryByText('Boleto velha')).not.toBeInTheDocument();
    });

    // Revisão final (16/11): a trava acima barra a resposta ATRASADA; o que a org
    // anterior já pintou também não pode ficar — no plano B seriam até ~16 s com
    // botão Aprovar de outra empresa debaixo do seletor do topo (REGRA #5).
    it('trocar de org volta os cartões ao esqueleto: nada da org anterior fica na tela', async () => {
        bootstrap
            .mockResolvedValueOnce(painel({ action_queue: { ok: true, data: [aprovacao('da-o1')] } }))
            .mockRejectedValueOnce(TIMEOUT);
        fontesSeparadas.mockImplementation(() => fontes({ action_queue: nunca, meu_dia: nunca }));
        const { rerender } = montar();
        expect(await within(cartao('Minha fila')).findByText('Boleto da-o1')).toBeInTheDocument();
        rerender(<CentralControle organizationId="o2" userEmail="ana@alpa.com.br" onNavigate={vi.fn()} />);
        await waitFor(() => expect(fontesSeparadas).toHaveBeenCalledWith('o2'));
        expect(screen.queryByText('Boleto da-o1')).not.toBeInTheDocument();
        expect(cartao('Minha fila')).toHaveAttribute('aria-busy', 'true');
        expect(cartao('Contas a pagar')).toHaveAttribute('aria-busy', 'true');
    });

    it('alerta financeiro que cai aparece no aviso da fila, mesmo com os outros alertas chegando', async () => {
        bootstrap.mockRejectedValue(TIMEOUT);
        fontesSeparadas.mockImplementation(() => fontes({ financial_alerts: caiu }));
        montar();
        expect(await screen.findByText(/Parte da fila não carregou \(alertas financeiros\)\./)).toBeInTheDocument();
    });

    // ── Menores do #521 (17/11/2026): docs/planos/2026-11-17-central-menores-plano-b.md ──

    it('alerta que não monta não trava a tela: os cartões carregam e o aviso cita a fonte', async () => {
        bootstrap.mockResolvedValue(painel({ financial_alerts: { ok: true, data: null } }));
        montar();
        expect(await screen.findByText(/Parte da fila não carregou \(alertas financeiros\)\./)).toBeInTheDocument();
        expect(cartao('Contas a pagar')).toHaveAttribute('aria-busy', 'false');
    });

    it('plano B: alerta que não monta não deixa o Atualizar preso em "carregando"', async () => {
        bootstrap.mockRejectedValue(TIMEOUT);
        fontesSeparadas.mockImplementation(() => fontes({ financial_alerts: () => Promise.resolve(null) }));
        montar();
        expect(await screen.findByText(/Parte da fila não carregou \(alertas financeiros\)\./)).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());
    });

    it('Atualizar no plano B: alerta de fonte que ainda não respondeu continua na fila', async () => {
        const fin = [{ alert_type: 'CASHFLOW_RISK', severity: 'HIGH', title: 'Saldo negativo previsto', description: 'Conta X', amount: 100, project_id: null, project_name: null, ref_id: 'r1' }];
        bootstrap.mockRejectedValue(TIMEOUT);
        fontesSeparadas
            .mockImplementationOnce(() => fontes({ financial_alerts: () => Promise.resolve(fin) }))
            .mockImplementationOnce(() => fontes({ financial_alerts: nunca }));
        montar();
        expect(await screen.findByText('Saldo negativo previsto')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());
        await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
        await waitFor(() => expect(fontesSeparadas).toHaveBeenCalledTimes(2));
        await new Promise(r => setTimeout(r, 50));
        expect(screen.getByText('Saldo negativo previsto')).toBeInTheDocument();
    });

    it('Atualizar no plano B: reajuste e 1º alerta caídos não voltam a fila ao esqueleto', async () => {
        bootstrap.mockRejectedValue(TIMEOUT);
        fontesSeparadas
            .mockImplementationOnce(() => fontes())
            .mockImplementationOnce(() => fontes({ financial_alerts: caiu, divergences: nunca, bottlenecks: nunca }));
        montar();
        await waitFor(() => expect(cartao('Minha fila')).toHaveAttribute('aria-busy', 'false'));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());
        reajustes.mockRejectedValue(TIMEOUT);
        await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
        await waitFor(() => expect(fontesSeparadas).toHaveBeenCalledTimes(2));
        await new Promise(r => setTimeout(r, 50));
        expect(cartao('Minha fila')).toHaveAttribute('aria-busy', 'false');
    });

    it('plano B: o caixa sai junto com os blocos, sem esperar o mais lento', async () => {
        bootstrap.mockRejectedValue(TIMEOUT);
        fontesSeparadas.mockImplementation(() => fontes({ scorecards: nunca }));
        montar();
        await waitFor(() => expect(fontesSeparadas).toHaveBeenCalled());
        await waitFor(() => expect(cashflow).toHaveBeenCalledTimes(1));
    });

    it('plano B pegajoso: depois de cair, o Atualizar vai direto aos blocos', async () => {
        bootstrap.mockRejectedValue(TIMEOUT);
        fontesSeparadas.mockImplementation(() => fontes());
        montar();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());
        await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
        await waitFor(() => expect(fontesSeparadas).toHaveBeenCalledTimes(2));
        expect(bootstrap).toHaveBeenCalledTimes(1);
    });

    it('plano B pegajoso: passados 5 minutos, volta a tentar a chamada única', async () => {
        const agora = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
        try {
            bootstrap.mockRejectedValueOnce(TIMEOUT).mockResolvedValue(painel());
            fontesSeparadas.mockImplementation(() => fontes());
            montar();
            await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());
            agora.mockReturnValue(1_000_000 + PLANO_B_PEGAJOSO_MS);
            await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
            await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(2));
            expect(fontesSeparadas).toHaveBeenCalledTimes(1);
        } finally {
            agora.mockRestore();
        }
    });

    it('plano B pegajoso é por organização: a outra org tenta a chamada única', async () => {
        bootstrap.mockRejectedValueOnce(TIMEOUT).mockResolvedValue(painel());
        fontesSeparadas.mockImplementation(() => fontes());
        const { rerender } = montar();
        await waitFor(() => expect(fontesSeparadas).toHaveBeenCalledWith('o1'));
        rerender(<CentralControle organizationId="o2" userEmail="ana@alpa.com.br" onNavigate={vi.fn()} />);
        await waitFor(() => expect(bootstrap).toHaveBeenCalledWith('o2'));
        expect(fontesSeparadas).toHaveBeenCalledTimes(1);
    });

    // Revisão final (17/11): sem zerar `fontesDeAlertaNaTela` na troca de org, o plano B
    // da org nova partia das fontes da anterior — alerta de outra empresa, com atalho,
    // debaixo do seletor do topo (REGRA #5) até o bloco financeiro da nova chegar.
    it('plano B nas duas orgs: alerta da org anterior nunca entra na nova', async () => {
        const fin = [{ alert_type: 'CASHFLOW_RISK', severity: 'HIGH', title: 'Alerta da o1', description: 'Conta X', amount: 100, project_id: null, project_name: null, ref_id: 'r1' }];
        bootstrap.mockRejectedValue(TIMEOUT);
        fontesSeparadas
            .mockImplementationOnce(() => fontes({ financial_alerts: () => Promise.resolve(fin) }))
            .mockImplementationOnce(() => fontes({ financial_alerts: nunca }));
        const { rerender } = montar();
        expect(await screen.findByText('Alerta da o1')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());
        rerender(<CentralControle organizationId="o2" userEmail="ana@alpa.com.br" onNavigate={vi.fn()} />);
        await waitFor(() => expect(fontesSeparadas).toHaveBeenCalledWith('o2'));
        // As outras fontes da o2 chegam (a fila sai do esqueleto); a financeira, não.
        await waitFor(() => expect(cartao('Minha fila')).toHaveAttribute('aria-busy', 'false'));
        expect(screen.queryByText('Alerta da o1')).not.toBeInTheDocument();
    });

    // ── Pendências da revisão do #538 (17/11/2026): docs/planos/2026-11-17-central-caixa-e-troca-de-org.md ──

    it('carga descartada pela mesma org não liga o pegajoso quando a mais nova respondeu', async () => {
        let rejeitar2!: (e: unknown) => void;
        bootstrap
            .mockResolvedValueOnce(painel({ scorecards: { ok: false, erro: 'timeout' } }))
            .mockReturnValueOnce(new Promise((_, rej) => { rejeitar2 = rej; }))
            .mockResolvedValue(painel());
        fontesSeparadas.mockImplementation(() => fontes());
        montar();
        await waitFor(() => expect(within(cartao('Obras')).getByText('Não carregou.')).toBeInTheDocument());
        await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());
        await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));      // carga 2: pendente
        await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(2));
        await userEvent.click(within(cartao('Obras')).getByRole('button', { name: /Tentar de novo/ })); // carga 3: responde
        await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());
        expect(within(cartao('Obras')).queryByText('Não carregou.')).not.toBeInTheDocument();
        rejeitar2(TIMEOUT);                                                               // a carga 2, já descartada, cai
        await new Promise(r => setTimeout(r, 20));
        await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
        await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(4));
        expect(fontesSeparadas).not.toHaveBeenCalled();
    });
});
