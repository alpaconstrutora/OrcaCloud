// @vitest-environment jsdom
/**
 * Planta Inteligente › aba Mapa Regulatório.
 * Pedido de 10/10/2026, docs/planos/2026-10-10-mapa-regulatorio-dentro-da-planta.md
 *
 * O que o typecheck não pega: a aba persistida, a trava de permissão (quem não via
 * o Mapa Regulatório pelo menu continua sem ver pela aba) e o endereço antigo
 * `regulatory-maps` chegando pelo `viewFocus` do store.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/blueprintService', () => ({
    listStudies: vi.fn(async () => [
        { id: 's1', name: 'Planta Torre A', status: 'RASCUNHO', updated_at: '2026-10-01T00:00:00Z' },
    ]),
    listBranches: vi.fn(async () => []),
    ramoPrincipal: vi.fn(() => null),
    createStudy: vi.fn(),
    duplicateStudy: vi.fn(),
    archiveStudy: vi.fn(),
}));
vi.mock('../../services/regulatoryMapService', () => ({
    regulatoryMapService: {
        list: vi.fn(async () => [
            { id: 'm1', name: 'Plano Diretor Campinas', city_name: 'Campinas', state_code: 'SP', status: 'ATIVO', lei_referencia: 'LC 208/2018' },
        ]),
        getById: vi.fn(),
        remove: vi.fn(),
    },
}));
// O editor é pesado (Konva/Three) e não entra nesta tela de lista.
vi.mock('../../components/blueprint/BlueprintEditor', () => ({ default: () => null }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import BlueprintModule from '../../components/blueprint/BlueprintModule';
import { useStore } from '../../store/useStore';

describe('Planta Inteligente — aba Mapa Regulatório', () => {
    beforeEach(() => {
        localStorage.clear();
        useStore.setState({ viewFocus: null });
    });

    it('começa em Plantas e troca título e conteúdo ao clicar na aba', async () => {
        render(<BlueprintModule podeVerMapaRegulatorio />);
        expect(await screen.findByText('Planta Torre A')).toBeTruthy();
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Planta Inteligente');

        fireEvent.click(screen.getByRole('tab', { name: 'Mapa Regulatório' }));

        expect(await screen.findByText('Plano Diretor Campinas')).toBeTruthy();
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Mapa Regulatório');
        // A barra continua lá, com a aba marcada — dá para voltar.
        expect(screen.getByRole('tab', { name: 'Mapa Regulatório' }).getAttribute('aria-selected')).toBe('true');
        expect(localStorage.getItem('blueprintModule:aba')).toBe('"mapa-regulatorio"');
    });

    it('ordem da tela no mapa: título → abas → KPIs (§19.3)', async () => {
        localStorage.setItem('blueprintModule:aba', '"mapa-regulatorio"');
        const { container } = render(<BlueprintModule podeVerMapaRegulatorio />);
        await screen.findByText('Plano Diretor Campinas');
        const h1 = container.querySelector('h1')!;
        const abas = container.querySelector('[role="tablist"]')!;
        const kpi = screen.getByText('Total de mapas');
        expect(h1.compareDocumentPosition(abas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(abas.compareDocumentPosition(kpi) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('sem permissão: nem barra de abas, nem o mapa — mesmo com a aba salva', async () => {
        localStorage.setItem('blueprintModule:aba', '"mapa-regulatorio"');
        render(<BlueprintModule podeVerMapaRegulatorio={false} />);
        expect(await screen.findByText('Planta Torre A')).toBeTruthy();
        expect(screen.queryByRole('tablist')).toBeNull();
        expect(screen.queryByText('Plano Diretor Campinas')).toBeNull();
    });

    it('endereço antigo (viewFocus do AppRouter) abre a aba e consome o foco', async () => {
        useStore.setState({ viewFocus: { ref: 'mapa-regulatorio', source: 'PLANTA_ABA' } });
        render(<BlueprintModule podeVerMapaRegulatorio />);
        expect(await screen.findByText('Plano Diretor Campinas')).toBeTruthy();
        await waitFor(() => expect(useStore.getState().viewFocus).toBeNull());
    });
});
