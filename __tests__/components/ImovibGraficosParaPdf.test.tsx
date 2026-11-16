// @vitest-environment jsdom
/**
 * Revisão da Fase 3 (plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md): se a
 * captura dos gráficos falhar, o relatório completo sai mesmo assim, só com texto e tabelas.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('html2canvas', () => ({ default: async () => { throw new Error('captura falhou'); } }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import { gerarRelatorioCompleto } from '../../components/ImovibGraficosParaPdf';
import { baseStudy } from '../fixtures/imovibEstudos';

describe('relatório completo sem a captura dos gráficos', () => {
    it('a captura falha e o PDF sai, sem imagem', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const pdf = await gerarRelatorioCompleto(
            { study: baseStudy() as never, comparaveis: [], riscos: [], cenarios: [], dueDiligence: [], socios: [], hoje: '2026-11-15' },
            { edicao: 'investidor' },
        );
        expect(pdf.getNumberOfPages()).toBeGreaterThan(5);
        expect(pdf.output()).not.toMatch(/\/Subtype \/Image/);
        // O contêiner fora da tela foi removido (sobra só o span de medição do próprio Recharts).
        expect([...document.body.children].filter(e => e.id !== 'recharts_measurement_span')).toEqual([]);
    });
});
