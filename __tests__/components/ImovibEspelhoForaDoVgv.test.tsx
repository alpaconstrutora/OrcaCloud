// @vitest-environment jsdom
/**
 * Espelho do estudo vinculado: unidade fora do VGV aparece marcada (plano
 * docs/planos/2026-11-19-espelho-vendavel-vgv.md, F2.1) — "Não vendável no empreendimento" / "Sem unidade no
 * empreendimento", aviso com quantas e quanto, e remover as sem unidade com confirmação.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ getUnitInstances: vi.fn(), deleteUnitInstancesByIds: vi.fn(), instanciasLigadasAoEmpreendimento: vi.fn() }));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../services/sync/writeBackImovib', () => ({ previewWriteBackImovib: vi.fn(), applyWriteBackImovib: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
// Preferência do usuário (plano 2026-11-20-imovib-preferencias-estudo): os testes antigos rodam com "exibir".
const pref = vi.hoisted(() => ({ exibir: true }));
vi.mock('../../hooks/useImovibPreferencias', () => ({ useImovibPreferencias: () => ({ exibirNaoVendaveis: pref.exibir, setExibirNaoVendaveis: vi.fn(), carregando: false }) }));

import ImovibSalesMapTab from '../../components/ImovibSalesMapTab';
import { ConfirmProvider } from '../../components/ui/confirm';
import { baseStudy } from '../fixtures/imovibEstudos';

const inst = (id: string, name: string, price: number, fora?: 'nao_vendavel' | 'sem_unidade') => ({
    id, study_id: 'estudo-teste', block_id: 'b1', name, floor: 1, private_area: 70, position_type: 'FRENTE', sun_orientation: 'NORTE',
    price, status: 'DISPONÍVEL', created_at: '', updated_at: '', ...(fora ? { fora_do_vgv: fora } : {}),
});
const marcadas = [inst('i1', '101', 700_000), inst('i2', 'G1', 30_000, 'nao_vendavel'), inst('i3', '999', 500_000, 'sem_unidade')];
const estudo = baseStudy({
    unit_instances: marcadas,
    estrutura: { origem: 'empreendimento', empreendimento_id: 'emp-1', empreendimento_nome: 'Garden', torres: 1, unidades: 2, blocos_fora_do_calculo: [] },
});
const montar = (aoMudar = vi.fn()) => render(<ConfirmProvider><ImovibSalesMapTab study={estudo} onDataChanged={aoMudar} /></ConfirmProvider>);

beforeEach(() => {
    // A tela lê o espelho cru do banco; a marca vem do estudo carregado.
    svc.getUnitInstances.mockReset().mockResolvedValue(marcadas.map(({ fora_do_vgv: _f, ...r }) => r));
    svc.deleteUnitInstancesByIds.mockReset().mockResolvedValue(undefined);
    svc.instanciasLigadasAoEmpreendimento.mockReset().mockResolvedValue(new Set());
    pref.exibir = true;
});

describe('espelho do estudo — unidades fora do VGV', () => {
    it('cada linha diz por que está fora, e o preço vira "fora do VGV"', async () => {
        montar();
        const g1 = (await screen.findByText('G1')).closest('tr')!;
        expect(within(g1).getByText('Não vendável no empreendimento')).toBeTruthy();
        expect(within(g1).getByText('fora do VGV')).toBeTruthy();
        const sobra = screen.getByText('999').closest('tr')!;
        expect(within(sobra).getByText('Sem unidade no empreendimento')).toBeTruthy();
        const ok = screen.getByText('101').closest('tr')!;
        expect(within(ok).queryByText('fora do VGV')).toBeNull();
    });

    it('aviso no topo com quantas e quanto ficou fora', async () => {
        montar();
        const aviso = await screen.findByRole('status', { name: 'Unidades fora do VGV' });
        expect(aviso.textContent).toMatch(/2 unidade\(s\) do espelho fora do VGV/);
        expect(aviso.textContent).toMatch(/1 não vendável no empreendimento/);
        expect(aviso.textContent).toMatch(/1 sem unidade no empreendimento/);
    });

    it('remover as sem unidade: confirma com os nomes e apaga só elas', async () => {
        const user = userEvent.setup();
        const aoMudar = vi.fn();
        montar(aoMudar);
        await user.click(await screen.findByRole('button', { name: 'Remover as sem unidade no empreendimento (1)' }));
        expect(await screen.findByText(/999/, { selector: 'div' })).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Remover' }));
        await vi.waitFor(() => expect(svc.deleteUnitInstancesByIds).toHaveBeenCalledWith(['i3']));
        expect(aoMudar).toHaveBeenCalled();
    });

    // Revisão (I1): a marca pode estar velha (alguém alinhou entretanto) e "sem unidade" pode estar vendida.
    it('remover confere o vínculo no banco na hora e não apaga vendida/reservada', async () => {
        const user = userEvent.setup();
        const vendida = { ...inst('i4', '998', 400_000, 'sem_unidade'), status: 'VENDIDO' };
        const ligadaAgora = inst('i5', '997', 400_000, 'sem_unidade');
        const lista = [...marcadas, vendida, ligadaAgora];
        svc.getUnitInstances.mockResolvedValue(lista.map(({ fora_do_vgv: _f, ...r }) => r));
        svc.instanciasLigadasAoEmpreendimento.mockResolvedValue(new Set(['i5']));
        render(<ConfirmProvider><ImovibSalesMapTab study={{ ...estudo, unit_instances: lista }} onDataChanged={vi.fn()} /></ConfirmProvider>);
        await user.click(await screen.findByRole('button', { name: /Remover as sem unidade no empreendimento/ }));
        expect(await screen.findByText(/998 \(vendida ou reservada\)/)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Remover' }));
        await vi.waitFor(() => expect(svc.deleteUnitInstancesByIds).toHaveBeenCalledWith(['i3']));
        expect(svc.instanciasLigadasAoEmpreendimento).toHaveBeenCalledWith(['i3', 'i5']);
    });

    // Plano 2026-11-20-imovib-preferencias-estudo: preferência "Exibir unidades não vendáveis" desligada (padrão).
    it('preferência desligada: não vendável sai da lista; sem unidade continua; o aviso diz que há ocultas', async () => {
        pref.exibir = false;
        montar();
        await screen.findByText('101');
        expect(screen.queryByText('G1')).toBeNull();
        expect(screen.getByText('999')).toBeTruthy();
        const aviso = screen.getByRole('status', { name: 'Unidades fora do VGV' });
        expect(aviso.textContent).toMatch(/1 não vendável no empreendimento \(oculta na lista — Preferências\)/);
    });
});
