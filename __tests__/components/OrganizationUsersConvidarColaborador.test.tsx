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
    organizationService: { updateMemberAccess: vi.fn(), urlAssinaturaMembro: vi.fn(), membroPorEmail: vi.fn(), reapontarFichasDoLogin: vi.fn() },
}));
vi.mock('../../services/laborService', () => ({
    laborService: { listColaboradoresParaConvite: vi.fn(), updateEmployee: vi.fn() },
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
    { id: 'e1', org_id: ORG, name: 'Carlos Lima', status: 'ATIVO', email: '', user_id: null, role: 'Pedreiro' },
    { id: 'e2', org_id: ORG, name: 'Dora Reis', status: 'ATIVO', email: 'dora@x.com', user_id: null },
    { id: 'e3', org_id: ORG, name: 'Maria Souza', status: 'ATIVO', email: 'm1@exemplo.com', user_id: 'u-1' },
    { id: 'e4', org_id: 'org-2', name: 'Ester Prado', status: 'ATIVO', email: '', user_id: null }, // disponibilizada pela SPE
    { id: 'e5', org_id: ORG, name: 'Fábio Nunes', status: 'ATIVO', email: 'fabio@x.com', user_id: 'u-77' }, // login de outra org
];

const listColaboradoresParaConvite = laborService.listColaboradoresParaConvite as unknown as ReturnType<typeof vi.fn>;
const updateEmployee = laborService.updateEmployee as unknown as ReturnType<typeof vi.fn>;
const membroPorEmail = organizationService.membroPorEmail as unknown as ReturnType<typeof vi.fn>;
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
    await waitFor(() => expect(listColaboradoresParaConvite).toHaveBeenCalledWith(ORG));
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
    listColaboradoresParaConvite.mockResolvedValue(COLABORADORES);
    updateEmployee.mockResolvedValue({});
    membroPorEmail.mockResolvedValue({ userId: 'u-9' });
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    useStore.setState({
        organizations: [
            { id: ORG, name: 'Alpa', members: MEMBROS, customRoles: [] } as never,
            { id: 'org-2', name: 'SPE Garden', members: [], customRoles: [] } as never,
        ],
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
        expect(membroPorEmail).toHaveBeenCalledWith(ORG, 'novo@x.com');
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
        expect(membroPorEmail).not.toHaveBeenCalled();
        liberar();
        await waitFor(() => expect(membroPorEmail).toHaveBeenCalledWith(ORG, 'dora@x.com'));
    });

    it('sem login: vínculo pendente, modal aberto', async () => {
        membroPorEmail.mockResolvedValue({ userId: null });
        render(<Tela />);
        await abrirConvite();
        escolher('Dora Reis');
        enviar();
        await screen.findByText(/RH › Colaboradores/);
        expect(screen.getByText(/a conta de acesso ainda não existe/)).toBeTruthy();
        expect(chamadasCom('user_id')).toHaveLength(0);
        expect(screen.getByText('Convidar Novo Membro')).toBeTruthy();
    });

    it('linha do membro não gravada: o aviso diz isso, não "conta não existe"', async () => {
        membroPorEmail.mockResolvedValue(null);
        render(<Tela />);
        await abrirConvite();
        escolher('Dora Reis');
        enviar();
        await screen.findByText(/O membro não foi gravado na organização/);
        expect(screen.queryByText(/Membro adicionado/)).toBeNull();
        expect(screen.queryByText(/a conta de acesso ainda não existe/)).toBeNull();
        expect(chamadasCom('user_id')).toHaveLength(0);
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
        expect(membroPorEmail).not.toHaveBeenCalled();
    });

    it('gravação do membro falha: botão volta, aviso diz e não tenta vincular', async () => {
        const onUpdateMembers = vi.fn(() => Promise.reject(new Error('sem permissão')));
        render(<Tela onUpdateMembers={onUpdateMembers} />);
        await abrirConvite();
        escolher('Dora Reis');
        enviar();
        await screen.findByText(/O membro não foi gravado na organização: sem permissão/);
        expect(screen.getByText('Enviar Convite')).toBeTruthy();
        expect(membroPorEmail).not.toHaveBeenCalled();
    });

    it('e-mail de quem já é membro: não convida, não grava e avisa (não rebaixa o papel)', async () => {
        const onUpdateMembers = vi.fn();
        render(<Tela onUpdateMembers={onUpdateMembers} />);
        await abrirConvite();
        escolher('Carlos Lima');
        fireEvent.change(campoEmail(), { target: { value: 'M1@exemplo.com' } });
        enviar();
        await screen.findByText(/já é de um usuário desta organização/);
        expect(invoke).not.toHaveBeenCalled();
        expect(onUpdateMembers).not.toHaveBeenCalled();
        expect(updateEmployee).not.toHaveBeenCalled();
    });

    it('a lista mostra o cargo e a origem (homônimos e disponibilizados se distinguem)', async () => {
        // quem convida é admin também na SPE — senão a opção da Ester vem desligada e mostra o motivo
        useStore.setState({
            organizations: [
                { id: ORG, name: 'Alpa', members: MEMBROS, customRoles: [] } as never,
                { id: 'org-2', name: 'SPE Garden', members: [{ id: 'm8', email: 'admin@exemplo.com', role: 'admin' }], customRoles: [] } as never,
            ],
        });
        render(<Tela />);
        await abrirConvite();
        expect(screen.getByRole('option', { name: /Carlos Lima/ }).textContent).toContain('Pedreiro');
        expect(screen.getByRole('option', { name: /Ester Prado/ }).textContent).toContain('disponibilizado por SPE Garden');
    });

    it('disponibilizado por org onde quem convida não é owner/admin: desligado com o motivo', async () => {
        useStore.setState({
            currentProfile: { group: 'GESTOR' } as never,
            organizations: [
                { id: ORG, name: 'Alpa', members: [...MEMBROS, { id: 'm9', email: 'admin@exemplo.com', role: 'owner' }], customRoles: [] } as never,
                { id: 'org-2', name: 'SPE Garden', members: [{ id: 'm8', email: 'admin@exemplo.com', role: 'member' }], customRoles: [] } as never,
            ],
        });
        render(<Tela />);
        await abrirConvite();
        const ester = screen.getByRole('option', { name: /Ester Prado/ });
        expect(ester.getAttribute('aria-disabled')).toBe('true');
        expect(ester.textContent).toContain('Disponibilizado por SPE Garden — só owner ou admin de lá vincula a um login');
    });

    // Visto na tela real (17/11): entrar pela "Área do Desenvolvedor" põe group = DESENVOLVEDOR para
    // QUALQUER membro, mas o banco só deixa vincular quem está em public.superadmins (= temAcessoTotal).
    it('entrou pela Área do Desenvolvedor sem ser superadmin: disponibilizado continua desligado', async () => {
        useStore.setState({
            currentProfile: { group: 'DESENVOLVEDOR' } as never,
            organizations: [
                { id: ORG, name: 'Alpa', members: [...MEMBROS, { id: 'm9', email: 'admin@exemplo.com', role: 'admin' }], customRoles: [] } as never,
                { id: 'org-2', name: 'SPE Garden', members: [{ id: 'm8', email: 'admin@exemplo.com', role: 'member' }], customRoles: [] } as never,
            ],
        });
        render(<Tela />);
        await abrirConvite();
        const ester = screen.getByRole('option', { name: /Ester Prado/ });
        expect(ester.getAttribute('aria-disabled')).toBe('true');
        expect(ester.textContent).toContain('Disponibilizado por SPE Garden — só owner ou admin de lá vincula a um login');
    });

    it('superadmin (acesso total) vincula em qualquer org: disponibilizado liberado', async () => {
        useStore.setState({
            currentProfile: { group: 'GESTOR' } as never,
            session: { user: { email: 'desenvolvedor@alpaconstrutora.com.br' } } as never,
        });
        render(<Tela />);
        await abrirConvite();
        expect(screen.getByRole('option', { name: /Ester Prado/ }).getAttribute('aria-disabled')).toBeNull();
    });

    it('vínculo negado pelo banco (42501): o aviso traz o motivo', async () => {
        updateEmployee.mockImplementation((_id: string, upd: Record<string, unknown>) =>
            'user_id' in upd ? Promise.reject({ code: '42501', message: 'só owner ou admin…' }) : Promise.resolve({}));
        render(<Tela />);
        await abrirConvite();
        escolher('Dora Reis');
        enviar();
        await screen.findByText(/Só owner ou admin da organização vincula o colaborador/);
    });

    it('escolher ficha sem e-mail mantém o e-mail já digitado', async () => {
        render(<Tela />);
        await abrirConvite();
        fireEvent.change(campoEmail(), { target: { value: 'carlos@x.com' } });
        escolher('Carlos Lima');
        expect(campoEmail().value).toBe('carlos@x.com');
        expect(campoNome().value).toBe('Carlos Lima');
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
        expect(membroPorEmail).not.toHaveBeenCalled();
    });
});

// "Reenviar convite" (resend: true) apaga o login ainda não confirmado e cria outro, com id
// novo; o gatilho do banco reaponta a linha do membro, mas não a ficha do colaborador.
describe('Reenviar convite — a ficha acompanha o login novo', () => {
    const reapontar = organizationService.reapontarFichasDoLogin as unknown as ReturnType<typeof vi.fn>;
    const reenviar = () => {
        fireEvent.click(screen.getAllByTitle('Mais ações')[0]);
        fireEvent.click(screen.getByText('Reenviar convite'));
    };

    it('login trocou: reaponta as fichas do antigo para o novo', async () => {
        membroPorEmail.mockResolvedValueOnce({ userId: 'u-1' }).mockResolvedValueOnce({ userId: 'u-2' });
        reapontar.mockResolvedValue({ trocadas: 1, falhas: [] });
        render(<Tela />);
        reenviar();
        await waitFor(() => expect(reapontar).toHaveBeenCalledWith('u-1', 'u-2'));
        expect(membroPorEmail.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0]);
        await screen.findByText('Convite reenviado para m1@exemplo.com');
    });

    it('login não trocou: não mexe em ficha', async () => {
        membroPorEmail.mockResolvedValue({ userId: 'u-1' });
        render(<Tela />);
        reenviar();
        await screen.findByText('Convite reenviado para m1@exemplo.com');
        expect(reapontar).not.toHaveBeenCalled();
    });

    it('reapontar falhou: avisa que a ficha ficou no login antigo', async () => {
        membroPorEmail.mockResolvedValueOnce({ userId: 'u-1' }).mockResolvedValueOnce({ userId: 'u-2' });
        reapontar.mockResolvedValue({ trocadas: 0, falhas: ['Carlos Lima: sem permissão'] });
        render(<Tela />);
        reenviar();
        await screen.findByText(/ficha do colaborador continua ligada ao login antigo/);
    });
});

// Pedido de 16/11 (2º) — os menores da revisão (itens 1, 2, 4 e 5 do plano).
describe('Convite — o que a tela diz', () => {
    const listar = laborService.listColaboradoresParaConvite as unknown as ReturnType<typeof vi.fn>;

    it('enquanto a lista carrega, o campo fica desligado dizendo isso', async () => {
        let soltar: (v: unknown) => void = () => {};
        listar.mockReturnValue(new Promise(r => { soltar = r; }));
        render(<Tela />);
        fireEvent.click(screen.getByText('Convidar membro'));
        const campo = screen.getByRole('combobox', { name: 'Colaborador' }) as HTMLInputElement;
        expect(campo.disabled).toBe(true);
        expect(campo.placeholder).toBe('Carregando colaboradores…');
        soltar(COLABORADORES);
        await waitFor(() => expect(campo.disabled).toBe(false));
    });

    it('organização sem colaboradores: a lista diz isso, sem oferecer cadastro', async () => {
        listar.mockResolvedValue([]);
        render(<Tela />);
        fireEvent.click(screen.getByText('Convidar membro'));
        const campo = screen.getByRole('combobox', { name: 'Colaborador' }) as HTMLInputElement;
        await waitFor(() => expect(campo.disabled).toBe(false));
        fireEvent.focus(campo);
        expect(screen.getByText('Nenhum colaborador ativo nesta organização.')).toBeTruthy();
        expect(screen.queryByText(/digite para cadastrar/)).toBeNull();
    });

    it('falha da Edge: o aviso traz o motivo real, com ponto final', async () => {
        invoke.mockResolvedValue({
            data: null,
            error: {
                message: 'Edge Function returned a non-2xx status code',
                context: { json: async () => ({ error: 'Somente administradores ou proprietários podem convidar membros' }) },
            },
        });
        render(<Tela />);
        await abrirConvite();
        escolher('Dora Reis');
        enviar();
        await screen.findByText(/Somente administradores ou proprietários podem convidar membros\./);
        expect(screen.queryByText(/non-2xx/)).toBeNull();
    });

    it('depois de uma pendência o rodapé vira "Fechar": não reenvia nem regrava a ficha', async () => {
        membroPorEmail.mockResolvedValue({ userId: null });
        render(<Tela />);
        await abrirConvite();
        escolher('Carlos Lima');
        fireEvent.change(campoEmail(), { target: { value: 'carlos@x.com' } });
        enviar();
        await screen.findByText(/a conta de acesso ainda não existe/);
        expect(screen.queryByText('Enviar Convite')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
        expect(screen.queryByText('Convidar Novo Membro')).toBeNull();
        expect(chamadasCom('email')).toHaveLength(1);
        // reabrir começa limpo
        fireEvent.click(screen.getByText('Convidar membro'));
        expect(campoNome().value).toBe('');
        expect(screen.getByText('Enviar Convite')).toBeTruthy();
    });

    it('pessoa que já tinha conta: o toast não diz que mandou e-mail', async () => {
        invoke.mockResolvedValue({ data: { success: true, alreadyRegistered: true }, error: null });
        render(<Tela />);
        await abrirConvite();
        escolher('Dora Reis');
        enviar();
        await screen.findByText(/Dora Reis já tinha conta no sistema: entrou na organização sem e-mail de convite/);
        expect(screen.getByText(/ficha do colaborador vinculada/)).toBeTruthy();
        expect(screen.queryByText(/Convite enviado/)).toBeNull();
    });

    it('ficha que já tinha login: o toast diz que já estava vinculada, sem regravar', async () => {
        render(<Tela />);
        await abrirConvite();
        escolher('Fábio Nunes');
        enviar();
        await screen.findByText(/Convite enviado para fabio@x\.com — a ficha do colaborador já estava vinculada a um login/);
        expect(chamadasCom('user_id')).toHaveLength(0);
    });
});
