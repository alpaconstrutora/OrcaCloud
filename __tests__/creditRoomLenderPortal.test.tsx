// @vitest-environment jsdom
/**
 * Caminho do CREDOR no Portal de Crédito — RoomView (conteúdo de um room dentro do LenderPortal).
 *
 * O que estes testes protegem:
 *  - "Baixar book" só aparece com a permissão `download` do vínculo;
 *  - o clique gera o book COM marca d'água contendo o e-mail de quem baixou e registra
 *    DOWNLOAD / book / <versão ativa> na trilha, como CREDOR;
 *  - sem versão liberada o botão desliga e diz o motivo;
 *  - o Data Room mostra a coluna "Empresa" só quando o room é de GRUPO.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { baixar, documentosDoIndice, listVersions, listDocuments, log } = vi.hoisted(() => ({
    baixar: vi.fn(),
    documentosDoIndice: vi.fn(),
    listVersions: vi.fn(),
    listDocuments: vi.fn(),
    log: vi.fn(),
}));

// O módulo importa o store via serviços; sem o cliente Supabase ele lança por falta de variáveis de ambiente.
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../services/creditRoomBookService', () => ({
    creditRoomBookService: { baixar, documentosDoIndice },
}));
vi.mock('../services/creditRoomService', () => ({
    creditRoomService: { listVersions, listDocuments, log },
}));

import { RoomView } from '../components/credit/portal/LenderPortal';
import type { CreditRoom, CreditRoomDocument, CreditRoomVersion, MyCreditRoomMembership } from '../types/creditRoom';
import { buildSnapshot, computeIndicators } from '../utils/creditRoomSnapshot';

const EMAIL = 'analista@banco.test';

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

const vinculo = (download: boolean): MyCreditRoomMembership => ({
    creditRoomId: 'r1', side: 'CREDOR', permissions: { view: true, download, comment: true, request: true },
});

const DOCUMENTO = {
    shareId: 's1', documentId: 'd1', nome: 'Matrícula.pdf', categoria: 'juridico', tipoDocumento: 'matricula',
    organizationId: 'o1', sharedAt: '2026-09-08T00:00:00Z', storagePath: 'x/y.pdf', dataValidade: null,
} as unknown as CreditRoomDocument;

const abrir = (opts: { download?: boolean; aba?: 'visao' | 'dataroom'; room?: Partial<CreditRoom> } = {}) =>
    render(<RoomView atual={{ room: sala(opts.room), membership: vinculo(opts.download ?? true) }} aba={opts.aba ?? 'dataroom'} userEmail={EMAIL} />);

const botaoBook = () => screen.getByRole('button', { name: /Baixar book/ });

beforeEach(() => {
    for (const f of [baixar, documentosDoIndice, listVersions, listDocuments, log]) f.mockReset();
    baixar.mockResolvedValue(undefined);
    documentosDoIndice.mockReturnValue([]);
    listVersions.mockResolvedValue([versao()]);
    listDocuments.mockResolvedValue([DOCUMENTO]);
    log.mockResolvedValue(undefined);
});

describe('LenderPortal › RoomView — book e Data Room do credor', () => {
    it('"Baixar book" fica escondido sem a permissão de download', async () => {
        abrir({ download: false });
        await screen.findByText('Operação');
        expect(screen.queryByRole('button', { name: /Baixar book/ })).toBeNull();
    });

    it('com a permissão, o clique gera o book com a marca d\'água do e-mail e registra o DOWNLOAD como CREDOR', async () => {
        abrir({ download: true });
        await screen.findByText('Operação');
        fireEvent.click(botaoBook());

        await waitFor(() => expect(log).toHaveBeenCalled());
        expect(baixar).toHaveBeenCalledTimes(1);
        const [salaChamada, versaoChamada, opcoes] = baixar.mock.calls[0];
        expect(salaChamada.id).toBe('r1');
        expect(versaoChamada.id).toBe('v1');
        expect(opcoes.marcaDagua).toContain(EMAIL);
        expect(log).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), 'DOWNLOAD', 'book', 'v1', {}, 'CREDOR');
    });

    it('book que falha não registra DOWNLOAD e mostra o erro', async () => {
        baixar.mockRejectedValue(new Error('PDF quebrou'));
        abrir({ download: true });
        await screen.findByText('Operação');
        fireEvent.click(botaoBook());
        expect(await screen.findByText('PDF quebrou')).toBeInTheDocument();
        expect(log).not.toHaveBeenCalled();
    });

    it('sem versão liberada o botão desliga e diz o motivo', async () => {
        listVersions.mockResolvedValue([]);
        abrir({ download: true, room: { activeVersionId: undefined } as Partial<CreditRoom> });
        await screen.findByText('Operação');
        expect(botaoBook()).toBeDisabled();
        expect(botaoBook().parentElement).toHaveAttribute('title', 'A empresa ainda não liberou uma versão');
        fireEvent.click(botaoBook());
        expect(baixar).not.toHaveBeenCalled();
    });

    it('Data Room: a coluna "Empresa" só existe quando o room é de GRUPO', async () => {
        const { unmount } = abrir({ room: { escopo: 'GRUPO' } });
        await screen.findByText('Matrícula.pdf');
        expect(screen.getByRole('columnheader', { name: 'Empresa' })).toBeInTheDocument();
        expect(screen.getByText('Alfa Construtora')).toBeInTheDocument();
        unmount();

        abrir({ room: { escopo: 'EMPRESA' } });
        await screen.findByText('Matrícula.pdf');
        expect(screen.queryByRole('columnheader', { name: 'Empresa' })).toBeNull();
    });
});
