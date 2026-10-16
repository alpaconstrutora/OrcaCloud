// @vitest-environment jsdom
/**
 * Regra de leitura da caixa (16/10/2026): depois de conectada, a caixa não tinha
 * onde trocar "quais remetentes ler" — o campo só existia ao conectar.
 * Pedido: "criar opcao para o usuario escolher: ler somentes remetentes
 * cadastratos e o modelo atual". Plano: docs/planos/2026-10-15-captura-boletos-por-email.md.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ atualizarConta: vi.fn() }));
vi.mock('../../services/emailCaptureService', async () => {
    const real = await vi.importActual<typeof import('../../services/emailCaptureService')>('../../services/emailCaptureService');
    return { ...real, emailCaptureService: svc };
});
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

import EmailCaptureRegraSheet from '../../components/boletos/EmailCaptureRegraSheet';
import { ConfirmProvider } from '../../components/ui/confirm';

const conta = { id: 'c1', organization_id: 'o1', usuario: 'caixa@gmail.com', status: 'ativa', modo: 'hibrido', modo_piloto: true } as never;

beforeEach(() => {
    vi.clearAllMocks();
    svc.atualizarConta.mockResolvedValue(undefined);
});

const montar = (onSalva = vi.fn()) => {
    render(
        <ConfirmProvider>
            <EmailCaptureRegraSheet open conta={conta} onClose={vi.fn()} onSalva={onSalva} />
        </ConfirmProvider>,
    );
    return onSalva;
};

describe('Regra de leitura da caixa', () => {
    it('oferece as duas regras, com a atual marcada', () => {
        montar();
        const opcoes = screen.getAllByRole('radio');
        expect(opcoes).toHaveLength(2);
        expect(screen.getByRole('radio', { name: /Só remetentes monitorados/ })).not.toBeChecked();
        expect(screen.getByRole('radio', { name: /Monitorados \+ boletos/ })).toBeChecked();
    });

    it('sem mudança, salvar fica desligado e diz por quê', () => {
        montar();
        const salvar = screen.getByRole('button', { name: 'Salvar regra' });
        expect(salvar).toBeDisabled();
        expect(salvar.getAttribute('title')).toMatch(/já é a regra/);
    });

    it('trocar para "Só remetentes monitorados" grava o modo da caixa', async () => {
        const onSalva = montar();
        fireEvent.click(screen.getByRole('radio', { name: /Só remetentes monitorados/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Salvar regra' }));
        await waitFor(() => expect(svc.atualizarConta).toHaveBeenCalledWith('c1', { modo: 'favoritos' }));
        expect(onSalva).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', modo: 'favoritos' }));
    });
});
