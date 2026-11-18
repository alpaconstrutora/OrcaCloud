// @vitest-environment jsdom
/**
 * Detalhe do empreendimento (app e Portal do Investidor) — sem "Parecer da Inteligência Artificial"
 * simulado (pedido de 18/11/2026).
 *
 * O card chamava `aiService.analyzeAsset`, que esperava 1,5 s e devolvia um texto fixo com números
 * inventados: "Yield on Cost de 12.5%, excelente para o setor" quando não havia rendimento, progresso
 * × 100 ("540%" no Garden Cambuhy, 5,4%) e uma "infraestrutura municipal prevista para o próximo
 * semestre" que não existe. Não é IA e não pode chegar ao investidor.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../components/investor/ObraTimeline', () => ({ default: () => <div>linha do tempo</div> }));
vi.mock('../../components/ProjectGallery', () => ({ default: () => <div>galeria</div> }));

import AssetDetailModal from '../../components/AssetDetailModal';

const garden = {
    id: 'ddcdbec3', name: 'Garden Cambuhy', location: 'MG', cota: '—', equity: null,
    semPatrimonio: 'Participação não registrada', status: 'Em andamento', progress: 5.4,
};

describe('AssetDetailModal — sem parecer simulado', () => {
    it('não oferece nem mostra "Parecer da Inteligência Artificial"', () => {
        render(<AssetDetailModal project={garden} projectId="ddcdbec3" onClose={vi.fn()} />);
        expect(screen.queryByText(/Parecer da Intelig/i)).toBeNull();
        expect(screen.queryByRole('button', { name: /An[áa]lise IA/i })).toBeNull();
        expect(document.body.textContent).not.toMatch(/12\.5%|540%|infraestrutura municipal/);
    });

    it('a galeria da obra continua no detalhe', () => {
        render(<AssetDetailModal project={garden} projectId="ddcdbec3" onClose={vi.fn()} />);
        expect(screen.getByText('galeria')).toBeTruthy();
        expect(screen.getByText('linha do tempo')).toBeTruthy();
    });
});
