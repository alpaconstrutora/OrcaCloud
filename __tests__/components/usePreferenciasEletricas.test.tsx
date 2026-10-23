// @vitest-environment jsdom
/**
 * usePreferenciasEletricas — plano docs/planos/2026-10-22-preferencias-planta-eletrica.md (seção 3).
 * Serviço e aviso simulados. Confere: a leitura da TELA roda sempre (REGRA #5), a da PRANCHA só com
 * organização; `alterar` é otimista e volta atrás na falha com aviso; leitura com erro cai no
 * padrão (nunca em branco) e expõe `erro`; trocar a organização refaz a leitura da prancha.
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chaveDoItem } from '../../utils/preferencias/catalogo';
import { EXIBICAO_ELETRICA_PADRAO, type LinhaDePreferencia } from '../../utils/preferencias/resolver';

const m = vi.hoisted(() => ({
    listarDoUsuario: vi.fn(),
    listarDaPrancha: vi.fn(),
    gravar: vi.fn(),
    apagarDoEstudo: vi.fn(),
    showToast: vi.fn(),
    userId: 'u1' as string | null,
}));
vi.mock('../../store/useStore', () => ({
    useStore: (sel: (s: unknown) => unknown) => sel({ session: m.userId ? { user: { id: m.userId } } : null }),
}));
vi.mock('../../services/preferenciasService', () => ({
    preferenciasService: {
        listarDoUsuario: m.listarDoUsuario,
        listarDaPrancha: m.listarDaPrancha,
        gravar: m.gravar,
        apagarDoEstudo: m.apagarDoEstudo,
    },
}));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: m.showToast }) }));

import { usePreferenciasEletricas } from '../../hooks/usePreferenciasEletricas';

type Args = { organizationId: string | null; studyId?: string | null };

function montar(inicial: Args) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return { client, ...renderHook((args: Args) => usePreferenciasEletricas(args), { wrapper, initialProps: inicial }) };
}

const linhaTela = (item: Parameters<typeof chaveDoItem>[1], valor: boolean): LinhaDePreferencia =>
    ({ escopo: 'USUARIO', chave: chaveDoItem('tela', item), valor });
const linhaOrg = (item: Parameters<typeof chaveDoItem>[1], valor: boolean): LinhaDePreferencia =>
    ({ escopo: 'ORGANIZACAO', chave: chaveDoItem('prancha', item), valor });

/**
 * "Banco" falso: depois de cada gravação o hook RELÊ a chave alterada (invalidateQueries), então a leitura
 * simulada precisa devolver o que foi gravado — como o banco de verdade devolveria.
 */
let banco: LinhaDePreferencia[] = [];
function gravarNoBanco(escopo: LinhaDePreferencia['escopo'], chave: string, valor: boolean | null) {
    banco = banco.filter((l) => !(l.escopo === escopo && l.chave === chave));
    if (valor !== null) banco.push({ escopo, chave, valor });
}
/** Linhas do banco de um conjunto de escopos. */
const doBanco = (...escopos: LinhaDePreferencia['escopo'][]) => banco.filter((l) => escopos.includes(l.escopo));

describe('usePreferenciasEletricas', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        banco = [];
        m.userId = 'u1';
        m.listarDoUsuario.mockImplementation(async () => doBanco('USUARIO'));
        m.listarDaPrancha.mockImplementation(async () => doBanco('ORGANIZACAO', 'ESTUDO'));
        m.gravar.mockImplementation(async (escopo: LinhaDePreferencia['escopo'], _dono: unknown, chave: string, valor: boolean | null) => {
            gravarNoBanco(escopo, chave, valor);
        });
    });

    it('sem nada gravado devolve o padrão (tudo ligado) e termina de carregar', async () => {
        const { result } = montar({ organizationId: 'org1' });
        await waitFor(() => expect(result.current.carregando).toBe(false));
        expect(result.current.tela).toEqual(EXIBICAO_ELETRICA_PADRAO);
        expect(result.current.prancha).toEqual({ ...EXIBICAO_ELETRICA_PADRAO, instrucaoSugerida: false, condutoresDoTrecho: false });
        expect(result.current.erro).toBeNull();
    });

    it('aplica as linhas lidas: tela pelo usuário, prancha pela organização', async () => {
        m.listarDoUsuario.mockResolvedValue([linhaTela('potencia', false)]);
        m.listarDaPrancha.mockResolvedValue([linhaOrg('bitola', false)]);
        const { result } = montar({ organizationId: 'org1', studyId: 'est1' });
        await waitFor(() => expect(result.current.tela.potencia).toBe(false));
        await waitFor(() => expect(result.current.prancha.bitola).toBe(false));
        expect(m.listarDaPrancha).toHaveBeenCalledWith('org1', 'est1');
        expect(result.current.linhasDaTela).toHaveLength(1);
        expect(result.current.linhasDaPrancha).toHaveLength(1);
    });

    it('a leitura da TELA roda mesmo sem organização; a da prancha não', async () => {
        const { result } = montar({ organizationId: null });
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(result.current.carregando).toBe(false));
        expect(m.listarDaPrancha).not.toHaveBeenCalled();
        expect(result.current.prancha).toEqual({ ...EXIBICAO_ELETRICA_PADRAO, instrucaoSugerida: false, condutoresDoTrecho: false });
    });

    it('alterar muda a tela NA HORA, antes de o serviço responder, e depois grava', async () => {
        let terminar!: () => void;
        m.gravar.mockImplementation((_e: unknown, _d: unknown, chave: string, valor: boolean | null) => new Promise<void>((ok) => {
            terminar = () => { gravarNoBanco('USUARIO', chave, valor); ok(); };
        }));
        const { result } = montar({ organizationId: 'org1' });
        await waitFor(() => expect(result.current.carregando).toBe(false));
        expect(result.current.tela.potencia).toBe(true);

        let pendente!: Promise<void>;
        act(() => { pendente = result.current.alterar('tela', 'potencia', false, 'USUARIO'); });
        await waitFor(() => expect(result.current.tela.potencia).toBe(false));
        expect(m.gravar).toHaveBeenCalledWith('USUARIO', {}, chaveDoItem('tela', 'potencia'), false);

        await act(async () => { terminar(); await pendente; });
        expect(result.current.tela.potencia).toBe(false);
        expect(m.showToast).not.toHaveBeenCalled();
    });

    it('serviço rejeitando: a tela muda na hora, depois volta ao valor anterior e avisa com o motivo', async () => {
        banco = [linhaTela('comando', false)];
        let recusar!: (e: Error) => void;
        m.gravar.mockImplementation(() => new Promise<void>((_ok, ko) => { recusar = ko; }));
        const { result } = montar({ organizationId: 'org1' });
        await waitFor(() => expect(result.current.tela.comando).toBe(false));

        let pendente!: Promise<void>;
        act(() => { pendente = result.current.alterar('tela', 'comando', true, 'USUARIO'); });
        await waitFor(() => expect(result.current.tela.comando).toBe(true));

        await act(async () => { recusar(new Error('sem permissão')); await pendente; });
        await waitFor(() => expect(result.current.tela.comando).toBe(false));
        expect(m.showToast).toHaveBeenCalledWith('Não foi possível salvar a preferência: sem permissão', 'error');
    });

    it('falha ao gravar uma escolha NOVA (sem linha antes) a remove de volta', async () => {
        let recusar!: (e: Error) => void;
        m.gravar.mockImplementation(() => new Promise<void>((_ok, ko) => { recusar = ko; }));
        const { result } = montar({ organizationId: 'org1' });
        await waitFor(() => expect(result.current.carregando).toBe(false));

        let pendente!: Promise<void>;
        act(() => { pendente = result.current.alterar('tela', 'fios', false, 'USUARIO'); });
        await waitFor(() => expect(result.current.tela.fios).toBe(false));

        await act(async () => { recusar(new Error('rede')); await pendente; });
        await waitFor(() => expect(result.current.tela.fios).toBe(true));
        expect(result.current.linhasDaTela).toHaveLength(0);
    });

    it('voltar ao padrão (valor null) remove a linha e manda null ao serviço', async () => {
        banco = [linhaTela('diametro', false)];
        const { result } = montar({ organizationId: 'org1' });
        await waitFor(() => expect(result.current.tela.diametro).toBe(false));

        await act(async () => { await result.current.alterar('tela', 'diametro', null, 'USUARIO'); });

        await waitFor(() => expect(result.current.tela.diametro).toBe(true));
        expect(m.gravar).toHaveBeenCalledWith('USUARIO', {}, chaveDoItem('tela', 'diametro'), null);
    });

    it('alterar a prancha na ORGANIZACAO grava com a organização e muda a prancha na hora', async () => {
        const { result } = montar({ organizationId: 'org1' });
        await waitFor(() => expect(result.current.carregando).toBe(false));

        await act(async () => { await result.current.alterar('prancha', 'bitola', false, 'ORGANIZACAO'); });

        expect(m.gravar).toHaveBeenCalledWith('ORGANIZACAO', { organizationId: 'org1' }, chaveDoItem('prancha', 'bitola'), false);
        await waitFor(() => expect(result.current.prancha.bitola).toBe(false));
    });

    it('alterar a prancha no ESTUDO grava com o estudo', async () => {
        const { result } = montar({ organizationId: 'org1', studyId: 'est1' });
        await waitFor(() => expect(result.current.carregando).toBe(false));

        await act(async () => { await result.current.alterar('prancha', 'bitola', false, 'ESTUDO'); });

        expect(m.gravar).toHaveBeenCalledWith('ESTUDO', { studyId: 'est1' }, chaveDoItem('prancha', 'bitola'), false);
        await waitFor(() => expect(result.current.linhasDaPrancha).toEqual([
            { escopo: 'ESTUDO', chave: chaveDoItem('prancha', 'bitola'), valor: false },
        ]));
    });

    it('⚠️ gravação que falha relê a chave e a tela fica igual ao banco', async () => {
        banco = [linhaTela('comando', false)];
        m.gravar.mockRejectedValue(new Error('sem rede'));
        const { result } = montar({ organizationId: 'org1' });
        await waitFor(() => expect(result.current.tela.comando).toBe(false));
        const leituras = m.listarDoUsuario.mock.calls.length;

        await act(async () => { await result.current.alterar('tela', 'comando', true, 'USUARIO'); });

        await waitFor(() => expect(m.listarDoUsuario.mock.calls.length).toBeGreaterThan(leituras));
        expect(result.current.tela.comando).toBe(false);
    });

    it('⚠️ dois cliques rápidos na MESMA chave: a tela termina igual ao banco (o último vale)', async () => {
        const { result } = montar({ organizationId: 'org1' });
        await waitFor(() => expect(result.current.carregando).toBe(false));
        // Cada gravação demora um pouco e a primeira demora mais que a segunda.
        let n = 0;
        m.gravar.mockImplementation((_e: unknown, _d: unknown, chave: string, valor: boolean | null) => {
            const espera = n++ === 0 ? 40 : 5;
            return new Promise<void>((ok) => setTimeout(() => { gravarNoBanco('USUARIO', chave, valor); ok(); }, espera));
        });

        await act(async () => {
            const a = result.current.alterar('tela', 'bitola', false, 'USUARIO');
            const b = result.current.alterar('tela', 'bitola', true, 'USUARIO');
            await Promise.all([a, b]);
        });

        // O banco acabou com a primeira gravação (terminou por último): a tela precisa mostrar ISSO.
        const noBanco = banco.find((l) => l.chave === chaveDoItem('tela', 'bitola'))?.valor;
        await waitFor(() => expect(result.current.tela.bitola).toBe(noBanco));
    });

    it('⚠️ padrão da EMPRESA gravado na gaveta (sem estudo) chega ao painel da planta aberta (org + estudo)', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
        );
        const { result } = renderHook(
            () => ({
                gaveta: usePreferenciasEletricas({ organizationId: 'org1', studyId: null }),
                painel: usePreferenciasEletricas({ organizationId: 'org1', studyId: 'estudo-1' }),
            }),
            { wrapper },
        );
        await waitFor(() => expect(result.current.gaveta.carregando).toBe(false));
        await waitFor(() => expect(result.current.painel.carregando).toBe(false));
        expect(result.current.painel.prancha.bitola).toBe(true);
        expect(m.listarDaPrancha).toHaveBeenCalledWith('org1', null);
        expect(m.listarDaPrancha).toHaveBeenCalledWith('org1', 'estudo-1');
        const leiturasDoPainel = m.listarDaPrancha.mock.calls.filter(([, e]) => e === 'estudo-1').length;

        await act(async () => { await result.current.gaveta.alterar('prancha', 'bitola', false, 'ORGANIZACAO'); });

        await waitFor(() => expect(result.current.painel.prancha.bitola).toBe(false));
        expect(m.listarDaPrancha.mock.calls.filter(([, e]) => e === 'estudo-1').length).toBeGreaterThan(leiturasDoPainel);
        expect(result.current.gaveta.prancha.bitola).toBe(false);
    });

    it('alterar na prancha sem a organização/estudo necessário avisa e não chama o serviço', async () => {
        const { result } = montar({ organizationId: null });
        await waitFor(() => expect(result.current.carregando).toBe(false));

        await act(async () => { await result.current.alterar('prancha', 'bitola', false, 'ORGANIZACAO'); });

        expect(m.gravar).not.toHaveBeenCalled();
        expect(m.showToast).toHaveBeenCalledWith(expect.stringContaining('Não foi possível salvar a preferência'), 'error');
    });

    it('leitura rejeitada: tela e prancha ficam no padrão, erro preenchido e aviso publicado', async () => {
        m.listarDoUsuario.mockRejectedValue(new Error('rede caiu'));
        const { result } = montar({ organizationId: 'org1' });
        await waitFor(() => expect(result.current.erro).not.toBeNull());
        expect(result.current.erro).toContain('rede caiu');
        expect(result.current.tela).toEqual(EXIBICAO_ELETRICA_PADRAO);
        expect(result.current.carregando).toBe(false);
        await waitFor(() => expect(m.showToast).toHaveBeenCalledWith(expect.stringContaining('rede caiu'), 'error'));
    });

    it('leitura da prancha rejeitada: prancha no padrão e erro preenchido', async () => {
        m.listarDaPrancha.mockRejectedValue(new Error('sem rede'));
        const { result } = montar({ organizationId: 'org1' });
        await waitFor(() => expect(result.current.erro).toContain('sem rede'));
        expect(result.current.prancha).toEqual({ ...EXIBICAO_ELETRICA_PADRAO, instrucaoSugerida: false, condutoresDoTrecho: false });
    });

    it('trocar organizationId refaz a leitura da prancha da nova organização', async () => {
        m.listarDaPrancha.mockImplementation(async (org: string) => (org === 'org2' ? [linhaOrg('bitola', false)] : []));
        const { result, rerender } = montar({ organizationId: 'org1' });
        await waitFor(() => expect(m.listarDaPrancha).toHaveBeenCalledWith('org1', undefined));
        expect(result.current.prancha.bitola).toBe(true);

        rerender({ organizationId: 'org2' });
        await waitFor(() => expect(m.listarDaPrancha).toHaveBeenCalledWith('org2', undefined));
        await waitFor(() => expect(result.current.prancha.bitola).toBe(false));
    });
    it('trocar de usuário refaz a leitura da tela (a chave leva o id) e não mostra o cache do anterior', async () => {
        m.listarDoUsuario.mockImplementation(async () => (m.userId === 'u2' ? [linhaTela('potencia', false)] : []));
        const { result, rerender } = montar({ organizationId: 'org1' });
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalledTimes(1));
        expect(result.current.tela.potencia).toBe(true);

        m.userId = 'u2';
        rerender({ organizationId: 'org1' });
        await waitFor(() => expect(m.listarDoUsuario).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(result.current.tela.potencia).toBe(false));

        m.userId = 'u1';
        rerender({ organizationId: 'org1' });
        await waitFor(() => expect(result.current.tela.potencia).toBe(true));
    });

    it('sem sessão a query da tela não é desligada: devolve vazio, não chama o serviço e usa o padrão', async () => {
        m.userId = null;
        const { result } = montar({ organizationId: 'org1' });
        await waitFor(() => expect(result.current.carregando).toBe(false));
        expect(m.listarDoUsuario).not.toHaveBeenCalled();
        expect(result.current.tela).toEqual(EXIBICAO_ELETRICA_PADRAO);
        expect(result.current.erro).toBeNull();
    });

    it('dois consumidores com a leitura rejeitada: o aviso sai UMA vez', async () => {
        m.listarDoUsuario.mockRejectedValue(new Error('queda unica'));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
        );
        const { result } = renderHook(
            () => [usePreferenciasEletricas({ organizationId: 'org1' }), usePreferenciasEletricas({ organizationId: 'org1' })],
            { wrapper },
        );
        await waitFor(() => expect(result.current[0].erro).toContain('queda unica'));
        await waitFor(() => expect(result.current[1].erro).toContain('queda unica'));
        expect(m.showToast.mock.calls.filter(([msg]) => String(msg).includes('queda unica'))).toHaveLength(1);
    });

    it('depois de a leitura voltar a dar certo, uma nova falha com a mesma frase avisa de novo', async () => {
        m.listarDoUsuario.mockRejectedValueOnce(new Error('oscila'));
        const a = montar({ organizationId: 'org1' });
        await waitFor(() => expect(m.showToast).toHaveBeenCalledTimes(1));
        a.unmount();

        m.listarDoUsuario.mockResolvedValue([]);
        const b = montar({ organizationId: 'org1' });
        await waitFor(() => expect(b.result.current.carregando).toBe(false));
        await waitFor(() => expect(b.result.current.erro).toBeNull());
        b.unmount();

        m.listarDoUsuario.mockRejectedValue(new Error('oscila'));
        montar({ organizationId: 'org1' });
        await waitFor(() => expect(m.showToast).toHaveBeenCalledTimes(2));
    });
});
