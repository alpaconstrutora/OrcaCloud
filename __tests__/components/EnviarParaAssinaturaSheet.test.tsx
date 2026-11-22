// @vitest-environment jsdom
/**
 * Gaveta "Enviar para assinatura no portal" (assinatura interna, sem certificado).
 * Plano: docs/planos/2026-11-21-assinatura-eletronica-interna.md (F4/F5).
 *
 * Trava:
 *  1. TODOS os compradores entram (mesmo peso), sem escolher;
 *  2. comprador sem CPF bloqueia o envio E o botão diz o motivo;
 *  3. o envio monta os canais certos (portal do cliente, membro, corretor, link)
 *     e NÃO manda organização — a Edge tira a org da linha do documento.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const criar = vi.fn();
let candidatos: unknown;

vi.mock('../../services/assinaturaInternaService', () => ({
    candidatosParaAssinar: vi.fn(async () => candidatos),
    cpfDoUsuarioNoRh: vi.fn(async () => '52998224725'),
    envioDeAssinaturaService: { criar: (...a: unknown[]) => criar(...a) },
}));

import { EnviarParaAssinaturaSheet } from '../../components/assinatura/EnviarParaAssinaturaSheet';
import { ConfirmProvider } from '../../components/ui/confirm';

const ANA = { id: 'cli-ana', name: 'Ana Souza', email: 'ana@x.com', document: '529.982.247-25', legal_rep_name: null, legal_rep_document: null };
const BRUNO = { id: 'cli-bruno', name: 'Bruno Souza', email: 'bruno@x.com', document: '111.444.777-35', legal_rep_name: null, legal_rep_document: null };

function abrir() {
    const onEnviado = vi.fn();
    render(
        <ConfirmProvider>
            <EnviarParaAssinaturaSheet aberto onFechar={() => {}} origem={{ tipo: 'DEAL_DOC', id: 'doc-1' }}
                titulo="Reserva — Venda Apto 101" organizationId="org-1" dealId="deal-1" onEnviado={onEnviado} />
        </ConfirmProvider>,
    );
    return { onEnviado };
}

beforeEach(() => {
    criar.mockReset();
    criar.mockResolvedValue({ envelope_id: 'env-1', signatarios: [] });
    candidatos = {
        compradores: [ANA, BRUNO],
        corretor: { id: 'brk-1', name: 'Carla Corretora', email: 'carla@x.com', cpf: '935.411.347-80' },
        membros: [{ user_id: 'u-eu', name: 'Diego Gestor', email: 'diego@x.com' }],
        eu: 'u-eu',
    };
});

describe('EnviarParaAssinaturaSheet', () => {
    it('lista todos os compradores e envia com os canais certos, sem organização', async () => {
        const { onEnviado } = abrir();
        await screen.findByText('Ana Souza');
        expect(screen.getByText('Bruno Souza')).toBeTruthy();

        fireEvent.click(screen.getByRole('checkbox'));                      // corretor também assina
        fireEvent.click(screen.getByRole('button', { name: /Testemunha/ }));
        fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Eva Testemunha' } });
        fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'eva@x.com' } });
        fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '935.411.347-80' } });

        const enviar = await screen.findByRole('button', { name: /Enviar para assinar/ });
        await waitFor(() => expect((enviar as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(enviar);

        await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
        const [origem, signatarios, titulo] = criar.mock.calls[0];
        expect(origem).toEqual({ tipo: 'DEAL_DOC', id: 'doc-1' });
        expect(titulo).toBe('Reserva — Venda Apto 101');
        expect(signatarios).toEqual([
            { canal: 'PORTAL_CLIENTE', client_id: 'cli-ana' },
            { canal: 'PORTAL_CLIENTE', client_id: 'cli-bruno' },
            { canal: 'MEMBRO', user_id: 'u-eu' },                              // CPF vem do RH
            { canal: 'PORTAL_CORRETOR', broker_id: 'brk-1' },
            { canal: 'LINK', nome: 'Eva Testemunha', email: 'eva@x.com', cpf: '93541134780' },
        ]);
        expect(JSON.stringify(criar.mock.calls[0])).not.toContain('org-1');
        await waitFor(() => expect(onEnviado).toHaveBeenCalled());
    });

    it('comprador sem CPF bloqueia o envio e diz o motivo', async () => {
        candidatos = { ...(candidatos as object), compradores: [ANA, { ...BRUNO, document: '' }] };
        abrir();
        await screen.findByText('Bruno Souza');
        expect(screen.getByText('sem CPF válido no cadastro')).toBeTruthy();
        const enviar = screen.getByRole('button', { name: /Enviar para assinar/ }) as HTMLButtonElement;
        expect(enviar.disabled).toBe(true);
        expect(screen.getByText('Bruno Souza: sem CPF válido no cadastro. Corrija o cadastro do cliente.')).toBeTruthy();
        expect(enviar.parentElement?.getAttribute('title')).toBe('Bruno Souza: sem CPF válido no cadastro. Corrija o cadastro do cliente.');
    });
});
