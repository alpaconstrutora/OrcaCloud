// @vitest-environment jsdom
/**
 * Tela de assinatura (22/11/2026) — antes uma gaveta com o PDF num quadro de
 * ~450 px; o usuário pediu tela, e aprovou exigir a leitura até o fim. Trava:
 *  1. abre como TELA por cima de tudo (dialog no <body>);
 *  2. "Assinar" desligado até a última página, e diz o motivo;
 *  3. a leitura vai junto no assinar (modo TELA, fim medido);
 *  4. PDF que não desenha: abrir o arquivo à parte libera, registrado como PDF_EXTERNO;
 *  5. "voltar" volta no histórico do navegador e fecha a tela;
 *  6. leituraDoScroll: página atual, última vista e fim.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const ver = vi.fn();
const pedirCodigo = vi.fn();
const assinar = vi.fn();
vi.mock('../../services/assinaturaInternaService', async (importOriginal) => {
    const real = await importOriginal<typeof import('../../services/assinaturaInternaService')>();
    return { ...real, assinaturaInternaService: { ver: (...a: unknown[]) => ver(...a), pedirCodigo: (...a: unknown[]) => pedirCodigo(...a), assinar: (...a: unknown[]) => assinar(...a) } };
});

// O leitor de verdade usa pdfjs/canvas; aqui ele só simula a rolagem ou a falha.
vi.mock('../../components/assinatura/PaginasDoPdf', async (importOriginal) => {
    const real = await importOriginal<typeof import('../../components/assinatura/PaginasDoPdf')>();
    return {
        ...real,
        PaginasDoPdf: (p: { onPosicao: (x: unknown) => void; onErro: (m: string) => void }) => (
            <div>
                <button type="button" onClick={() => p.onPosicao({ atual: 3, ultimaVista: 4, total: 32, noFim: false })}>rolar um pouco</button>
                <button type="button" onClick={() => p.onPosicao({ atual: 32, ultimaVista: 32, total: 32, noFim: true })}>rolar até o fim</button>
                <button type="button" onClick={() => p.onErro('falhou')}>pdf falha</button>
            </div>
        ),
    };
});

import { FluxoDeAssinatura } from '../../components/assinatura/FluxoDeAssinatura';
import { leituraDoScroll } from '../../components/assinatura/PaginasDoPdf';

const VISAO = {
    url: 'https://x/doc.pdf',
    termo: 'Declaro que li e concordo.',
    termo_versao: '2026-11-21.1',
    documento: {
        envelope_id: 'env-1', titulo: 'Contrato CTL-014 — Minuta (v1)', status: 'ENVIADO', expira_em: '2026-12-22T18:17:00Z',
        original_sha256: 'abc', paginas: 32, emitente: 'Alpa Construtora',
        signatario: { id: 'sig-1', nome: 'Tamara', papel: 'PARTE', representa: null, status: 'PENDENTE', assinado_em: null, email_mascarado: 't***@gmail.com' },
        signatarios: [
            { nome: 'Alpa', papel: 'REPRESENTANTE', status: 'ASSINADO', assinado_em: '2026-11-22T10:00:00Z' },
            { nome: 'Tamara', papel: 'PARTE', status: 'PENDENTE', assinado_em: null },
        ],
    },
};
const ACESSO = { signatarioId: 'sig-1', canal: 'PORTAL_CLIENTE' as const, credencial: 'tok' };

function abrir() {
    const onFechar = vi.fn();
    render(<FluxoDeAssinatura aberto onFechar={onFechar} acesso={ACESSO} />);
    return { onFechar };
}

const botaoAssinar = () => screen.getAllByRole('button', { name: /^Assinar$/ }).at(-1) as HTMLButtonElement;

async function preencherConfirmacao() {
    fireEvent.change(screen.getByLabelText('Seu CPF'), { target: { value: '529.982.247-25' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar código para t\*\*\*@gmail.com/ }));
    await screen.findByText(/Enviamos o código/);
    fireEvent.change(screen.getByLabelText('Código recebido por e-mail'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('checkbox'));
}

beforeEach(() => {
    ver.mockReset(); pedirCodigo.mockReset(); assinar.mockReset();
    ver.mockResolvedValue(VISAO);
    pedirCodigo.mockResolvedValue({ email_mascarado: 't***@gmail.com' });
    assinar.mockResolvedValue({ concluido: false, faltam: 1 });
});

describe('Tela de assinatura', () => {
    it('abre como tela e só libera o Assinar depois da última página; manda a leitura', async () => {
        abrir();
        const tela = await screen.findByRole('dialog');
        expect(tela.parentElement).toBe(document.body);
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Contrato CTL-014 — Minuta (v1)');

        await preencherConfirmacao();
        fireEvent.click(screen.getByText('rolar um pouco'));
        expect(botaoAssinar().disabled).toBe(true);
        expect(screen.getAllByText('Role o documento até a última página (você está na 3 de 32).').length).toBeGreaterThan(0);

        fireEvent.click(screen.getByText('rolar até o fim'));
        expect(screen.getByText('Você leu o documento até a última página.')).toBeTruthy();
        expect(botaoAssinar().disabled).toBe(false);

        fireEvent.click(botaoAssinar());
        await screen.findByText('Assinatura registrada');
        const [, corpo] = assinar.mock.calls[0];
        expect(corpo).toMatchObject({ codigo: '123456', cpf: '52998224725', termoVersao: '2026-11-21.1' });
        expect(corpo.leitura).toMatchObject({ modo: 'TELA', paginas: 32, ultima_pagina: 32, chegou_ao_fim: true });
        expect(typeof corpo.leitura.segundos).toBe('number');
    });

    it('PDF que não desenha: abrir o arquivo libera, registrado como PDF_EXTERNO', async () => {
        abrir();
        await screen.findByRole('dialog');
        await preencherConfirmacao();
        fireEvent.click(screen.getByText('pdf falha'));
        expect(screen.getByText('Não foi possível mostrar o documento nesta tela.')).toBeTruthy();
        expect(botaoAssinar().disabled).toBe(true);

        fireEvent.click(screen.getByRole('link', { name: /Abrir o documento \(PDF\)/ }));
        expect(botaoAssinar().disabled).toBe(false);
        fireEvent.click(botaoAssinar());
        await screen.findByText('Assinatura registrada');
        expect(assinar.mock.calls[0][1].leitura).toMatchObject({ modo: 'PDF_EXTERNO', chegou_ao_fim: false, ultima_pagina: null });
    });

    it('"Voltar" volta no histórico do navegador e fecha a tela', async () => {
        const { onFechar } = abrir();
        await screen.findByRole('dialog');
        expect(window.history.state?.telaDeAssinatura).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Voltar aos documentos' }));
        await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1));
    });
});

describe('leituraDoScroll', () => {
    const topos = [0, 1000, 2000];
    it('início: página 1, nada além dela, fora do fim', () => {
        expect(leituraDoScroll(topos, 0, 800, 3000)).toEqual({ atual: 1, ultimaVista: 1, total: 3, noFim: false });
    });
    it('meio: a página do centro é a atual; a que aparece embaixo conta como vista', () => {
        expect(leituraDoScroll(topos, 700, 800, 3000)).toEqual({ atual: 2, ultimaVista: 2, total: 3, noFim: false });
    });
    it('fim da rolagem: última página vista', () => {
        expect(leituraDoScroll(topos, 2200, 800, 3000)).toEqual({ atual: 3, ultimaVista: 3, total: 3, noFim: true });
    });
    it('documento curto que cabe inteiro já está no fim', () => {
        expect(leituraDoScroll([0], 0, 800, 600)).toEqual({ atual: 1, ultimaVista: 1, total: 1, noFim: true });
    });
});
