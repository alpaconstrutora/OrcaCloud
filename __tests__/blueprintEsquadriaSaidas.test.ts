/**
 * TIPOS DE ESQUADRIA nas SAÍDAS — IFC, quantitativo, orçamento, planilha, diff.
 *
 * O kernel está em `blueprintEsquadria.test.ts`. Aqui se prova que as três
 * saídas contam as MESMAS linhas, porque as três agrupam pela mesma assinatura:
 *
 *   1. IFC: um `IfcDoorType` por assinatura, ligado às instâncias por
 *      `IfcRelDefinesByType` — inclusive as portas sem nome;
 *   2. quantitativo: o quadro de esquadrias tem uma linha por tipo, com a
 *      quantidade;
 *   3. orçamento: uma linha por tipo, pela UNIDADE do item — contagem em UN,
 *      área em M2; sem item, divergência e não silêncio;
 *   4. planilha: a aba do quadro;
 *   5. diff: trocar o tipo é frase própria.
 *
 * ⚠️ Todo valor esperado está CALCULADO À MÃO no comentário.
 */

import { describe, expect, it } from 'vitest';
import {
  POLITICA_PADRAO,
  applyBatch,
  applyCommand,
  computeQuantities,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
  type Esquadria,
} from '../utils/blueprintKernel';
import { gerarIfc } from '../utils/blueprintIfc';
import { gerarLancamentosDeEsquadrias } from '../utils/blueprintBudget';
import { abasDoQuantitativo } from '../utils/blueprintPlanilha';
import { diffSnapshots } from '../utils/blueprintDiff';
import type { SinapiItem } from '../types/budget';

const P1: Esquadria = { nome: 'P1', itemCode: '90843', descricao: 'Porta semi-oca 80×210' };
const P2: Esquadria = { nome: 'P2', itemCode: '90844', descricao: 'Porta semi-oca 90×210' };
const J1: Esquadria = { nome: 'J1', itemCode: '94559', descricao: 'Janela de alumínio 120×120' };

/**
 * Uma parede de 12 m com: duas P1 (80×210), uma P2 (90×210), uma janela J1
 * (120×120) e uma porta SEM tipo de 80×210.
 *
 * Assinaturas distintas: P1 (2 un), P2 (1), J1 (1), "Porta 800×2100" sem nome
 * (1) — QUATRO grupos, cinco aberturas.
 */
function casa(): BlueprintModel {
  const a = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  });
  const levelId = a.model.levels[0].id;
  const b = applyCommand(a.model, {
    type: 'AddWall',
    levelId,
    a: point(0, 0),
    b: point(12000, 0),
    thicknessMm: 150,
    heightMm: 2800,
  });
  const wallId = b.model.walls[0].id;
  const porta = (offsetMm: number, widthMm: number, esquadria?: Esquadria): Command => ({
    type: 'AddOpening',
    wallId,
    kind: 'door',
    offsetMm,
    widthMm,
    heightMm: 2100,
    sillMm: 0,
    ...(esquadria ? { esquadria } : {}),
  });
  return applyBatch(b.model, [
    porta(500, 800, P1),
    porta(2500, 800, P1),
    porta(4500, 900, P2),
    { type: 'AddOpening', wallId, kind: 'window', offsetMm: 7000, widthMm: 1200, heightMm: 1200, sillMm: 900, esquadria: J1 },
    porta(9500, 800),
  ]).model;
}

const OPCOES_IFC = { titulo: 'Casa', revisao: 1, hash: 'h', studyId: 'e1' };

const item = (code: string, unit: string): SinapiItem => ({
  code,
  description: `Item ${code}`,
  unit,
  price: 100,
  type: 'COMPOSICAO' as SinapiItem['type'],
  category: '',
});

const CTX = { studyId: 'e1', studyName: 'Casa', snapshotId: 's1', snapshotHash: 'abcdef123456', revision: 1 };

// ─────────────────────────────────────────────────────────────────────────────

describe('esquadria · 1. IFC', () => {
  it('um IfcDoorType por assinatura, e a porta SEM nome também ganha o dela', () => {
    // 3 tipos de porta (P1, P2, "Porta 800×2100") + 1 de janela (J1).
    const ifc = gerarIfc(casa(), OPCOES_IFC);
    expect(ifc.match(/IFCDOORTYPE\(/g)).toHaveLength(3);
    expect(ifc.match(/IFCWINDOWTYPE\(/g)).toHaveLength(1);
    expect(ifc.match(/IFCRELDEFINESBYTYPE\(/g)).toHaveLength(4);
    expect(ifc).toContain("'P1'");
    expect(ifc).toContain("'Porta 800×2100'");
  });

  it('as DUAS P1 apontam para o MESMO tipo', () => {
    const ifc = gerarIfc(casa(), OPCOES_IFC);
    // A relação que liga as duas: dois produtos na lista, um tipo.
    const rel = ifc.split('\n').find((l) => l.includes('IFCRELDEFINESBYTYPE(') && /\(#\d+,#\d+\),#\d+\)/.test(l));
    expect(rel).toBeDefined();
  });

  it('o item de catálogo vai no tipo, e o GUID do tipo é o mesmo em duas exportações', () => {
    const a = gerarIfc(casa(), OPCOES_IFC);
    const b = gerarIfc(casa(), OPCOES_IFC);
    const guidDe = (ifc: string) => ifc.split('\n').find((l) => l.includes("IFCDOORTYPE(") && l.includes("'P1'"))!.match(/IFCDOORTYPE\('([^']+)'/)![1];
    expect(guidDe(a)).toBe(guidDe(b));
    expect(a).toMatch(/IFCDOORTYPE\('[^']+',#\d+,'P1','Porta semi-oca 80×210',\$,\$,\$,'90843',\$,\.DOOR\.,\.NOTDEFINED\.,\.F\.,\$\)/);
  });

  it('a cobertura passa a dizer que TEM tipos de porta e janela, e não de parede', () => {
    const ifc = gerarIfc(casa(), OPCOES_IFC);
    expect(ifc).toMatch(/CONT[ÉE]M tipos de porta e janela/);
    expect(ifc).toMatch(/N[ÃA]O CONT[ÉE]M tipos de parede/);
  });
});

describe('esquadria · 2. quantitativo', () => {
  it('o quadro tem uma linha por tipo, com a quantidade — e vão livre fora', () => {
    const q = computeQuantities(casa(), POLITICA_PADRAO, 'teste');
    const quadro = q.totais.porEsquadria;
    expect(quadro).toHaveLength(4);
    const p1 = quadro.find((e) => e.nome === 'P1')!;
    expect(p1.quantidade).toBe(2);
    // 2 × 0,8 × 2,1 = 3,36 m²
    expect(p1.areaM2).toBeCloseTo(3.36, 6);
    expect(p1.itemCode).toBe('90843');
    const semNome = quadro.find((e) => e.nome === 'Porta 800×2100')!;
    expect(semNome.quantidade).toBe(1);
    expect(semNome.itemCode).toBe('');
  });

  it('cada abertura carrega nome e assinatura', () => {
    const q = computeQuantities(casa(), POLITICA_PADRAO, 'teste');
    expect(q.aberturas[0].nome).toBe('P1');
    expect(q.aberturas[0].assinatura).toBe('door|800|2100|P1|90843');
    expect(q.policy.version).toBe('quant-1.8.0');
  });
});

describe('esquadria · 3. orçamento por tipo', () => {
  it('item em UN → quantidade; item em M2 → área do vão somada', () => {
    const q = computeQuantities(casa(), POLITICA_PADRAO, 'teste');
    const itens = new Map<string, SinapiItem>([
      ['90843', item('90843', 'UN')],
      ['90844', item('90844', 'UN')],
      ['94559', item('94559', 'M2')],
    ]);
    const r = gerarLancamentosDeEsquadrias(q, itens, CTX);

    expect(r.divergencias).toEqual([]);
    expect(r.entries).toHaveLength(3);
    const p1 = r.entries.find((e) => e.id.includes('|P1|'))!;
    expect(p1.quantity).toBe(2);
    expect(p1.group).toBe('Esquadrias');
    const j1 = r.entries.find((e) => e.id.includes('|J1|'))!;
    // 1,2 × 1,2 = 1,44 m²
    expect(j1.quantity).toBeCloseTo(1.44, 6);
    // A porta SEM nome não gera linha nem divergência: ninguém declarou tipo.
    expect(r.entries.some((e) => e.id.endsWith('||'))).toBe(false);
  });

  it('tipo declarado SEM item vira divergência, não silêncio', () => {
    const m = applyCommand(casa(), {
      type: 'SetOpeningEsquadria',
      openingId: casa().openings[0].id,
      esquadria: { nome: 'P9', itemCode: '', descricao: '' },
    }).model;
    const q = computeQuantities(m, POLITICA_PADRAO, 'teste');
    const r = gerarLancamentosDeEsquadrias(q, new Map(), CTX);
    expect(r.divergencias.some((d) => d.motivo.includes('P9') && d.motivo.includes('sem item'))).toBe(true);
  });

  it('item cotado em metro linear é RECUSADO com divergência', () => {
    const q = computeQuantities(casa(), POLITICA_PADRAO, 'teste');
    const r = gerarLancamentosDeEsquadrias(q, new Map([['90843', item('90843', 'M')]]), CTX);
    expect(r.entries.some((e) => e.id.includes('|P1|'))).toBe(false);
    expect(r.divergencias.some((d) => d.itemCode === '90843' && d.motivo.includes('plausível e errado'))).toBe(true);
  });
});

describe('esquadria · 4. planilha', () => {
  it('a aba "Quadro de esquadrias" agrupa por tipo', () => {
    const q = computeQuantities(casa(), POLITICA_PADRAO, 'teste');
    const abas = abasDoQuantitativo(q, { titulo: 'Casa', revisao: 1, hash: 'h', kernelVersion: 'teste' });
    const quadro = abas.find((a) => a.nome === 'Quadro de esquadrias')!;
    expect(quadro).toBeDefined();
    // cabeçalho + 4 linhas
    expect(quadro.linhas).toHaveLength(5);
    const p1 = quadro.linhas.find((l) => l[0] === 'P1')!;
    expect(p1[4]).toBe(2);
  });
});

describe('esquadria · 5. diff', () => {
  it('trocar o tipo é frase própria, e sem tipo → P1 também', () => {
    const antes = casa();
    const semNome = antes.openings[4];
    const depois = applyCommand(antes, {
      type: 'SetOpeningEsquadria',
      openingId: semNome.id,
      esquadria: P1,
    }).model;
    const d = diffSnapshots(antes, depois);
    const tipos = d.alteracoes.filter((a) => a.tipo === 'ABERTURA_TIPO');
    expect(tipos).toHaveLength(1);
    expect(tipos[0].descricao).toContain('sem tipo → P1 (90843)');
    expect(tipos[0].uid).toBe(semNome.uid);
    // Nada de "alterada": as medidas não mudaram.
    expect(d.alteracoes.some((a) => a.tipo === 'ABERTURA_ALTERADA')).toBe(false);
  });
});
