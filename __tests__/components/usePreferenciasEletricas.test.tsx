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

describe('usePreferenciasEletricas', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        m.listarDoUsuario.mockResolvedValue([]);
        m.listarDaPrancha.mockResolvedValue([]);
        m.gravar.mockResolvedValue(undefined);
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
        m.gravar.mockImplementation(() => new Promise<void>((ok) => { terminar = ok; }));
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
        m.listarDoUsuario.mockResolvedValue([linhaTela('comando', false)]);
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
        m.listarDoUsuario.mockResolvedValue([linhaTela('diametro', false)]);
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
});
