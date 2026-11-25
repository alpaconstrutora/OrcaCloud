// @vitest-environment jsdom
/**
 * Módulo Qualidade (SiAC), fase 1 — Sheet do item controlado
 * (docs/planos/2026-11-25-qualidade-siac-pbqph.md, "Telas (rascunho)").
 * Serviços, GED, Base e Treinamentos simulados: aqui se prova o que o Sheet GRAVA e o que MOSTRA.
 *
 *  (a) salvar DISPENSADO sem justificativa não grava e mostra o erro no campo;
 *  (b) escolher documento do GED grava `procedure_document_id` na hora;
 *  (c) procedimento em rascunho → "só conta quando aprovado no GED";
 *  (d) 2 itens escolhidos na Base → `definirCodigos(id, [c1, c2])`;
 *  (e) sem curso → "Registrar treinamento em obra" desligado com o motivo;
 *  (f) item novo em "Todas" → cria em cada organização do alvo (`forEachTargetOrg`) e fecha.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ItemControlado, ProcedimentoResumo } from '../../types/qualidadeSiac';

const criarItem = vi.fn();
const atualizarItem = vi.fn();
const definirCodigos = vi.fn();
const listTrainingCourses = vi.fn();
const createTrainingCourse = vi.fn();
const uploadNewDocument = vi.fn();
const listEmployees = vi.fn();

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

vi.mock('../../services/qualidadeSiacService', () => ({
    qualidadeSiacService: {
        criarItem: (...a: unknown[]) => criarItem(...a),
        atualizarItem: (...a: unknown[]) => atualizarItem(...a),
        definirCodigos: (...a: unknown[]) => definirCodigos(...a),
    },
}));
vi.mock('../../services/trainingsService', () => ({
    trainingsService: {
        listTrainingCourses: (...a: unknown[]) => listTrainingCourses(...a),
        createTrainingCourse: (...a: unknown[]) => createTrainingCourse(...a),
    },
}));
vi.mock('../../services/documentService', () => ({
    documentService: { uploadNewDocument: (...a: unknown[]) => uploadNewDocument(...a) },
}));
vi.mock('../../services/laborService', () => ({
    laborService: { listEmployees: (...a: unknown[]) => listEmployees(...a) },
}));
// O picker do GED e o catálogo da Base têm testes próprios: aqui só importa o que o Sheet faz com a escolha.
vi.mock('../../components/ui/DocumentPicker', () => ({
    DocumentPicker: ({ organizationId, onPick, excludeIntegrated }: {
        organizationId: string; onPick: (d: unknown) => void; excludeIntegrated?: boolean;
    }) => (
        <button type="button" data-org={organizationId} data-sem-integrados={String(!!excludeIntegrated)}
            onClick={() => onPick({ id: 'doc-9', nome: 'PES-06', approval_status: 'rascunho' })}>
            documento PES-06
        </button>
    ),
}));
vi.mock('../../components/DatabasePickerModal', () => ({
    default: ({ isOpen, onSelectMany, title }: { isOpen: boolean; onSelectMany?: (i: unknown[]) => void; title?: string }) =>
        isOpen ? (
            <div role="dialog" aria-label={title}>
                <button type="button" onClick={() => onSelectMany?.([{ code: 'C1' }, { code: 'C2' }])}>confirmar 2 itens</button>
            </div>
        ) : null,
}));

import { useStore } from '../../store/useStore';
import { ConfirmProvider } from '../../components/ui/confirm';
import { ItemControladoSheet, type EdicaoDoItem } from '../../components/qualidade/ItemControladoSheet';

const item = (p: Partial<ItemControlado> = {}): ItemControlado => ({
    id: 'item-1', organization_id: 'org-a', tipo: 'SERVICO', nome: 'concretagem de peça estrutural', etapa: 'Estrutura',
    origem: 'ANEXO4', anexo4_numero: 6, chave_padrao: 'ANEXO4-06', substitui_item_id: null, situacao: 'ATIVO',
    justificativa: null, procedure_document_id: null, training_course_id: null, ordem: 6, codigos: [], ...p,
});

const montar = (over: {
    edicao?: EdicaoDoItem | null;
    procedimento?: ProcedimentoResumo | null;
    onSaved?: () => void;
    onClose?: () => void;
} = {}) => {
    const edicao = over.edicao === undefined ? { modo: 'editar' as const, item: item() } : over.edicao;
    const onSaved = over.onSaved ?? vi.fn();
    const onClose = over.onClose ?? vi.fn();
    render(
        <ConfirmProvider>
            <ItemControladoSheet edicao={edicao} itensDaOrg={edicao?.modo === 'editar' ? [edicao.item] : []}
                procedimento={over.procedimento ?? null} treinamentos={[]} podeEditar
                onClose={onClose} onSaved={onSaved} onRegistrarTreinamento={vi.fn()} />
        </ConfirmProvider>,
    );
    return { onSaved, onClose };
};

beforeEach(() => {
    localStorage.clear();
    criarItem.mockReset().mockResolvedValue({});
    atualizarItem.mockReset().mockResolvedValue(undefined);
    definirCodigos.mockReset().mockResolvedValue(undefined);
    listTrainingCourses.mockReset().mockResolvedValue([]);
    createTrainingCourse.mockReset();
    uploadNewDocument.mockReset();
    listEmployees.mockReset().mockResolvedValue([]);
    useStore.setState({
        activeOrganizationId: 'org-a',
        organizations: [
            { id: 'org-a', name: 'Construtora A', address: {}, members: [] },
            { id: 'org-b', name: 'Construtora B', address: {}, members: [] },
        ] as never,
    });
});

describe('Qualidade (SiAC) — Sheet do item controlado', () => {
    it('(a) DISPENSADO sem justificativa: não grava e mostra o erro no campo', async () => {
        const user = userEvent.setup();
        montar();
        await user.selectOptions(await screen.findByLabelText('Situação'), 'DISPENSADO');
        await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        expect(await screen.findByText('Escreva por que o item foi dispensado.')).toBeTruthy();
        expect(screen.getByLabelText('Justificativa da dispensa').getAttribute('aria-invalid')).toBe('true');
        expect(atualizarItem).not.toHaveBeenCalled();
    });

    it('(b) escolher documento do GED grava o procedimento na hora, na organização do item', async () => {
        const user = userEvent.setup();
        const { onSaved } = montar();
        await user.click(await screen.findByRole('button', { name: 'Escolher do GED' }));
        const doc = screen.getByRole('button', { name: 'documento PES-06' });
        expect(doc.getAttribute('data-org')).toBe('org-a');
        expect(doc.getAttribute('data-sem-integrados')).toBe('true');
        await user.click(doc);
        await waitFor(() => expect(atualizarItem).toHaveBeenCalledWith('item-1', { procedure_document_id: 'doc-9' }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
    });

    it('(c) procedimento em rascunho: avisa que só conta quando aprovado no GED', async () => {
        montar({
            edicao: { modo: 'editar', item: item({ procedure_document_id: 'doc-1' }) },
            procedimento: { id: 'doc-1', nome: 'PES-06', revisao: '2', approval_status: 'rascunho', versao_ativa_em: '2026-09-01T10:00:00Z' },
        });
        expect(await screen.findByText('PES-06 rev.2 rascunho')).toBeTruthy();
        expect(screen.getByText(/só conta quando aprovado no GED/)).toBeTruthy();
    });

    it('(d) 2 itens escolhidos na Base: definirCodigos com os dois códigos', async () => {
        const user = userEvent.setup();
        const { onSaved } = montar();
        await user.click(await screen.findByRole('button', { name: 'Buscar composição na Base' }));
        await user.click(screen.getByRole('button', { name: 'confirmar 2 itens' }));
        await waitFor(() => expect(definirCodigos).toHaveBeenCalledWith('item-1', ['C1', 'C2']));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
    });

    it('(d2) material: a busca na Base é de insumo', async () => {
        montar({ edicao: { modo: 'editar', item: item({ tipo: 'MATERIAL', origem: 'PROPRIO', etapa: null }) } });
        expect(await screen.findByRole('button', { name: 'Buscar insumo na Base' })).toBeTruthy();
    });

    it('(e) sem curso: "Registrar treinamento em obra" desligado e diz por quê', async () => {
        montar();
        const botao = await screen.findByRole('button', { name: 'Registrar treinamento em obra' }) as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        expect(botao.title).toBe('Escolha o curso de treinamento primeiro');
    });

    it('(f) novo em "Todas": cria em cada organização do alvo, avisa e fecha', async () => {
        const user = userEvent.setup();
        const { onSaved, onClose } = montar({
            edicao: { modo: 'novo', tipo: 'SERVICO', alvo: { kind: 'all', orgIds: ['org-a', 'org-b'] } },
        });
        // só nome, etapa e origem: o resto precisa de UMA organização
        expect(screen.queryByRole('button', { name: 'Registrar treinamento em obra' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Escolher do GED' })).toBeNull();
        await user.type(await screen.findByLabelText('Nome'), 'execução de piso elevado');
        await user.click(screen.getByRole('button', { name: 'Criar serviço' }));
        await waitFor(() => expect(criarItem).toHaveBeenCalledTimes(2));
        const esperado = { tipo: 'SERVICO', nome: 'execução de piso elevado', etapa: null, origem: 'PROPRIO' };
        expect(criarItem).toHaveBeenCalledWith('org-a', esperado);
        expect(criarItem).toHaveBeenCalledWith('org-b', esperado);
        expect(await screen.findByText('Serviço criado em 2 organizações.')).toBeTruthy();
        expect(onSaved).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });
});
