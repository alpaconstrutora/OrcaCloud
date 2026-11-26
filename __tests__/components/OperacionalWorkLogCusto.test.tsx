// @vitest-environment jsdom
/**
 * Pendência da Qualidade fase 2 (26/11) — 406 no console: `.single()` com 0 linhas é HTTP 406 no
 * PostgREST. Equipe sem custo/hora em `vw_team_hourly_cost` é legítimo (o custo fica vazio), então o
 * apontamento lê com `maybeSingle` e grava sem custo; erro de verdade da leitura aparece na tela.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const terminais: { metodo: string; tabela: string }[] = [];
const insercoes: { tabela: string; linha: Record<string, unknown> }[] = [];
let custo: { data: unknown; error: { message: string } | null } = { data: null, error: null };
let apontamentos: unknown[] = [];
const exclusoes: string[] = [];

function consulta(tabela: string) {
    const q: Record<string, unknown> = {};
    const encadeia = () => q;
    let resposta = (): unknown => ({
        data: tabela === 'labor_teams' ? [{ id: 't1', name: 'Equipe Alvenaria' }] : tabela === 'work_logs' ? apontamentos : [],
        error: null,
    });
    Object.assign(q, {
        select: encadeia, eq: encadeia, order: encadeia,
        single: () => { terminais.push({ metodo: 'single', tabela }); resposta = () => custo; return q; },
        maybeSingle: () => { terminais.push({ metodo: 'maybeSingle', tabela }); resposta = () => custo; return q; },
        delete: () => { exclusoes.push(tabela); resposta = () => ({ data: null, error: null }); return q; },
        insert: (linha: Record<string, unknown>) => { insercoes.push({ tabela, linha }); resposta = () => ({ data: null, error: null }); return q; },
        then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resposta()).then(ok, erro),
    });
    return q;
}

vi.mock('../../lib/supabase', () => ({ supabase: { from: (t: string) => consulta(t) } }));

import OperacionalWorkLog from '../../components/OperacionalWorkLog';
import { ConfirmProvider } from '../../components/ui/confirm';

async function apontar() {
    const user = userEvent.setup();
    render(<ConfirmProvider><OperacionalWorkLog workOrderId="wo-1" measurementUnit={null} /></ConfirmProvider>);
    await user.click(await screen.findByRole('button', { name: /Novo Apontamento/ }));
    await waitFor(() => expect(screen.getByRole('option', { name: 'Equipe Alvenaria' })).toBeTruthy());
    await user.selectOptions(screen.getByRole('combobox'), 't1');
    await user.type(screen.getByPlaceholderText('0.0'), '8');
    await user.click(screen.getByRole('button', { name: /Salvar/ }));
}

beforeEach(() => {
    terminais.length = 0;
    insercoes.length = 0;
    custo = { data: null, error: null };
    apontamentos = [];
    exclusoes.length = 0;
});

describe('OperacionalWorkLog — custo/hora da equipe', () => {
    it('equipe sem custo na view: lê com maybeSingle (sem 406) e grava o apontamento sem custo', async () => {
        await apontar();
        await waitFor(() => expect(insercoes.some(i => i.tabela === 'work_logs')).toBe(true));
        expect(terminais.filter(t => t.tabela === 'vw_team_hourly_cost').map(t => t.metodo)).toEqual(['maybeSingle']);
        const linha = insercoes.find(i => i.tabela === 'work_logs')!.linha;
        expect(linha).toMatchObject({ team_id: 't1', hours_worked: 8 });
        expect(linha.calculated_cost).toBeUndefined();
    });

    it('com custo: calcula horas × custo/hora', async () => {
        custo = { data: { total_hourly_cost: 50 }, error: null };
        await apontar();
        await waitFor(() => expect(insercoes.some(i => i.tabela === 'work_logs')).toBe(true));
        expect(insercoes.find(i => i.tabela === 'work_logs')!.linha.calculated_cost).toBe(400);
    });

    it('erro de verdade ao ler o custo aparece com a mensagem do banco e não grava', async () => {
        custo = { data: null, error: { message: 'permission denied for view vw_team_hourly_cost' } };
        await apontar();
        expect(await screen.findByText(/permission denied for view vw_team_hourly_cost/)).toBeTruthy();
        expect(insercoes.some(i => i.tabela === 'work_logs')).toBe(false);
    });
});

describe('OperacionalWorkLog — remover pede confirmação (useConfirm, guia §14)', () => {
    it('Remover abre o diálogo; Cancelar não apaga', async () => {
        apontamentos = [{ id: 'log-1', log_date: '2026-11-26', team_id: null, hours_worked: 8, quantity_executed: null,
            calculated_cost: null, notes: null, created_at: '2026-11-26T10:00:00Z', team: null }];
        const user = userEvent.setup();
        render(<ConfirmProvider><OperacionalWorkLog workOrderId="wo-1" measurementUnit={null} /></ConfirmProvider>);
        await user.click(await screen.findByRole('button', { name: 'Remover' }));
        expect(await screen.findByText('Remover apontamento')).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Cancelar' }));
        await waitFor(() => expect(screen.queryByText('Remover apontamento')).toBeNull());
        expect(exclusoes).toEqual([]);
    });
});
