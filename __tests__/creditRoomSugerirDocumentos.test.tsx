// @vitest-environment jsdom
/**
 * "Sugerir documentos" do Data Room — CreditRoomSugerirDocumentos (Sheet).
 *
 * O que estes testes protegem:
 *  - os grupos saem na ordem Contratos → Empreendimentos → Obra → Clientes;
 *  - o grupo de CLIENTES nasce DESMARCADO e com o aviso de LGPD (dado pessoal não vai sem escolha);
 *  - documento que já está no Data Room fica desligado, sem marca e rotulado;
 *  - documento do contrato que também é do cliente segue marcado, mas avisa "contém dados do cliente";
 *  - "Compartilhar" entrega ao serviço EXATAMENTE os ids marcados e recarrega a lista;
 *  - sem nada marcado o botão desliga e diz o motivo;
 *  - room de Grupo mostra a empresa de cada documento; room de Empresa não;
 *  - erro do serviço aparece no painel.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sugerirDocumentos, shareDocuments, listDocuments } = vi.hoisted(() => ({
    sugerirDocumentos: vi.fn(),
    shareDocuments: vi.fn(),
    listDocuments: vi.fn(),
}));

// O módulo importa o store via serviços; sem o cliente Supabase ele lança por falta de variáveis de ambiente.
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../services/creditRoomService', () => ({
    creditRoomService: { sugerirDocumentos, shareDocuments, listDocuments },
}));

import { ConfirmProvider } from '../components/ui/confirm';
import CreditRoomSugerirDocumentos from '../components/credit/CreditRoomSugerirDocumentos';
import type { CreditRoom, CreditRoomDocument, CreditRoomVersion } from '../types/creditRoom';
import { buildSnapshot, computeIndicators } from '../utils/creditRoomSnapshot';
import { agruparSugestoes, AVISO_LGPD_CLIENTE, type DocumentoSugerido, type OrigemSugestao } from '../utils/creditRoomSugestoes';

const doc = (id: string, origem: OrigemSugestao, extra: Partial<DocumentoSugerido> = {}): DocumentoSugerido => ({
    documentId: id, nome: `Documento ${id}`, categoria: 'juridico', tipoDocumento: 'contrato',
    organizationId: 'o1', dataValidade: null, origem, referencia: 'Venda 01', vencido: false, jaCompartilhado: false,
    ...extra,
});

const DOCS = [
    doc('c1', 'CONTRATO'),
    doc('c2', 'CONTRATO', { jaCompartilhado: true }),
    doc('c3', 'CONTRATO', { temDadosDoCliente: true }),
    doc('e1', 'EMPREENDIMENTO', { vencido: true, dataValidade: '2025-01-31' }),
    doc('o1', 'OBRA'),
    doc('k1', 'CLIENTE'),
];

const room = (escopo: 'EMPRESA' | 'GRUPO' = 'EMPRESA') => ({ id: 'r1', code: 'CR-1', name: 'Operação', escopo }) as unknown as CreditRoom;

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
            organizacoes: [{ id: 'o1', nome: 'Alfa Construtora', cnpj: null }, { id: 'o2', nome: 'Beta Incorporadora', cnpj: null }],
        },
    } as Parameters<typeof buildSnapshot>[0]);
    return {
        id: 'v1', organizationId: 'o1', creditRoomId: 'r1', versionNo: 1, dataBase: '2026-09-07',
        snapshot, indicators: computeIndicators(snapshot), documentVersionIds: [], frozenAt: '2026-09-07T12:00:00Z',
    };
};

const abrir = (opts: { escopo?: 'EMPRESA' | 'GRUPO'; onShared?: (d: CreditRoomDocument[]) => void; onClose?: () => void } = {}) =>
    render(
        <ConfirmProvider>
            <CreditRoomSugerirDocumentos
                open onClose={opts.onClose ?? vi.fn()} room={room(opts.escopo)} versao={versao()} onShared={opts.onShared ?? vi.fn()}
            />
        </ConfirmProvider>,
    );

const caixa = (nome: string | RegExp) => screen.getByRole('checkbox', { name: nome }) as HTMLInputElement;
const botaoCompartilhar = () => screen.getByRole('button', { name: /^Compartilhar/ });

beforeEach(() => {
    sugerirDocumentos.mockReset();
    shareDocuments.mockReset();
    listDocuments.mockReset();
    sugerirDocumentos.mockResolvedValue(agruparSugestoes(DOCS));
    shareDocuments.mockResolvedValue(undefined);
    listDocuments.mockResolvedValue([]);
});

describe('CreditRoomSugerirDocumentos', () => {
    it('os grupos saem na ordem Contratos → Empreendimentos → Obra → Clientes', async () => {
        abrir();
        await screen.findByText('Documentos dos contratos da carteira');
        const titulos = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);
        expect(titulos).toEqual([
            'Documentos dos contratos da carteira',
            'Documentos dos empreendimentos',
            'Documentos da obra',
            'Documentos dos clientes',
        ]);
    });

    it('CLIENTES nasce desmarcado e com o aviso de LGPD; os demais grupos vêm marcados', async () => {
        abrir();
        await screen.findByText('Documentos dos clientes');
        expect(screen.getByText(AVISO_LGPD_CLIENTE)).toBeInTheDocument();
        expect(caixa('Selecionar Documento k1').checked).toBe(false);
        expect(caixa('Selecionar todos: Documentos dos clientes').checked).toBe(false);
        for (const n of ['c1', 'c3', 'e1', 'o1']) expect(caixa(`Selecionar Documento ${n}`).checked).toBe(true);
    });

    it('documento já no Data Room fica desligado, sem marca e rotulado', async () => {
        abrir();
        await screen.findByText('Documentos dos contratos da carteira');
        const c2 = caixa('Selecionar Documento c2');
        expect(c2).toBeDisabled();
        expect(c2.checked).toBe(false);
        expect(c2).toHaveAttribute('title', 'Este documento já está no Data Room');
        expect(screen.getAllByText('já no Data Room')).toHaveLength(1);
    });

    it('documento do contrato que também é do cliente segue marcado e avisa "contém dados do cliente"', async () => {
        abrir();
        await screen.findByText('Documentos dos contratos da carteira');
        expect(caixa('Selecionar Documento c3').checked).toBe(true);
        const aviso = screen.getAllByText('contém dados do cliente');
        expect(aviso).toHaveLength(1);
        expect(within(aviso[0].closest('li') as HTMLElement).getByText('Documento c3')).toBeInTheDocument();
    });

    it('vencido aparece como texto vermelho (sem pílula)', async () => {
        abrir();
        const venc = await screen.findByText(/Vencido em 31\/01\/2025/);
        expect(venc.className).toContain('text-red-600');
        expect(venc.className).not.toContain('rounded-full');
    });

    it('"Compartilhar" entrega ao serviço exatamente os ids marcados, recarrega a lista e fecha', async () => {
        const novaLista = [{ shareId: 's1', documentId: 'c1' }] as unknown as CreditRoomDocument[];
        listDocuments.mockResolvedValue(novaLista);
        const onShared = vi.fn();
        const onClose = vi.fn();
        abrir({ onShared, onClose });
        await screen.findByText('Documentos dos clientes');

        // Marca um do grupo CLIENTES e desmarca um dos contratos.
        fireEvent.click(caixa('Selecionar Documento k1'));
        fireEvent.click(caixa('Selecionar Documento c1'));
        expect(botaoCompartilhar()).toHaveTextContent('Compartilhar 4 documentos');

        fireEvent.click(botaoCompartilhar());
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        const [salaChamada, ids] = shareDocuments.mock.calls[0];
        expect(salaChamada.id).toBe('r1');
        expect([...ids].sort()).toEqual(['c3', 'e1', 'k1', 'o1']);
        expect(listDocuments).toHaveBeenCalledWith('r1');
        expect(onShared).toHaveBeenCalledWith(novaLista);
    });

    it('a caixa do grupo marca e desmarca todos os que podem ser marcados (e fica parcial no meio)', async () => {
        abrir();
        await screen.findByText('Documentos dos contratos da carteira');
        const grupo = caixa('Selecionar todos: Documentos dos contratos da carteira');
        expect(grupo.checked).toBe(true);

        fireEvent.click(caixa('Selecionar Documento c1'));
        expect(grupo.checked).toBe(false);
        expect(grupo.indeterminate).toBe(true);

        fireEvent.click(grupo); // parcial → marca todos
        expect(caixa('Selecionar Documento c1').checked).toBe(true);
        expect(caixa('Selecionar Documento c2').checked).toBe(false); // já no Data Room: nunca marca
        fireEvent.click(grupo); // todos → desmarca
        expect(caixa('Selecionar Documento c1').checked).toBe(false);
        expect(caixa('Selecionar Documento c3').checked).toBe(false);
    });

    it('sem nada marcado o botão desliga e diz o motivo', async () => {
        sugerirDocumentos.mockResolvedValue(agruparSugestoes([doc('k1', 'CLIENTE')]));
        abrir();
        await screen.findByText('Documentos dos clientes');
        expect(botaoCompartilhar()).toBeDisabled();
        expect(botaoCompartilhar()).toHaveTextContent('Compartilhar 0 documentos');
        expect(botaoCompartilhar().parentElement).toHaveAttribute('title', 'Marque ao menos um documento para compartilhar');
        fireEvent.click(botaoCompartilhar());
        expect(shareDocuments).not.toHaveBeenCalled();
    });

    it('room de Grupo mostra a empresa de cada documento; room de Empresa não', async () => {
        sugerirDocumentos.mockResolvedValue(agruparSugestoes([
            doc('a', 'CONTRATO', { organizationId: 'o1' }),
            doc('b', 'CONTRATO', { organizationId: 'o2' }),
            doc('c', 'CONTRATO', { organizationId: 'fora' }),
        ]));
        const { unmount } = abrir({ escopo: 'GRUPO' });
        await screen.findByText('Documentos dos contratos da carteira');
        expect(screen.getByText(/Empresa: Alfa Construtora/)).toBeInTheDocument();
        expect(screen.getByText(/Empresa: Beta Incorporadora/)).toBeInTheDocument();
        expect(screen.getByText(/Empresa: —/)).toBeInTheDocument();
        unmount();

        abrir({ escopo: 'EMPRESA' });
        await screen.findByText('Documentos dos contratos da carteira');
        expect(screen.queryByText(/Empresa:/)).toBeNull();
    });

    it('erro do serviço aparece no painel e não libera o Compartilhar', async () => {
        sugerirDocumentos.mockRejectedValue(new Error('Não foi possível ler os documentos do GED para sugerir. Tente de novo.'));
        abrir();
        expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível ler os documentos do GED para sugerir');
        expect(botaoCompartilhar()).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    });

    it('erro ao compartilhar aparece no painel e mantém o painel aberto', async () => {
        shareDocuments.mockRejectedValue(new Error('Sem permissão para compartilhar.'));
        const onClose = vi.fn();
        abrir({ onClose });
        await screen.findByText('Documentos dos clientes');
        fireEvent.click(botaoCompartilhar());
        expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão para compartilhar.');
        expect(onClose).not.toHaveBeenCalled();
    });
});
