// @vitest-environment jsdom
/**
 * Data Room pelo link do Portal do Investidor (Fase 7 do plano
 * docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md, 16/11/2026). Antes o painel lia
 * `opportunity_documents` direto — pelo link (sessão anônima) a RLS devolvia vazio, em silêncio.
 * Agora lista pela RPC do token e baixa pela Edge Function que assina só o que a RPC listou.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const sb = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), from: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
    supabase: {
        rpc: (...a: unknown[]) => sb.rpc(...a),
        functions: { invoke: (...a: unknown[]) => sb.invoke(...a) },
        from: (...a: unknown[]) => sb.from(...a),
        storage: { from: () => ({ createSignedUrl: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    },
}));

import DataRoomPanel from '../../components/investor/DataRoomPanel';

const doc = { id: 'd1', opportunity_id: 'op1', name: 'Matrícula atualizada.pdf', description: null, file_path: 'org/op1/matricula.pdf', file_size: 2048, mime_type: 'application/pdf', category: 'matricula', created_at: '2026-11-10T12:00:00Z' };

beforeEach(() => {
    sb.rpc.mockReset(); sb.invoke.mockReset(); sb.from.mockReset();
    sb.from.mockImplementation(() => { throw new Error('pelo link não se lê a tabela direto'); });
});

describe('Data Room pelo link do portal', () => {
    it('lista pela RPC do token e baixa pela função que assina', async () => {
        const user = userEvent.setup();
        const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
        sb.rpc.mockResolvedValue({ data: { valid: true, documents: [doc] }, error: null });
        sb.invoke.mockResolvedValue({ data: { urls: { 'org/op1/matricula.pdf': 'https://assinado/matricula' } }, error: null });

        render(<DataRoomPanel opportunityId="op1" organizationId="org" isAdmin={false} portalToken="tok" />);
        expect(await screen.findByText('Matrícula atualizada.pdf')).toBeTruthy();
        expect(sb.rpc).toHaveBeenCalledWith('fn_investor_portal_get_dataroom', { p_token: 'tok', p_opportunity_id: 'op1' });

        await user.click(screen.getByRole('button', { name: /Baixar|Download/ }));
        expect(sb.invoke).toHaveBeenCalledWith('investor-portal-dataroom-download', {
            body: { token: 'tok', opportunityId: 'op1', filePaths: ['org/op1/matricula.pdf'] },
        });
        expect(abrir).toHaveBeenCalledWith('https://assinado/matricula', '_blank', 'noopener,noreferrer');
    });

    it('link vencido: diz o motivo, não fica "sem documentos"', async () => {
        sb.rpc.mockResolvedValue({ data: { valid: false, error: 'unauthorized' }, error: null });
        render(<DataRoomPanel opportunityId="op1" organizationId="org" isAdmin={false} portalToken="tok" />);
        expect(await screen.findByText(/link do portal venceu/i)).toBeTruthy();
    });

    it('falha ao baixar: diz na tela (antes era alert)', async () => {
        const user = userEvent.setup();
        sb.rpc.mockResolvedValue({ data: { valid: true, documents: [doc] }, error: null });
        sb.invoke.mockResolvedValue({ data: null, error: { message: 'Arquivo não disponível para este acesso' } });
        render(<DataRoomPanel opportunityId="op1" organizationId="org" isAdmin={false} portalToken="tok" />);
        await user.click(await screen.findByRole('button', { name: /Baixar|Download/ }));
        expect(await screen.findByRole('alert')).toBeTruthy();
    });
});
