// @vitest-environment jsdom
/**
 * Portal do Síndico › Financeiro › Fornecedores e Contratos (G3, 26/11/2026).
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 *
 * O que fica travado:
 *  1. fornecedor da org do condomínio edita; o disponibilizado por outra empresa
 *     não — o botão diz por quê;
 *  2. editar o nome chama a RPC e o aviso diz quantos títulos acompanharam;
 *  3. contrato novo: o botão diz o que falta, a prévia vem do BANCO e avisa as
 *     parcelas que já nascem vencidas;
 *  4. encerrar exige o motivo e diz quantas parcelas foram canceladas.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    getFornecedores: vi.fn(), editarFornecedor: vi.fn(), salvarContaFornecedor: vi.fn(),
    getContratos: vi.fn(), contratoPrevia: vi.fn(), salvarContrato: vi.fn(), encerrarContrato: vi.fn(),
}));
vi.mock('../../services/sindicoPortalService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../services/sindicoPortalService')>()),
    sindicoPortalService: svc,
}));

import { ConfirmProvider } from '../../components/ui/confirm';
import PainelFornecedoresDoSindico from '../../components/sindico/PainelFornecedoresDoSindico';
import PainelContratosDoSindico from '../../components/sindico/PainelContratosDoSindico';
import { MOTIVO_FORNECEDOR_DE_OUTRA_ORG, type FornecedorDoCondominio, type ContratoDoCondominio } from '../../utils/fornecedoresDoSindico';
import type { CondominioDoFinanceiro } from '../../services/sindicoPortalService';

const fornecedor = (p: Partial<FornecedorDoCondominio> = {}): FornecedorDoCondominio => ({
    id: 'f1', codigo: '001', nome: 'Elevadores Andrade', apelido: null, documento: '11.222.333/0001-81', tipo: 'PJ',
    email: null, telefone: null, contato: null, categoria: 'Elevadores', editavel: true, lancadoPeloSindico: true,
    titulosEmAberto: 2, contas: [{ id: 'b1', banco: null, codigoBanco: null, agencia: null, conta: null, tipoConta: 'corrente',
        titular: null, documentoTitular: null, pix: '11222333000181', tipoPix: 'cnpj', principal: true, ativa: true }], ...p,
});

const CONDOMINIO: CondominioDoFinanceiro = {
    id: 'c1', nome: '010 - Galeria Altavista', codigo: '010', podeOperar: true, motivoNaoOpera: null,
    centros: [{ id: 'cc1', code: '035', name: 'Galeria Altavista', parentId: 'g' }],
    categorias: [{ id: 'cat1', name: 'Manutenção predial', parentId: null, nature: 'EXPENSE' }],
    planos: [], contas: [], fornecedores: [{ id: 'f1', name: 'Elevadores Andrade', nickname: null, document: null, category: null }],
};

const contrato = (p: Partial<ContratoDoCondominio> = {}): ContratoDoCondominio => ({
    id: 'k1', numero: 'CTS-010-001-0001', objeto: 'Manutenção dos elevadores', status: 'Ativo', fornecedorId: 'f1',
    fornecedor: 'Elevadores Andrade', valor: 850, recorrente: true, periodicidade: 'Mensal', diaVencimento: 10,
    inicio: '2026-12-01', fim: null, centroId: 'cc1', categoriaId: 'cat1', parcelas: 12, pagas: 0, emAberto: 12,
    proximoVencimento: '2026-12-10', ...p,
});

const montar = (el: React.ReactElement) => render(<ConfirmProvider>{el}</ConfirmProvider>);

beforeEach(() => { Object.values(svc).forEach(f => f.mockReset()); localStorage.clear(); });

describe('Fornecedores', () => {
    it('1. o da org edita; o disponibilizado por outra empresa diz por que não', async () => {
        svc.getFornecedores.mockResolvedValue([fornecedor(), fornecedor({ id: 'f2', nome: 'Energisa', editavel: false, contas: [] })]);
        montar(<PainelFornecedoresDoSindico identidade={{ token: 't' }} condominioId="c1" motivoBase={null} notify={vi.fn()} onAlterado={vi.fn()} />);
        expect(await screen.findByText('Elevadores Andrade')).toBeTruthy();
        expect(screen.getByText('PIX CNPJ 11222333000181')).toBeTruthy();
        expect(screen.getByText('Sem conta nem PIX')).toBeTruthy();
        const [editar1, editar2] = screen.getAllByRole('button', { name: 'Editar' }) as HTMLButtonElement[];
        expect(editar1.disabled).toBe(false);
        expect(editar2.disabled).toBe(true);
        expect(editar2.parentElement?.getAttribute('title')).toBe(MOTIVO_FORNECEDOR_DE_OUTRA_ORG);
    });

    it('2. editar o nome: a RPC recebe o cadastro e o aviso conta os títulos que acompanharam', async () => {
        svc.getFornecedores.mockResolvedValue([fornecedor()]);
        svc.editarFornecedor.mockResolvedValue({ titulosAtualizados: 2, titulosMantidos: 1 });
        const notify = vi.fn();
        montar(<PainelFornecedoresDoSindico identidade={{ token: 't' }} condominioId="c1" motivoBase={null} notify={notify} onAlterado={vi.fn()} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
        // A gaveta de cadastro fica montada fechada com o mesmo rótulo: pega a de edição pelo id.
        await screen.findByText('Editar fornecedor');
        const nome = document.getElementById('editar-forn-nome') as HTMLInputElement;
        fireEvent.change(nome, { target: { value: 'Elevadores Andrade Ltda' } });
        expect(screen.getByText('O nome novo também vai para os títulos em aberto deste fornecedor.')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
        await waitFor(() => expect(svc.editarFornecedor).toHaveBeenCalledWith({ token: 't' }, 'c1', 'f1',
            expect.objectContaining({ name: 'Elevadores Andrade Ltda', document: '11.222.333/0001-81' })));
        expect(notify).toHaveBeenCalledWith(expect.stringMatching(/atualizado em 2 títulos.*1 ficou com o nome antigo/));
    });
});

describe('Contratos', () => {
    it('3. novo contrato: o botão diz o que falta; a prévia vem do banco e avisa as vencidas', async () => {
        svc.getContratos.mockResolvedValue([contrato()]);
        svc.contratoPrevia.mockResolvedValue({ vencimentos: ['2026-10-10', '2026-11-10', '2026-12-10'], vencidas: 2 });
        montar(<PainelContratosDoSindico identidade={{ token: 't' }} condominioId="c1" condominio={CONDOMINIO} motivoBase={null} notify={vi.fn()} onAlterado={vi.fn()} />);
        expect(await screen.findByText('Manutenção dos elevadores')).toBeTruthy();
        expect(screen.getByText('0 de 12 pagas')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Novo contrato/ }));
        const criar = (await screen.findByRole('button', { name: /Criar contrato/ })) as HTMLButtonElement;
        expect(criar.disabled).toBe(true);
        expect(criar.parentElement?.getAttribute('title')).toBe('Informe o objeto do contrato.');
        fireEvent.change(screen.getByLabelText('Objeto *'), { target: { value: 'Limpeza' } });
        expect(criar.parentElement?.getAttribute('title')).toBe('Escolha o fornecedor.');
        await waitFor(() => expect(svc.contratoPrevia).toHaveBeenCalled());
        expect(await screen.findByText(/^3 parcelas: de /)).toBeTruthy();
        expect(screen.getByText(/2 já nascem vencidas/)).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Dia do vencimento *'), { target: { value: '31' } });
        await waitFor(() => expect(criar.parentElement?.getAttribute('title')).toBe('Escolha o fornecedor.'));
    });

    it('4. encerrar exige o motivo e conta as parcelas canceladas; encerrado não encerra de novo', async () => {
        svc.getContratos.mockResolvedValue([contrato(), contrato({ id: 'k2', objeto: 'Portaria antiga', status: 'Encerrado' })]);
        svc.encerrarContrato.mockResolvedValue({ canceladas: 8, mantidas: 0 });
        const notify = vi.fn();
        montar(<PainelContratosDoSindico identidade={{ token: 't' }} condominioId="c1" condominio={CONDOMINIO} motivoBase={null} notify={notify} onAlterado={vi.fn()} />);
        await screen.findByText('Portaria antiga');
        const [enc1, enc2] = screen.getAllByRole('button', { name: 'Encerrar' }) as HTMLButtonElement[];
        expect(enc2.disabled).toBe(true);
        expect(enc2.parentElement?.getAttribute('title')).toBe('Este contrato já está encerrado.');
        fireEvent.click(enc1);
        const confirmar = (await screen.findAllByRole('button', { name: 'Encerrar' })).at(-1) as HTMLButtonElement;
        expect(confirmar.parentElement?.getAttribute('title')).toBe('Diga o motivo do encerramento.');
        fireEvent.change(screen.getByLabelText('Motivo *'), { target: { value: 'Troca de empresa' } });
        fireEvent.click(confirmar);
        await waitFor(() => expect(svc.encerrarContrato).toHaveBeenCalledWith({ token: 't' }, 'c1', 'k1', expect.any(String), 'Troca de empresa'));
        expect(notify).toHaveBeenCalledWith('Contrato encerrado. 8 parcelas em aberto foram canceladas.');
    });
});
