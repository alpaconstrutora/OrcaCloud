import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Fase 1 do plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md: a versão
 * congelada guarda tudo o que o relatório completo lê (comparáveis, riscos, due diligence,
 * sócios, além dos cenários), para o PDF da versão — no app e no Portal do Investidor — sair
 * igual ao do estudo no instante em que foi congelado.
 */
const gravado = vi.hoisted(() => ({ linha: null as null | Record<string, unknown> }));
vi.mock('../lib/supabase', () => {
    const q: Record<string, unknown> = {};
    q.from = () => q;
    q.insert = (linha: Record<string, unknown>) => { gravado.linha = linha; return q; };
    q.select = () => Promise.resolve({ data: [{ id: 'v1' }], error: null });
    return { supabase: q };
});

import { imovibService } from '../services/imovibService';
import { dadosDoRelatorioDaVersao } from '../utils/imovibVersoes';
import { secoesDoRelatorio } from '../utils/imovibRelatorio';
import { baseStudy } from './fixtures/imovibEstudos';

const riscos = [{ id: 'r1', study_id: 'estudo-teste', category: 'juridico', description: 'Matrícula com ônus', probability: 3, impact: 4, mitigation: 'Baixa do ônus', owner: 'Jurídico', status: 'aberto', sort_order: 0 }];
const cenarios = [{ id: 'c1', study_id: 'estudo-teste', name: 'Pessimista', kind: 'pessimista', choques: { preco: -10 }, sort_order: 0 }];
const dueDiligence = [{ id: 'd1', study_id: 'estudo-teste', item_key: 'matricula', label: 'Matrícula atualizada', status: 'ok', notes: 'Conferida', sort_order: 0 }];
const comparaveis = [{ id: 'm1', study_id: 'estudo-teste', name: 'Edifício Vizinho', price_sqm: 9_500, private_area: 80, sale_date: '2026-09-01', source: 'Corretor', sort_order: 0 }];
const socios = [{ id: 's1', study_id: 'estudo-teste', name: 'Sócio A', share_percent: 60, capital_percent: 60, sort_order: 0 }];

beforeEach(() => {
    gravado.linha = null;
    vi.spyOn(imovibService, 'listarCenarios').mockResolvedValue(cenarios as never);
    vi.spyOn(imovibService, 'listarRiscos').mockResolvedValue(riscos as never);
    vi.spyOn(imovibService, 'listarDueDiligence').mockResolvedValue(dueDiligence as never);
    vi.spyOn(imovibService, 'listarComparaveis').mockResolvedValue(comparaveis as never);
    vi.spyOn(imovibService, 'listarSocios').mockResolvedValue(socios as never);
});

describe('versão congelada completa', () => {
    it('congelar grava no snapshot os cenários e as quatro listas do relatório', async () => {
        await imovibService.congelarVersao(baseStudy() as never, 'Comitê', null);
        const snapshot = gravado.linha!.snapshot as Record<string, unknown>;
        expect(snapshot.cenarios).toEqual(cenarios);
        expect(snapshot.relatorio).toEqual({ comparaveis, riscos, dueDiligence, socios });
        expect(snapshot.name).toBe('Estudo teste');
    });

    it('os dados do relatório da versão: estudo sem as listas penduradas, listas da versão e a data da versão', async () => {
        await imovibService.congelarVersao(baseStudy() as never, 'Comitê', null);
        const snapshot = JSON.parse(JSON.stringify(gravado.linha!.snapshot));
        const d = dadosDoRelatorioDaVersao(snapshot, { created_at: '2026-11-15T13:40:00Z' });
        expect(d.hoje).toBe('2026-11-15');
        expect(d.riscos).toEqual(riscos);
        expect(d.cenarios).toEqual(cenarios);
        expect('relatorio' in d.study).toBe(false);
        expect('cenarios' in d.study).toBe(false);
    });

    it('versão antiga, sem as listas: o relatório sai com a frase de vazio nas seções delas', () => {
        const d = dadosDoRelatorioDaVersao({ ...(baseStudy() as object), cenarios: [] } as never, { created_at: '2026-11-12T10:00:00Z' });
        expect(d.comparaveis).toEqual([]);
        expect(d.riscos).toEqual([]);
        const s = secoesDoRelatorio(d);
        expect(s.find(x => x.id === 'riscos')!.vazio).toMatch(/risco/i);
    });

    it('o relatório da versão é o mesmo do estudo no instante do congelamento', async () => {
        const estudo = baseStudy();
        await imovibService.congelarVersao(estudo as never, 'Comitê', null);
        const snapshot = JSON.parse(JSON.stringify(gravado.linha!.snapshot));
        const daVersao = secoesDoRelatorio(dadosDoRelatorioDaVersao(snapshot, { created_at: '2026-11-15T13:40:00Z' }));
        const aoVivo = secoesDoRelatorio({ study: estudo as never, comparaveis, riscos, cenarios, dueDiligence, socios, hoje: '2026-11-15' } as never);
        expect(daVersao).toEqual(aoVivo);
    });
});
