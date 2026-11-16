// @vitest-environment jsdom
/**
 * Minha organização › Usuários › Convidar membro a partir de um colaborador do RH.
 * Pedido de 16/11/2026: "Por que nao consigo adicionar colaboradores como usuários?" → o convite
 * pedia nome e e-mail digitados e não havia caminho colaborador → usuário.
 * Plano: docs/planos/2026-11-16-usuarios-convidar-colaborador.md (Tarefa 3).
 *
 * O que este teste trava: escolher o colaborador preenche o convite; ficha sem e-mail recebe o
 * e-mail ANTES do convite; o vínculo com o login só é lido DEPOIS que a linha de membro existe;
 * a ficha nunca perde o e-mail que já tinha; falha em qualquer passo é dita, não escondida.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/organizationService', () => ({
    organizationService: { updateMemberAccess: vi.fn(), urlAssinaturaMembro: vi.fn(), userIdDoMembro: vi.fn() },
}));
vi.mock('../../services/laborService', () => ({
    laborService: { listEmployees: vi.fn(), updateEmployee: vi.fn() },
}));
vi.mock('../../lib/supabase', () => ({
    supabase: { functions: { invoke: vi.fn() }, from: vi.fn(), rpc: vi.fn() },
}));

import OrganizationUsers from '../../components/OrganizationUsers';
import { ConfirmProvider } from '../../components/ui/confirm';
import { useStore } from '../../store/useStore';
import { organizationService } from '../../services/organizationService';
import { laborService } from '../../services/laborService';
import { supabase } from '../../lib/supabase';

const ORG = 'org-1';
const MEMBROS = [{ id: 'm1', code: '001', name: 'Maria', email: 'm1@exemplo.com', role: 'member' as const, joinedAt: '2026-01-01', permissions: {}, userId: 'u-1' }];
const COLABORADORES = [
    { id: 'e1', org_id: ORG, name: 'Carlos Lima', status: 'ATIVO', email: '', user_id: null },
    { id: 'e2', org_id: ORG, name: 'Dora Reis', status: 'ATIVO', email: 'dora@x.com', user_id: null },
    { id: 'e3', org_id: ORG, name: 'Maria Souza', status: 'ATIVO', email: 'm1@exemplo.com', user_id: 'u-1' },
];

const listEmployees = laborService.listEmployees as unknown as ReturnType<typeof vi.fn>;
const updateEmployee = laborService.updateEmployee as unknown as ReturnType<typeof vi.fn>;
const userIdDoMembro = organizationService.userIdDoMembro as unknown as ReturnType<typeof vi.fn>;
const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

const Tela = ({ onUpdateMembers = vi.fn() }: { onUpdateMembers?: (m: unknown[]) => void | Promise<void> }) => (
    <ConfirmProvider>
        <OrganizationUsers
            organizationId={ORG}
            members={MEMBROS as never}
            onUpdateMembers={onUpdateMembers as never}
            customRoles={[]}
            onUpdateCustomRoles={() => {}}
            onUpdateAll={() => {}}
        />
    </ConfirmProvider>
);

const abrirConvite = async () => {
    fireEvent.click(screen.getByText('Convidar membro'));
    await waitFor(() => expect(listEmployees).toHaveBeenCalledWith(ORG));
    const campo = screen.getByRole('combobox', { name: 'Colaborador' });
    fireEvent.focus(campo);
    await screen.findByRole('option', { name: /Carlos Lima/ });
    return campo;
};
const escolher = (nome: string) => fireEvent.click(screen.getByRole('option', { name: new RegExp(nome) }));
const campoNome = () => screen.getByPlaceholderText('Nome') as HTMLInputElement;
const campoEmail = () => screen.getByPlaceholderText('email@empresa.com') as HTMLInputElement;
const enviar = () => fireEvent.submit(screen.getByText('Enviar Convite').closest('form')!);
const chamadasCom = (chave: 'email' | 'user_id') =>
    updateEmployee.mock.calls.filter(([, upd]) => Object.prototype.hasOwnProperty.call(upd, chave));

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    listEmployees.mockResolvedValue(COLABORADORES);
    updateEmployee.mockResolvedValue({});
    userIdDoMembro.mockResolvedValue('u-9');
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    useStore.setState({
        organizations: [{ id: ORG, name: 'Alpa', members: MEMBROS, customRoles: [] } as never],
        currentProfile: { group: 'DESENVOLVEDOR' } as never,
        session: { user: { email: 'admin@exemplo.com' } } as never,
    });
});

describe('Convidar membro a partir de um colaborador', () => {
    it('escolher colaborador preenche nome e e-mail', async () => {
        render(<Tela />);
        await abrirConvite();
        escolher('Dora Reis');
        expect(campoNome().value).toBe('Dora Reis');
        expect(campoEmail().value).toBe('dora@x.com');
    });

    it('colaborador já usuário aparece desligado com o motivo', async () => {
        render(<Tela />);
        await abrirConvite();
        const maria = screen.getByRole('option', { name: /Maria Souza/ });
        expect(maria.getAttribute('aria-disabled')).toBe('true');
        expect(maria.textContent).toContain('Já é usuário desta organização');
        fireEvent.click(maria);
        expect(campoNome().value).toBe('');
    });

    it('sem e-mail: grava na ficha antes do convite e vincula depois', async () => {
        const onUpdateMembers = vi.fn();
        render(<Tela onUpdateMembers={onUpdateMembers} />);
        await abrirConvite();
        escolher('Carlos Lima');
        expect(campoEmail().value).toBe('');
        expect(screen.getByText('Será gravado na ficha do colaborador.')).toBeTruthy();
        fireEvent.change(campoEmail(), { target: { value: 'Novo@X.com' } });
        enviar();

        await waitFor(() => expect(updateEmployee).toHaveBeenCalledWith('e1', { user_id: 'u-9' }));
        expect(updateEmployee).toHaveBeenCalledWith('e1', { email: 'novo@x.com' });
        const gravouEmail = updateEmployee.mock.calls.findIndex(([, u]) => 'email' in u);
        expect(updateEmployee.mock.invocationCallOrder[gravouEmail]).toBeLessThan(invoke.mock.invocationCallOrder[0]);
        expect(invoke.mock.calls[0][1].body.email).toBe('novo@x.com');
        expect(userIdDoMembro).toHaveBeenCalledWith(ORG, 'novo@x.com');
        expect(onUpdateMembers).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(screen.queryByText('Convidar Novo Membro')).toBeNull());
    });

    it('ficha com e-mail e e-mail editado: ficha não muda, convite usa o digitado', async () => {
        render(<Tela />);
        await abrirConvite();
        escolher('Dora Reis');
        fireEvent.change(campoEmail(), { target: { value: 'outro@x.com' } });
        enviar();
        await waitFor(() => expect(updateEmployee).toHaveBeenCalledWith('e2', { user_id: 'u-9' }));
        expect(chamadasCom('email')).toHaveLength(0);
        expect(invoke.mock.calls[0][1].body.email).toBe('outro@x.com');
    });

    it('aguarda o onUpdateMembers antes de ler o login', async () => {
        let liberar: () => void = () => {};
        const onUpdateMembers = vi.fn(() => new Promise<void>(r => { liberar = r; }));
        render(<Tela onUpdateMembers={onUpdateMembers} />);
        await abrirConvite();
        escolher('Dora Reis');
        enviar();
        await waitFor(() => expect(onUpdateMembers).toHaveBeenCalledTimes(1));
        await new Promise(r => setTimeout(r, 20));
        expect(userIdDoMembro).not.toHaveBeenCalled();
        liberar();
        await waitFor(() => expect(userIdDoMembro).toHaveBeenCalledWith(ORG, 'dora@x.com'));
    });

    it('sem login: vínculo pendente, modal aberto', async () => {
        userIdDoMembro.mockResolvedValue(null);
        render(<Tela />);
        await abrirConvite();
        escolher('Dora Reis');
        enviar();
        await screen.findByText(/RH › Colaboradores/);
        expect(chamadasCom('user_id')).toHaveLength(0);
        expect(screen.getByText('Convidar Novo Membro')).toBeTruthy();
    });

    it('falha na ficha: convite segue e o aviso diz', async () => {
        updateEmployee.mockRejectedValueOnce(new Error('RLS'));
        render(<Tela />);
        await abrirConvite();
        escolher('Carlos Lima');
        fireEvent.change(campoEmail(), { target: { value: 'carlos@x.com' } });
        enviar();
        await screen.findByText(/e-mail não foi gravado na ficha/);
        expect(invoke).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Convidar Novo Membro')).toBeTruthy();
    });

    it('digitar desvincula: convite sem tocar em ficha', async () => {
        render(<Tela />);
        const campo = await abrirConvite();
        escolher('Dora Reis');
        fireEvent.change(campo, { target: { value: 'Dora R' } });
        expect(campoNome().value).toBe('Dora Reis');
        enviar();
        await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
        await new Promise(r => setTimeout(r, 20));
        expect(updateEmployee).not.toHaveBeenCalled();
        expect(userIdDoMembro).not.toHaveBeenCalled();
    });

    it('gravação do membro falha: botão volta, aviso diz e não tenta vincular', async () => {
        const onUpdateMembers = vi.fn(() => Promise.reject(new Error('sem permissão')));
        render(<Tela onUpdateMembers={onUpdateMembers} />);
        await abrirConvite();
        escolher('Dora Reis');
        enviar();
        await screen.findByText(/O membro não foi gravado na organização: sem permissão/);
        expect(screen.getByText('Enviar Convite')).toBeTruthy();
        expect(userIdDoMembro).not.toHaveBeenCalled();
    });

    it('sem colaborador: convite como hoje', async () => {
        render(<Tela />);
        await abrirConvite();
        fireEvent.change(campoNome(), { target: { value: 'Fulano' } });
        fireEvent.change(campoEmail(), { target: { value: 'fulano@x.com' } });
        enviar();
        await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
        await new Promise(r => setTimeout(r, 20));
        expect(updateEmployee).not.toHaveBeenCalled();
        expect(userIdDoMembro).not.toHaveBeenCalled();
    });
});
