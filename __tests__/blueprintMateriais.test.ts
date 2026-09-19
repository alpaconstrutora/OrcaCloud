/**
 * Biblioteca de materiais (19/09/2026, E7.4): linha → material, validação,
 * camada pronta do material, massa e desempenho térmico (NBR 15220), custo
 * pela unidade, item de orçamento, sementes, resumo de uso — e a prova de que
 * o KERNEL não mudou: a camada continua com `itemCode` opaco e o hash de um
 * desenho não depende da biblioteca.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, KERNEL_VERSION, point, snapshotHash } from '../utils/blueprintKernel';
import {
  camadaDoMaterial,
  custoDe,
  desempenhoTermico,
  indicePorCodigo,
  itemDoMaterial,
  massaKg,
  MATERIAIS_SEMENTE,
  materialDaLinha,
  resumirUso,
  validarMaterial,
  type Material,
} from '../utils/blueprintMateriais';
import type { BlueprintMaterialRow } from '../types/blueprint';

const linha = (over: Partial<BlueprintMaterialRow> = {}): BlueprintMaterialRow => ({
  id: 'm1',
  organization_id: 'org',
  codigo: 'INT-BLOCO-CER-14',
  nome: 'Bloco cerâmico 14 cm',
  fonte: 'INTERNA',
  unidade: 'm²',
  custo: 85.5,
  fabricante: 'Cerâmica X',
  densidade_kg_m3: 1300,
  condutividade_w_mk: 0.9,
  cor: '#c4a484',
  funcao: 'VEDACAO',
  espessura_padrao_mm: 140,
  propriedades: {},
  active: true,
  created_at: '',
  updated_at: '',
  ...over,
});

describe('biblioteca de materiais (E7.4)', () => {
  it('linha → material (números vêm como número mesmo quando o banco manda texto); validação recusa o que não dá para gravar', () => {
    const m = materialDaLinha(linha({ custo: '85.50' as unknown as number, densidade_kg_m3: '1300' as unknown as number }));
    expect(m).toMatchObject({ codigo: 'INT-BLOCO-CER-14', custo: 85.5, densidadeKgM3: 1300, condutividadeWmK: 0.9, funcao: 'VEDACAO', espessuraPadraoMm: 140 });
    expect(validarMaterial(m)).toEqual([]);
    expect(validarMaterial({ codigo: '', nome: '', unidade: '', custo: -1, densidadeKgM3: 0, cor: 'azul', espessuraPadraoMm: 2.5 })).toEqual([
      'código é obrigatório (SINAPI ou interno)',
      'nome é obrigatório',
      'unidade é obrigatória',
      'custo tem de ser zero ou positivo',
      'densidade tem de ser positiva',
      'cor tem de ser #rrggbb',
      'espessura padrão tem de ser inteira e positiva',
    ]);
    expect(validarMaterial({ codigo: 'INT 1', nome: 'x', unidade: 'm²', custo: 0 })).toEqual(['código não pode ter espaço']);
  });

  it('a camada nasce pronta do material (função e espessura usuais, descrição = nome); massa e custo pela unidade; item de orçamento', () => {
    const m = materialDaLinha(linha());
    expect(camadaDoMaterial(m)).toEqual({ espessuraMm: 140, itemCode: 'INT-BLOCO-CER-14', descricao: 'Bloco cerâmico 14 cm', funcao: 'VEDACAO' });
    expect(camadaDoMaterial(m, 90).espessuraMm).toBe(90);
    expect(camadaDoMaterial(materialDaLinha(linha({ funcao: null, espessura_padrao_mm: null })))).toMatchObject({ espessuraMm: 25, funcao: 'REVESTIMENTO' });
    expect(massaKg(2, m)).toBe(2600);
    expect(massaKg(2, materialDaLinha(linha({ densidade_kg_m3: null })))).toBeNull();
    expect(custoDe(m, { areaM2: 10, volumeM3: 1.4 })).toBe(855); // m² → área
    expect(custoDe(materialDaLinha(linha({ unidade: 'M3' })), { areaM2: 10, volumeM3: 1.4 })).toBeCloseTo(119.7, 6); // m³ → volume
    expect(custoDe(materialDaLinha(linha({ unidade: 'm' })), { comprimentoM: 3 })).toBe(256.5);
    expect(custoDe(materialDaLinha(linha({ unidade: 'm' })), { areaM2: 3 })).toBeNull(); // grandeza não casa
    const item = itemDoMaterial(m, 'INPUT');
    expect(item).toMatchObject({ code: 'INT-BLOCO-CER-14', description: 'Bloco cerâmico 14 cm', unit: 'm²', price: 85.5, source: 'Própria', isOverride: true, category: 'VEDACAO' });
    expect(itemDoMaterial(materialDaLinha(linha({ fonte: 'SINAPI' })), 'INPUT').source).toBe('SINAPI');
  });

  it('desempenho térmico NBR 15220: R = Σ e/λ, U = 1/(Rsi + R + Rse); câmara de ar sem material vale 0,17; camada sem λ derruba o U', () => {
    const idx = indicePorCodigo([
      materialDaLinha(linha()),
      materialDaLinha(linha({ id: 'm2', codigo: 'INT-REBOCO', nome: 'Reboco', condutividade_w_mk: 1.15, densidade_kg_m3: 1900 })),
      materialDaLinha(linha({ id: 'm3', codigo: 'INT-EPS', nome: 'EPS', condutividade_w_mk: 0.04, densidade_kg_m3: 20 })),
      materialDaLinha(linha({ id: 'm4', codigo: 'SEM-LAMBDA', nome: 'Sem λ', condutividade_w_mk: null })),
    ]);
    const parede = desempenhoTermico(
      [
        { espessuraMm: 25, itemCode: 'INT-REBOCO', descricao: 'Reboco', funcao: 'REVESTIMENTO' },
        { espessuraMm: 140, itemCode: 'INT-BLOCO-CER-14', descricao: 'Bloco', funcao: 'VEDACAO' },
        { espessuraMm: 25, itemCode: 'INT-REBOCO', descricao: 'Reboco', funcao: 'REVESTIMENTO' },
      ],
      idx,
    );
    // R = 0,025/1,15 × 2 + 0,14/0,9 = 0,0435 + 0,1556 = 0,1990; U = 1/(0,13 + 0,199 + 0,04) = 2,71
    expect(parede.resistenciaM2KW).toBeCloseTo(0.199, 3);
    expect(parede.transmitanciaWm2K).toBeCloseTo(2.71, 2);
    expect(parede.camadasSemLambda).toEqual([]);
    const comEps = desempenhoTermico([{ espessuraMm: 50, itemCode: 'INT-EPS', descricao: 'EPS', funcao: 'ISOLAMENTO' }, { espessuraMm: 30, itemCode: '', descricao: '', funcao: 'CAMARA_AR' }], idx);
    expect(comEps.resistenciaM2KW).toBeCloseTo(1.25 + 0.17, 6);
    const semLambda = desempenhoTermico([{ espessuraMm: 10, itemCode: 'SEM-LAMBDA', descricao: 'X', funcao: 'ACABAMENTO' }], idx);
    expect(semLambda.transmitanciaWm2K).toBeNull();
    expect(semLambda.camadasSemLambda).toEqual(['X']);
  });

  it('sementes: 12 códigos internos únicos, com densidade e λ onde faz sentido; resumo de uso soma e converte em massa/custo', () => {
    expect(MATERIAIS_SEMENTE).toHaveLength(12);
    expect(new Set(MATERIAIS_SEMENTE.map((s) => s.codigo)).size).toBe(12);
    expect(MATERIAIS_SEMENTE.every((s) => s.codigo.startsWith('INT-') && s.custo === 0 && s.fonte === 'INTERNA')).toBe(true);
    expect(MATERIAIS_SEMENTE.filter((s) => s.condutividadeWmK != null)).toHaveLength(9);
    const m: Material = materialDaLinha(linha({ unidade: 'm³', custo: 600, densidade_kg_m3: 2500 }));
    const r = resumirUso(
      [
        { codigo: m.codigo, descricao: '', origem: 'PAREDE', areaM2: 10, volumeM3: 1.5, comprimentoM: 0 },
        { codigo: m.codigo, descricao: '', origem: 'PISO', areaM2: 20, volumeM3: 0.8, comprimentoM: 0 },
      ],
      m,
    );
    expect(r).toEqual({ areaM2: 30, volumeM3: 2.3, comprimentoM: 0, massaKg: 5750, custo: 1380 });
    expect(resumirUso([], undefined)).toEqual({ areaM2: 0, volumeM3: 0, comprimentoM: 0, massaKg: null, custo: null });
  });

  it('o kernel não mudou: a camada leva só o código opaco e o hash do desenho não sabe da biblioteca (sem bump)', () => {
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.44.0');
    const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m0.levels[0].id;
    const com = applyBatch(m0, [{ type: 'AddWall', levelId: t, a: point(0, 0), b: point(4000, 0), thicknessMm: 190, heightMm: 2800 }]).model;
    const w = com.walls[0];
    const mat = materialDaLinha(linha());
    const camadas = [camadaDoMaterial(mat), camadaDoMaterial(materialDaLinha(linha({ id: 'm2', codigo: 'INT-REBOCO', nome: 'Reboco', funcao: 'REVESTIMENTO', espessura_padrao_mm: 25 }))), camadaDoMaterial(materialDaLinha(linha({ id: 'm3', codigo: 'INT-REBOCO', nome: 'Reboco', funcao: 'REVESTIMENTO', espessura_padrao_mm: 25 })))];
    const a = applyCommand(com, { type: 'SetWallLayers', wallId: w.id, camadas }).model;
    // Mesmas camadas com o nome do material trocado na biblioteca depois: o payload só tem o código e a descrição-cache → hash igual.
    const b = applyCommand(com, { type: 'SetWallLayers', wallId: w.id, camadas: camadas.map((c) => ({ ...c })) }).model;
    expect(snapshotHash(a)).toBe(snapshotHash(b));
    expect(a.walls[0].camadas?.map((c) => c.itemCode)).toEqual(['INT-BLOCO-CER-14', 'INT-REBOCO', 'INT-REBOCO']);
    expect(Object.keys(a.walls[0].camadas![0])).toEqual(['espessuraMm', 'itemCode', 'descricao', 'funcao']);
  });
});
