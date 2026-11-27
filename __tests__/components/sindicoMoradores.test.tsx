// @vitest-environment jsdom
/**
 * Portal do Síndico › Unidades › Moradores (G6, 26/11/2026).
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 *
 * O que fica travado:
 *  1. sem e-mail não convida — o botão diz por quê, e a faixa conta quantos estão assim;
 *  2. convidar pede confirmação e chama a Edge com a porta do síndico (o link vai só ao e-mail);
 *  3. contato: e-mail inválido não salva; o válido vai ao banco;
 *  4. novo morador: o botão diz o que falta; "pessoa nova" manda nome/CPF/e-mail.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
    getMoradores: vi.fn(), salvarMorador: vi.fn(), encerrarMorador: vi.fn(), contatoMorador: vi.fn(), convidarMorador: vi.fn(),
}));
vi.mock('../../services/sindicoPortalService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../services/sindicoPortalService')>()),
    sindicoPortalService: svc,
}));

import { ConfirmProvider } from '../../components/ui/confirm';
import PainelMoradoresDoSindico from '../../components/sindico/PainelMoradoresDoSindico';
import type { OcupacaoDoPredio } from '../../utils/moradoresDoSindico';
import type { CondominioDoSindico } from '../../services/sindicoPortalService';

const CONDOMINIOS = [{ id: 'c1', codigo: '007', nome: '007 - Bella Vista', cnpj: null, razaoSocial: null, cidade: null, mandatoInicio: null, mandatoFim: null }] as CondominioDoSindico[];
const oc = (p: Partial<OcupacaoDoPredio> = {}): OcupacaoDoPredio => ({
    id: 'o1', papel: 'PROPRIETARIO', desde: '2018-05-29', ate: null, vigente: true, clientId: 'p1', nome: 'Marcos Juliano Forster',
    email: null, telefone: null, convidadoEm: null, abaCondominio: true, ...p,
});

const montar = () => {
    const notify = vi.fn();
    render(<ConfirmProvider><PainelMoradoresDoSindico identidade={{ token: 't' }} condominios={CONDOMINIOS} logado notify={notify} onAlterado={vi.fn()} /></ConfirmProvider>);
    return notify;
};

beforeEach(() => {
    Object.values(svc).forEach(f => f.mockReset());
    localStorage.clear();
    svc.getMoradores.mockResolvedValue({ motivoNaoOpera: null, unidades: [
        // O dono é também o responsável financeiro: 2 ocupações, 1 pessoa sem e-mail.
        { unitId: 'u11', unidade: '11', torre: 'Torre Única', ocupacoes: [oc(), oc({ id: 'o1b', papel: 'RESPONSAVEL_FINANCEIRO' })] },
        { unitId: 'u42', unidade: '42', torre: 'Torre Única', ocupacoes: [oc({ id: 'o2', clientId: 'p2', nome: 'Gabriela', email: 'gabi@x.com' })] },
    ] });
});

describe('Moradores do síndico', () => {
    it('1. sem e-mail não convida, e a faixa conta quantos', async () => {
        montar();
        await screen.findAllByText('Marcos Juliano Forster');
        expect(screen.getByText(/1 morador está sem e-mail/)).toBeTruthy();
        const [c1, , gabriela] = screen.getAllByRole('button', { name: 'Convidar' }) as HTMLButtonElement[];
        expect(c1.disabled).toBe(true);
        expect(c1.parentElement?.getAttribute('title')).toBe('O morador não tem e-mail. Preencha o e-mail antes de convidar.');
        expect(gabriela.disabled).toBe(false);
    });

    it('2. convidar confirma e chama a Edge pela porta do síndico', async () => {
        svc.convidarMorador.mockResolvedValue({ kind: 'invite' });
        const notify = montar();
        await screen.findAllByText('Gabriela');
        fireEvent.click(screen.getAllByRole('button', { name: 'Convidar' })[2]);
        fireEvent.click(await screen.findByRole('button', { name: 'Enviar convite' }));
        await waitFor(() => expect(svc.convidarMorador).toHaveBeenCalledWith({ token: 't' }, 'c1', 'p2'));
        expect(notify).toHaveBeenCalledWith('Convite enviado para gabi@x.com.');
    });

    it('3. contato: e-mail inválido não salva; o válido vai ao banco', async () => {
        svc.contatoMorador.mockResolvedValue(undefined);
        montar();
        await screen.findAllByText('Marcos Juliano Forster');
        fireEvent.click(screen.getAllByRole('button', { name: 'Contato' })[0]);
        await screen.findByText('Contato do morador');
        // A gaveta de novo morador (montada fechada) também tem "E-mail": pega a do contato pelo id.
        const email = document.getElementById('contato-email') as HTMLInputElement;
        fireEvent.change(email, { target: { value: 'marcos@' } });
        const salvar = screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement;
        expect(salvar.parentElement?.getAttribute('title')).toBe('E-mail inválido.');
        fireEvent.change(email, { target: { value: 'marcos@exemplo.com' } });
        fireEvent.click(salvar);
        await waitFor(() => expect(svc.contatoMorador).toHaveBeenCalledWith({ token: 't' }, 'c1', 'p1', { email: 'marcos@exemplo.com', telefone: '' }));
    });

    it('4. novo morador: o botão diz o que falta; pessoa nova manda os dados', async () => {
        svc.salvarMorador.mockResolvedValue({ reaproveitado: false });
        montar();
        await screen.findAllByText('Marcos Juliano Forster');
        fireEvent.click(screen.getByRole('button', { name: /Novo morador/ }));
        const cadastrar = (await screen.findByRole('button', { name: 'Cadastrar' })) as HTMLButtonElement;
        expect(cadastrar.parentElement?.getAttribute('title')).toBe('Informe o nome do morador.');
        fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Inquilina Nova' } });
        fireEvent.change(screen.getByLabelText('CPF ou CNPJ'), { target: { value: '529.982.247-25' } });
        fireEvent.change(screen.getByLabelText('Papel'), { target: { value: 'INQUILINO' } });
        fireEvent.click(cadastrar);
        await waitFor(() => expect(svc.salvarMorador).toHaveBeenCalledWith({ token: 't' }, 'c1',
            expect.objectContaining({ unitId: 'u11', papel: 'INQUILINO', clientId: '', nome: 'Inquilina Nova', documento: '529.982.247-25' })));
    });
});
