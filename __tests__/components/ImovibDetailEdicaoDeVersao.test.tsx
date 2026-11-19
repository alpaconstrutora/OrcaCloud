// @vitest-environment jsdom
/**
 * Estudo com versão em edição (plano docs/planos/2026-11-19-imovib-versoes-editar-excluir.md, F3.3):
 * a faixa aparece, "Congelar versão" fica desligado com o motivo, e outro membro vê só leitura.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const nada = vi.hoisted(() => () => ({ default: () => null }));
vi.mock('../../components/ImovibPremisesForm', nada);
vi.mock('../../components/ImovibStaticViability', nada);
vi.mock('../../components/ImovibDynamicForm', () => ({ default: ({ study }: { study: { discount_rate?: number } }) => {
    const [valor] = React.useState(String(study.discount_rate));
    return <input aria-label="TMA simulada" readOnly value={valor} />;
} }));
vi.mock('../../components/ImovibCashFlow', nada);
vi.mock('../../components/ImovibExecutiveSummary', nada);
vi.mock('../../components/ImovibCapexForm', nada);
vi.mock('../../components/ImovibReceitasForm', nada);
vi.mock('../../components/ImovibCapitalForm', nada);
vi.mock('../../components/ImovibSensitivityForm', nada);
vi.mock('../../components/ImovibForm', nada);
vi.mock('../../components/ImovibVersoesTab', nada);
vi.mock('../../components/ImovibAcompanhamentoTab', nada);
vi.mock('../../components/ImovibCongelarVersao', nada);
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const svc = vi.hoisted(() => ({ estudo: null as null | Record<string, unknown>, depois: null as null | Record<string, unknown>, salvar: vi.fn(), descartar: vi.fn(), carregou: 0 }));
vi.mock('../../services/imovibService', () => ({
    imovibService: {
        getStudyById: async () => { svc.carregou += 1; return svc.carregou > 1 && svc.depois ? svc.depois : svc.estudo; },
        salvarEdicaoDaVersao: (s: unknown) => svc.salvar(s),
        descartarEdicaoDaVersao: (id: string) => svc.descartar(id),
    },
}));

import ImovibDetailView from '../../components/ImovibDetailView';
import { useStore } from '../../store/useStore';
import { ConfirmProvider } from '../../components/ui/confirm';

const edicao = { version_id: 'v1', version_label: 'Cenário banco', started_by: 'u-ana', started_by_name: 'Ana', started_at: '2026-11-19T17:05:00Z' };
const montar = () => render(<ConfirmProvider><ImovibDetailView studyId="s1" onBack={vi.fn()} /></ConfirmProvider>);

beforeEach(() => {
    svc.estudo = { id: 's1', organization_id: 'org1', name: 'Garden', version: '1', edicao_versao: edicao };
    svc.salvar.mockReset().mockResolvedValue(undefined);
    svc.descartar.mockReset().mockResolvedValue(undefined);
    svc.carregou = 0;
    svc.depois = null;
});

describe('ImovibDetailView com versão em edição', () => {
    it('quem abriu: faixa com Salvar na versão; Congelar desligado com o motivo; salvar recarrega o estudo', async () => {
        useStore.setState({ session: { user: { id: 'u-ana', email: 'ana@exemplo.com.br' } } as never });
        montar();
        expect(await screen.findByText(/Editando a versão/)).toBeTruthy();
        const congelar = screen.getByRole('button', { name: /Congelar versão/ }) as HTMLButtonElement;
        expect(congelar.disabled).toBe(true);
        expect(congelar.title).toBe('Termine a edição da versão «Cenário banco» antes de congelar outra.');
        await userEvent.click(screen.getByRole('button', { name: 'Salvar na versão' }));
        await waitFor(() => expect(svc.salvar).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(svc.carregou).toBe(2));
    });

    it('outro membro: somente leitura com quem está editando, sem Salvar', async () => {
        useStore.setState({ session: { user: { id: 'u-bruno', email: 'bruno@exemplo.com.br' } } as never });
        montar();
        expect(await screen.findByText(/Somente leitura — «Ana» está editando a versão «Cenário banco»/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Salvar na versão' })).toBeNull();
        expect((screen.getByRole('button', { name: /Congelar versão/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    // Conferência em produção (19/11): salvar com a aba Dinâmica aberta deixava o formulário com o valor da
    // versão (15,5) — o estudo tinha voltado a 12 no banco. Sair do campo regravaria o 15,5 no estudo vivo.
    it('salvar na versão remonta as abas: o formulário mostra o estudo recarregado', async () => {
        useStore.setState({ session: { user: { id: 'u-ana', email: 'ana@exemplo.com.br' } } as never });
        svc.estudo = { ...svc.estudo!, discount_rate: 15.5 };
        svc.depois = { id: 's1', organization_id: 'org1', name: 'Garden', version: '1', discount_rate: 12, edicao_versao: null };
        montar();
        await screen.findByText(/Editando a versão/);
        await userEvent.click(screen.getByRole('tab', { name: /Dinâmica/ }));
        expect((await screen.findByLabelText('TMA simulada') as HTMLInputElement).value).toBe('15.5');
        await userEvent.click(screen.getByRole('button', { name: 'Salvar na versão' }));
        await waitFor(() => expect(svc.carregou).toBe(2));
        await waitFor(() => expect((screen.getByLabelText('TMA simulada') as HTMLInputElement).value).toBe('12'));
    });
});
