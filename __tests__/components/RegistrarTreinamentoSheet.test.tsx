// @vitest-environment jsdom
/**
 * Módulo Qualidade (SiAC), fase 1 — Registrar treinamento em obra
 * (docs/planos/2026-11-25-qualidade-siac-pbqph.md, "Telas (rascunho)", seção Treinados).
 * Serviço e RH simulados: aqui se prova o que o Sheet ENVIA à RPC e o que mostra.
 *
 *  (a) 2 colaboradores + 1 pessoa de empreiteira sem cadastro → `registrarTreinamentoEmObra` na
 *      organização do item, com os 2 ids, o terceiro novo e o NOME da obra como local;
 *  (b) pessoa de empreiteira sem nome → não envia e mostra o erro no campo;
 *  (c) ninguém presente → "Registrar treinamento" desligado, com o motivo no `title`;
 *  (d) CPF com 10 dígitos → erro no campo, não envia;
 *  (e) a lista de presentes: só ativos, marca "empreiteira" (com o nome dela) e a ficha
 *      disponibilizada por outra organização aparece desligada com o motivo.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ItemControlado } from '../../types/qualidadeSiac';

const registrarTreinamentoEmObra = vi.fn();
const listEmployees = vi.fn();

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../services/qualidadeSiacService', () => ({
    qualidadeSiacService: {
        registrarTreinamentoEmObra: (...a: unknown[]) => registrarTreinamentoEmObra(...a),
    },
}));
vi.mock('../../services/laborService', () => ({
    laborService: { listEmployees: (...a: unknown[]) => listEmployees(...a) },
}));

import { useStore } from '../../store/useStore';
import { ConfirmProvider } from '../../components/ui/confirm';
import { RegistrarTreinamentoSheet } from '../../components/qualidade/RegistrarTreinamentoSheet';

const item = (p: Partial<ItemControlado> = {}): ItemControlado => ({
    id: 'item-1', organization_id: 'org-a', tipo: 'SERVICO', nome: 'concretagem de peça estrutural', etapa: 'Estrutura',
    origem: 'ANEXO4', anexo4_numero: 6, chave_padrao: 'ANEXO4-06', substitui_item_id: null, situacao: 'ATIVO',
    justificativa: null, procedure_document_id: null, training_course_id: 'curso-1', ordem: 6, codigos: [], ...p,
});

const EMPREGADOS = [
    { id: 'e1', org_id: 'org-a', name: 'Ana Própria', contract_type: 'CLT', status: 'ATIVO', role: 'Pedreira' },
    {
        id: 'e2', org_id: 'org-a', name: 'Bruno Empreiteiro', contract_type: 'EMPREITEIRO', status: 'ATIVO', role: 'Terceirizado',
        academy_externo: true, notes: 'Pessoal de empreiteira cadastrado pelo registro de treinamento em obra — Fortes Ltda',
    },
    { id: 'e3', org_id: 'org-a', name: 'Carlos Desligado', contract_type: 'CLT', status: 'DESLIGADO', role: 'Servente' },
    { id: 'e4', org_id: 'org-b', name: 'Dora Disponibilizada', contract_type: 'CLT', status: 'ATIVO', role: 'Mestre' },
];

const montar = (it: ItemControlado = item()) => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(
        <ConfirmProvider>
            <RegistrarTreinamentoSheet open item={it} onClose={onClose} onSaved={onSaved} />
        </ConfirmProvider>,
    );
    return { onSaved, onClose };
};

beforeEach(() => {
    localStorage.clear();
    registrarTreinamentoEmObra.mockReset().mockResolvedValue(3);
    listEmployees.mockReset().mockResolvedValue(EMPREGADOS);
    useStore.setState({
        activeOrganizationId: 'org-a',
        organizations: [
            { id: 'org-a', name: 'Construtora A', address: {}, members: [] },
            { id: 'org-b', name: 'Construtora B', address: {}, members: [] },
        ] as never,
        projects: [
            { id: 'p1', name: 'Residencial Garden', organization_id: 'org-a', settings: {}, budget: [] },
            { id: 'p2', name: 'Obra da B', organization_id: 'org-b', settings: {}, budget: [] },
        ] as never,
    });
});

describe('Qualidade (SiAC) — Registrar treinamento em obra', () => {
    it('(a) 2 colaboradores + 1 pessoa de empreiteira sem cadastro: grava na organização do item', async () => {
        const user = userEvent.setup();
        const { onSaved, onClose } = montar();
        await waitFor(() => expect(listEmployees).toHaveBeenCalledWith('org-a'));

        const data = screen.getByLabelText('Data') as HTMLInputElement;
        await user.clear(data);
        await user.type(data, '2026-11-20');
        await user.type(screen.getByLabelText('Instrutor'), 'Eng. Paula');
        const local = screen.getByLabelText('Local (obra)') as HTMLSelectElement;
        // só as obras da organização do item
        expect([...local.options].map(o => o.textContent)).not.toContain('Obra da B');
        await user.selectOptions(local, 'p1');

        await user.click(await screen.findByRole('checkbox', { name: /Ana Própria/ }));
        await user.click(screen.getByRole('checkbox', { name: /Bruno Empreiteiro/ }));
        await user.click(screen.getByRole('button', { name: /Pessoa de empreiteira sem cadastro/ }));
        await user.type(screen.getByLabelText('Nome'), 'Zé Novo');
        await user.type(screen.getByLabelText('CPF'), '123.456.789-01');
        await user.type(screen.getByLabelText('Empreiteira'), 'Fortes Ltda');

        await user.click(screen.getByRole('button', { name: 'Registrar treinamento' }));
        await waitFor(() => expect(registrarTreinamentoEmObra).toHaveBeenCalledTimes(1));
        expect(registrarTreinamentoEmObra).toHaveBeenCalledWith({
            organizationId: 'org-a',
            courseId: 'curso-1',
            data: '2026-11-20',
            instrutor: 'Eng. Paula',
            local: 'Residencial Garden',
            employeeIds: ['e1', 'e2'],
            novosTerceiros: [{ nome: 'Zé Novo', cpf: '123.456.789-01', empreiteira: 'Fortes Ltda' }],
        });
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith(3));
        expect(onClose).toHaveBeenCalled();
    });

    it('(b) pessoa de empreiteira sem nome: não envia e mostra o erro no campo', async () => {
        const user = userEvent.setup();
        montar();
        await user.click(await screen.findByRole('checkbox', { name: /Ana Própria/ }));
        await user.click(screen.getByRole('button', { name: /Pessoa de empreiteira sem cadastro/ }));
        await user.type(screen.getByLabelText('Empreiteira'), 'Fortes Ltda');
        await user.click(screen.getByRole('button', { name: 'Registrar treinamento' }));
        expect(await screen.findByText('Informe o nome da pessoa.')).toBeTruthy();
        expect(screen.getByLabelText('Nome').getAttribute('aria-invalid')).toBe('true');
        expect(registrarTreinamentoEmObra).not.toHaveBeenCalled();
    });

    it('(c) ninguém presente: o botão fica desligado e diz por quê', async () => {
        montar();
        await screen.findByRole('checkbox', { name: /Ana Própria/ });
        const botao = screen.getByRole('button', { name: 'Registrar treinamento' }) as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        expect(botao.title).toBe('Marque ao menos uma pessoa presente.');
        // o motivo também está escrito ao lado (nem todo navegador mostra dica em botão desligado)
        expect(screen.getByText('Marque ao menos uma pessoa presente.')).toBeTruthy();
    });

    it('(d) CPF com 10 dígitos: erro no campo, não envia', async () => {
        const user = userEvent.setup();
        montar();
        await screen.findByRole('checkbox', { name: /Ana Própria/ });
        await user.click(screen.getByRole('button', { name: /Pessoa de empreiteira sem cadastro/ }));
        await user.type(screen.getByLabelText('Nome'), 'Zé Novo');
        await user.type(screen.getByLabelText('CPF'), '1234567890');
        await user.click(screen.getByRole('button', { name: 'Registrar treinamento' }));
        expect(await screen.findByText('CPF inválido: informe os 11 dígitos.')).toBeTruthy();
        expect(screen.getByLabelText('CPF').getAttribute('aria-invalid')).toBe('true');
        expect(registrarTreinamentoEmObra).not.toHaveBeenCalled();
    });

    it('(e) presentes: só ativos, marca empreiteira e desliga a ficha de outra organização com o motivo', async () => {
        montar();
        const bruno = await screen.findByRole('checkbox', { name: /Bruno Empreiteiro/ });
        expect(bruno.closest('label')?.textContent).toContain('Empreiteira · Fortes Ltda');
        expect(screen.getByRole('checkbox', { name: /Ana Própria/ }).closest('label')?.textContent).not.toContain('Empreiteira');
        expect(screen.queryByRole('checkbox', { name: /Carlos Desligado/ })).toBeNull();
        const dora = screen.getByRole('checkbox', { name: /Dora Disponibilizada/ }) as HTMLInputElement;
        expect(dora.disabled).toBe(true);
        expect(dora.closest('label')?.getAttribute('title')).toMatch(/outra organização/);
    });

    it('erro do banco sobe no toast com a mensagem dele e o Sheet fica aberto', async () => {
        const user = userEvent.setup();
        registrarTreinamentoEmObra.mockRejectedValue({ message: 'CPF inválido para Zé: informe os 11 dígitos.', code: '22023' });
        const { onSaved, onClose } = montar();
        await user.click(await screen.findByRole('checkbox', { name: /Ana Própria/ }));
        await user.click(screen.getByRole('button', { name: 'Registrar treinamento' }));
        expect(await screen.findByText(/Não foi possível registrar o treinamento: CPF inválido para Zé/)).toBeTruthy();
        expect(onSaved).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });
});
