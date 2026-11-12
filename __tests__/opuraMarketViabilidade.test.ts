import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Vínculo da viabilidade com o estudo de terreno do Ópura Market (item 7.2 do
 * plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 */
const svc = vi.hoisted(() => ({ createStudy: vi.fn(), createBlock: vi.fn(), createUnit: vi.fn() }));
vi.mock('../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { criarViabilidadeImovib } from '../services/opuraMarketViabilidadeService';
import { estudoDeOrigem } from '../hooks/useMarketVocacao';

const resultado = {
    stats: { pricePerM2Avg: 9_000 },
    recStandard: 'Médio',
    hipoteses: { coeficienteAproveitamento: 2, taxaOcupacao: 60, custoObraM2: 4_000, eficienciaVenda: 0.8, areaComumFator: 0.2 },
    productMix: { tipologias: [{ tipo: '2Q', area: 60, mix: 100 }] },
} as never;
const dados = (over: Record<string, unknown> = {}) => ({
    organizationId: 'org', nomeEstudo: 'Terreno X', emailUsuario: 'a@b.com', nomeBairro: null, areaTerreno: 1_000, resultado, ...over,
});

beforeEach(() => {
    for (const f of Object.values(svc)) f.mockReset();
    svc.createStudy.mockResolvedValue({ id: 'estudo-novo' });
    svc.createBlock.mockResolvedValue({ id: 'bloco' });
    svc.createUnit.mockResolvedValue({});
});

describe('7.2 — criarViabilidadeImovib grava o estudo de mercado de origem', () => {
    it('estudo de terreno salvo: grava o id no estudo criado', async () => {
        await criarViabilidadeImovib(dados({ estudoDeTerrenoId: 'terreno-1' }));
        expect(svc.createStudy).toHaveBeenCalledWith(expect.objectContaining({ opura_terrain_study_id: 'terreno-1' }));
    });

    it('estudo de terreno não salvo: cria sem o vínculo e não falha', async () => {
        await criarViabilidadeImovib(dados());
        expect(svc.createStudy.mock.calls[0][0].opura_terrain_study_id ?? null).toBeNull();
        expect(svc.createBlock).toHaveBeenCalled();
    });
});

describe('7.2 — qual estudo de terreno vai como origem', () => {
    const lista = [{ id: 't1' }, { id: 't2' }] as never;
    it('só o estudo salvo/reaberto que ainda está na lista da organização atual', () => {
        expect(estudoDeOrigem('t1', lista)).toBe('t1');
        expect(estudoDeOrigem('apagado', lista)).toBeNull(); // apagado ou de outra organização
        expect(estudoDeOrigem(null, lista)).toBeNull(); // análise não salva
    });
});
