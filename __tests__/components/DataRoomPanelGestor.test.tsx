// @vitest-environment jsdom
/**
 * Data Room do gestor pelo GED (Fase 3 do plano docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md):
 * lista o que está compartilhado, adiciona documentos do GED do empreendimento, tira sem apagar do GED.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ listar: vi.fn(), candidatos: vi.fn(), compartilhar: vi.fn(), descompartilhar: vi.fn(), getSignedUrl: vi.fn() }));
vi.mock('../../services/opportunityDocumentsService', async (orig) => ({
    ...(await orig<typeof import('../../services/opportunityDocumentsService')>()),
    opportunityDocumentsService: svc,
}));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import DataRoomPanel from '../../components/investor/DataRoomPanel';

const doc = { id: 'g1', name: 'Matrícula atualizada', file_path: 'org/g1/v1_matricula.pdf', file_size: 2048, mime_type: 'application/pdf', category: 'juridico', created_at: '2026-11-21T12:00:00Z' };

beforeEach(() => {
    for (const f of Object.values(svc)) f.mockReset();
    svc.listar.mockResolvedValue([doc]);
});

describe('Data Room do gestor (GED)', () => {
    it('lista os compartilhados agrupados pela categoria do GED', async () => {
        render(<DataRoomPanel opportunityId="op1" organizationId="org" isAdmin uploadedBy="ana@x" empreendimentoId="emp1" />);
        expect(await screen.findByText('Matrícula atualizada')).toBeTruthy();
        expect(screen.getByRole('region', { name: 'Jurídico' })).toBeTruthy();
        expect(svc.listar).toHaveBeenCalledWith('op1');
    });

    it('sem empreendimento, "Adicionar" fica desligado e diz por quê', async () => {
        render(<DataRoomPanel opportunityId="op1" organizationId="org" isAdmin empreendimentoId={null} />);
        const botao = await screen.findByRole('button', { name: /Adicionar do empreendimento/ }) as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        expect(botao.closest('[title]')!.getAttribute('title')).toMatch(/não tem empreendimento/);
    });

    it('adiciona documentos do empreendimento e tira um (o documento continua no GED)', async () => {
        const user = userEvent.setup();
        svc.candidatos.mockResolvedValue([{ id: 'g2', nome: 'Memorial descritivo', categoria: 'engenharia' }]);
        svc.compartilhar.mockResolvedValue(undefined);
        svc.descompartilhar.mockResolvedValue(undefined);
        render(<DataRoomPanel opportunityId="op1" organizationId="org" isAdmin uploadedBy="ana@x" empreendimentoId="emp1" />);
        await user.click(await screen.findByRole('button', { name: /Adicionar do empreendimento/ }));
        expect(svc.candidatos).toHaveBeenCalledWith('emp1', ['g1']);
        await user.click(await screen.findByRole('checkbox'));
        await user.click(screen.getByRole('button', { name: 'Adicionar ao Data Room' }));
        await waitFor(() => expect(svc.compartilhar).toHaveBeenCalledWith(['g2'], 'op1', 'ana@x'));

        await user.click(screen.getByTitle(/Tirar do Data Room/));
        await waitFor(() => expect(svc.descompartilhar).toHaveBeenCalledWith(['g1'], 'op1'));
    });

    it('investidor (não gestor) não vê adicionar nem tirar', async () => {
        render(<DataRoomPanel opportunityId="op1" organizationId="org" isAdmin={false} empreendimentoId="emp1" />);
        expect(await screen.findByText('Matrícula atualizada')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Adicionar do empreendimento/ })).toBeNull();
        expect(screen.queryByTitle(/Tirar do Data Room/)).toBeNull();
    });
});
