// @vitest-environment jsdom
/**
 * Detalhe interno do Credit Room: PRÉVIA de hoje por padrão e "Liberar para a instituição".
 *
 * O que estes testes protegem:
 *  - abrir a tela calcula a prévia UMA vez (prepararVersao) e NÃO grava nada (freezeVersion não é chamado);
 *  - o seletor troca para uma versão liberada (somente leitura) sem recalcular a prévia;
 *  - "Atualizar prévia" recalcula; cadastro salvo (room novo) descarta a prévia;
 *  - erro na prévia (ex.: não-membro do grupo) aparece com "Tentar de novo" e as versões liberadas seguem selecionáveis;
 *  - sala sem versão liberada: as abas funcionam e a faixa diz "Ainda não liberada à instituição";
 *  - "Liberar" entrega ao serviço o MESMO objeto da prévia da tela; trocar a data-base no painel recalcula antes;
 *  - o botão desligado diz o motivo;
 *  - Capacidade da prévia: "Salvar no room" grava SÓ os parâmetros (salvarParametrosCapacidade) e avisa onChanged;
 *    a versão liberada não tem o painel de simulação.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prepararVersao, freezeVersion, listVersions, listDocuments, salvarParametrosCapacidade } = vi.hoisted(() => ({
    prepararVersao: vi.fn(),
    freezeVersion: vi.fn(),
    listVersions: vi.fn(),
    listDocuments: vi.fn(),
    salvarParametrosCapacidade: vi.fn(),
}));

// O CreditRoomDetail importa o store inteiro; sem o cliente Supabase o módulo lança por falta de variáveis de ambiente.
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../services/creditRoomService', () => ({
    creditRoomService: { prepararVersao, freezeVersion, listVersions, listDocuments, salvarParametrosCapacidade },
}));

import { ConfirmProvider } from '../components/ui/confirm';
import CreditRoomDetail from '../components/credit/CreditRoomDetail';
import { formatMoney } from '../components/ui/Format';
import type { CreditRoom, CreditRoomVersion } from '../types/creditRoom';
import { buildSnapshot, computeIndicators, type SnapshotCapacidade } from '../utils/creditRoomSnapshot';
import { PARAMETROS_CAPACIDADE_PADRAO, type SerieMes } from '../utils/creditCapacity';
import { hojeLocalISO } from '../utils/periodoControladoria';

const serie: SerieMes[] = Array.from({ length: 12 }, (_, k) => ({
    mes: `2026-${String(k + 1).padStart(2, '0')}`, vendas: 6000, alugueis: 4000, despesa_operacional: 500,
    renda_liquida: 9500, servico_atual: 5000, servico_novo: 1000, folga: 3500, dscr: 1.58,
}));

const capacidade = (valorMaximo: number): SnapshotCapacidade => ({
    fonte: 'creditCapacity', data_base: '2026-09-07',
    parametros: PARAMETROS_CAPACIDADE_PADRAO, base: 'CONTRATADA', serie,
    recebido_12m: [], vencido_na_data_base: 0, a_vencer_mes_corrente: 0, estoque: null,
    capacidade_maxima: { parcela_maxima: 4_000, valor_maximo: valorMaximo },
    alertas: [{ tipo: 'VENDA_SEM_PARCELAS', qtd: 3, valor: 90_000 }],
    por_organizacao: [],
});

const montar = (dataBase: string, valorSolicitado: number, cap: SnapshotCapacidade | null) => {
    const snapshot = buildSnapshot({
        dataBase,
        operacao: {
            requestedAmount: valorSolicitado, modality: 'Financiamento',
            eligibleFlows: { noi: true, receivables: true, operating_cash: false },
            guarantees: [], equityCommitted: 0, equityContributed: 0,
        },
        documentVersionIds: [],
        ...(cap ? { capacidade: cap } : {}),
    });
    return { snapshot, indicators: computeIndicators(snapshot) };
};

/** O que `prepararVersao` devolve. */
const preparar = (cap: SnapshotCapacidade | null, dataBase = hojeLocalISO(), valorSolicitado = 5_000_000) =>
    ({ roomId: 'r1', dataBase, servicoNovoSimulado: true, ...montar(dataBase, valorSolicitado, cap) });

const versaoLiberada = (): CreditRoomVersion => ({
    id: 'v1', organizationId: 'o1', creditRoomId: 'r1', versionNo: 1, label: 'Proposta inicial', dataBase: '2026-08-01',
    ...montar('2026-08-01', 3_000_000, capacidade(100_000)),
    documentVersionIds: [], frozenAt: '2026-08-01T15:00:00Z',
});

const sala = (over: Partial<CreditRoom> = {}) => ({
    id: 'r1', organizationId: 'o1', code: 'CR-1', name: 'Operação teste', status: 'ENVIADA', escopo: 'EMPRESA',
    activeVersionId: 'v1', requestedAmount: 5_000_000,
    eligibleFlows: { noi: true, receivables: true, operating_cash: false },
    grupoOrganizationIds: [], empreendimentoIds: [], parametrosCapacidade: PARAMETROS_CAPACIDADE_PADRAO,
    ...over,
}) as unknown as CreditRoom;

const arvore = (room: CreditRoom) => (
    <ConfirmProvider>
        <CreditRoomDetail room={room} onBack={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()} />
    </ConfirmProvider>
);

const abrir = (room: CreditRoom = sala()) => {
    localStorage.setItem(`creditRoom:${room.id}:aba`, JSON.stringify('visao'));
    return render(arvore(room));
};

const seletor = () => screen.getByLabelText('Visão exibida') as HTMLSelectElement;
const botaoLiberar = () => screen.getByRole('button', { name: /^Liberar V\d+$/ });
const abrirPainel = () => fireEvent.click(screen.getByRole('button', { name: 'Liberar para a instituição' }));
const campoDataBase = () => document.querySelector('input[type="date"]') as HTMLInputElement;
const dinheiro = (v: number) => formatMoney(v).replace(/\s/g, ' ');

beforeEach(() => {
    localStorage.clear();
    for (const f of [prepararVersao, freezeVersion, listVersions, listDocuments, salvarParametrosCapacidade]) f.mockReset();
    listVersions.mockResolvedValue([versaoLiberada()]);
    listDocuments.mockResolvedValue([]);
});

describe('CreditRoomDetail — prévia de hoje por padrão', () => {
    it('abre na prévia, calcula UMA vez e não grava nada', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        const r = sala();
        abrir(r);

        expect(await screen.findByText(/Prévia de hoje — calculada às \d{2}:\d{2}, ainda não liberada à instituição/)).toBeInTheDocument();
        expect(prepararVersao).toHaveBeenCalledTimes(1);
        expect(prepararVersao).toHaveBeenCalledWith(r, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
        expect(freezeVersion).not.toHaveBeenCalled();
        expect(seletor().value).toBe('previa');
        // O número da prévia (valor solicitado 5 mi), não o da V1 (3 mi).
        expect(screen.getAllByText(dinheiro(5_000_000)).length).toBeGreaterThan(0);
        expect(screen.queryByText('Nenhuma versão congelada')).toBeNull();
    });

    it('enquanto calcula mostra o esqueleto (aria-busy)', async () => {
        prepararVersao.mockReturnValue(new Promise(() => undefined));
        abrir();
        const esqueleto = await screen.findByRole('status', { name: 'Calculando a prévia' });
        expect(esqueleto).toHaveAttribute('aria-busy', 'true');
    });

    it('a faixa compara com a liberada: números e cadastro que mudou', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        abrir(sala({ requestedAmount: 7_000_000 }));

        // O painel "Liberar" fica montado (escondido) e repete a comparação: a faixa é a primeira no DOM.
        const faixa = (await screen.findAllByText(/Desde a V1 liberada: valor máximo/))[0];
        const texto = (faixa.textContent ?? '').replace(/\s/g, ' ');
        expect(texto).toContain(`${dinheiro(100_000)} → ${dinheiro(123_400)}`);
        expect(texto).toMatch(/cadastro mudou: .*valor solicitado/);
    });

    it('o seletor lista a prévia e cada versão liberada, e troca para a V1 (somente leitura) sem recalcular', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        abrir();
        await screen.findByText(/Prévia de hoje — calculada às/);

        const opcoes = within(seletor()).getAllByRole('option').map(o => o.textContent);
        expect(opcoes[0]).toBe('Prévia (hoje)');
        expect(opcoes[1]).toMatch(/^V1 — liberada em \d{2}\/\d{2}\/\d{4} · ativa$/);

        fireEvent.change(seletor(), { target: { value: 'v1' } });
        expect(await screen.findByText(/V1 liberada em .* Somente leitura/)).toBeInTheDocument();
        expect(screen.getAllByText(dinheiro(3_000_000)).length).toBeGreaterThan(0);
        expect(screen.queryByText(/Prévia de hoje — calculada às/)).toBeNull();
        // A versão liberada não diz mais "congelada" (o painel de proveniência traz o texto).
        expect(screen.queryByText(/congelada/)).toBeNull();
        expect(prepararVersao).toHaveBeenCalledTimes(1);

        // Voltar para a prévia reaproveita o cálculo.
        fireEvent.change(seletor(), { target: { value: 'previa' } });
        expect(await screen.findByText(/Prévia de hoje — calculada às/)).toBeInTheDocument();
        expect(prepararVersao).toHaveBeenCalledTimes(1);
    });

    it('"Atualizar prévia" recalcula', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        abrir();
        await screen.findByText(/Prévia de hoje — calculada às/);

        fireEvent.click(screen.getByRole('button', { name: 'Atualizar prévia' }));
        await waitFor(() => expect(prepararVersao).toHaveBeenCalledTimes(2));
        expect(await screen.findByText(/Prévia de hoje — calculada às/)).toBeInTheDocument();
        expect(freezeVersion).not.toHaveBeenCalled();
    });

    it('cadastro salvo (room novo) descarta a prévia e recalcula', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        const r = sala();
        const { rerender } = abrir(r);
        await screen.findByText(/Prévia de hoje — calculada às/);

        const salvo = { ...r, name: 'Operação editada' } as CreditRoom;
        rerender(arvore(salvo));

        await waitFor(() => expect(prepararVersao).toHaveBeenCalledTimes(2));
        expect(prepararVersao).toHaveBeenLastCalledWith(salvo, expect.any(String));
        expect(await screen.findByText(/Prévia de hoje — calculada às/)).toBeInTheDocument();
    });

    it('erro na prévia (GRUPO sem acesso) aparece com "Tentar de novo" e a V1 segue selecionável', async () => {
        prepararVersao.mockRejectedValueOnce(new Error('Você não é membro de todas as empresas do grupo.'));
        abrir(sala({ escopo: 'GRUPO' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(/não é membro de todas as empresas do grupo/);
        expect(within(seletor()).getByRole('option', { name: /^V1 — liberada em/ })).toBeInTheDocument();
        expect(screen.queryByText('Atualizar prévia')).toBeNull();

        fireEvent.change(seletor(), { target: { value: 'v1' } });
        expect(await screen.findByText(/V1 liberada em .* Somente leitura/)).toBeInTheDocument();
        fireEvent.change(seletor(), { target: { value: 'previa' } });

        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
        expect(await screen.findByText(/Prévia de hoje — calculada às/)).toBeInTheDocument();
        expect(freezeVersion).not.toHaveBeenCalled();
    });

    it('prévia pronta para OUTRO dia (virada do dia) vale como nenhuma: recalcula e mostra a de hoje', async () => {
        prepararVersao.mockResolvedValueOnce(preparar(capacidade(111_100), '2020-01-01'));
        prepararVersao.mockResolvedValueOnce(preparar(capacidade(123_400)));
        abrir();

        await waitFor(() => expect(prepararVersao).toHaveBeenCalledTimes(2));
        expect(await screen.findByText(/Prévia de hoje — calculada às/)).toBeInTheDocument();
        expect(prepararVersao).toHaveBeenCalledTimes(2);
        expect(freezeVersion).not.toHaveBeenCalled();
    });

    it('a faixa só compara depois de as versões carregarem (nada de "Ainda não liberada" piscando)', async () => {
        let resolverVersoes: (v: CreditRoomVersion[]) => void = () => undefined;
        listVersions.mockReturnValue(new Promise(r => { resolverVersoes = r; }));
        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        abrir();

        expect(await screen.findByText(/Prévia de hoje — calculada às/)).toBeInTheDocument();
        expect(screen.queryByText(/Ainda não liberada à instituição/)).toBeNull();
        expect(screen.queryByText(/Desde a V\d+ liberada/)).toBeNull();
        expect(screen.getByRole('button', { name: 'Atualizar prévia' })).toBeInTheDocument();

        // O painel não crava "V1" no escuro: botão "Liberar" sem número, com o motivo no title.
        abrirPainel();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Liberar' })).not.toBeDisabled());
        expect(screen.getByRole('button', { name: 'Liberar' }).parentElement).toHaveAttribute('title', expect.stringMatching(/Carregando as versões/));
        // Botão da barra + título do painel, ambos sem número.
        expect(screen.getAllByText('Liberar para a instituição').length).toBeGreaterThanOrEqual(2);

        await act(async () => { resolverVersoes([versaoLiberada()]); });
        expect(await screen.findAllByText(/Desde a V1 liberada: valor máximo/)).not.toHaveLength(0);
        expect(screen.getByRole('button', { name: 'Liberar V2' })).toBeInTheDocument();
    });

    it('sala sem versão liberada: a prévia funciona e a faixa diz que ainda não foi liberada', async () => {
        listVersions.mockResolvedValue([]);
        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        abrir(sala({ activeVersionId: undefined } as Partial<CreditRoom>));

        expect((await screen.findAllByText(/Ainda não liberada à instituição — o banco ainda não vê nada desta operação/)).length).toBeGreaterThan(0);
        await waitFor(() => expect(listVersions).toHaveBeenCalled());
        expect(within(seletor()).getAllByRole('option')).toHaveLength(1);
        expect(screen.getAllByText(dinheiro(5_000_000)).length).toBeGreaterThan(0);
    });
});

describe('LiberarSheet — Liberar para a instituição', () => {
    it('abre com o resumo DA PRÉVIA: valor máximo, DSCR, renda, alertas com o "como resolver", blocos sem dado e a comparação', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        abrir();
        await screen.findByText(/Prévia de hoje — calculada às/);
        abrirPainel();

        await screen.findByText('Valor máximo (sobre a dívida atual)');
        const painel = screen.getByRole('region', { name: 'Resumo da prévia' });
        expect(within(painel).getByText('DSCR mínimo 12m (pós-operação)')).toBeInTheDocument();
        expect(within(painel).getByText('Renda líquida média 12m')).toBeInTheDocument();
        expect(within(painel).getByText('1,58×')).toBeInTheDocument();
        expect(within(painel).getByText(dinheiro(123_400))).toBeInTheDocument();
        expect(within(painel).getByText(/Vendas sem parcelas geradas/)).toBeInTheDocument();
        expect(within(painel).getByText(/Gerar parcelas/)).toBeInTheDocument();
        expect(within(painel).getByText(/Sem dado nesta versão:.*Obra/)).toBeInTheDocument();
        expect(within(painel).getByText(/Desde a V1 liberada: valor máximo/)).toBeInTheDocument();
        expect(screen.getByText('Liberar V2 para a instituição')).toBeInTheDocument();
        expect(botaoLiberar()).not.toBeDisabled();
        // Não há mais o passo "Conferir".
        expect(screen.queryByRole('button', { name: /^Conferir$/ })).toBeNull();
        expect(prepararVersao).toHaveBeenCalledTimes(1);
    });

    it('carteira sem alertas diz que não há pendências; capacidade ausente avisa que a versão sai sem ela', async () => {
        prepararVersao.mockResolvedValue(preparar({ ...capacidade(123_400), alertas: [] }));
        const { unmount } = abrir();
        await screen.findByText(/Prévia de hoje — calculada às/);
        abrirPainel();
        expect(await screen.findByText('Carteira sem pendências de cadastro')).toBeInTheDocument();
        unmount();

        prepararVersao.mockReset();
        prepararVersao.mockResolvedValue(preparar(null));
        abrir();
        await screen.findByText(/Prévia de hoje — calculada às/);
        abrirPainel();
        expect(await screen.findByText(/capacidade de pagamento não pôde ser calculada/i)).toBeInTheDocument();
        expect(screen.getByText(/será liberada sem ela/i)).toBeInTheDocument();
        expect(botaoLiberar()).not.toBeDisabled();
    });

    it('"Liberar" entrega ao serviço o MESMO objeto da prévia da tela; depois a nova versão entra no seletor e a visão segue na prévia', async () => {
        const previa = preparar(capacidade(123_400));
        prepararVersao.mockResolvedValue(previa);
        const nova = { ...versaoLiberada(), id: 'v2', versionNo: 2, label: 'Comitê' } as CreditRoomVersion;
        freezeVersion.mockResolvedValue(nova);
        const r = sala();
        abrir(r);
        await screen.findByText(/Prévia de hoje — calculada às/);
        abrirPainel();

        fireEvent.change(screen.getByPlaceholderText(/Proposta inicial/), { target: { value: ' Comitê ' } });
        await waitFor(() => expect(botaoLiberar()).not.toBeDisabled());
        fireEvent.click(botaoLiberar());

        await waitFor(() => expect(freezeVersion).toHaveBeenCalledTimes(1));
        const [salaArg, opts, preparadaArg] = freezeVersion.mock.calls[0];
        expect(salaArg).toBe(r);
        expect(opts).toMatchObject({ label: 'Comitê', dataBase: previa.dataBase });
        expect(preparadaArg).toBe(previa);
        // Só um cálculo: liberar não relê nada além do que está na tela.
        expect(prepararVersao).toHaveBeenCalledTimes(1);

        await waitFor(() => expect(within(seletor()).getByRole('option', { name: /^V2 — liberada em/ })).toBeInTheDocument());
        expect(seletor().value).toBe('previa');
    });

    it('trocar a data-base recalcula a prévia antes de liberar (e liberar grava a prévia NOVA)', async () => {
        const hoje = preparar(capacidade(123_400));
        const outra = preparar(capacidade(150_000), '2026-08-31');
        prepararVersao.mockResolvedValueOnce(hoje);
        let resolver: (p: ReturnType<typeof preparar>) => void = () => undefined;
        prepararVersao.mockReturnValueOnce(new Promise(r => { resolver = r; }));
        freezeVersion.mockResolvedValue({ ...versaoLiberada(), id: 'v2', versionNo: 2 });
        abrir();
        await screen.findByText(/Prévia de hoje — calculada às/);
        abrirPainel();
        await waitFor(() => expect(botaoLiberar()).not.toBeDisabled());

        fireEvent.change(campoDataBase(), { target: { value: '2026-08-31' } });

        await waitFor(() => expect(prepararVersao).toHaveBeenCalledTimes(2));
        expect(prepararVersao).toHaveBeenLastCalledWith(expect.anything(), '2026-08-31');
        // Enquanto recalcula, "Liberar" fica desligado e diz o motivo.
        expect(botaoLiberar()).toBeDisabled();
        expect(botaoLiberar().parentElement).toHaveAttribute('title', 'Calculando a prévia desta data-base...');

        await act(async () => { resolver(outra); });
        await waitFor(() => expect(botaoLiberar()).not.toBeDisabled());
        fireEvent.click(botaoLiberar());
        await waitFor(() => expect(freezeVersion).toHaveBeenCalledTimes(1));
        expect(freezeVersion.mock.calls[0][2]).toBe(outra);
        expect(freezeVersion.mock.calls[0][1]).toMatchObject({ dataBase: '2026-08-31' });
    });

    it('cálculo que volta DEPOIS de a data-base mudar de novo é ignorado', async () => {
        const hoje = preparar(capacidade(123_400));
        const antiga = preparar(capacidade(150_000), '2026-08-31');
        prepararVersao.mockResolvedValueOnce(hoje);
        let resolverAntiga: (p: ReturnType<typeof preparar>) => void = () => undefined;
        prepararVersao.mockReturnValueOnce(new Promise(r => { resolverAntiga = r; }));
        prepararVersao.mockReturnValueOnce(new Promise(() => undefined));
        abrir();
        await screen.findByText(/Prévia de hoje — calculada às/);
        abrirPainel();
        await waitFor(() => expect(botaoLiberar()).not.toBeDisabled());

        fireEvent.change(campoDataBase(), { target: { value: '2026-08-31' } });
        await waitFor(() => expect(prepararVersao).toHaveBeenCalledTimes(2));
        fireEvent.change(campoDataBase(), { target: { value: '2026-08-15' } });
        await waitFor(() => expect(prepararVersao).toHaveBeenCalledTimes(3));
        await act(async () => { resolverAntiga(antiga); });

        expect(botaoLiberar()).toBeDisabled();
        expect(screen.queryByRole('region', { name: 'Resumo da prévia' })).toBeNull();
    });

    it('cadastro salvo com o painel aberto: a prévia velha some, recalcula para a data-base do painel e só então libera', async () => {
        const velha = preparar(capacidade(123_400));
        const nova = preparar(capacidade(222_200));
        prepararVersao.mockResolvedValueOnce(velha);
        let resolver: (p: ReturnType<typeof preparar>) => void = () => undefined;
        prepararVersao.mockReturnValueOnce(new Promise(r => { resolver = r; }));
        freezeVersion.mockResolvedValue({ ...versaoLiberada(), id: 'v2', versionNo: 2 });
        const r = sala();
        const { rerender } = abrir(r);
        await screen.findByText(/Prévia de hoje — calculada às/);
        abrirPainel();
        await waitFor(() => expect(botaoLiberar()).not.toBeDisabled());

        const salvo = { ...r, name: 'Operação editada' } as CreditRoom;
        rerender(arvore(salvo));

        await waitFor(() => expect(prepararVersao).toHaveBeenCalledTimes(2));
        expect(botaoLiberar()).toBeDisabled();
        await act(async () => { resolver(nova); });
        await waitFor(() => expect(botaoLiberar()).not.toBeDisabled());
        fireEvent.click(botaoLiberar());
        await waitFor(() => expect(freezeVersion).toHaveBeenCalledTimes(1));
        expect(freezeVersion.mock.calls[0][0]).toBe(salvo);
        expect(freezeVersion.mock.calls[0][2]).toBe(nova);
    });

    it('cancelar o painel com a data-base trocada e o cálculo em voo: o resultado tardio é ignorado, a aba segue em HOJE e o painel reabre usável', async () => {
        const hoje1 = preparar(capacidade(123_400));
        const tardia = preparar(capacidade(150_000), '2026-08-31');
        const hoje2 = preparar(capacidade(123_400));
        prepararVersao.mockResolvedValueOnce(hoje1);
        let resolverTardia: (p: ReturnType<typeof preparar>) => void = () => undefined;
        prepararVersao.mockReturnValueOnce(new Promise(r => { resolverTardia = r; }));
        prepararVersao.mockResolvedValue(hoje2);
        abrir();
        await screen.findByText(/Prévia de hoje — calculada às/);
        abrirPainel();
        await waitFor(() => expect(botaoLiberar()).not.toBeDisabled());

        fireEvent.change(campoDataBase(), { target: { value: '2026-08-31' } });
        await waitFor(() => expect(prepararVersao).toHaveBeenCalledTimes(2));
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        // Fechou: a aba recalcula a de hoje (3ª chamada) e o cálculo da outra data, quando voltar, não vira a prévia.
        await waitFor(() => expect(prepararVersao).toHaveBeenCalledTimes(3));
        expect(prepararVersao).toHaveBeenLastCalledWith(expect.anything(), hojeLocalISO());
        await act(async () => { resolverTardia(tardia); });

        expect(await screen.findByText(/Prévia de hoje — calculada às/)).toBeInTheDocument();
        expect(screen.queryByRole('status', { name: 'Calculando a prévia' })).toBeNull();
        expect(prepararVersao).toHaveBeenCalledTimes(3);

        // Reabrir: a data-base volta para hoje e "Liberar" liga (nada de esqueleto eterno).
        abrirPainel();
        await waitFor(() => expect(botaoLiberar()).not.toBeDisabled());
        expect(campoDataBase().value).toBe(hojeLocalISO());
        expect(prepararVersao).toHaveBeenCalledTimes(3);
    });

    it('a data-base fica travada enquanto libera, com o motivo', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        freezeVersion.mockReturnValue(new Promise(() => undefined));
        abrir();
        await screen.findByText(/Prévia de hoje — calculada às/);
        abrirPainel();
        await waitFor(() => expect(botaoLiberar()).not.toBeDisabled());
        fireEvent.click(botaoLiberar());
        await waitFor(() => expect(campoDataBase()).toBeDisabled());
        expect(campoDataBase()).toHaveAttribute('title', expect.stringMatching(/Liberando/));
    });

    it('erro do cálculo aparece no painel, não libera e permite tentar de novo', async () => {
        prepararVersao.mockRejectedValueOnce(new Error('Você não é membro de todas as empresas do grupo.'));
        abrir(sala({ escopo: 'GRUPO' }));
        await screen.findByRole('alert');
        abrirPainel();

        expect(await screen.findAllByText(/não é membro de todas as empresas do grupo/)).not.toHaveLength(0);
        expect(botaoLiberar()).toBeDisabled();
        expect(botaoLiberar().parentElement).toHaveAttribute('title', 'A prévia não pôde ser calculada: veja o motivo acima');

        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        const painel = screen.getAllByRole('alert').find(a => /Tentar de novo/.test(a.textContent ?? ''))!;
        fireEvent.click(within(painel).getByRole('button', { name: 'Tentar de novo' }));
        await waitFor(() => expect(botaoLiberar()).not.toBeDisabled());
    });
});

describe('CreditRoomDetail — simular parâmetros na aba Capacidade', () => {
    const abrirCapacidade = (r: CreditRoom, onChanged = vi.fn()) => {
        localStorage.setItem(`creditRoom:${r.id}:aba`, JSON.stringify('capacidade'));
        render(
            <ConfirmProvider>
                <CreditRoomDetail room={r} onBack={vi.fn()} onEdit={vi.fn()} onChanged={onChanged} />
            </ConfirmProvider>,
        );
        return onChanged;
    };

    it('simular não grava; "Salvar no room" chama salvarParametrosCapacidade com o cadastro editado e avisa onChanged', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        const r = sala();
        const salvo = { ...r, parametrosCapacidade: { ...PARAMETROS_CAPACIDADE_PADRAO, taxa_mensal_pct: 2.2 } } as CreditRoom;
        salvarParametrosCapacidade.mockResolvedValue(salvo);
        const onChanged = abrirCapacidade(r);

        await screen.findByText('Simular parâmetros');
        fireEvent.change(screen.getByLabelText('Taxa mensal (%)'), { target: { value: '2.2' } });
        expect(screen.getByText('simulado — não salvo')).toBeInTheDocument();
        expect(salvarParametrosCapacidade).not.toHaveBeenCalled();
        expect(freezeVersion).not.toHaveBeenCalled();
        expect(prepararVersao).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Salvar no room' }));

        await waitFor(() => expect(onChanged).toHaveBeenCalledWith(salvo));
        expect(salvarParametrosCapacidade).toHaveBeenCalledWith(r, { ...PARAMETROS_CAPACIDADE_PADRAO, taxa_mensal_pct: 2.2 });
        expect(freezeVersion).not.toHaveBeenCalled();
    });

    it('depois de "Salvar no room" a prévia é recalculada com o room novo e a marca "simulado — não salvo" some', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        const r = sala();
        const salvo = { ...r, parametrosCapacidade: { ...PARAMETROS_CAPACIDADE_PADRAO, taxa_mensal_pct: 2.2 } } as CreditRoom;
        salvarParametrosCapacidade.mockResolvedValue(salvo);
        // O pai troca o room de verdade: a prévia velha é descartada e a nova nasce do cadastro salvo.
        const onChanged = vi.fn();
        localStorage.setItem(`creditRoom:${r.id}:aba`, JSON.stringify('capacidade'));
        const ui = (room: CreditRoom) => (
            <ConfirmProvider>
                <CreditRoomDetail room={room} onBack={vi.fn()} onEdit={vi.fn()} onChanged={onChanged} />
            </ConfirmProvider>
        );
        const { rerender } = render(ui(r));

        await screen.findByText('Simular parâmetros');
        fireEvent.change(screen.getByLabelText('Taxa mensal (%)'), { target: { value: '2.2' } });
        expect(screen.getByText('simulado — não salvo')).toBeInTheDocument();
        expect(prepararVersao).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Salvar no room' }));
        await waitFor(() => expect(onChanged).toHaveBeenCalledWith(salvo));
        rerender(ui(salvo));

        await waitFor(() => expect(prepararVersao).toHaveBeenCalledTimes(2));
        expect(prepararVersao).toHaveBeenLastCalledWith(salvo, expect.any(String));
        expect(await screen.findByText('Simular parâmetros')).toBeInTheDocument();
        expect(screen.queryByText('simulado — não salvo')).toBeNull();
        expect((screen.getByLabelText('Taxa mensal (%)') as HTMLInputElement).value).toBe('2.2');
    });

    it('"Liberar" avisa que a simulação não salva NÃO vai na liberação (e segue habilitado); o aviso some ao voltar aos do room', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        abrirCapacidade(sala());
        await screen.findByText('Simular parâmetros');
        const aviso = /Há uma simulação não salva na aba Capacidade — ela NÃO vai nesta liberação/;

        // Sem simulação: nada a avisar.
        abrirPainel();
        await screen.findByRole('button', { name: /^Liberar V\d+$/ });
        expect(screen.queryByText(aviso)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

        fireEvent.change(screen.getByLabelText('Taxa mensal (%)'), { target: { value: '2.2' } });
        abrirPainel();
        expect(await screen.findByText(aviso)).toBeInTheDocument();
        expect(screen.getByText(aviso).textContent).toContain('Salve no room antes de liberar se quiser os simulados.');
        await waitFor(() => expect(botaoLiberar()).not.toBeDisabled());
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

        fireEvent.click(screen.getByRole('button', { name: 'Voltar aos do room' }));
        abrirPainel();
        await screen.findByRole('button', { name: /^Liberar V\d+$/ });
        expect(screen.queryByText(aviso)).toBeNull();
    });

    it('com a simulação pendente, trocar de aba (a Capacidade desmonta) apaga o aviso do "Liberar"', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        abrirCapacidade(sala());
        await screen.findByText('Simular parâmetros');
        fireEvent.change(screen.getByLabelText('Taxa mensal (%)'), { target: { value: '2.2' } });

        fireEvent.click(screen.getByRole('tab', { name: /^Versões/ }));
        await waitFor(() => expect(screen.queryByText('Simular parâmetros')).toBeNull());
        abrirPainel();
        await screen.findByRole('button', { name: /^Liberar V\d+$/ });
        expect(screen.queryByText(/Há uma simulação não salva/)).toBeNull();
    });

    it('falha ao salvar mostra o motivo e não avisa onChanged', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        salvarParametrosCapacidade.mockRejectedValue(new Error('permission denied'));
        const onChanged = abrirCapacidade(sala());

        await screen.findByText('Simular parâmetros');
        fireEvent.change(screen.getByLabelText('Taxa mensal (%)'), { target: { value: '2.2' } });
        fireEvent.click(screen.getByRole('button', { name: 'Salvar no room' }));

        expect(await screen.findByText(/permission denied/)).toBeInTheDocument();
        expect(onChanged).not.toHaveBeenCalled();
    });

    it('a versão liberada (somente leitura) não tem o painel', async () => {
        prepararVersao.mockResolvedValue(preparar(capacidade(123_400)));
        abrirCapacidade(sala());
        await screen.findByText('Simular parâmetros');

        fireEvent.change(seletor(), { target: { value: 'v1' } });
        expect(await screen.findByText(/V1 liberada em .* Somente leitura/)).toBeInTheDocument();
        expect(screen.queryByText('Simular parâmetros')).toBeNull();
    });
});
