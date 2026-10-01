/**
 * INCÊNDIO E9.2 (01/10/2026): COMPOSIÇÃO POR PEÇA — a peça sem código vira uma
 * linha por item (peças × quantidade por peça), a com especificação vence a
 * genérica, a peça com código fica com a sua linha; e a prévia passa a buscar
 * no catálogo TODOS os códigos do quantitativo (peça, tubo e esquadria ficavam
 * de fora).
 */
import { describe, expect, it } from 'vitest';
import { KERNEL_VERSION, POLITICA_PADRAO, applyBatch, applyCommand, computeQuantities, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { codigosDoQuantitativo, composicaoDaPeca, gerarLancamentosDeInstalacoes, type ComposicaoDePeca } from '../utils/blueprintBudget';
import { itensDaColuna } from '../services/blueprintComposicaoService';
import type { SinapiItem } from '../types';

const item = (code: string, unit: string): SinapiItem => ({ code, description: code, unit, price: 10, source: 'SINAPI' }) as unknown as SinapiItem;
const CTX = { studyId: 'std', studyName: 'Prédio', snapshotId: 'snp', snapshotHash: 'h'.repeat(20), revision: 1 };

/** O hidrante do roadmap: abrigo + válvula + 2 mangueiras + esguicho + adaptador + chave + placa. */
const HIDRANTE: ComposicaoDePeca = {
  id: 'c1',
  disciplina: 'INCENDIO',
  tipo: 'HIDRANTE_SIMPLES',
  especificacao: null,
  itens: [
    { codigo: 'ABRIGO', quantidade: 1, descricao: 'Abrigo 90 × 60 × 17' },
    { codigo: 'VALV', quantidade: 1, descricao: 'Válvula angular 2½"' },
    { codigo: 'MANG', quantidade: 2, descricao: 'Mangueira 1½" 15 m' },
    { codigo: 'ESG', quantidade: 1 },
    { codigo: 'ADAPT', quantidade: 1 },
    { codigo: 'CHAVE', quantidade: 1 },
    { codigo: 'PLACA', quantidade: 1 },
  ],
};
const CATALOGO = new Map(['ABRIGO', 'VALV', 'MANG', 'ESG', 'ADAPT', 'CHAVE', 'PLACA', 'EXTABC', 'EXTGEN', 'HIDCOD'].map((c) => [c, item(c, 'UN')]));

/** 2 hidrantes sem código, 1 com código; 1 extintor ABC 4 kg e 1 de CO₂ sem código. */
function predio(): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const p = (tipo: string, x: number, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: point(x, 0), cotaMm: 1300, ...extra }) as Command;
  return applyBatch(m, [
    p('HIDRANTE_SIMPLES', 0),
    p('HIDRANTE_SIMPLES', 5000),
    p('HIDRANTE_SIMPLES', 10000, { itemCode: 'HIDCOD' }),
    p('EXTINTOR', 2000, { agenteExtintor: 'PQS_ABC', cargaExtintorKg: 4 }),
    p('EXTINTOR', 3000, { agenteExtintor: 'CO2', cargaExtintorKg: 6 }),
  ]).model;
}
const quant = () => computeQuantities(predio(), POLITICA_PADRAO, KERNEL_VERSION);

describe('E9.2 · qual composição vale', () => {
  it('a da especificação vence a genérica; inativa e de outra rede não contam', () => {
    const generica: ComposicaoDePeca = { id: 'g', disciplina: 'INCENDIO', tipo: 'EXTINTOR', especificacao: null, itens: [{ codigo: 'EXTGEN', quantidade: 1 }] };
    const abc: ComposicaoDePeca = { id: 'a', disciplina: 'INCENDIO', tipo: 'EXTINTOR', especificacao: 'PQS_ABC · 4 kg', itens: [{ codigo: 'EXTABC', quantidade: 1 }] };
    const linha = (e: string | null) => ({ disciplina: 'INCENDIO', classificacao: 'EXTINTOR', tipo: 'Extintor', especificacao: e });
    expect(composicaoDaPeca(linha('PQS_ABC · 4 kg'), [generica, abc])?.id).toBe('a');
    expect(composicaoDaPeca(linha('CO2 · 6 kg'), [generica, abc])?.id).toBe('g');
    expect(composicaoDaPeca(linha('CO2 · 6 kg'), [{ ...generica, active: false }, abc])).toBeNull();
    expect(composicaoDaPeca({ ...linha(null), disciplina: 'AGUA_FRIA' }, [generica])).toBeNull();
  });
});

describe('E9.2 · o orçamento expande a composição', () => {
  it('⚠️ PRONTO QUANDO: o hidrante sem código lança as 7 linhas da composição (× 2 hidrantes); o com código fica com a sua', () => {
    const r = gerarLancamentosDeInstalacoes(quant(), CATALOGO, CTX, [HIDRANTE]);
    expect(r.divergencias).toEqual([]);
    const comp = r.entries.filter((e) => e.id.includes(':instalacao:composicao:'));
    expect(comp.map((e) => [e.sinapiItem.code, e.quantity])).toEqual([
      ['ABRIGO', 2],
      ['VALV', 2],
      ['MANG', 4],
      ['ESG', 2],
      ['ADAPT', 2],
      ['CHAVE', 2],
      ['PLACA', 2],
    ]);
    expect(new Set(comp.map((e) => e.id)).size).toBe(7);
    expect(comp.every((e) => e.group === 'Instalações de incêndio — composições · Incêndio')).toBe(true);
    expect(comp[2].calculationMemory?.formula).toBe('2 peça(s) × 2 UN por peça (composição de "Hidrante simples")');
    expect(comp[0].id).toBe('bp:std:instalacao:composicao:INCENDIO:HIDRANTE_SIMPLES:ABRIGO');
    // O hidrante com código: a linha DELE, não a composição (contaria duas vezes).
    expect(r.entries.filter((e) => e.sinapiItem.code === 'HIDCOD').map((e) => e.quantity)).toEqual([1]);
  });

  it('a especificação separa a composição do extintor; item fora do catálogo é divergência, não linha', () => {
    const abc: ComposicaoDePeca = { id: 'a', disciplina: 'INCENDIO', tipo: 'EXTINTOR', especificacao: 'PQS_ABC · 4 kg', itens: [{ codigo: 'EXTABC', quantidade: 1 }, { codigo: 'SUMIU', quantidade: 1 }] };
    const r = gerarLancamentosDeInstalacoes(quant(), CATALOGO, CTX, [abc]);
    expect(r.entries.filter((e) => e.sinapiItem.code === 'EXTABC').map((e) => e.id)).toEqual(['bp:std:instalacao:composicao:INCENDIO:EXTINTOR:PQS_ABC · 4 kg:EXTABC']);
    expect(r.divergencias.map((d) => d.itemCode)).toEqual(['SUMIU']);
    expect(r.divergencias[0].motivo).toMatch(/composição de "Extintor \(PQS_ABC · 4 kg\)"/);
  });

  it('sem composição, nada muda (a peça sem código continua sem linha)', () => {
    const r = gerarLancamentosDeInstalacoes(quant(), CATALOGO, CTX);
    expect(r.entries.map((e) => e.sinapiItem.code)).toEqual(['HIDCOD']);
  });
});

describe('E9.2 · a prévia procura TODOS os códigos', () => {
  it('peça, tubo e composição entram na resolução do catálogo (antes caíam em "não encontrado")', () => {
    const m = predio();
    const l = m.levels[0].id;
    const comTubo = applyCommand(m, { type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(0, 0), b: point(5000, 0), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 65, itemCode: 'TUBO65' } as Command).model;
    const codigos = codigosDoQuantitativo(computeQuantities(comTubo, POLITICA_PADRAO, KERNEL_VERSION), [HIDRANTE, { ...HIDRANTE, id: 'x', active: false, itens: [{ codigo: 'INATIVO', quantidade: 1 }] }]);
    expect(codigos).toEqual(expect.arrayContaining(['HIDCOD', 'TUBO65', 'ABRIGO', 'MANG', 'PLACA']));
    expect(codigos).not.toContain('INATIVO');
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('o JSONB do banco: só item com código e quantidade > 0', () => {
    expect(itensDaColuna([{ codigo: ' A ', quantidade: 2 }, { codigo: '', quantidade: 1 }, { codigo: 'B', quantidade: 0 }, { codigo: 'C' }, 'lixo'])).toEqual([{ codigo: 'A', quantidade: 2, descricao: null }]);
    expect(itensDaColuna(null)).toEqual([]);
  });
});
