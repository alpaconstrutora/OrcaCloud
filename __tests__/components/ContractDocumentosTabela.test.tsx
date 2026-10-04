// @vitest-environment jsdom
/**
 * Contratos › Emissão › documentos — tabela + abas (2026-10-03).
 *
 * Pedido: "Transformar em tabela e aplicar o padrão ui_ux_guia_unificado.md no
 * toolbar de abas + botão de ajuste de colunas". Antes: um card por dono
 * (contrato, cada aditivo) empilhado, cada um com uma pilha de cartões de versão.
 *
 * O que este teste trava:
 *  1. as versões vêm numa <table> (StandardTable) com o botão de ajustar as
 *     colunas ao conteúdo (§6.1.2) — não em cartões;
 *  2. contrato e aditivos são ABAS (role=tab) acopladas à mesma tabela, e trocar
 *     de aba troca as linhas;
 *  3. excluir versão emitida fica desabilitado E diz o motivo.
 *
 * Plano: docs/planos/2026-10-03-documentos-do-contrato-em-tabela.md
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const VERSOES = {
    'c-1': [
        { id: 'v2', owner_id: 'c-1', owner_type: 'CONTRACT', v: 2, name: 'Minuta revisada', notes: 'Prazo ajustado', emitted: false, source: 'UPLOAD', url: 'https://x/2.pdf', created_at: '2026-10-02T10:00:00Z' },
        { id: 'v1', owner_id: 'c-1', owner_type: 'CONTRACT', v: 1, name: 'Minuta inicial', notes: '', emitted: true, source: 'TEMPLATE_DOCX', url: 'https://x/1.pdf', created_at: '2026-10-01T10:00:00Z' },
    ],
    'ad-1': [
        { id: 'a1', owner_id: 'ad-1', owner_type: 'ADDENDUM', v: 1, name: 'Termo aditivo 01', notes: '', emitted: false, source: 'UPLOAD', url: 'https://x/a1.pdf', created_at: '2026-10-03T10:00:00Z' },
    ],
} as Record<string, unknown[]>;

vi.mock('../../services/contractDocumentVersionService', () => ({
    contractDocumentVersionService: {
        listByOwner: vi.fn((_t: string, id: string) => Promise.resolve(VERSOES[id] ?? [])),
        list: vi.fn(() => Promise.resolve([...VERSOES['c-1'], ...VERSOES['ad-1']])),
        addVersion: vi.fn(), emit: vi.fn(), update: vi.fn(), remove: vi.fn(),
    },
}));
vi.mock('../../services/contractService', () => ({
    contractService: {
        listAddendums: vi.fn(() => Promise.resolve([
            { id: 'ad-1', number: 'AD-001', description: 'Prorrogação de prazo', status: 'Aprovado', new_start_date: '2026-11-01', new_end_date: '2027-10-31' },
        ])),
    },
}));

import ContractDocumentsTab from '../../components/contracts/ContractDocumentsTab';
import { ConfirmProvider } from '../../components/ui/confirm';

const montar = () => render(
    <ConfirmProvider>
        <ContractDocumentsTab
            contract={{ id: 'c-1', number: 'CTS-001', organization_id: 'org-1' } as never}
            onNotify={() => {}}
        />
    </ConfirmProvider>,
);

describe('Documentos do contrato — tabela com abas', () => {
    beforeEach(() => { localStorage.clear(); });

    it('versões em <table> com o botão de ajustar colunas ao conteúdo', async () => {
        const { container } = montar();
        await screen.findByText('Minuta revisada');

        expect(container.querySelector('table')).not.toBeNull();
        expect(screen.getByTitle('Ajustar largura das colunas ao conteúdo')).toBeTruthy();
        // cabeçalhos §6.2
        for (const h of ['Versão', 'Documento', 'Situação', 'O que mudou', 'Origem', 'Data']) {
            expect(within(container.querySelector('thead')!).getByText(h)).toBeTruthy();
        }
        // situação em texto (§8)
        expect(screen.getByText('Rascunho')).toBeTruthy();
        expect(screen.getByText('Emitida')).toBeTruthy();
    });

    it('contrato e aditivo são abas da MESMA tabela; trocar de aba troca as linhas', async () => {
        const { container } = montar();
        await screen.findByText('Minuta revisada');

        const abas = await screen.findAllByRole('tab');
        expect(abas.map(a => a.textContent)).toEqual(['Contrato CTS-0012', 'Aditivo AD-0011']);
        expect(container.querySelectorAll('table')).toHaveLength(1);

        fireEvent.click(screen.getByRole('tab', { name: /Aditivo AD-001/ }));
        await screen.findByText('Termo aditivo 01');
        expect(screen.queryByText('Minuta revisada')).toBeNull();
        expect(screen.getByText('Prorrogação de prazo')).toBeTruthy();
        expect(container.querySelectorAll('table')).toHaveLength(1);
    });

    it('versão emitida: excluir desabilitado e com o motivo', async () => {
        montar();
        await screen.findByText('Minuta inicial');
        const motivo = 'Versão emitida ao cliente não pode ser excluída';
        const botao = screen.getAllByTitle(motivo).find(el => el.tagName === 'BUTTON') as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        // o rascunho continua excluível
        await waitFor(() => expect(screen.getAllByTitle('Excluir versão')).toHaveLength(1));
    });
});
