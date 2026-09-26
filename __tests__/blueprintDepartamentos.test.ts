/**
 * DEPARTAMENTO DO AMBIENTE (21/09/2026, backlog P2 — P2.22, kernel 0.56.0):
 * o setor na etiqueta, normalizado e validado; canônico só quando presente;
 * quadro por setor com área útil e %; sugestão pelo nome/tipo, idempotente;
 * paleta "Colorir por" DEPARTAMENTO com legenda.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, emptyModel, KERNEL_VERSION, modelFromCanonicalPayload, parseCanonicalPayload, point, type Command } from '../utils/blueprintKernel';
import { corDoDepartamento, departamentosDoModelo, quadroDeDepartamentos, sugerirDepartamento, sugestoesDeDepartamento } from '../utils/blueprintDepartamentos';
import { coresDaVista } from '../utils/blueprintPaletas';

function casa() {
  const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const t = nivel.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  // Dois ambientes lado a lado: 4×3 (Sala) e 3×3 (Dormitório), separados por uma parede em x=4000.
  let m = applyBatch(nivel.model, [w(0, 0, 7000, 0), w(7000, 0, 7000, 3000), w(7000, 3000, 0, 3000), w(0, 3000, 0, 0), w(4000, 0, 4000, 3000)]).model;
  const esq = m.spaces.find((s) => s.ring.some((p) => p.x === 0))!;
  const dir = m.spaces.find((s) => s.id !== esq.id)!;
  m = applyCommand(m, { type: 'NameSpace', spaceId: esq.id, name: 'Sala' }).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: dir.id, name: 'Dormitório 1' }).model;
  return { m, t, sala: esq.id, dorm: dir.id };
}

describe('P2.22 · departamento na etiqueta', () => {
  it('grava normalizado, apaga com null/vazio, valida o limite e vai e volta no canônico só quando presente', () => {
    const { m, sala, dorm } = casa();
    const etiqueta = (mm: typeof m, spaceId: string) => mm.labels.find((l) => l.uid === mm.spaces.find((s) => s.id === spaceId)!.labelUid)!;
    // Normaliza: aparado e espaços colapsados.
    let m1 = applyCommand(m, { type: 'SetSpaceLabelProps', labelId: etiqueta(m, sala).id, departamento: '  Social   principal ' }).model;
    expect(etiqueta(m1, sala).departamento).toBe('Social principal');
    // Sem departamento no canônico de quem não declarou; presente em quem declarou.
    const payload = canonicalPayload(m1);
    const labelsCanon = parseCanonicalPayload(payload).labels;
    expect(labelsCanon.find((l) => l.name === 'Sala')?.departamento).toBe('Social principal');
    expect('departamento' in labelsCanon.find((l) => l.name === 'Dormitório 1')!).toBe(false);
    // Ida e volta.
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(JSON.parse(JSON.stringify(payload))));
    expect(volta.labels.find((l) => l.name === 'Sala')?.departamento).toBe('Social principal');
    expect(volta.labels.find((l) => l.name === 'Dormitório 1')?.departamento).toBeUndefined();
    // Vazio apaga; null apaga.
    m1 = applyCommand(m1, { type: 'SetSpaceLabelProps', labelId: etiqueta(m1, sala).id, departamento: '   ' }).model;
    expect(etiqueta(m1, sala).departamento).toBeUndefined();
    // NameSpace também aceita — e um ambiente sem etiqueta ganha uma com o departamento.
    const m2 = applyCommand(m, { type: 'NameSpace', spaceId: dorm, name: 'Dormitório 1', departamento: 'Íntimo' }).model;
    expect(etiqueta(m2, dorm).departamento).toBe('Íntimo');
    // Comprido demais é cortado no limite (40), não recusado.
    const m3 = applyCommand(m, { type: 'SetSpaceLabelProps', labelId: etiqueta(m, sala).id, departamento: 'x'.repeat(60) }).model;
    expect(etiqueta(m3, sala).departamento).toHaveLength(40);
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.59.0');
  });

  it('sugere pelo nome e pelo tipo, é idempotente, e o quadro soma área útil por setor com %', () => {
    const { m, t, sala, dorm } = casa();
    expect(sugerirDepartamento('Suíte master', null)).toBe('Íntimo');
    expect(sugerirDepartamento('Sala de estar', null)).toBe('Social');
    expect(sugerirDepartamento('Área de serviço', null)).toBe('Serviço');
    expect(sugerirDepartamento('Hall', null)).toBe('Circulação');
    expect(sugerirDepartamento('Casa de máquinas', null)).toBe('Técnico');
    expect(sugerirDepartamento('Ambiente 3', 'BANHEIRO')).toBe('Íntimo');
    expect(sugerirDepartamento('Ambiente 3', null)).toBeNull();

    const sug = sugestoesDeDepartamento(m, t);
    expect(sug.map((s) => [s.nome, s.departamento])).toEqual([
      ['Sala', 'Social'],
      ['Dormitório 1', 'Íntimo'],
    ]);
    const m1 = applyBatch(m, sug.map((s) => s.comando)).model;
    expect(sugestoesDeDepartamento(m1, t)).toEqual([]);
    expect(departamentosDoModelo(m1)).toEqual(['Íntimo', 'Social']);

    const quadro = quadroDeDepartamentos(m1, t);
    // Sala útil: (4000-150)×(3000-150) = 10,97 m²; Dormitório: (3000-150)×2850 = 8,12 m². Total 19,09.
    expect(quadro.map((l) => [l.departamento, l.ambientes, l.areaM2])).toEqual([
      ['Íntimo', 1, 8.12],
      ['Social', 1, 10.97],
    ]);
    expect(quadro.reduce((s, l) => s + l.pct, 0)).toBeCloseTo(100, 0);
    expect(quadro[0].cor).toBe('#bfdbfe');
    expect(quadro[1].cor).toBe('#fde68a');

    // Um setor fora da lista sugerida entra na paleta rotativa, estável por ordem alfabética.
    const m2 = applyCommand(m1, { type: 'SetSpaceLabelProps', labelId: m1.labels.find((l) => l.uid === m1.spaces.find((s) => s.id === sala)!.labelUid)!.id, departamento: 'Ateliê' }).model;
    expect(corDoDepartamento('Ateliê', departamentosDoModelo(m2))).toBe('#fecaca');
    const q2 = quadroDeDepartamentos(m2, t);
    expect(q2.map((l) => l.departamento)).toEqual(['Ateliê', 'Íntimo']);
    // Sem departamento vai por último.
    const m3 = applyCommand(m2, { type: 'SetSpaceLabelProps', labelId: m2.labels.find((l) => l.uid === m2.spaces.find((s) => s.id === dorm)!.labelUid)!.id, departamento: null }).model;
    expect(quadroDeDepartamentos(m3, t).map((l) => l.departamento)).toEqual(['Ateliê', null]);
  });

  it('"Colorir por" DEPARTAMENTO pinta pelo setor e a legenda conta', () => {
    const { m, t, sala } = casa();
    const m1 = applyBatch(m, sugestoesDeDepartamento(m, t).map((s) => s.comando)).model;
    const cores = coresDaVista(m1, 'DEPARTAMENTO', t);
    expect(cores.porAmbiente.get(sala)).toBe('#fde68a');
    expect(cores.legenda.map((l) => [l.rotulo, l.quantidade])).toEqual([
      ['Íntimo', 1],
      ['Social', 1],
    ]);
    const semNada = coresDaVista(m, 'DEPARTAMENTO', t);
    expect(semNada.legenda.map((l) => l.rotulo)).toEqual(['Sem departamento']);
  });
});
