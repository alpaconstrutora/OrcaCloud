// @vitest-environment jsdom
/**
 * Um carregador só para a abertura (handleLoadProject) e a reidratação (usePersistenceSync) —
 * publicação 3 de docs/planos/2026-11-15-planejamento-lista-critica-2.md. Antes a reidratação punha
 * nos itens a coluna `budget` CRUA e, num planejamento vinculado "ao vivo" ao orçamento, abria VAZIO
 * quando chegava depois da abertura (teste com gravação, 15/11/2026).
 */
import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const ITENS = [{ id: 'i1', quantity: 2, sinapiItem: { price: 10 } }];

vi.mock('../services/projectService', () => ({
    projectService: {
        loadProject: vi.fn(),
        saveProject: vi.fn(),
    },
}));
vi.mock('../services/budgetResolver', () => ({
    resolveProjectBudget: vi.fn(),
}));

import { projectService } from '../services/projectService';
import { resolveProjectBudget } from '../services/budgetResolver';
import { carregarProjeto } from '../services/carregarProjeto';
import { usePersistenceSync } from '../hooks/usePersistenceSync';

const PLANEJAMENTO_AO_VIVO = {
    id: 'pl1', name: 'Planejamento', code: '002', budget: [],
    settings: { classification: 'PLANEJAMENTO', linkedProjectId: 'orc1' },
};

beforeEach(() => {
    vi.mocked(projectService.loadProject).mockReset().mockResolvedValue(PLANEJAMENTO_AO_VIVO as never);
    vi.mocked(resolveProjectBudget).mockReset().mockResolvedValue({ budget: ITENS, source: 'linked-live' } as never);
});

describe('carregarProjeto', () => {
    it('devolve o orçamento RESOLVIDO (vínculo), não a coluna crua; o "do banco" fica para o salvamento automático', async () => {
        const c = await carregarProjeto('pl1');
        expect(c!.budget).toEqual(ITENS);
        expect(c!.budgetDoBanco).toEqual([]);
        expect(c!.settings).toMatchObject({ classification: 'PLANEJAMENTO', code: '002' });
    });

    it('congelou agora → a versão vai nas settings da tela, não nas "do banco" (para o salvamento gravar)', async () => {
        vi.mocked(resolveProjectBudget).mockResolvedValue({ budget: ITENS, source: 'active-version', versionId: 'v1', versionItem: 3, snapshotToPersist: ITENS } as never);
        const c = await carregarProjeto('pl1');
        expect(c!.settings).toMatchObject({ basedOnBudgetSnapshot: ITENS, basedOnBudgetVersionId: 'v1', basedOnBudgetVersionItem: 3 });
        expect(c!.settingsDoBanco).not.toHaveProperty('basedOnBudgetSnapshot');
    });

    it('projeto que não existe → null', async () => {
        vi.mocked(projectService.loadProject).mockResolvedValue(null as never);
        expect(await carregarProjeto('x')).toBeNull();
    });
});

describe('usePersistenceSync — reidratação', () => {
    it('põe nos itens o orçamento resolvido (antes: a coluna crua, e o planejamento abria vazio)', async () => {
        const setBudget = vi.fn();
        const setProjectSettings = vi.fn();
        const noop = vi.fn();
        renderHook(() => usePersistenceSync({
            projectSettings: null, budget: [], projectId: 'pl1', session: { user: { id: 'u1' } }, isRehydrating: false,
            activeView: 'planning-view', selectedQuotationId: null, selectedContractId: null, selectedOrderId: null,
            isCreatingImovibStudy: false, editingImovibStudyId: null, viewingImovibStudyId: null,
            favorites: [], setFavorites: noop, setSelectedQuotationId: noop, setSelectedContractId: noop, setSelectedOrderId: noop,
            setIsCreatingImovibStudy: noop, setEditingImovibStudyId: noop, setViewingImovibStudyId: noop,
            setIsRehydrating: noop, setProjectId: noop, setProjectSettings, setBudget,
        }));
        await waitFor(() => expect(setBudget).toHaveBeenCalledWith(ITENS));
        expect(setBudget).not.toHaveBeenCalledWith([]);
        expect(setProjectSettings).toHaveBeenCalledWith(expect.objectContaining({ classification: 'PLANEJAMENTO' }));
    });
});
