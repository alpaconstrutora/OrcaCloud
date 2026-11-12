// @vitest-environment jsdom
/**
 * Estática › Produto (Fase 8 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md):
 * indicadores de produto (8.1) e área equivalente NBR 12721 (8.2).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ areaEquivalenteDaPlanta: vi.fn() }));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import ImovibStaticViability from '../../components/ImovibStaticViability';
import { baseStudy } from '../fixtures/imovibEstudos';

const estrutura = (blueprint_study_id: string | null) => ({
    origem: 'empreendimento' as const, empreendimento_id: 'emp-1', empreendimento_nome: 'Residencial', blueprint_study_id,
    torres: 1, unidades: 40, blocos_fora_do_calculo: [],
});
const tela = (over: Record<string, unknown> = {}) =>
    render(<ImovibStaticViability study={{ ...baseStudy(over), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' } as never} />);

beforeEach(() => {
    svc.areaEquivalenteDaPlanta.mockReset();
});

describe('8.1 — indicadores de produto na Estática', () => {
    it('estudo-base: eficiência 77,78%, 40 unidades, tíquete, VGV e custo por m² privativo', () => {
        tela();
        expect(screen.getByText('77,78%')).toBeTruthy();
        expect(screen.getByText('40')).toBeTruthy();
        expect(screen.getByText(/R\$\s700\.000/)).toBeTruthy();
        expect(screen.getByText(/R\$\s10\.000\/m²/)).toBeTruthy();
        expect(screen.getByText(/R\$\s5\.786\/m²/)).toBeTruthy();
    });
});

describe('8.2 — área equivalente NBR 12721', () => {
    it('estudo sem vínculo: "não medido", sem consultar a Planta', () => {
        tela();
        expect(screen.getByText('Não medido')).toBeTruthy();
        expect(screen.getByText(/vincule o estudo a um empreendimento/i)).toBeTruthy();
        expect(svc.areaEquivalenteDaPlanta).not.toHaveBeenCalled();
    });

    it('vinculado sem quadro publicado: "não medido" com link para a Planta, nunca zero', async () => {
        svc.areaEquivalenteDaPlanta.mockResolvedValue(null);
        tela({ estrutura: estrutura('planta-1') });
        expect(await screen.findByText(/nenhuma versão publicada com os quadros/i)).toBeTruthy();
        expect(screen.getByText('Não medido')).toBeTruthy();
        expect(screen.getByRole('link', { name: /Planta Inteligente/ }).getAttribute('href')).toBe('#/blueprint?studyId=planta-1');
        expect(svc.areaEquivalenteDaPlanta).toHaveBeenCalledWith('planta-1');
    });

    it('com quadro: total da versão e custo de obra por m² equivalente', async () => {
        svc.areaEquivalenteDaPlanta.mockResolvedValue({ snapshotId: 's1', revisao: 4, total: 3_240, situacao: 'Só a técnica aprovada', status: 'success' });
        tela({ estrutura: estrutura('planta-1') });
        expect(await screen.findByText('3.240 m²')).toBeTruthy();
        // custo de obra 40 × 90 × 4.500 = 16.200.000 ÷ 3.240 = 5.000
        expect(screen.getByText(/R\$\s5\.000\/m²/)).toBeTruthy();
        expect(screen.getByText(/versão 4 · só a técnica aprovada/i)).toBeTruthy();
    });

    it('trocar de Planta não mostra o total da anterior enquanto carrega', async () => {
        svc.areaEquivalenteDaPlanta.mockResolvedValueOnce({ snapshotId: 's1', revisao: 1, total: 3_240, situacao: 'Sem aprovação', status: 'success' });
        svc.areaEquivalenteDaPlanta.mockReturnValueOnce(new Promise(() => {}));
        const base = { ...baseStudy(), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' };
        const { rerender } = render(<ImovibStaticViability study={{ ...base, estrutura: estrutura('planta-1') } as never} />);
        expect(await screen.findByText('3.240 m²')).toBeTruthy();
        rerender(<ImovibStaticViability study={{ ...base, estrutura: estrutura('planta-2') } as never} />);
        expect(screen.queryByText('3.240 m²')).toBeNull();
        expect(screen.getByText('Não medido')).toBeTruthy();
    });

    it('custo do estudo sem área comum: avisa que o custo por m² equivalente fica subestimado', async () => {
        svc.areaEquivalenteDaPlanta.mockResolvedValue({ snapshotId: 's1', revisao: 4, total: 3_240, situacao: 'Sem aprovação', status: 'success' });
        const s = baseStudy({ estrutura: estrutura('planta-1') });
        s.blocks[0].units[0].common_area = 0;
        render(<ImovibStaticViability study={{ ...s, organization_id: 'org', version: '1.0', created_at: '', updated_at: '' } as never} />);
        expect(await screen.findByText(/sem área comum/i, { selector: 'p' })).toBeTruthy();
    });

    it('Planta de outra organização: diz que não há acesso, não que falta publicar', async () => {
        svc.areaEquivalenteDaPlanta.mockResolvedValue('sem_acesso');
        tela({ estrutura: estrutura('planta-1') });
        expect(await screen.findByText(/não é membro da organização da Planta/i)).toBeTruthy();
        expect(screen.queryByText(/nenhuma versão publicada/i)).toBeNull();
        expect(screen.getByText('Não medido')).toBeTruthy();
    });

    it('quadro com pendência bloqueante: mostra o total e avisa', async () => {
        svc.areaEquivalenteDaPlanta.mockResolvedValue({ snapshotId: 's1', revisao: 2, total: 3_240, situacao: 'Sem aprovação', status: 'failed' });
        tela({ estrutura: estrutura('planta-1') });
        expect(await screen.findByText(/pendência bloqueante/i)).toBeTruthy();
    });
});
