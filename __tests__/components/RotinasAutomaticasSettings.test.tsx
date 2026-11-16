// @vitest-environment jsdom
/**
 * Configurações › Rotinas automáticas — liga/desliga os jobs do pg_cron (só superadmin).
 * Plano: docs/planos/2026-11-16-rotinas-automaticas-ligar-desligar.md (Task 4).
 *
 * O que trava:
 *   1. grupos na ordem do catálogo; horário traduzido; job fora do catálogo em "Outras";
 *   2. falhas da semana com o erro da última execução no title;
 *   3. "Desligada por X em dd/mm" a partir do registro de alterações;
 *   4. desligar rotina sensível pede confirmação com o que deixa de acontecer
 *      (cancelar não grava); as demais, e LIGAR, não perguntam;
 *   5. erro ao gravar: o interruptor volta ao estado anterior e a mensagem aparece.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { RotinaAutomatica } from '../../services/rotinasAutomaticasService';

const listar = vi.fn();
const definir = vi.fn();
vi.mock('../../services/rotinasAutomaticasService', () => ({
    rotinasAutomaticasService: {
        listar: (...a: unknown[]) => listar(...a),
        definir: (...a: unknown[]) => definir(...a),
    },
}));

import RotinasAutomaticasSettings from '../../components/settings/RotinasAutomaticasSettings';
import { ConfirmProvider } from '../../components/ui/confirm';
import { rotinaMeta } from '../../utils/rotinasAutomaticas';

const rotina = (jobname: string, extra: Partial<RotinaAutomatica> = {}): RotinaAutomatica => ({
    jobid: Math.floor(Math.random() * 1e6), jobname, schedule: '5 * * * *', ativa: true,
    ultima: { inicio: '2026-11-16T17:05:00Z', status: 'succeeded', mensagem: '1 row' },
    execucoes7d: 168, falhas7d: 0, ultimaAlteracao: null, ...extra,
});

const LISTA: RotinaAutomatica[] = [
    rotina('process-sla-sweep'),
    rotina('asaas-status-sync', { schedule: '*/15 * * * *' }),
    rotina('daily-payment-tasks', {
        schedule: '0 7 * * *', falhas7d: 3,
        ultima: { inicio: '2026-11-16T07:00:00Z', status: 'failed', mensagem: 'ERROR: function public.create_task(…) does not exist' },
    }),
    rotina('hourly-bi-report-check', {
        schedule: '0 * * * *', ativa: false,
        ultimaAlteracao: { em: '2026-11-16T15:00:00Z', porEmail: 'chefe@alpa.com.br', ativaDepois: false },
    }),
    rotina('x-nova', { schedule: '0 9 * * 1-5' }),
];

const nome = (job: string) => rotinaMeta(job).nome;
const interruptor = (job: string) => screen.getByRole('checkbox', { name: `Rotina ${nome(job)}` });

function montar() {
    return render(<ConfirmProvider><RotinasAutomaticasSettings /></ConfirmProvider>);
}

describe('RotinasAutomaticasSettings', () => {
    beforeEach(() => {
        localStorage.clear();
        listar.mockReset().mockResolvedValue(LISTA.map(r => ({ ...r })));
        definir.mockReset().mockImplementation(async (job: string, ativa: boolean) => ({
            ...LISTA.find(r => r.jobname === job)!, ativa,
        }));
    });

    it('mostra os grupos na ordem do catálogo, com o horário traduzido; job desconhecido em Outras', async () => {
        montar();
        await screen.findByText(nome('process-sla-sweep'));
        const grupos = screen.getAllByRole('button', { expanded: true }).map(b => b.textContent ?? '');
        const ordem = ['Avisos à equipe', 'Dinheiro e sistemas externos', 'Relatórios', 'Outras']
            .map(g => grupos.findIndex(t => t.includes(g)));
        expect(ordem.every(i => i >= 0)).toBe(true);
        expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
        expect(screen.getByText('De hora em hora (minuto 5)')).toBeTruthy();
        expect(screen.getByText('x-nova')).toBeTruthy();
        expect(screen.getByText('0 9 * * 1-5')).toBeTruthy();
    });

    it('falhas da semana com o erro da última execução no title', async () => {
        montar();
        const falhas = await screen.findByText('3 falhas');
        expect(falhas.getAttribute('title')).toContain('create_task');
    });

    it('rotina desligada diz quem desligou e quando', async () => {
        montar();
        expect(await screen.findByText(/Desligada por chefe@alpa\.com\.br em 16\/11/)).toBeTruthy();
    });

    it('desligar rotina não sensível grava direto, sem diálogo', async () => {
        const user = userEvent.setup();
        montar();
        await screen.findByText(nome('process-sla-sweep'));
        await user.click(interruptor('process-sla-sweep'));
        await waitFor(() => expect(definir).toHaveBeenCalledWith('process-sla-sweep', false));
        expect(screen.queryByRole('button', { name: 'Desligar' })).toBeNull();
        await waitFor(() => expect((interruptor('process-sla-sweep') as HTMLInputElement).checked).toBe(false));
    });

    it('desligar rotina sensível pede confirmação com o que para; cancelar não grava', async () => {
        const user = userEvent.setup();
        montar();
        await screen.findByText(nome('asaas-status-sync'));
        await user.click(interruptor('asaas-status-sync'));
        expect(await screen.findByText(new RegExp(rotinaMeta('asaas-status-sync').aoDesligar!.slice(0, 30)))).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Cancelar' }));
        expect(definir).not.toHaveBeenCalled();
        expect((interruptor('asaas-status-sync') as HTMLInputElement).checked).toBe(true);

        await user.click(interruptor('asaas-status-sync'));
        await user.click(await screen.findByRole('button', { name: 'Desligar' }));
        await waitFor(() => expect(definir).toHaveBeenCalledWith('asaas-status-sync', false));
    });

    it('ligar rotina sensível não pede confirmação', async () => {
        listar.mockResolvedValue(LISTA.map(r => (r.jobname === 'asaas-status-sync' ? { ...r, ativa: false } : { ...r })));
        const user = userEvent.setup();
        montar();
        await screen.findByText(nome('asaas-status-sync'));
        await user.click(interruptor('asaas-status-sync'));
        await waitFor(() => expect(definir).toHaveBeenCalledWith('asaas-status-sync', true));
        expect(screen.queryByRole('button', { name: 'Desligar' })).toBeNull();
    });

    it('erro ao gravar: o interruptor volta e o erro aparece', async () => {
        definir.mockRejectedValue(new Error('apenas superadmin'));
        const user = userEvent.setup();
        montar();
        await screen.findByText(nome('process-sla-sweep'));
        await user.click(interruptor('process-sla-sweep'));
        expect(await screen.findByText(/apenas superadmin/)).toBeTruthy();
        expect((interruptor('process-sla-sweep') as HTMLInputElement).checked).toBe(true);
    });

    it('rotina desligada pela tela que voltou a ligar por fora avisa "Religada fora desta tela"', async () => {
        // ex.: uma migration fez unschedule + schedule do job, que renasce ligado
        listar.mockResolvedValue(LISTA.map(r => (r.jobname === 'hourly-bi-report-check' ? { ...r, ativa: true } : { ...r })));
        montar();
        expect(await screen.findByText(/Religada fora desta tela/)).toBeTruthy();
        expect(screen.getByText(/desligada por chefe@alpa\.com\.br em 16\/11/)).toBeTruthy();
        expect(screen.queryByText(/^Desligada por/)).toBeNull();
    });

    it('erro ao gravar relê o banco: se a gravação passou e só a resposta se perdeu, a tela mostra o estado real', async () => {
        definir.mockRejectedValue(new Error('Failed to fetch'));
        const user = userEvent.setup();
        montar();
        await screen.findByText(nome('process-sla-sweep'));
        listar.mockResolvedValue(LISTA.map(r => (r.jobname === 'process-sla-sweep' ? { ...r, ativa: false } : { ...r })));
        await user.click(interruptor('process-sla-sweep'));
        expect(await screen.findByText(/Failed to fetch/)).toBeTruthy();
        await waitFor(() => expect((interruptor('process-sla-sweep') as HTMLInputElement).checked).toBe(false));
        expect(listar).toHaveBeenCalledTimes(2);
    });

    it('falha ao carregar mostra o erro com "Tentar de novo"', async () => {
        listar.mockRejectedValueOnce(new Error('apenas superadmin'));
        const user = userEvent.setup();
        montar();
        const alerta = await screen.findByRole('alert');
        expect(within(alerta).getByText(/apenas superadmin/)).toBeTruthy();
        await user.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }));
        expect(await screen.findByText(nome('process-sla-sweep'))).toBeTruthy();
    });
});
