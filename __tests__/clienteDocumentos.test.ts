import { describe, expect, it } from 'vitest';
import {
    TIPOS_DOCUMENTO_CLIENTE, chaveDoDocumento, documentoDoItem, payloadDoDocumentoCliente,
    rotuloDoTipo, situacaoDaValidade, tipoDocumentoNoGed, tiposDoCliente,
} from '../types/clienteDocumentos';
import { hojeISO } from '../utils/empreendimentoDocumentos';

/**
 * Documentos do cliente — Meus Clientes › aba Documentos e checklist da
 * negociação (15/11/2026). Plano: docs/planos/2026-11-15-cliente-aba-documentos.md
 *
 * O checklist da negociação acha o arquivo do cliente pela CHAVE gravada em
 * opura_documents.metadados.documento_cliente. Estes testes travam: as chaves
 * (que também estão em commercial_deals.doc_checklist), a escolha do documento
 * mais recente, a validade por data pura e o que vai ao banco no envio.
 */

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

function doc(p: { client_id?: string; key?: string | null; created_at?: string; id?: string }) {
    return {
        id: p.id ?? 'x',
        client_id: p.client_id ?? A,
        metadados: p.key === null ? null : { documento_cliente: p.key ?? 'rg_cnh' },
        created_at: p.created_at ?? '2026-11-01T10:00:00Z',
    };
}

describe('tipos de documento do cliente', () => {
    it('mantém as chaves gravadas em commercial_deals.doc_checklist', () => {
        expect(TIPOS_DOCUMENTO_CLIENTE.PF.map(t => t.key)).toEqual([
            'rg_cnh', 'cpf', 'certidao_estado_civil', 'comprovante_residencia',
            'declaracao_irpf', 'certidao_negativa_federal', 'comprovante_renda', 'extratos_bancarios',
        ]);
        expect(TIPOS_DOCUMENTO_CLIENTE.PJ.map(t => t.key)).toEqual([
            'cnpj', 'contrato_social', 'docs_socios', 'certidoes_negativas_empresa',
            'balanco_dre_faturamento', 'procuracao',
        ]);
    });

    it('oferece a lista do tipo de pessoa com "Outro" no fim (sem tipo = PF)', () => {
        expect(tiposDoCliente('PJ').at(-1)?.key).toBe('outro');
        expect(tiposDoCliente('PJ')[0].key).toBe('cnpj');
        expect(tiposDoCliente(undefined)[0].key).toBe('rg_cnh');
    });

    it('acha o rótulo nas duas listas', () => {
        expect(rotuloDoTipo('cnpj')).toBe('CNPJ');
        expect(rotuloDoTipo('rg_cnh')).toBe('RG / CNH');
        expect(rotuloDoTipo('nao_existe')).toBeNull();
        expect(rotuloDoTipo(null)).toBeNull();
    });
});

describe('chaveDoDocumento', () => {
    it('lê metadados.documento_cliente e ignora o que não é texto', () => {
        expect(chaveDoDocumento({ metadados: { documento_cliente: 'cpf' } })).toBe('cpf');
        expect(chaveDoDocumento({ metadados: null })).toBeNull();
        expect(chaveDoDocumento({ metadados: { documento_cliente: 3 } })).toBeNull();
        expect(chaveDoDocumento({ metadados: { documento_cliente: '  ' } })).toBeNull();
    });
});

describe('documentoDoItem', () => {
    it('devolve o mais recente do tipo, só do cliente pedido', () => {
        const docs = [
            doc({ id: 'velho', created_at: '2026-01-01T00:00:00Z' }),
            doc({ id: 'novo', created_at: '2026-10-01T00:00:00Z' }),
            doc({ id: 'de-B', client_id: B, created_at: '2026-12-01T00:00:00Z' }),
            doc({ id: 'cpf', key: 'cpf', created_at: '2026-12-01T00:00:00Z' }),
        ];
        expect(documentoDoItem(docs, A, 'rg_cnh')?.id).toBe('novo');
        expect(documentoDoItem(docs, B, 'rg_cnh')?.id).toBe('de-B');
        expect(documentoDoItem(docs, B, 'cpf')).toBeNull();
    });

    it('documento sem chave (enviado pelo GED) não atende item nenhum', () => {
        expect(documentoDoItem([doc({ key: null })], A, 'rg_cnh')).toBeNull();
    });
});

describe('situacaoDaValidade', () => {
    const hoje = '2026-11-15';
    it('sem validade', () => {
        expect(situacaoDaValidade({ data_validade: undefined, alerta_dias_antecedencia: 30 }, hoje).situacao).toBe('sem_validade');
    });
    it('vencido, vencendo (dentro do alerta) e ok', () => {
        expect(situacaoDaValidade({ data_validade: '2026-11-14', alerta_dias_antecedencia: 30 }, hoje)).toEqual({ situacao: 'vencido', dias: -1 });
        expect(situacaoDaValidade({ data_validade: '2026-11-15', alerta_dias_antecedencia: 30 }, hoje)).toEqual({ situacao: 'vencendo', dias: 0 });
        expect(situacaoDaValidade({ data_validade: '2026-12-15', alerta_dias_antecedencia: 30 }, hoje)).toEqual({ situacao: 'vencendo', dias: 30 });
        expect(situacaoDaValidade({ data_validade: '2026-12-16', alerta_dias_antecedencia: 30 }, hoje)).toEqual({ situacao: 'ok', dias: 31 });
    });
    it('"hoje" é a data LOCAL: 21h do dia 15 em Brasília ainda é dia 15', () => {
        // 2026-11-16T00:30Z = 15/11 21:30 em UTC−3. toISOString() diria dia 16.
        const noite = new Date(2026, 10, 15, 21, 30);
        expect(hojeISO(noite)).toBe('2026-11-15');
        expect(situacaoDaValidade({ data_validade: '2026-11-15', alerta_dias_antecedencia: 0 }, hojeISO(noite)).situacao).toBe('vencendo');
    });
});

describe('payloadDoDocumentoCliente', () => {
    const cliente = { id: A, organization_id: 'org-do-cliente' };

    it('grava na organização DO CLIENTE, com client_id e a chave em metadados', () => {
        const { doc: d, metadados } = payloadDoDocumentoCliente(cliente, { tipo: 'comprovante_renda', nome: '  Holerites set–nov  ', data_validade: '2027-01-31' });
        expect(d.organization_id).toBe('org-do-cliente');
        expect(d.client_id).toBe(A);
        expect(d.nome).toBe('Holerites set–nov');
        expect(d.tipo_documento).toBe('Comprovante de renda (3 últimos)');
        expect(d.categoria).toBe('comercial');
        expect(d.data_validade).toBe('2027-01-31');
        expect(d.tags).toEqual(['cliente', 'comprovante_renda']);
        expect(metadados).toEqual({ documento_cliente: 'comprovante_renda' });
    });

    it('sem validade não manda data vazia ao banco', () => {
        expect(payloadDoDocumentoCliente(cliente, { tipo: 'cpf', nome: 'CPF', data_validade: '' }).doc.data_validade).toBeUndefined();
    });

    it('"Outro" usa o texto livre como tipo no GED', () => {
        expect(tipoDocumentoNoGed({ tipo: 'outro', tipoLivre: ' Certidão de casamento ' })).toBe('Certidão de casamento');
        expect(tipoDocumentoNoGed({ tipo: 'outro', tipoLivre: '' })).toBe('Outro documento');
    });
});
