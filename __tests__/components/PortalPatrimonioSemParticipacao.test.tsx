// @vitest-environment jsdom
/**
 * Portal do Investidor (link) — participação sem patrimônio conhecido (pedido de 18/11/2026).
 *
 * O Tiago via "Patrimônio R$ 230.000" e "1x" no Garden Cambuhy sem participação registrada. Item
 * sem patrimônio (equity null) mostra "—" com o motivo — nunca "R$ 0" nem um valor inventado.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import PortalOverview from '../../components/investor/portal/PortalOverview';
import PortalHoldings from '../../components/investor/portal/PortalHoldings';
import { HoldingItem } from '../../components/investor/types';
import { SEM_PARTICIPACAO } from '../../utils/investidorCarteira';

const garden: HoldingItem = {
    id: 'ddcdbec3', name: 'Garden Cambuhy', location: 'MG', cota: '—', equity: null,
    semPatrimonio: SEM_PARTICIPACAO, status: 'Em andamento', progress: 5.4,
};

const resumo = (holdings: HoldingItem[]) => render(
    <PortalOverview
        equity="—" activeWorks={holdings.length} monthlyYieldPct={null} totalContributed={0} totalRecebido={0} retornoTotal={null} retornoEmCaixa={null}
        holdings={holdings} contributions={[]}
        onSelectAsset={vi.fn()} onNavigateToHoldings={vi.fn()}
    />,
);

describe('Resumo do portal — patrimônio sem participação', () => {
    it('KPI Patrimônio mostra "—" e o motivo, não um valor', () => {
        resumo([garden]);
        const kpi = screen.getByText('Patrimônio', { selector: 'p' }).parentElement!;
        expect(within(kpi).getByText('—')).toBeTruthy();
        expect(within(kpi).getByText(SEM_PARTICIPACAO)).toBeTruthy();
        expect(kpi.textContent).not.toMatch(/R\$/);
    });

    it('linha da participação: patrimônio "—", sem "R$ 0" e sem "1x"', () => {
        resumo([garden]);
        const linha = screen.getByText('Garden Cambuhy').closest('tr')!;
        expect(linha.textContent).not.toMatch(/R\$/);
        expect(linha.textContent).not.toMatch(/1x/);
        expect(within(linha).getAllByText('—').length).toBeGreaterThanOrEqual(2);
    });

    it('com uma participação conhecida e outra não: soma só a conhecida e avisa a outra', () => {
        resumo([garden, { id: 'x', name: 'Outro', cota: '10%', equity: 120000, status: 'Em andamento', progress: 0 }]);
        const kpi = screen.getByText('Patrimônio', { selector: 'p' }).parentElement!;
        expect(kpi.textContent).toMatch(/R\$\s?120\.000/);
        expect(kpi.textContent).toMatch(/1 sem patrimônio calculado/);
    });
});

describe('Carteira do portal — patrimônio sem participação', () => {
    it('subtítulo não soma "R$ 0 em patrimônio"; célula "—"; detalhe diz o motivo', async () => {
        render(<PortalHoldings holdings={[garden]} filterStatus="Todos" onFilterChange={vi.fn()} onSelectAsset={vi.fn()} />);
        expect(screen.queryByText(/em patrimônio/)).toBeNull();
        const linha = screen.getAllByText('Garden Cambuhy').map(e => e.closest('tr')).find(Boolean)!;
        expect(linha.textContent).not.toMatch(/R\$/);
        await userEvent.click(linha);
        const detalhe = screen.getByText('Patrimônio estimado').parentElement!;
        expect(within(detalhe).getByText(SEM_PARTICIPACAO)).toBeTruthy();
    });
});
