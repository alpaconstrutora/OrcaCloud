// @vitest-environment jsdom
/**
 * Pedido › Recebimento › Documentos — duas visualizações da mesma lista
 * (09/11/2026: "não é para substituir e sim criar uma opção de visualização").
 * A tabela é o padrão; os cartões de recibo são a alternativa; a busca vale nos
 * dois; e o documento do outro lado continua sem Excluir nos cartões.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('../../services/pedidoDocumentoService', () => ({
    pedidoDocumentoService: {
        notasVinculadas: vi.fn(async () => []),
        urlDoDocumento: vi.fn(),
        urlDaNota: vi.fn(),
        excluir: vi.fn(),
        enviar: vi.fn(),
    },
}));

import PedidoDocumentos from '../../components/suprimentos/PedidoDocumentos';
import type { DocumentoPedido } from '../../lib/pedidoDocumentos';

const doc = (over: Partial<DocumentoPedido>): DocumentoPedido => ({
    id: '3f2a9c10-77ab-4d1e-9b0c-1234567890ab',
    orderId: 'o1',
    categoria: 'RECIBO',
    descricao: 'Frete da entrega',
    filePath: 'o1/a_recibo-frete.pdf',
    fileName: 'recibo-frete.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    enviadoPorLado: 'FORNECEDOR',
    enviadoPor: 'ACME Materiais',
    createdAt: '2026-11-09T14:32:00Z',
    ...over,
});

const documentos = [
    doc({}),
    doc({ id: '9d0e1f22-0000-4000-8000-000000000001', categoria: 'NOTA_FISCAL', fileName: 'nf-1234.xml', descricao: 'NF 1234', enviadoPorLado: 'COMPRADOR', enviadoPor: 'Altair', createdAt: '2026-11-08T10:05:00Z' }),
];

const montar = () => render(
    <PedidoDocumentos orderId="o1" ehComprador documentos={documentos} onDocumentosChange={() => {}} notify={() => {}} />,
);

describe('PedidoDocumentos · cartões de recibo × tabela', () => {
    beforeEach(() => localStorage.clear());

    it('começa na tabela e troca para os cartões de recibo', () => {
        montar();
        expect(screen.getByRole('table')).toBeInTheDocument();
        expect(screen.queryByRole('article')).toBeNull();

        fireEvent.click(screen.getByTitle('Visualização em cards'));

        expect(screen.queryByRole('table')).toBeNull();
        const cartoes = screen.getAllByRole('article');
        expect(cartoes).toHaveLength(2);
        // mais recente primeiro, com o Nº curto do recibo
        expect(within(cartoes[0]).getByText('Recibo')).toBeInTheDocument();
        expect(within(cartoes[0]).getByText('Nº 3F2A9C10')).toBeInTheDocument();
        expect(within(cartoes[0]).getByText('recibo-frete.pdf')).toBeInTheDocument();
        expect(within(cartoes[1]).getByText('Nota fiscal')).toBeInTheDocument();
    });

    it('a escolha fica guardada', () => {
        const { unmount } = montar();
        fireEvent.click(screen.getByTitle('Visualização em cards'));
        unmount();
        montar();
        expect(screen.getAllByRole('article')).toHaveLength(2);
    });

    it('a busca é uma só: o termo digitado nos cartões vale na tabela', () => {
        montar();
        fireEvent.click(screen.getByTitle('Visualização em cards'));
        fireEvent.change(screen.getByPlaceholderText('Buscar documento...'), { target: { value: 'nf-1234' } });
        expect(screen.getAllByRole('article')).toHaveLength(1);

        fireEvent.click(screen.getByTitle('Visualização em lista'));
        expect((screen.getByPlaceholderText('Buscar documento...') as HTMLInputElement).value).toBe('nf-1234');
        expect(screen.queryByText('recibo-frete.pdf')).toBeNull();
        expect(screen.getByText('nf-1234.xml')).toBeInTheDocument();
    });

    it('no cartão, o documento do fornecedor não pode ser excluído pelo comprador — e diz por quê', () => {
        montar();
        fireEvent.click(screen.getByTitle('Visualização em cards'));
        const [doFornecedor, doComprador] = screen.getAllByRole('article');
        const excluirFornecedor = within(doFornecedor).getByTitle('Excluir');
        expect(excluirFornecedor).toBeDisabled();
        expect(excluirFornecedor.parentElement).toHaveAttribute('title', expect.stringMatching(/fornecedor/));
        expect(within(doComprador).getByTitle('Excluir')).toBeEnabled();
    });
});
