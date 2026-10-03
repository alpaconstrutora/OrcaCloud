import { describe, expect, it } from 'vitest';
import {
  isSentDocument, sentDocumentAsRow, sentDocumentFileName, sentDocumentStatus,
} from '../utils/partnerSentDocuments';
import type { PartnerRequest } from '../types/partner';

const REQ = {
  id: 'r1', partner_workspace_id: 'ws1', title: 'Proposta.pdf', description: 'obs',
  type: 'DOCUMENTACAO', status: 'ABERTO', priority: 'MEDIA', created_by_email: 'p@x.com',
  attachment_paths: ['partner-uploads/ws1/1726000000000_Proposta_004.pdf'],
  created_at: '2026-07-22T02:30:00Z', updated_at: '2026-07-22T02:30:00Z',
} as PartnerRequest;

describe('partnerSentDocuments', () => {
  it('envio = DOCUMENTACAO com anexo', () => {
    expect(isSentDocument(REQ)).toBe(true);
    expect(isSentDocument({ ...REQ, attachment_paths: [] })).toBe(false);
    expect(isSentDocument({ ...REQ, type: 'DUVIDA' } as PartnerRequest)).toBe(false);
  });

  it('nome do arquivo sem pasta nem prefixo numérico; sem anexo cai no título', () => {
    expect(sentDocumentFileName(REQ)).toBe('Proposta_004.pdf');
    expect(sentDocumentFileName({ ...REQ, attachment_paths: [] })).toBe('Proposta.pdf');
  });

  it('status de revisão', () => {
    expect(sentDocumentStatus(REQ).label).toBe('Aguardando revisão');
    expect(sentDocumentStatus({ ...REQ, status: 'CONCLUIDO' } as PartnerRequest).label).toBe('Incluído no GED');
  });

  it('linha da DocumentsTable: o que o envio tem preenchido, o resto vazio', () => {
    const row = sentDocumentAsRow(REQ, { supplierName: 'Parceiro X', organizationId: 'org1' });
    expect(row.id).toBe('r1');
    expect(row.nome).toBe('Proposta_004.pdf');
    expect(row.descricao).toBe('obs');
    expect(row.autor).toBe('Parceiro X');
    expect(row.active_version?.storage_path).toBe(REQ.attachment_paths![0]);
    expect(row.numero_documento_fornecedor).toBeUndefined();
    expect(row.revisao).toBeUndefined();
    expect(row.data_validade).toBeUndefined();
    expect(row.project_id).toBeUndefined();
  });

  it('Emissão = dia LOCAL do envio, ancorado ao meio-dia (02h30 UTC é véspera em Brasília)', () => {
    const row = sentDocumentAsRow(REQ, {});
    const local = new Date(REQ.created_at);
    expect(row.data_emissao!.endsWith('T12:00:00')).toBe(true);
    // Mesmo dia que o card antigo mostrava (toLocaleDateString do created_at),
    // em qualquer fuso em que o teste rodar.
    expect(new Date(row.data_emissao!).toDateString()).toBe(local.toDateString());
  });
});
