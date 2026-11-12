// @vitest-environment jsdom
/**
 * Pendências da Fase 3 (plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md):
 * cenários padrão pelo tipo, riscos sem "vazio" junto do erro, "Ver o risco" no só leitura.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ listarRiscos: vi.fn(), criarCenariosPadrao: vi.fn(), listarCenarios: vi.fn() }));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import ImovibCenariosCard from '../../components/ImovibCenariosCard';
import ImovibRiscosCard from '../../components/ImovibRiscosCard';
import { ToastProvider } from '../../components/ui/toast';
import { ConfirmProvider } from '../../components/ui/confirm';
import { ImovibEdicaoProvider } from '../../hooks/useImovibEdicao';
import { baseStudy } from '../fixtures/imovibEstudos';

const estudo = { ...baseStudy(), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' } as never;
const comEdicao = (ui: React.ReactElement, pode = true) => (
    <ToastProvider><ConfirmProvider>
        <ImovibEdicaoProvider value={pode ? { pode: true, motivo: '' } : { pode: false, motivo: 'Sem permissão' }}>{ui}</ImovibEdicaoProvider>
    </ConfirmProvider></ToastProvider>
);
const cenario = (id: string, name: string, kind: 'pessimista' | 'otimista' | 'personalizado') =>
    ({ id, study_id: 'estudo-teste', name, kind, choques: { preco: -5 }, sort_order: 0 });

beforeEach(() => { for (const f of Object.values(svc)) f.mockReset(); });

describe('cenários padrão pelo tipo, não pelo nome', () => {
    it('Pessimista renomeado continua contando: o botão não oferece criar outro', () => {
        render(comEdicao(<ImovibCenariosCard study={estudo} cenarios={[cenario('a', 'Pior caso', 'pessimista'), cenario('b', 'Otimista', 'otimista')]} carregando={false} erro={null} onCenarios={vi.fn()} />));
        const botao = screen.getByRole('button', { name: /cenários padrão/i }) as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
    });

    it('falta só o otimista: cria só ele', async () => {
        const user = userEvent.setup();
        svc.criarCenariosPadrao.mockResolvedValue(undefined);
        svc.listarCenarios.mockResolvedValue([]);
        render(comEdicao(<ImovibCenariosCard study={estudo} cenarios={[cenario('a', 'Pior caso', 'pessimista')]} carregando={false} erro={null} onCenarios={vi.fn()} />));
        await user.click(screen.getByRole('button', { name: /cenários padrão/i }));
        const criados = svc.criarCenariosPadrao.mock.calls[0][1] as { kind: string }[];
        expect(criados.map(c => c.kind)).toEqual(['otimista']);
    });
});

describe('riscos', () => {
    it('erro de leitura não aparece junto de "nenhum risco"', async () => {
        svc.listarRiscos.mockRejectedValue(new Error('rede caiu'));
        render(comEdicao(<ImovibRiscosCard study={estudo} />));
        expect(await screen.findByText(/rede caiu/)).toBeTruthy();
        expect(screen.queryByText(/Nenhum risco/i)).toBeNull();
    });

    it('quem só lê vê "Ver o risco", não "Editar o risco"', async () => {
        svc.listarRiscos.mockResolvedValue([{ id: 'r1', study_id: 'estudo-teste', category: 'legal', description: 'Matrícula', probability: 3, impact: 4, status: 'aberto', sort_order: 0 }]);
        render(comEdicao(<ImovibRiscosCard study={estudo} />, false));
        await screen.findByText('Matrícula');
        expect(screen.queryByTitle('Editar o risco')).toBeNull();
        expect(screen.getByTitle('Ver o risco')).toBeTruthy();
    });
});
