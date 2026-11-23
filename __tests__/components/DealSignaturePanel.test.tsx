// @vitest-environment jsdom
/**
 * Negociação › Contrato › "Assinatura eletrônica" — relato de 22/11/2026: em
 * Comercial › Locações o bloco só oferecia o ZapSign. Trava:
 *  1. as DUAS opções aparecem, e o portal (sem custo) é o padrão;
 *  2. no portal, o envio assina a VERSÃO do contrato (origem CDV) — a mesma da Emissão;
 *  3. versão não emitida desliga o envio E diz o motivo à vista;
 *  4. sem contrato gerado, diz o que fazer;
 *  5. negociação que já foi ao ZapSign abre no ZapSign;
 *  6. versão ASSINADA abre a via assinada, não o original (relato de 23/11/2026).
 */
import React from 'react';
import { abrirArquivoAssinado } from '../../lib/storageAssinado';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

let versoes: unknown[] = [];

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/storageAssinado', () => ({ abrirArquivoAssinado: vi.fn(async () => {}), BUCKET_DOCUMENTOS: 'documents' }));
vi.mock('../../services/signatureService', () => ({ signatureService: {} }));
vi.mock('../../services/contractDocumentVersionService', async (importOriginal) => {
    const real = await importOriginal<typeof import('../../services/contractDocumentVersionService')>();
    return { ...real, contractDocumentVersionService: { listByOwner: vi.fn(async () => versoes) } };
});
vi.mock('../../components/assinatura/EnviarParaAssinaturaSheet', () => ({
    EnviarParaAssinaturaSheet: (p: { aberto: boolean; origem: { tipo: string; id: string } | null; titulo: string }) =>
        p.aberto ? <div data-testid="enviar">{`${p.origem?.tipo}:${p.origem?.id}|${p.titulo}`}</div> : null,
}));
vi.mock('../../components/assinatura/AcompanharAssinaturaSheet', () => ({
    AcompanharAssinaturaSheet: () => null,
}));

import DealSignaturePanel from '../../components/DealSignaturePanel';

const CONTRATO = { id: 'ct-1', organization_id: 'org-1', number: 'CL-2026-001' };
const versao = (over: Record<string, unknown>) => ({
    id: 'v-1', contract_id: 'ct-1', owner_type: 'CONTRACT', owner_id: 'ct-1', v: 1, kind: 'CONTRATO',
    name: 'Contrato de locação', url: 'p.pdf', storage_path: 'p.pdf', emitted: true, ...over,
});

function montar(props: Partial<React.ComponentProps<typeof DealSignaturePanel>> = {}) {
    render(
        <DealSignaturePanel deal={{ id: 'deal-1' }} organizationId="org-1" onNotify={() => {}} contrato={CONTRATO} {...props} />,
    );
}

beforeEach(() => { versoes = []; vi.mocked(abrirArquivoAssinado).mockClear(); });

describe('DealSignaturePanel', () => {
    it('oferece portal e ZapSign; envia a versão emitida do contrato pelo portal', async () => {
        versoes = [versao({})];
        montar();
        expect(screen.getByRole('tab', { name: 'No portal (sem custo)' }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByRole('tab', { name: 'ZapSign' })).toBeTruthy();

        fireEvent.click(await screen.findByRole('button', { name: /Enviar para assinatura/ }));
        expect(screen.getByTestId('enviar').textContent).toBe('CDV:v-1|Contrato CL-2026-001 — Contrato de locação (v1)');
    });

    it('versão não emitida: envio desligado e o motivo à vista', async () => {
        versoes = [versao({ emitted: false })];
        montar();
        const botao = await screen.findByRole('button', { name: /Enviar para assinatura/ });
        expect((botao as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText('Emita a versão antes de enviar para assinatura.')).toBeTruthy();
    });

    it('sem contrato gerado: diz o que fazer', () => {
        montar({ contrato: null });
        expect(screen.getByText(/Gere o contrato acima/)).toBeTruthy();
    });

    it('versão assinada: "Abrir via assinada" abre o PDF assinado, não o original', async () => {
        versoes = [versao({ signature_status: 'SIGNED', signature_provider: 'PORTAL', assinatura_envelope_id: 'env-1',
            signed_file_url: 'contract-minutas/ct-1/assinado-env-1.pdf' })];
        montar();
        fireEvent.click(await screen.findByRole('button', { name: /Abrir via assinada/ }));
        expect(abrirArquivoAssinado).toHaveBeenCalledWith('documents', 'contract-minutas/ct-1/assinado-env-1.pdf');
    });

    it('versão sem assinatura abre o original', async () => {
        versoes = [versao({})];
        montar();
        fireEvent.click(await screen.findByRole('button', { name: /Abrir documento/ }));
        expect(abrirArquivoAssinado).toHaveBeenCalledWith('documents', 'p.pdf');
    });

    it('negociação já enviada ao ZapSign abre no ZapSign', () => {
        montar({ deal: { id: 'deal-1', signature_token: 'tok', signature_status: 'PENDING' } as never });
        expect(screen.getByRole('tab', { name: 'ZapSign' }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByText('Aguardando assinatura')).toBeTruthy();
    });
});
