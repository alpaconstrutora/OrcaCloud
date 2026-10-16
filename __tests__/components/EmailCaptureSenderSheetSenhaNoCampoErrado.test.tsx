// @vitest-environment jsdom
/**
 * Senha do PDF digitada em "Palavras-chave" (caso real, 16/10/2026): o painel
 * avisa e move o valor para "Senha dos PDFs" com um clique.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../services/emailCaptureService', () => ({ emailCaptureService: { salvarRemetente: vi.fn(), definirSenhaPdf: vi.fn() } }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

import EmailCaptureSenderSheet from '../../components/boletos/EmailCaptureSenderSheet';
import { ConfirmProvider } from '../../components/ui/confirm';

const conta = { id: 'c1', organization_id: 'o1', usuario: 'caixa@gmail.com', modo_piloto: true, status: 'ativa' } as never;
const remetente = (palavras: string[]) => ({
    id: 's1', organization_id: 'o1', account_id: 'c1', supplier_id: null, nome: 'Energisa', tipo: 'exato',
    email: 'faturas@energisa.com.br', dominio: null, palavras_chave: palavras, importacao: 'revisao',
    exigir_dmarc: true, ativo: true, pdf_senha_atualizada_em: null, created_at: '2026-10-15',
}) as never;

const montar = (palavras: string[]) => render(
    <ConfirmProvider>
        <EmailCaptureSenderSheet open onClose={vi.fn()} contas={[conta]} fornecedores={[]} remetente={remetente(palavras)} onSalvo={vi.fn()} />
    </ConfirmProvider>,
);

describe('painel do remetente — senha no campo errado', () => {
    it('número puro em Palavras-chave mostra o aviso; o botão leva o valor para a senha', () => {
        montar(['1234']);
        expect(screen.getByText(/parece a senha do PDF/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Mover para Senha dos PDFs' }));
        expect((document.getElementById('erem-palavras') as HTMLInputElement).value).toBe('');
        expect((document.getElementById('erem-senha-pdf') as HTMLInputElement).value).toBe('1234');
        expect(screen.queryByText(/parece a senha do PDF/)).toBeNull();
    });

    it('palavras de texto ficam; só o número sai', () => {
        montar(['fatura', '09264']);
        fireEvent.click(screen.getByRole('button', { name: 'Mover para Senha dos PDFs' }));
        expect((document.getElementById('erem-palavras') as HTMLInputElement).value).toBe('fatura');
        expect((document.getElementById('erem-senha-pdf') as HTMLInputElement).value).toBe('09264');
    });

    it('sem número puro, sem aviso', () => {
        montar(['boleto', 'fatura']);
        expect(screen.queryByText(/senha do PDF, não uma palavra-chave/)).toBeNull();
    });
});
