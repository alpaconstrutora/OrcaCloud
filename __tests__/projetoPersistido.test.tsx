// @vitest-environment jsdom
/**
 * Salvamento automático só com alteração (14/11/2026): abrir um projeto regravava
 * `projects` inteiro 2 s depois — mudava a data de atualização e podia atropelar a
 * edição de um colega ("quem grava por último vence").
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { assinaturaDoProjeto, precisaGravar, registrarPersistido, limparPersistidos, obterUltimaGravacao } from '../utils/projetoPersistido';

const saveProject = vi.fn().mockResolvedValue({ id: 'p1' });
const loadProject = vi.fn();
vi.mock('../services/projectService', () => ({
    projectService: {
        saveProject: (...a: unknown[]) => saveProject(...a),
        loadProject: (...a: unknown[]) => loadProject(...a),
    },
}));

import { usePersistenceSync } from '../hooks/usePersistenceSync';
import type { BudgetEntry, ProjectSettings } from '../types';

const SETTINGS = { name: 'Garden', bdi: 25 } as unknown as ProjectSettings;
const ITEM = { id: 'i1', quantity: 2, group: 'G', phase: 'P', subPhase: 'S' } as unknown as BudgetEntry;

describe('projetoPersistido (função pura)', () => {
    beforeEach(() => limparPersistidos());

    it('projeto nunca registrado grava (na dúvida, não perde edição)', () => {
        expect(precisaGravar('x', SETTINGS, [ITEM])).toBe(true);
    });
    it('igual ao registrado não grava; diferente grava', () => {
        registrarPersistido('x', SETTINGS, [ITEM]);
        expect(precisaGravar('x', { ...SETTINGS }, [{ ...ITEM }])).toBe(false);
        expect(precisaGravar('x', { ...SETTINGS, bdi: 30 } as ProjectSettings, [ITEM])).toBe(true);
        expect(precisaGravar('x', SETTINGS, [{ ...ITEM, quantity: 3 } as BudgetEntry])).toBe(true);
    });
    it('a assinatura não depende da identidade do objeto', () => {
        expect(assinaturaDoProjeto(SETTINGS, [ITEM])).toBe(assinaturaDoProjeto({ ...SETTINGS }, [{ ...ITEM }]));
    });
});

// ── o hook de verdade, com o estado num componente ─────────────────────────────
type Controles = { setBudget: (b: BudgetEntry[]) => void; setSettings: (s: ProjectSettings) => void };

function Palco({ controles }: { controles: { current: Controles | null } }) {
    const [settings, setSettings] = React.useState<ProjectSettings | null>(null);
    const [budget, setBudget] = React.useState<BudgetEntry[]>([]);
    const [projectId, setProjectId] = React.useState<string | null>('p1');
    const [isRehydrating, setIsRehydrating] = React.useState(true);
    const nada = () => {};
    usePersistenceSync({
        projectSettings: settings, budget, projectId, session: { user: { id: 'u1' } }, isRehydrating, activeView: 'analytic',
        selectedQuotationId: null, selectedContractId: null, selectedOrderId: null,
        isCreatingImovibStudy: false, editingImovibStudyId: null, viewingImovibStudyId: null,
        favorites: [], setFavorites: nada,
        setSelectedQuotationId: nada, setSelectedContractId: nada, setSelectedOrderId: nada,
        setIsCreatingImovibStudy: nada, setEditingImovibStudyId: nada, setViewingImovibStudyId: nada,
        setIsRehydrating, setProjectId, setProjectSettings: setSettings as (s: ProjectSettings) => void, setBudget,
    });
    controles.current = { setBudget, setSettings: setSettings as (s: ProjectSettings) => void };
    return null;
}

describe('usePersistenceSync — salvamento automático', () => {
    beforeEach(() => {
        limparPersistidos();
        saveProject.mockClear();
        loadProject.mockReset().mockResolvedValue({ id: 'p1', settings: SETTINGS, budget: [ITEM] });
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    const montar = async () => {
        const controles: { current: Controles | null } = { current: null };
        render(<Palco controles={controles} />);
        // reidratação: loadProject resolve e o estado recebe o que veio do banco
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        await act(async () => { vi.advanceTimersByTime(2500); await Promise.resolve(); });
        return controles;
    };

    it('abrir (reidratar) o projeto NÃO grava', async () => {
        await montar();
        expect(loadProject).toHaveBeenCalledWith('p1');
        expect(saveProject).not.toHaveBeenCalled();
        // abriu e não gravou: nada de "Salvo às"
        expect(obterUltimaGravacao()).toBeNull();
    });

    it('editar grava uma vez; voltar ao que o banco tem não grava de novo', async () => {
        const c = await montar();
        await act(async () => { c.current!.setBudget([{ ...ITEM, quantity: 3 } as BudgetEntry]); });
        await act(async () => { vi.advanceTimersByTime(2500); await Promise.resolve(); await Promise.resolve(); });
        expect(saveProject).toHaveBeenCalledTimes(1);
        // o topo passa a mostrar "Salvo às HH:MM"
        expect(obterUltimaGravacao()).not.toBeNull();
        // mesmo conteúdo de novo (objeto novo): já está no banco
        await act(async () => { c.current!.setBudget([{ ...ITEM, quantity: 3 } as BudgetEntry]); });
        await act(async () => { vi.advanceTimersByTime(2500); await Promise.resolve(); });
        expect(saveProject).toHaveBeenCalledTimes(1);
    });
});
