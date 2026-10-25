// @vitest-environment jsdom
/**
 * Portal do Síndico (20/10/2026, docs/planos/2026-10-20-portal-do-sindico.md).
 *
 * O que fica travado:
 *  1. a casca carrega pela identidade certa (token no link/login, clientId na
 *     prévia do admin) e mostra o prédio;
 *  2. a prévia diz que é somente leitura;
 *  3. a aba Unidades mostra o contato dos ocupantes e a situação da cota —
 *     inclusive "Não cobrada" para cota sem título (nunca "em aberto");
 *  4. acesso recusado mostra o motivo do banco (ex.: mandato não vigente).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDados = vi.fn();
const getFinanceiro = vi.fn();
const baixarTitulo = vi.fn();
const receberTitulo = vi.fn();
const getContas = vi.fn();
const getExtrato = vi.fn();
vi.mock('../../services/sindicoPortalService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../services/sindicoPortalService')>()),
    sindicoPortalService: {
        getDados: (...a: unknown[]) => getDados(...a),
        abrirDocumento: vi.fn(),
        comprovantesDoRateio: vi.fn(),
        getFinanceiro: (...a: unknown[]) => getFinanceiro(...a),
        documentosDosTitulos: vi.fn().mockResolvedValue({}),
        baixarTitulo: (...a: unknown[]) => baixarTitulo(...a),
        receberTitulo: (...a: unknown[]) => receberTitulo(...a),
        getContas: (...a: unknown[]) => getContas(...a),
        getExtrato: (...a: unknown[]) => getExtrato(...a),
    },
}));

import SindicoPortal from '../../components/sindico/SindicoPortal';
// Na app o provedor vive na raiz (index.tsx); a casca do portal fica dentro dele.
import { ConfirmProvider } from '../../components/ui/confirm';

const payload = {
    ok: true,
    sindico: { clientId: 's1', nome: 'Maria Síndica', email: 'maria@x.com' },
    condominios: [{ id: 'c1', codigo: '010', nome: '010 - Galeria Altavista', cnpj: null, razaoSocial: null, cidade: 'Uberaba', mandatoInicio: null, mandatoFim: null }],
    unidades: [{
        unitId: 'u1', unidade: 'Sala - 201', torre: 'Torre Única', pavimento: 2, tipologia: 'Sala',
        areaPrivativa: 17, fracaoIdeal: null, fracaoOrigem: null, papeis: [],
        condominioId: 'c1', condominioCode: '010', condominioNome: '010 - Galeria Altavista', condominioCnpj: null,
        ocupacoes: [{ papel: 'INQUILINO', nome: 'João Inquilino', clientId: 'p1', email: 'joao@x.com', telefone: '34 9999-0000', desde: null }],
    }],
    avisos: [], documentos: [], manutencao: [], ordens: [], ativos: [],
    rateios: [{
        id: 'r1', numero: 'RAT-1', competencia: '2026-09-01', tipo: 'ORDINARIO', criterio: 'AREA_PRIVATIVA',
        status: 'FECHADO', totalDespesas: 1000, totalRateado: 1000, fechadoEm: '2026-09-30', condominioId: 'c1',
        condominioNome: '010 - Galeria Altavista', despesas: [],
        cotas: [{ id: 'i1', unitId: 'u1', unidade: 'Sala - 201', torre: 'Torre Única', pessoa: 'João Inquilino', peso: 1, valor: 250, ajusteManual: false, minha: false, tituloStatus: null, tituloNegocio: null, vencimento: null, pagoEm: null }],
    }],
};

// Financeiro do condomínio (24/10/2026, docs/planos/2026-10-24-portal-sindico-financeiro.md).
const condominioFin = {
    id: 'c1', nome: '010 - Galeria Altavista', codigo: '010', podeOperar: true, motivoNaoOpera: null,
    centros: [{ id: 'cc1', code: '010', name: 'Galeria Altavista', parentId: null }],
    categorias: [{ id: 'cat1', name: 'Manutenção predial', parentId: null, nature: 'EXPENSE' }],
    planos: [], contas: [], fornecedores: [],
};
const tituloBase = {
    condominioId: 'c1', direcao: 'DEBIT', supplierId: null, competencia: '2026-10-01', status: 'PENDING',
    businessStatus: 'PREVISTO', approvalStatus: 'APROVADO', pagoEm: null, formaPagamento: null, contaId: null,
    centroId: 'cc1', categoriaId: 'cat1', categoria: 'Manutenção predial', planoId: null, lancadoPeloSindico: false, travaAsaas: null,
};
const financeiro = {
    competencia: '2026-10-01', hoje: '2026-10-24', condominios: [condominioFin],
    titulos: [
        { ...tituloBase, id: 'm1', origem: 'MANUAL', descricao: 'Limpeza da caixa d\'água', credor: 'Hidro Ltda', vencimento: '2026-10-30', valor: 350 },
        { ...tituloBase, id: 'k1', origem: 'CONTRACT_RECURRING', descricao: 'Portaria terceirizada', credor: 'Vigia SA', vencimento: '2026-10-10', valor: 1200 },
    ],
};

// O Sheet fechado continua montado (por portal, no fim do body): os botões do
// rodapé dos painéis existem no DOM. As buscas olham só a tabela e o 1º "Lançar".
const naTabela = () => within(screen.getByRole('table'));
const lancarConta = () => screen.getAllByRole('button', { name: /Lançar conta/ })[0];

const irParaContasAPagar = async () => {
    await screen.findAllByText('010 - Galeria Altavista');
    fireEvent.click(screen.getAllByRole('button', { name: /^Financeiro$/ })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Contas a pagar' }));
    await screen.findByText('Portaria terceirizada');
};

describe('SindicoPortal', () => {
    beforeEach(() => {
        getDados.mockReset(); getFinanceiro.mockReset(); baixarTitulo.mockReset(); receberTitulo.mockReset(); getContas.mockReset(); getExtrato.mockReset(); localStorage.clear();
        getFinanceiro.mockResolvedValue(financeiro);
    });

    it('1–2. prévia por clientId: carrega o prédio e avisa que é somente leitura', async () => {
        getDados.mockResolvedValue(payload);
        render(<ConfirmProvider><SindicoPortal clientId="s1" somenteLeitura embutido /></ConfirmProvider>);
        expect(await screen.findByText(/somente leitura, nada é gravado/)).toBeTruthy();
        expect(getDados).toHaveBeenCalledWith({ clientId: 's1' });
        expect((await screen.findAllByText('010 - Galeria Altavista')).length).toBeGreaterThan(0);
    });

    it('3. Unidades: contato do ocupante e cota sem título = Não cobrada', async () => {
        getDados.mockResolvedValue(payload);
        render(<ConfirmProvider><SindicoPortal token="tok" /></ConfirmProvider>);
        await screen.findAllByText('010 - Galeria Altavista');
        expect(getDados).toHaveBeenCalledWith({ token: 'tok' });
        fireEvent.click(screen.getAllByRole('button', { name: /Unidades/ })[0]);
        expect(await screen.findByText('joao@x.com')).toBeTruthy();
        expect(screen.getByText('34 9999-0000')).toBeTruthy();
        expect(screen.getByText('Não cobrada')).toBeTruthy();
        expect(screen.queryByText('Em aberto')).toBeNull();
    });

    it('5. prévia do admin não oferece ação (publicar, responder)', async () => {
        getDados.mockResolvedValue({ ...payload, chamados: [{
            id: 'ch1', titulo: 'Vazamento', descricao: null, categoria: 'Hidráulica', prioridade: 'Alta', status: 'Aberto',
            abertoEm: '2026-10-01', resolvidoEm: null, notaDaEquipe: null, unitId: 'u1', unidade: 'Sala - 201', torre: null,
            morador: 'João Inquilino', moradorEmail: null, moradorTelefone: null, condominioId: 'c1', condominioNome: '010', eventos: [],
        }] });
        render(<ConfirmProvider><SindicoPortal clientId="s1" somenteLeitura embutido /></ConfirmProvider>);
        await screen.findAllByText('010 - Galeria Altavista');
        fireEvent.click(screen.getAllByRole('button', { name: /Avisos/ })[0]);
        await screen.findByText('Avisos do condomínio');
        expect(screen.queryByRole('button', { name: /Publicar aviso/ })).toBeNull();
        fireEvent.click(screen.getAllByRole('button', { name: /Chamados/ })[0]);
        expect(await screen.findByText('Vazamento')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Ver' })).toBeTruthy();
    });

    it('6. rateio: o síndico monta e fecha (fechar = a aprovação dele) — só com login', async () => {
        // G1 (24/10/2026): "Aprovar" virou "Fechar" — quem fecha é o síndico.
        const comRascunho = { ...payload, rateios: [{ ...payload.rateios[0], status: 'RASCUNHO', aprovacao: { status: null, em: null, porNome: null, observacao: null, desatualizada: false } }] };
        getDados.mockResolvedValue(comRascunho);
        const { unmount } = render(<ConfirmProvider><SindicoPortal token="tok" /></ConfirmProvider>);
        await screen.findAllByText('010 - Galeria Altavista');
        // Desde 24/10/2026 a prestação de contas é sub-aba do Financeiro.
        fireEvent.click(screen.getAllByRole('button', { name: /^Financeiro$/ })[0]);
        fireEvent.click(await screen.findByRole('button', { name: 'Prestação de contas' }));
        const fecharLink = await screen.findByRole('button', { name: /^Fechar$/ });
        expect((fecharLink as HTMLButtonElement).disabled).toBe(true);
        expect(fecharLink.parentElement?.getAttribute('title')).toMatch(/e-mail e senha/);
        const novoLink = screen.getByRole('button', { name: /Novo rateio/ });
        expect((novoLink as HTMLButtonElement).disabled).toBe(true);
        unmount();

        render(<ConfirmProvider><SindicoPortal token="tok" onLogout={() => undefined} /></ConfirmProvider>);
        await screen.findAllByText('010 - Galeria Altavista');
        await waitFor(async () => {
            const fecharLogin = await screen.findByRole('button', { name: /^Fechar$/ });
            expect((fecharLogin as HTMLButtonElement).disabled).toBe(false);
        });
        expect((screen.getByRole('button', { name: /Novo rateio/ }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('6b. rateio fechado: gerar cotas com login; cancelar diz por quê quando a cota já virou cobrança', async () => {
        const cota = payload.rateios[0].cotas[0];
        const fechado = {
            ...payload,
            rateios: [{ ...payload.rateios[0], status: 'FECHADO', cotas: [
                { ...cota, tituloStatus: 'PENDING' },
                { ...cota, id: 'i2', unitId: 'u2', unidade: 'Sala - 202', tituloStatus: null },
            ] }],
        };
        getDados.mockResolvedValue(fechado);
        render(<ConfirmProvider><SindicoPortal token="tok" onLogout={() => undefined} /></ConfirmProvider>);
        await screen.findAllByText('010 - Galeria Altavista');
        fireEvent.click(screen.getAllByRole('button', { name: /^Financeiro$/ })[0]);
        fireEvent.click(await screen.findByRole('button', { name: 'Prestação de contas' }));
        // Painéis fechados continuam montados (portal no fim do body): o 1º é o da lista.
        await waitFor(() => {
            const gerar = screen.getAllByRole('button', { name: /Gerar cotas/ })[0];
            expect((gerar as HTMLButtonElement).disabled).toBe(false);
        });
        const cancelar = screen.getAllByRole('button', { name: /^Cancelar$/ })[0];
        expect((cancelar as HTMLButtonElement).disabled).toBe(true);
        expect(cancelar.parentElement?.getAttribute('title')).toMatch(/viraram cobrança/);
    });

    it('7. Financeiro pelo LINK: lê o caixa, mas lançar e pagar pedem login', async () => {
        getDados.mockResolvedValue(payload);
        render(<ConfirmProvider><SindicoPortal token="tok" /></ConfirmProvider>);
        await irParaContasAPagar();
        expect(getFinanceiro).toHaveBeenCalledWith({ token: 'tok' }, expect.stringMatching(/^\d{4}-\d{2}-01$/));
        const lancar = lancarConta();
        expect((lancar as HTMLButtonElement).disabled).toBe(true);
        expect(lancar.parentElement?.getAttribute('title')).toMatch(/e-mail e senha/);
        const pagar = naTabela().getAllByRole('button', { name: 'Pagar' });
        expect(pagar.every(b => (b as HTMLButtonElement).disabled)).toBe(true);
    });

    it('8. Financeiro com LOGIN: paga qualquer origem; edita só o manual, e o contrato diz por quê', async () => {
        getDados.mockResolvedValue(payload);
        baixarTitulo.mockResolvedValue(undefined);
        render(<ConfirmProvider><SindicoPortal token="tok" onLogout={() => undefined} /></ConfirmProvider>);
        await irParaContasAPagar();
        expect((lancarConta() as HTMLButtonElement).disabled).toBe(false);
        const pagar = naTabela().getAllByRole('button', { name: 'Pagar' }) as HTMLButtonElement[];
        expect(pagar.every(b => !b.disabled)).toBe(true);
        const editar = naTabela().getAllByRole('button', { name: 'Editar' }) as HTMLButtonElement[];
        // Ordem por vencimento: o contrato (10/10) vem antes do manual (30/10).
        expect(editar[0].disabled).toBe(true);
        expect(editar[0].parentElement?.getAttribute('title')).toMatch(/contrato/);
        expect(editar[1].disabled).toBe(false);

        fireEvent.click(pagar[1]);
        fireEvent.click(await screen.findByRole('button', { name: /Confirmar pagamento/ }));
        await waitFor(() => expect(baixarTitulo).toHaveBeenCalledWith({ token: 'tok' }, 'm1', expect.objectContaining({ data: expect.any(String) })));
        // Depois de gravar, relê o financeiro.
        await waitFor(() => expect(getFinanceiro).toHaveBeenCalledTimes(2));
    });

    it('8b. G2a — receber com login; baixa já casada com o extrato não se desfaz, e diz por quê', async () => {
        getDados.mockResolvedValue(payload);
        receberTitulo.mockResolvedValue(undefined);
        getFinanceiro.mockResolvedValue({ ...financeiro, titulos: [
            { ...tituloBase, id: 'r1', direcao: 'CREDIT', origem: 'MANUAL', descricao: 'Aluguel do salão', credor: 'João', vencimento: '2026-10-20', valor: 200 },
            { ...tituloBase, id: 'r2', direcao: 'CREDIT', origem: 'MANUAL', descricao: 'Multa', credor: 'Ana', vencimento: '2026-10-05', valor: 80,
              status: 'CONCILIATED', businessStatus: 'RECEBIDO', pagoEm: '2026-10-06', conciliadoExtrato: true },
        ] });
        render(<ConfirmProvider><SindicoPortal token="tok" onLogout={() => undefined} /></ConfirmProvider>);
        await screen.findAllByText('010 - Galeria Altavista');
        fireEvent.click(screen.getAllByRole('button', { name: /^Financeiro$/ })[0]);
        fireEvent.click(await screen.findByRole('button', { name: 'Contas a receber' }));
        await screen.findByText('Aluguel do salão');
        const desfazer = naTabela().getByRole('button', { name: 'Desfazer' });
        expect((desfazer as HTMLButtonElement).disabled).toBe(true);
        expect(desfazer.parentElement?.getAttribute('title')).toMatch(/extrato/);
        expect((screen.getAllByRole('button', { name: /Lançar receita/ })[0] as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(naTabela().getByRole('button', { name: 'Receber' }));
        fireEvent.click(await screen.findByRole('button', { name: /Confirmar recebimento/ }));
        await waitFor(() => expect(receberTitulo).toHaveBeenCalledWith({ token: 'tok' }, 'r1', expect.objectContaining({ data: expect.any(String) })));
    });

    it('8c. G2a — Contas bancárias: lista a conta do condomínio; a do Asaas não se edita por aqui', async () => {
        getDados.mockResolvedValue(payload);
        getContas.mockResolvedValue([
            { id: 'a1', codigo: '001', nome: 'Sicredi Condomínio', tipo: 'banco', banco: '748', agencia: '0812', numero: '1', descricao: null,
              saldoInicial: 100, saldoInicialEm: '2026-10-01', ativa: true, emUso: false },
            { id: 'a2', codigo: '002', nome: 'Asaas', tipo: 'gateway', banco: null, agencia: null, numero: null, descricao: null,
              saldoInicial: 0, saldoInicialEm: null, ativa: true, emUso: true },
        ]);
        render(<ConfirmProvider><SindicoPortal token="tok" onLogout={() => undefined} /></ConfirmProvider>);
        await screen.findAllByText('010 - Galeria Altavista');
        fireEvent.click(screen.getAllByRole('button', { name: /^Financeiro$/ })[0]);
        fireEvent.click(await screen.findByRole('button', { name: 'Contas bancárias' }));
        expect(await screen.findByText('Sicredi Condomínio')).toBeTruthy();
        expect(getContas).toHaveBeenCalledWith({ token: 'tok' }, 'c1');
        const editar = within(screen.getByRole('table')).getAllByRole('button', { name: 'Editar' }) as HTMLButtonElement[];
        expect(editar[0].disabled).toBe(false);
        expect(editar[1].disabled).toBe(true);
        expect(editar[1].parentElement?.getAttribute('title')).toMatch(/Asaas/);
        await waitFor(() => expect((screen.getAllByRole('button', { name: /Nova conta/ })[0] as HTMLButtonElement).disabled).toBe(false));
    });

    it('8d. G2b — extrato: importar e conciliar com login; conciliado só desfaz', async () => {
        getDados.mockResolvedValue(payload);
        getContas.mockResolvedValue([{ id: 'a1', codigo: '001', nome: 'Sicredi Condomínio', tipo: 'banco', banco: null, agencia: null,
            numero: '12345-6', descricao: null, saldoInicial: 100, saldoInicialEm: '2026-10-01', ativa: true, emUso: true }]);
        getExtrato.mockResolvedValue({ temMovimento: true, importacoes: [], movimentos: [
            { id: 'b1', data: '2026-10-10', valor: 1200, direcao: 'DEBIT', descricao: 'PAGTO VIGIA SA', status: 'MATCHED', candidatosExatos: 0,
              vinculos: [{ matchId: 'm1', tituloId: 'k1', descricao: 'Portaria terceirizada', valor: 1200, vencimento: '2026-10-10', credor: 'Vigia SA' }] },
            { id: 'b2', data: '2026-10-12', valor: 12.9, direcao: 'DEBIT', descricao: 'TARIFA PACOTE', status: 'NORMALIZED', candidatosExatos: 0, vinculos: [] },
        ] });
        render(<ConfirmProvider><SindicoPortal token="tok" onLogout={() => undefined} /></ConfirmProvider>);
        await screen.findAllByText('010 - Galeria Altavista');
        fireEvent.click(screen.getAllByRole('button', { name: /^Financeiro$/ })[0]);
        fireEvent.click(await screen.findByRole('button', { name: 'Extrato e conciliação' }));
        expect(await screen.findByText('TARIFA PACOTE')).toBeTruthy();
        expect(getExtrato).toHaveBeenCalledWith({ token: 'tok' }, 'a1', expect.stringMatching(/-01$/), expect.any(String));
        const tabela = within(screen.getByRole('table'));
        expect((tabela.getByRole('button', { name: 'Desfazer' }) as HTMLButtonElement).disabled).toBe(false);
        expect((tabela.getByRole('button', { name: 'Conciliar' }) as HTMLButtonElement).disabled).toBe(false);
        expect(tabela.getByText('Portaria terceirizada', { exact: false })).toBeTruthy();
        await waitFor(() => expect((screen.getAllByRole('button', { name: /Importar extrato/ })[0] as HTMLButtonElement).disabled).toBe(false));
    });

    it('9. prévia do admin: Financeiro lê pelo clientId e nada fica ligado', async () => {
        getDados.mockResolvedValue(payload);
        render(<ConfirmProvider><SindicoPortal clientId="s1" somenteLeitura embutido /></ConfirmProvider>);
        await irParaContasAPagar();
        expect(getFinanceiro).toHaveBeenCalledWith({ clientId: 's1' }, expect.any(String));
        expect(lancarConta().parentElement?.getAttribute('title')).toBe('Prévia somente leitura.');
        expect((naTabela().getAllByRole('button', { name: 'Cancelar' }) as HTMLButtonElement[]).every(b => b.disabled)).toBe(true);
    });

    it('10. condomínio ainda na org da construtora: só consulta, com o motivo', async () => {
        getDados.mockResolvedValue(payload);
        getFinanceiro.mockResolvedValue({
            ...financeiro,
            condominios: [{ ...condominioFin, podeOperar: false, motivoNaoOpera: 'Este condomínio ainda opera na organização da construtora.' }],
        });
        render(<ConfirmProvider><SindicoPortal token="tok" onLogout={() => undefined} /></ConfirmProvider>);
        await irParaContasAPagar();
        expect(screen.getAllByText(/ainda opera na organização da construtora/).length).toBeGreaterThan(0);
        expect((lancarConta() as HTMLButtonElement).disabled).toBe(true);
        expect((naTabela().getAllByRole('button', { name: 'Pagar' }) as HTMLButtonElement[]).every(b => b.disabled)).toBe(true);
    });

    it('4. acesso recusado mostra o motivo do banco', async () => {
        getDados.mockResolvedValue({ ok: false, motivo: 'Seu mandato de síndico não está vigente em nenhum condomínio.' });
        render(<ConfirmProvider><SindicoPortal token="tok" /></ConfirmProvider>);
        await waitFor(() => expect(screen.getByText(/mandato de síndico não está vigente/)).toBeTruthy());
    });
});
