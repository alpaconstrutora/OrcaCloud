// @vitest-environment jsdom
/**
 * Fase 6 do plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md: com o cálculo
 * congelado na versão, o painel, o PDF e o portal leem os números GUARDADOS — o motor não roda.
 * Prova: um cálculo congelado "impossível" (VPL 123.456, seção com título próprio) aparece igual.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const rpc = vi.hoisted(() => ({ resposta: null as unknown }));
const gravado = vi.hoisted(() => ({ linha: null as null | Record<string, unknown> }));
vi.mock('../../lib/supabase', () => {
    const q: Record<string, unknown> = {};
    q.from = () => q;
    q.insert = (linha: Record<string, unknown>) => { gravado.linha = linha; return q; };
    q.select = () => Promise.resolve({ data: [{ id: 'v1' }], error: null });
    q.rpc = () => Promise.resolve({ data: rpc.resposta, error: null });
    return { supabase: q };
});
vi.mock('html2canvas', () => ({ default: async () => { throw new Error('sem captura no jsdom'); } }));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import ImovibPainelDoInvestidor from '../../components/investor/portal/ImovibPainelDoInvestidor';
import { gerarRelatorioCompleto } from '../../components/ImovibGraficosParaPdf';
import { imovibService } from '../../services/imovibService';
import { investorPortalTokenService } from '../../services/investorPortalTokenService';
import { calculoDaVersao, type CalculoDaVersao } from '../../utils/imovibCalculoDaVersao';
import { versaoPublicadaDoSnapshot, congeladoDaVersao, type VersaoPublicada } from '../../utils/imovibVersoes';
import { baseStudy } from '../fixtures/imovibEstudos';

const versao = { id: 'v1', label: 'Comitê', created_at: '2026-11-15T13:40:00Z' };
const organizacao = { name: 'Alpa', logo_url: null };
const dados = () => ({ study: baseStudy() as never, comparaveis: [], riscos: [], cenarios: [], dueDiligence: [], socios: [], hoje: '2026-11-15' });

/** Um cálculo congelado que o motor de hoje NÃO produziria. */
const calculoImpossivel = (): CalculoDaVersao => {
    const c = calculoDaVersao(dados(), versao);
    c.investidor.indicadores.vpl = 123456;
    c.investidor.secoes = [{ id: 'indicadores', titulo: 'SECAO CONGELADA DO INVESTIDOR', paragrafos: [], tabelas: [], vazio: null, graficos: [] }];
    c.interno.secoes = [{ id: 'capa', titulo: 'SECAO CONGELADA INTERNA', paragrafos: ['Parecer: Aprovar'], tabelas: [], vazio: null, graficos: [] }];
    return c;
};

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });

describe('números congelados na versão', () => {
    it('congelar grava o cálculo junto do estudo', async () => {
        for (const m of ['listarCenarios', 'listarComparaveis', 'listarRiscos', 'listarDueDiligence', 'listarSocios'] as const) {
            vi.spyOn(imovibService, m).mockResolvedValue([] as never);
        }
        await imovibService.congelarVersao(baseStudy() as never, 'Comitê', null);
        const snap = gravado.linha!.snapshot as { calculo: CalculoDaVersao };
        expect(snap.calculo.versaoDoCalculo).toBe(1);
        expect(snap.calculo.investidor.indicadores.vpl).toBe(calculoDaVersao(dados(), versao).investidor.indicadores.vpl);
        expect(snap.calculo.interno.secoes.some(s => s.id === 'capa')).toBe(true);
    });

    it('o recorte do investidor leva só a parte dele; a interna fica de fora', () => {
        const vp = versaoPublicadaDoSnapshot({ ...(baseStudy() as object), calculo: calculoImpossivel() } as never, versao, organizacao);
        expect(vp.calculo!.indicadores.vpl).toBe(123456);
        expect(JSON.stringify(vp)).not.toContain('SECAO CONGELADA INTERNA');
        expect('calculo' in vp.study).toBe(false);
    });

    it('o painel mostra o VPL congelado, não o do motor', () => {
        const vp = versaoPublicadaDoSnapshot({ ...(baseStudy() as object), calculo: calculoImpossivel() } as never, versao, organizacao);
        render(<ImovibPainelDoInvestidor versaoPublicada={vp} study={vp.study} cenarios={[]} accent="portal" />);
        const kpis = screen.getByRole('region', { name: 'Indicadores da versão' });
        expect(within(kpis).getByText('R$ 123.456')).toBeTruthy();
    });

    it('o PDF usa as seções congeladas da edição pedida', async () => {
        const c = calculoImpossivel();
        const doInvestidor = await gerarRelatorioCompleto(dados(), { edicao: 'investidor', versao, congelado: congeladoDaVersao(c, 'investidor') });
        expect(doInvestidor.output()).toContain('SECAO CONGELADA DO INVESTIDOR');
        expect(doInvestidor.output()).not.toContain('SECAO CONGELADA INTERNA');
        const interno = await gerarRelatorioCompleto(dados(), { versao, congelado: congeladoDaVersao(c, 'interna') });
        expect(interno.output()).toContain('SECAO CONGELADA INTERNA');
    });

    it('o portal recebe o cálculo do investidor em chave própria', async () => {
        const c = calculoImpossivel();
        rpc.resposta = { valid: true, study: baseStudy(), cenarios: [], relatorio: {}, calculo: c.investidor, versao, organizacao };
        const vp: VersaoPublicada = await investorPortalTokenService.getVersaoPublicadaByToken('tok', 'op1');
        expect(vp.calculo!.indicadores.vpl).toBe(123456);
    });
});
