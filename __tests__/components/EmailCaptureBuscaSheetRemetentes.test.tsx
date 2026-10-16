// @vitest-environment jsdom
/**
 * Buscar período — atalho de mês e remetentes escolhidos (16/10/2026).
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    buscarPeriodo: vi.fn(),
    continuarBusca: vi.fn(),
    cancelarBusca: vi.fn(),
}));
vi.mock('../../services/emailCaptureService', async () => {
    const real = await vi.importActual<typeof import('../../services/emailCaptureService')>('../../services/emailCaptureService');
    return { ...real, emailCaptureService: svc };
});
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

import EmailCaptureBuscaSheet, { periodoDoMes } from '../../components/boletos/EmailCaptureBuscaSheet';
import { ConfirmProvider } from '../../components/ui/confirm';

const conta = { id: 'c1', organization_id: 'o1', usuario: 'caixa@gmail.com', status: 'ativa', modo: 'hibrido', modo_piloto: true } as never;
const remetentes = [
    { id: 's1', account_id: 'c1', nome: 'Energisa', tipo: 'exato', email: 'faturas@energisa.com.br', dominio: null, ativo: true },
    { id: 's2', account_id: 'c1', nome: 'Copasa', tipo: 'dominio', email: null, dominio: 'copasa.com.br', ativo: true },
] as never[];

beforeEach(() => {
    vi.clearAllMocks();
    svc.buscarPeriodo.mockResolvedValue({
        id: 'b1', status: 'concluida', data_de: '2026-09-01', data_ate: '2026-09-30', total_mensagens: 0,
        mensagens_processadas: 0, criados: 0, duplicados: 0, ignorados: 0, erros: 0, remetentes: null,
    });
});

describe('periodoDoMes', () => {
    it('mês fechado e fevereiro bissexto', () => {
        expect(periodoDoMes('2026-09', '2026-10-16')).toEqual({ de: '2026-09-01', ate: '2026-09-30' });
        expect(periodoDoMes('2028-02', '2028-12-31')).toEqual({ de: '2028-02-01', ate: '2028-02-29' });
    });
    it('mês corrente vai até hoje; mês futuro e texto inválido não valem', () => {
        expect(periodoDoMes('2026-10', '2026-10-16')).toEqual({ de: '2026-10-01', ate: '2026-10-16' });
        expect(periodoDoMes('2026-11', '2026-10-16')).toBeNull();
        expect(periodoDoMes('xx', '2026-10-16')).toBeNull();
    });
});

describe('painel Buscar período — remetentes', () => {
    const montar = () => render(
        <ConfirmProvider>
            <EmailCaptureBuscaSheet open onClose={vi.fn()} conta={conta} buscaAtiva={null} onAtualizada={vi.fn()} remetentesDaCaixa={remetentes} />
        </ConfirmProvider>,
    );

    it('mês preenche De/Até; remetentes marcados + digitado vão para a busca', async () => {
        montar();
        fireEvent.change(document.getElementById('ebus-mes')!, { target: { value: '2026-09' } });
        expect((document.getElementById('ebus-de') as HTMLInputElement).value).toBe('2026-09-01');
        expect((document.getElementById('ebus-ate') as HTMLInputElement).value).toBe('2026-09-30');

        fireEvent.click(screen.getByLabelText(/Só os remetentes que eu escolher/));
        const botao = screen.getByRole('button', { name: 'Buscar e-mails do período' });
        expect(botao).toBeDisabled();
        expect(botao.getAttribute('title')).toMatch(/ao menos um remetente/);

        fireEvent.click(screen.getByRole('checkbox', { name: /Energisa/ }));
        fireEvent.change(document.getElementById('ebus-outro')!, { target: { value: '@EnergisaOnline.com.br' } });
        fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
        expect(screen.getByText('energisaonline.com.br')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Buscar e-mails do período' }));
        await waitFor(() => expect(svc.buscarPeriodo).toHaveBeenCalledWith(
            'c1', '2026-09-01', '2026-09-30', ['faturas@energisa.com.br', 'energisaonline.com.br']));
    });

    it('digitado inválido não entra e diz por quê', () => {
        montar();
        fireEvent.click(screen.getByLabelText(/Só os remetentes que eu escolher/));
        fireEvent.change(document.getElementById('ebus-outro')!, { target: { value: 'energisa' } });
        fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
        expect(screen.getByText(/Use um e-mail/)).toBeTruthy();
    });

    it('"Todos" manda a busca sem remetentes', async () => {
        montar();
        fireEvent.click(screen.getByRole('button', { name: 'Buscar e-mails do período' }));
        await waitFor(() => expect(svc.buscarPeriodo).toHaveBeenCalledWith('c1', expect.any(String), expect.any(String), []));
    });
});
