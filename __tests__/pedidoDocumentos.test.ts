import { describe, it, expect } from 'vitest';
import {
    erroDoArquivoDocumento,
    podeExcluirDocumento,
    motivoNaoExcluir,
    rotuloCategoriaDocumento,
    documentoDaLinha,
    tamanhoLegivel,
} from '../lib/pedidoDocumentos';

describe('anexos do pedido · arquivo aceito', () => {
    it('aceita PDF, XML de NF e foto', () => {
        expect(erroDoArquivoDocumento({ name: 'NF 123.PDF', size: 2048 })).toBeNull();
        expect(erroDoArquivoDocumento({ name: '35261112345678000199550010000012341000012345-nfe.xml', size: 9000 })).toBeNull();
        expect(erroDoArquivoDocumento({ name: 'recibo.heic', size: 300_000 })).toBeNull();
    });

    it('recusa vazio, acima de 10 MB, sem extensão e executável', () => {
        expect(erroDoArquivoDocumento({ name: 'a.pdf', size: 0 })).toMatch(/vazio/);
        expect(erroDoArquivoDocumento({ name: 'a.pdf', size: 10 * 1024 * 1024 + 1 })).toMatch(/10 MB/);
        expect(erroDoArquivoDocumento({ name: 'recibo', size: 10 })).toMatch(/Tipo não aceito/);
        expect(erroDoArquivoDocumento({ name: 'virus.exe', size: 10 })).toMatch(/Tipo não aceito/);
    });
});

describe('anexos do pedido · quem exclui', () => {
    it('cada lado exclui só o que o próprio lado enviou', () => {
        expect(podeExcluirDocumento({ enviadoPorLado: 'COMPRADOR' }, true)).toBe(true);
        expect(podeExcluirDocumento({ enviadoPorLado: 'FORNECEDOR' }, true)).toBe(false);
        expect(podeExcluirDocumento({ enviadoPorLado: 'FORNECEDOR' }, false)).toBe(true);
        expect(podeExcluirDocumento({ enviadoPorLado: 'COMPRADOR' }, false)).toBe(false);
    });

    it('o botão desligado diz o porquê', () => {
        expect(motivoNaoExcluir({ enviadoPorLado: 'FORNECEDOR' }, true)).toMatch(/fornecedor/);
        expect(motivoNaoExcluir({ enviadoPorLado: 'COMPRADOR' }, false)).toMatch(/comprador/);
        expect(motivoNaoExcluir({ enviadoPorLado: 'COMPRADOR' }, true)).toBeNull();
    });
});

describe('anexos do pedido · leitura', () => {
    it('rótulo de categoria desconhecida cai em Outro', () => {
        expect(rotuloCategoriaDocumento('RECIBO')).toBe('Recibo');
        expect(rotuloCategoriaDocumento('XPTO')).toBe('Outro');
    });

    it('linha da RPC de link vira o mesmo objeto da tabela', () => {
        const doc = documentoDaLinha({
            id: 'd1', order_id: 'o1', categoria: 'BOLETO', descricao: null,
            file_path: 'o1/x_boleto.pdf', file_name: 'boleto.pdf', mime_type: 'application/pdf',
            size_bytes: '2048', enviado_por_lado: 'FORNECEDOR', enviado_por: 'ACME', created_at: '2026-11-09T12:00:00Z',
        });
        expect(doc).toMatchObject({ orderId: 'o1', categoria: 'BOLETO', sizeBytes: 2048, enviadoPorLado: 'FORNECEDOR' });
    });

    it('tamanho legível', () => {
        expect(tamanhoLegivel(null)).toBe('—');
        expect(tamanhoLegivel(2048)).toBe('2 KB');
        expect(tamanhoLegivel(1.5 * 1024 * 1024)).toBe('1,5 MB');
    });
});
