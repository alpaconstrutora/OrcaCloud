// @vitest-environment jsdom
/**
 * Preferências do estudo de viabilidade (plano docs/planos/2026-11-20-imovib-preferencias-estudo.md):
 * "Exibir unidades não vendáveis no empreendimento", por usuário no banco (chave imovib.receitas.exibir_nao_vendaveis).
 * Sem linha = OCULTAS (padrão escolhido em 20/11).
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ listarDoUsuario: vi.fn(), gravar: vi.fn() }));
vi.mock('../services/preferenciasService', () => ({ preferenciasService: svc }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useToast', () => ({ useToast: () => ({ showToast: toast }) }));

import { useImovibPreferencias, CHAVE_EXIBIR_NAO_VENDAVEIS } from '../hooks/useImovibPreferencias';
import { useStore } from '../store/useStore';

const linha = (valor: unknown) => ({ escopo: 'USUARIO', chave: CHAVE_EXIBIR_NAO_VENDAVEIS, valor });
const montar = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    return renderHook(() => useImovibPreferencias(), { wrapper });
};

beforeEach(() => {
    useStore.setState({ session: { user: { id: 'u1' } } as never });
    svc.listarDoUsuario.mockReset().mockResolvedValue([]);
    svc.gravar.mockReset().mockResolvedValue(undefined);
    toast.mockReset();
});

describe('useImovibPreferencias', () => {
    it('a chave é imovib.*', () => {
        expect(CHAVE_EXIBIR_NAO_VENDAVEIS).toBe('imovib.receitas.exibir_nao_vendaveis');
    });

    it('sem linha no banco: ocultas (padrão)', async () => {
        const { result } = montar();
        await waitFor(() => expect(result.current.carregando).toBe(false));
        expect(result.current.exibirNaoVendaveis).toBe(false);
    });

    it('linha true: exibir', async () => {
        svc.listarDoUsuario.mockResolvedValue([linha(true)]);
        const { result } = montar();
        await waitFor(() => expect(result.current.exibirNaoVendaveis).toBe(true));
    });

    it('ligar grava true na chave do usuário; desligar volta ao padrão (apaga a linha)', async () => {
        const { result } = montar();
        await waitFor(() => expect(result.current.carregando).toBe(false));
        await act(async () => { result.current.setExibirNaoVendaveis(true); });
        await waitFor(() => expect(result.current.exibirNaoVendaveis).toBe(true));
        expect(svc.gravar).toHaveBeenCalledWith('USUARIO', {}, CHAVE_EXIBIR_NAO_VENDAVEIS, true);
        await act(async () => { result.current.setExibirNaoVendaveis(false); });
        expect(svc.gravar).toHaveBeenLastCalledWith('USUARIO', {}, CHAVE_EXIBIR_NAO_VENDAVEIS, null);
    });

    it('falha ao gravar: volta ao que era e avisa', async () => {
        svc.gravar.mockRejectedValue(new Error('sem rede'));
        const { result } = montar();
        await waitFor(() => expect(result.current.carregando).toBe(false));
        await act(async () => { result.current.setExibirNaoVendaveis(true); });
        await waitFor(() => expect(result.current.exibirNaoVendaveis).toBe(false));
        expect(toast).toHaveBeenCalledWith(expect.stringMatching(/sem rede/), 'error');
    });
});
