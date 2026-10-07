/**
 * CLIMATIZAÇÃO E0.4 — trilhos (04/10/2026): os quatro defeitos que o benchmark
 * achou no código de 20/09 (achados 9–12 do roadmap), cada um com o teste que
 * reproduzia o erro antes da correção.
 */
import { describe, expect, it } from 'vitest';
import { POLITICA_PADRAO, applyBatch, applyCommand, computeQuantities, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { COBERTURA_IFC, gerarIfc } from '../utils/blueprintIfc';
import { MEDIDAS, gerarLancamentos, type MapeamentoOrcamento, type MapeamentoResolvido } from '../utils/blueprintBudget';
import { SinapiType, type SinapiItem } from '../types/budget';

const CTX = { studyId: 'estudo-1', studyName: 'Casa', snapshotId: 'snap-1', snapshotHash: 'abcdef0123456789', revision: 1 };
const item = (code: string, unit: string): SinapiItem => ({ code, description: `Item ${code}`, unit, price: 10, type: SinapiType.COMPOSITION, category: 'Material' });
const mapa = (over: Partial<MapeamentoOrcamento>): MapeamentoOrcamento => ({ id: 'm1', organization_id: 'org', medida: 'AREA_PISO', item_code: '1', phase: 'Instalações', budget_group: 'Mecânica', agrupamento: 'POR_ELEMENTO', filtro_ambiente: [], active: true, ...over });
const resolvido = (m: MapeamentoOrcamento, it: SinapiItem): MapeamentoResolvido[] => [{ mapeamento: m, item: it }];

/** Térreo com um duto, um difusor, um ponto de água (para a medida hidráulica ter o que contar) e um split. */
function cena() {
  const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m0.levels[0].id;
  const m = applyBatch(m0, [
    { type: 'AddTrecho', levelId: t, disciplina: 'MECANICA', a: point(0, 0), b: point(4000, 0), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 200 },
    { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Difusor', at: point(1000, 0), cotaMm: 2600 } as Command,
    { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Grelha de retorno', at: point(3000, 0), cotaMm: 2600 } as Command,
    { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Lavatório', tipoHidraulico: 'LAVATORIO', at: point(2000, 2000), cotaMm: 600 } as Command,
    { type: 'AddComponente', levelId: t, tipoId: 'EVAPORADORA', at: point(1000, 3800) },
    { type: 'AddComponente', levelId: t, tipoId: 'CONDENSADORA', at: point(5000, 3000) },
    { type: 'AddConjunto', levelId: t, tipoId: 'CONJUNTO_BANHEIRO', at: point(2000, 2000) },
  ]).model;
  return { m, t };
}

describe('achado 9 — a cobertura do IFC não mente sobre a climatização', () => {
  it('diz o que CONTÉM (duto, linha, dreno, equipamentos, Pset) e o que não contém (gás, a memória da carga)', () => {
    const texto = COBERTURA_IFC.join(' ');
    expect(texto).not.toMatch(/NÃO CONTÉM ar-condicionado/);
    // ⚠️ E10.1 (07/10/2026): "NÃO CONTÉM linha frigorígena, dreno, duto retangular…" era FALSO desde a E3/E7.
    expect(texto).not.toMatch(/NÃO CONTÉM linha frigorígena/);
    expect(texto).toMatch(/CONTÉM a climatização desenhada/);
    expect(texto).toMatch(/IfcDuctSegment .RIGIDSEGMENT. no sistema .AIRCONDITIONING./);
    expect(texto).toMatch(/LINHA FRIGORÍGENA como IfcPipeSegment no sistema .REFRIGERATION. com DOIS sólidos/);
    expect(texto).toMatch(/IfcDuctFitting/);
    expect(texto).toMatch(/Pset_OpuraClimatizacao/);
    expect(texto).toMatch(/NÃO CONTÉM gás/);
  });
});

describe('achado 11 — o sistema do duto tem tipo no IFC', () => {
  it('IfcDistributionSystem da MECANICA sai .AIRCONDITIONING., não `$`', () => {
    const { m } = cena();
    const ifc = gerarIfc(m, { titulo: 'Clima', revisao: 1, hash: 'a'.repeat(64), data: new Date('2026-10-04T12:00:00Z') });
    const sistemas = ifc.match(/IFCDISTRIBUTIONSYSTEM\([^\n]*\)/g) ?? [];
    const mecanica = sistemas.find((s) => s.includes("'MECANICA'"));
    expect(mecanica, 'o duto forma um sistema').toBeTruthy();
    expect(mecanica).toMatch(/\.AIRCONDITIONING\.\)$/);
    expect(mecanica).not.toMatch(/,\$\)$/);
  });
});

describe('achado 10 — o difusor não é "ponto hidráulico" no orçamento', () => {
  it('CONTAGEM_PONTOS_HIDRAULICOS conta só as redes hidráulicas; CONTAGEM_TERMINAIS_DE_AR conta difusor e grelha pelo nome', () => {
    const { m } = cena();
    const q = computeQuantities(m, POLITICA_PADRAO);
    expect(MEDIDAS.find((x) => x.id === 'CONTAGEM_TERMINAIS_DE_AR')).toMatchObject({ escopo: 'INSTALACAO', dimensao: 'UN' });

    // O rótulo da linha mora em `location.room` (como no teste das medidas de instalação).
    const rotulos = (r: ReturnType<typeof gerarLancamentos>) => r.entries.map((e) => e.location?.room ?? e.description).join(' | ');
    const hidro = gerarLancamentos(q, resolvido(mapa({ medida: 'CONTAGEM_PONTOS_HIDRAULICOS' }), item('1', 'UN')), CTX);
    expect(rotulos(hidro)).toMatch(/Lavatório/);
    expect(rotulos(hidro)).not.toMatch(/Difusor|Grelha/);

    const ar = gerarLancamentos(q, resolvido(mapa({ medida: 'CONTAGEM_TERMINAIS_DE_AR' }), item('2', 'UN')), CTX);
    const descricoes = rotulos(ar);
    expect(descricoes).toMatch(/Difusor/);
    expect(descricoes).toMatch(/Grelha de retorno/);
    expect(descricoes).not.toMatch(/Lavatório/);
    expect(ar.entries.reduce((s, e) => s + e.quantity, 0)).toBe(2);
  });
});

describe('achado 12 — DuplicateLevel leva os componentes', () => {
  it('o pavimento copiado tem os mesmos componentes, com uid novo, e o filho do conjunto aponta para a CÓPIA do pai', () => {
    const { m, t } = cena();
    const antes = (m.componentes ?? []).filter((c) => c.levelId === t);
    expect(antes.length).toBeGreaterThanOrEqual(6); // split (2) + conjunto do banheiro (pai + 3 filhos)
    const r = applyCommand(m, { type: 'DuplicateLevel', levelId: t, novoNome: '1º andar', elevationMm: 2900 });
    const novo = r.model.levels.find((l) => l.name === '1º andar')!;
    const depois = (r.model.componentes ?? []).filter((c) => c.levelId === novo.id);
    expect(depois.map((c) => c.tipoId).sort()).toEqual(antes.map((c) => c.tipoId).sort());
    // Identidade: nenhum uid repetido entre original e cópia.
    const uids = new Set((r.model.componentes ?? []).map((c) => c.uid));
    expect(uids.size).toBe((r.model.componentes ?? []).length);
    // O conjunto continua inteiro no andar de cima: os filhos apontam para o pai COPIADO.
    const paiCopiado = depois.find((c) => c.tipoId === 'CONJUNTO_BANHEIRO')!;
    const filhos = depois.filter((c) => c.paiUid);
    expect(filhos.length).toBe(3);
    for (const f of filhos) expect(f.paiUid).toBe(paiCopiado.uid);
    // A cota da evaporadora (2200) e o giro vêm junto; o original não mudou.
    expect(depois.find((c) => c.tipoId === 'EVAPORADORA')?.cotaMm).toBe(2200);
    expect((r.model.componentes ?? []).filter((c) => c.levelId === t)).toEqual(antes);
  });
});
