// @vitest-environment jsdom
/**
 * Versões congeladas (item 10.2 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, D5).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ listarVersoes: vi.fn(), snapshotDaVersao: vi.fn(), congelarVersao: vi.fn() }));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import ImovibVersoesTab from '../../components/ImovibVersoesTab';
import ImovibCongelarVersao from '../../components/ImovibCongelarVersao';
import { ToastProvider } from '../../components/ui/toast';
import { ConfirmProvider } from '../../components/ui/confirm';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';
import { resultadosDoEstudo } from '../../utils/imovibVersoes';
import { baseStudy } from '../fixtures/imovibEstudos';

const estudo = (over: Record<string, unknown> = {}) => ({ ...baseStudy(over), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' });
const versao = (id: string, label: string, over: Record<string, unknown> = {}) => {
    const s = estudo(over);
    return { linha: { id, study_id: 'estudo-teste', label, notes: null, results: resultadosDoEstudo(s as never), created_at: '2026-11-10T12:00:00Z', created_by: null }, snapshot: s };
};
const comEdicao = (ui: React.ReactElement, pode = true) => (
    <ToastProvider>
        <ConfirmProvider>
            <ImovibEdicaoProvider value={pode ? { pode: true, motivo: '' } : { pode: false, motivo: 'Sem permissão' }}>{ui}</ImovibEdicaoProvider>
        </ConfirmProvider>
    </ToastProvider>
);

beforeEach(() => {
    for (const f of Object.values(svc)) f.mockReset();
});

describe('10.2 — aba Versões', () => {
    it('sem versão: diz como congelar', async () => {
        svc.listarVersoes.mockResolvedValue([]);
        render(comEdicao(<ImovibVersoesTab study={estudo({ discount_rate: 15 }) as never} />));
        expect(await screen.findByText(/Nenhuma versão congelada/)).toBeTruthy();
    });

    it('compara a versão mais recente com o estudo atual: premissa que mudou e indicadores lado a lado', async () => {
        const v = versao('v1', 'Comitê de outubro');
        svc.listarVersoes.mockResolvedValue([v.linha]);
        svc.snapshotDaVersao.mockResolvedValue(v.snapshot);
        render(comEdicao(<ImovibVersoesTab study={estudo({ discount_rate: 15 }) as never} />));
        const mudou = await screen.findByRole('region', { name: 'Premissas que mudaram' });
        expect(await within(mudou).findByText('TMA')).toBeTruthy();
        expect(within(mudou).getByText('12% a.a.')).toBeTruthy();
        expect(within(mudou).getByText('15% a.a.')).toBeTruthy();
        expect(within(screen.getByRole('region', { name: 'Indicadores lado a lado' })).getByText('VPL')).toBeTruthy();
        expect(svc.snapshotDaVersao).toHaveBeenCalledWith('v1');
    });

    it('não oferece editar nem apagar versão', async () => {
        const v = versao('v1', 'Comitê de outubro');
        svc.listarVersoes.mockResolvedValue([v.linha]);
        svc.snapshotDaVersao.mockResolvedValue(v.snapshot);
        render(comEdicao(<ImovibVersoesTab study={estudo() as never} />));
        await screen.findAllByText('Comitê de outubro');
        expect(screen.queryByRole('button', { name: /excluir|apagar|editar/i })).toBeNull();
    });
});

describe('10.2 (revisão) — erro ao ler a versão', () => {
    it('mostra o erro e não fica em "Lendo as versões…"', async () => {
        const v = versao('v1', 'Comitê de outubro');
        svc.listarVersoes.mockResolvedValue([v.linha]);
        svc.snapshotDaVersao.mockRejectedValue(new Error('rede caiu'));
        render(comEdicao(<ImovibVersoesTab study={estudo() as never} />));
        expect(await screen.findByText(/rede caiu/)).toBeTruthy();
        expect(screen.queryByText(/Lendo as versões/)).toBeNull();
    });
});

describe('10.2 — congelar versão', () => {
    it('grava com o nome e as observações e avisa que não se altera depois', async () => {
        const user = userEvent.setup();
        svc.congelarVersao.mockResolvedValue({ id: 'v9' });
        const onCongelada = vi.fn();
        const s = estudo();
        render(comEdicao(<ImovibCongelarVersao open study={s as never} onClose={vi.fn()} onCongelada={onCongelada} />));
        expect(screen.getByText(/não pode ser editada nem apagada/i)).toBeTruthy();
        const nome = screen.getByLabelText('Nome da versão') as HTMLInputElement;
        await user.clear(nome);
        await user.type(nome, 'Comitê de novembro');
        await user.type(screen.getByLabelText('Observações'), 'Antes da renegociação do terreno');
        await user.click(screen.getByRole('button', { name: 'Congelar' }));
        expect(svc.congelarVersao).toHaveBeenCalledWith(s, 'Comitê de novembro', 'Antes da renegociação do terreno');
        expect(onCongelada).toHaveBeenCalled();
    });

    it('sem nome o botão diz por quê; quem só lê não congela', async () => {
        const user = userEvent.setup();
        const { unmount } = render(comEdicao(<ImovibCongelarVersao open study={estudo() as never} onClose={vi.fn()} onCongelada={vi.fn()} />));
        await user.clear(screen.getByLabelText('Nome da versão'));
        expect(screen.getByRole('button', { name: 'Congelar' }).getAttribute('title')).toBe('Dê um nome à versão.');
        unmount();
        render(comEdicao(<ImovibCongelarVersao open study={estudo() as never} onClose={vi.fn()} onCongelada={vi.fn()} />, false));
        const b = screen.getByRole('button', { name: 'Congelar' }) as HTMLButtonElement;
        expect(b.disabled).toBe(true);
        expect(b.getAttribute('title')).toBe('Sem permissão');
    });
});
