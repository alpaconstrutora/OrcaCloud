/**
 * Dutos como trechos MECANICA (20/09/2026, backlog P2 — P2.2): o duto é um
 * `Trecho` da disciplina MECANICA (cota no forro, "bitola" = Ø equivalente); o
 * difusor/grelha é um `Terminal` com nome em texto e medidas 300 × 300; o
 * quantitativo soma por bitola e por terminal; o orçamento oferece
 * `COMPRIMENTO_DUTO`; o clash de instalação × estrutura vale para o duto.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, computeQuantities, conflitosDoModelo, emptyModel, modelFromCanonicalPayload, parseCanonicalPayload, point, POLITICA_PADRAO, snapshotHash, KERNEL_VERSION, type Command } from '../utils/blueprintKernel';
import { COTA_PADRAO_MM, COTA_TERMINAL_PADRAO_MM, BITOLA_PADRAO_MM, MEDIDAS_PADRAO_TERMINAL_MECANICO, NOME_DO_TRECHO, TIPOS_DE_TERMINAL_MECANICO } from '../utils/blueprintRede';
import { MEDIDAS, gerarLancamentos, type MapeamentoOrcamento, type MapeamentoResolvido } from '../utils/blueprintBudget';
import { SinapiType, type SinapiItem } from '../types/budget';

const CTX = { studyId: 'estudo-1', studyName: 'Casa', snapshotId: 'snap-1', snapshotHash: 'abcdef0123456789', revision: 1 };
const item = (code: string, unit: string): SinapiItem => ({ code, description: `Item ${code}`, unit, price: 10, type: SinapiType.COMPOSITION, category: 'Material' });
const mapa = (over: Partial<MapeamentoOrcamento>): MapeamentoOrcamento => ({ id: 'm1', organization_id: 'org', medida: 'AREA_PISO', item_code: '1', phase: 'Instalações', budget_group: 'Mecânica', agrupamento: 'TOTAL', filtro_ambiente: [], active: true, ...over });
const resolvido = (m: MapeamentoOrcamento, it: SinapiItem): MapeamentoResolvido[] => [{ mapeamento: m, item: it }];

function sala() {
  const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m0.levels[0].id;
  const m = applyBatch(m0, [
    // Duto de 4 m no forro (Ø 200) e um ramal de 2 m (Ø 150).
    { type: 'AddTrecho', levelId: t, disciplina: 'MECANICA', a: point(0, 0), b: point(4000, 0), cotaAMm: COTA_PADRAO_MM.MECANICA, cotaBMm: COTA_PADRAO_MM.MECANICA, bitolaMm: BITOLA_PADRAO_MM.MECANICA },
    { type: 'AddTrecho', levelId: t, disciplina: 'MECANICA', a: point(4000, 0), b: point(4000, 2000), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 150 },
    // Dois difusores e uma grelha.
    { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Difusor', at: point(1000, 0), cotaMm: COTA_TERMINAL_PADRAO_MM.MECANICA } as Command,
    { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Difusor', at: point(3000, 0), cotaMm: 2600 } as Command,
    { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Grelha de retorno', at: point(4000, 2000), cotaMm: 2600 } as Command,
    // Uma viga cruzando o duto principal na mesma altura: conflito de instalação × estrutura.
    { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [point(2000, -1000), point(2000, 1000)], larguraMm: 150, alturaMm: 400, baseMm: 2400 } as Command,
  ]).model;
  // O item do menu grava a medida num segundo comando (`AddTerminal` não a recebe) — como as caixas hidráulicas.
  const comMedida = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais![0].id, ...MEDIDAS_PADRAO_TERMINAL_MECANICO }).model;
  return { m: comMedida, t };
}

describe('dutos como trechos MECANICA (P2.2)', () => {
  it('o duto é um trecho MECANICA: padrões (forro 2600, Ø 200, "Duto"), canônico ida e volta, e o kernel não sobe de versão', () => {
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.55.0');
    expect(COTA_PADRAO_MM.MECANICA).toBe(2600);
    expect(BITOLA_PADRAO_MM.MECANICA).toBe(200);
    expect(COTA_TERMINAL_PADRAO_MM.MECANICA).toBe(2600);
    expect(NOME_DO_TRECHO.MECANICA).toBe('Duto');
    expect(TIPOS_DE_TERMINAL_MECANICO).toContain('Difusor');
    const { m } = sala();
    expect(m.trechos!.filter((x) => x.disciplina === 'MECANICA')).toHaveLength(2);
    const payload = canonicalPayload(m);
    expect((payload.match(/"disciplina":"MECANICA"/g) ?? []).length).toBe(5);
    const relido = modelFromCanonicalPayload(parseCanonicalPayload(payload));
    expect(snapshotHash(relido)).toBe(snapshotHash(m));
    // Terminal mecânico com medida declarada (o item do menu grava 300 × 300 × 50) e sem (marca de lugar).
    const [d1, d2] = m.terminais!;
    expect(d1.larguraMm).toBe(300);
    expect(d2.larguraMm ?? null).toBeNull();
  });

  it('quantitativo: comprimento por bitola da mecânica e contagem por terminal; orçamento oferece COMPRIMENTO_DUTO, uma linha por Ø', () => {
    const { m } = sala();
    const q = computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION);
    const mec = (q.totais.porBitola ?? []).filter((b) => b.disciplina === 'MECANICA');
    expect(mec.map((b) => [b.bitolaMm, Math.round(b.comprimentoM * 1000) / 1000])).toEqual(expect.arrayContaining([[200, 4], [150, 2]]));
    const terminais = (q.totais.porTerminal ?? []).filter((t) => t.disciplina === 'MECANICA');
    expect(terminais.reduce((s, t) => s + t.quantidade, 0)).toBe(3);
    expect(MEDIDAS.find((x) => x.id === 'COMPRIMENTO_DUTO')).toMatchObject({ escopo: 'INSTALACAO', dimensao: 'M' });
    const r = gerarLancamentos(q, resolvido(mapa({ medida: 'COMPRIMENTO_DUTO', agrupamento: 'POR_ELEMENTO' }), item('1', 'M')), CTX);
    expect(r.divergencias).toHaveLength(0);
    expect(r.entries).toHaveLength(2);
    const nomes = r.entries.map((e) => e.location?.room ?? e.description).join(' ');
    expect(nomes).toMatch(/Mecânica DN 200/);
    expect(r.entries.find((e) => /DN 200/.test(e.location?.room ?? ''))?.quantity).toBeCloseTo(4, 3);
    // Eletroduto e tubos não confundem com o duto.
    expect(gerarLancamentos(q, resolvido(mapa({ medida: 'COMPRIMENTO_ELETRODUTO' }), item('1', 'M')), CTX).entries).toHaveLength(0);
  });

  it('clash: o duto no forro que atravessa a viga entra em conflitos como as outras disciplinas', () => {
    const { m } = sala();
    const c = conflitosDoModelo(m);
    const doDuto = c.filter((x) => m.trechos!.find((t) => t.id === x.trechoId)?.disciplina === 'MECANICA');
    expect(doDuto).toHaveLength(1);
    expect(doDuto[0].classe).toBe('ESTRUTURA');
    expect(doDuto[0].comprimentoDentroMm).toBeGreaterThan(0);
  });
});
