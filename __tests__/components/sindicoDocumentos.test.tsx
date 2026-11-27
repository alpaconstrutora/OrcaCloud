// @vitest-environment jsdom
/**
 * Portal do Síndico › Documentos (G5, 26/11/2026).
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 *
 * O que fica travado:
 *  1. enviar: o botão diz o que falta; o título vem do nome do arquivo; a Edge recebe
 *     categoria, título e "visível ao morador";
 *  2. mostrar/esconder do morador e remover chamam o banco; ata de assembleia não sai
 *     (o botão diz por quê);
 *  3. sem login nada grava — o motivo é o do Financeiro.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    getDocumentos: vi.fn(), enviarDocumento: vi.fn(), visibilidadeDocumento: vi.fn(), removerDocumento: vi.fn(), abrirDocumento: vi.fn(),
}));
vi.mock('../../services/sindicoPortalService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../services/sindicoPortalService')>()),
    sindicoPortalService: svc,
}));

import { ConfirmProvider } from '../../components/ui/confirm';
import PainelDocumentosDoSindico from '../../components/sindico/PainelDocumentosDoSindico';
import { MOTIVO_SEM_LOGIN } from '../../utils/financeiroDoSindico';
import type { DocumentoDoPredio } from '../../utils/documentosDoSindico';
import type { CondominioDoSindico } from '../../services/sindicoPortalService';

const CONDOMINIOS = [{ id: 'c1', codigo: '010', nome: '010 - Galeria Altavista', cnpj: null, razaoSocial: null, cidade: null, mandatoInicio: null, mandatoFim: null }] as CondominioDoSindico[];
const doc = (p: Partial<DocumentoDoPredio> = {}): DocumentoDoPredio => ({
    id: 'd1', titulo: 'Convenção do condomínio', categoria: 'CONVENCAO', descricao: null, visivelPortal: false, arquivo: 'convencao.pdf',
    tamanho: 1000, link: false, criadoEm: '2026-11-20T12:00:00+00:00', motivoPreso: null, ...p,
});
const ATA_PRESA = 'Esta é a ata de uma assembleia — ela fica com a assembleia.';

const montar = (logado = true) => {
    const notify = vi.fn();
    render(<ConfirmProvider><PainelDocumentosDoSindico identidade={{ token: 't' }} condominios={CONDOMINIOS} logado={logado} notify={notify} onAlterado={vi.fn()} /></ConfirmProvider>);
    return notify;
};

beforeEach(() => {
    Object.values(svc).forEach(f => f.mockReset());
    localStorage.clear();
    svc.getDocumentos.mockResolvedValue({ documentos: [doc(), doc({ id: 'd2', titulo: 'Ata da AGO', categoria: 'ATA', visivelPortal: true, motivoPreso: ATA_PRESA })], motivoNaoOpera: null });
});

describe('Documentos do síndico', () => {
    it('1. enviar: o botão diz o que falta, o título vem do arquivo e a Edge recebe o que foi escolhido', async () => {
        svc.enviarDocumento.mockResolvedValue('novo');
        const notify = montar();
        await screen.findByText('Convenção do condomínio');
        fireEvent.click(screen.getByRole('button', { name: /Enviar documento/ }));
        const enviar = (await screen.findByRole('button', { name: 'Enviar' })) as HTMLButtonElement;
        expect(enviar.parentElement?.getAttribute('title')).toBe('Escolha o arquivo.');
        const arquivo = new File(['%PDF'], 'laudo_spda-2026.pdf', { type: 'application/pdf' });
        fireEvent.change(screen.getByLabelText('Arquivo do documento'), { target: { files: [arquivo] } });
        expect((screen.getByLabelText('Título *') as HTMLInputElement).value).toBe('laudo spda 2026');
        fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'LAUDO' } });
        fireEvent.click(enviar);
        await waitFor(() => expect(svc.enviarDocumento).toHaveBeenCalledWith({ token: 't' }, 'c1',
            { titulo: 'laudo spda 2026', categoria: 'LAUDO', visivelPortal: true, arquivo }));
        expect(notify).toHaveBeenCalledWith('Documento enviado. Ele já aparece no portal dos moradores.');
    });

    it('2. mostrar ao morador chama o banco; a ata de assembleia não sai e diz por quê', async () => {
        svc.visibilidadeDocumento.mockResolvedValue(undefined);
        montar();
        await screen.findByText('Ata da AGO');
        fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }));
        await waitFor(() => expect(svc.visibilidadeDocumento).toHaveBeenCalledWith({ token: 't' }, 'c1', 'd1', true));
        const remover = screen.getAllByRole('button', { name: 'Remover' }) as HTMLButtonElement[];
        expect(remover[0].disabled).toBe(false);
        expect(remover[1].disabled).toBe(true);
        expect(remover[1].parentElement?.getAttribute('title')).toBe(ATA_PRESA);
    });

    it('3. sem login nada grava — o motivo é o do Financeiro', async () => {
        montar(false);
        await screen.findByText('Convenção do condomínio');
        const enviar = screen.getByRole('button', { name: /Enviar documento/ }) as HTMLButtonElement;
        expect(enviar.disabled).toBe(true);
        expect(enviar.parentElement?.getAttribute('title')).toBe(MOTIVO_SEM_LOGIN);
        expect((screen.getAllByRole('button', { name: 'Mostrar' })[0] as HTMLButtonElement).disabled).toBe(true);
        // Abrir continua: ler não exige login.
        expect((screen.getAllByRole('button', { name: 'Abrir' })[0] as HTMLButtonElement).disabled).toBe(false);
    });
});
