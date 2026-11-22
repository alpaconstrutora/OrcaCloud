// @vitest-environment jsdom
/**
 * Book e Data Room no lado INTERNO — CreditRoomDetail.
 *
 * O que estes testes protegem:
 *  - "Baixar book" gera o book SEM marca d'água (é a própria empresa) e NÃO registra DOWNLOAD
 *    na trilha do credor;
 *  - sem versão liberada o botão desliga e diz o motivo;
 *  - o Data Room mostra a coluna "Empresa" só quando o room é de GRUPO.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { baixar, documentosDoIndice, listVersions, listDocuments, log, prepararVersao } = vi.hoisted(() => ({
    baixar: vi.fn(),
    documentosDoIndice: vi.fn(),
    listVersions: vi.fn(),
    listDocuments: vi.fn(),
    log: vi.fn(),
    prepararVersao: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../services/creditRoomBookService', () => ({
    creditRoomBookService: { baixar, documentosDoIndice },
}));
vi.mock('../services/creditRoomService', () => ({
    creditRoomService: { listVersions, listDocuments, log, prepararVersao },
}));

import { ConfirmProvider } from '../components/ui/confirm';
import CreditRoomDetail from '../components/credit/CreditRoomDetail';
import type { CreditRoom, CreditRoomDocument, CreditRoomVersion } from '../types/creditRoom';
import { buildSnapshot, computeIndicators } from '../utils/creditRoomSnapshot';

const versao = (): CreditRoomVersion => {
    const snapshot = buildSnapshot({
        dataBase: '2026-09-07',
        operacao: {
            requestedAmount: 5_000_000, modality: 'Financiamento',
            eligibleFlows: { noi: true, receivables: true, operating_cash: false },
            guarantees: [], equityCommitted: 0, equityContributed: 0,
        },
        documentVersionIds: [],
        escopo: {
            fonte: 'creditRoom', data_base: '2026-09-07', tipo: 'GRUPO',
            organizacoes: [{ id: 'o1', nome: 'Alfa Construtora', cnpj: null }],
        },
    } as Parameters<typeof buildSnapshot>[0]);
    return {
        id: 'v1', organizationId: 'o1', creditRoomId: 'r1', versionNo: 1, dataBase: '2026-09-07',
        snapshot, indicators: computeIndicators(snapshot), documentVersionIds: [], frozenAt: '2026-09-07T12:00:00Z',
    };
};

const sala = (over: Partial<CreditRoom> = {}) =>
    ({ id: 'r1', code: 'CR-1', name: 'Operação', status: 'ENVIADA', escopo: 'EMPRESA', activeVersionId: 'v1', ...over }) as unknown as CreditRoom;

const DOCUMENTO = {
    shareId: 's1', documentId: 'd1', nome: 'Matrícula.pdf', categoria: 'juridico', tipoDocumento: 'matricula',
    organizationId: 'o1', sharedAt: '2026-09-08T00:00:00Z', storagePath: 'x/y.pdf', dataValidade: null,
} as unknown as CreditRoomDocument;

const abrir = (room: CreditRoom, aba: 'visao' | 'dataroom' = 'visao') => {
    // A aba é lembrada por sala no localStorage (usePersistedState).
    localStorage.setItem(`creditRoom:${room.id}:aba`, JSON.stringify(aba));
    return render(
        <ConfirmProvider>
            <CreditRoomDetail room={room} onBack={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()} />
        </ConfirmProvider>,
    );
};

const botaoBook = () => screen.getByRole('button', { name: /Baixar book/ });

beforeEach(() => {
    localStorage.clear();
    for (const f of [baixar, documentosDoIndice, listVersions, listDocuments, log, prepararVersao]) f.mockReset();
    // A prévia da aba Visão não é o assunto aqui: nunca resolve.
    prepararVersao.mockReturnValue(new Promise(() => undefined));
    baixar.mockResolvedValue(undefined);
    documentosDoIndice.mockReturnValue([]);
    listVersions.mockResolvedValue([versao()]);
    listDocuments.mockResolvedValue([DOCUMENTO]);
    log.mockResolvedValue(undefined);
});

describe('CreditRoomDetail — book e Data Room internos', () => {
    it('"Baixar book" gera o book sem marca d\'água e não registra DOWNLOAD', async () => {
        abrir(sala());
        await waitFor(() => expect(botaoBook()).toBeEnabled());
        fireEvent.click(botaoBook());

        await waitFor(() => expect(baixar).toHaveBeenCalledTimes(1));
        const [salaChamada, versaoChamada, opcoes] = baixar.mock.calls[0];
        expect(salaChamada.id).toBe('r1');
        expect(versaoChamada.id).toBe('v1');
        expect(opcoes).not.toHaveProperty('marcaDagua');
        // Espera o clique assentar (o botão volta de "Gerando book…") antes de afirmar que nada foi registrado.
        await waitFor(() => expect(screen.getByRole('button', { name: /Baixar book/ })).toBeEnabled());
        expect(log).not.toHaveBeenCalled();
    });

    it('sem versão liberada o botão desliga e diz o motivo', async () => {
        listVersions.mockResolvedValue([]);
        abrir(sala({ activeVersionId: undefined } as Partial<CreditRoom>));
        await waitFor(() => expect(listVersions).toHaveBeenCalled());
        expect(botaoBook()).toBeDisabled();
        expect(botaoBook().parentElement).toHaveAttribute('title', 'Libere uma versão para baixar o book');
        fireEvent.click(botaoBook());
        expect(baixar).not.toHaveBeenCalled();
    });

    it('Data Room: a coluna "Empresa" só existe quando o room é de GRUPO', async () => {
        const { unmount } = abrir(sala({ escopo: 'GRUPO' }), 'dataroom');
        await screen.findByText('Matrícula.pdf');
        await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Empresa' })).toBeInTheDocument());
        expect(screen.getByText('Alfa Construtora')).toBeInTheDocument();
        unmount();

        abrir(sala({ escopo: 'EMPRESA' }), 'dataroom');
        await screen.findByText('Matrícula.pdf');
        expect(screen.queryByRole('columnheader', { name: 'Empresa' })).toBeNull();
    });
});
