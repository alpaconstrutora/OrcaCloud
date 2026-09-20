/**
 * Vagas em espinha de peixe (45°) e em fila (20/09/2026, backlog P2 — P2.7):
 * a geometria de cada arranjo, o plano com giro e passo certos, sem
 * sobreposição entre vagas, e o padrão (de ré) intacto para o estado persistido
 * antigo sem `arranjo`.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, contornoDaVaga, emptyModel, point, polygonArea, recorteComum, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { FOLGA_DA_FILA_MM, geometriaDoArranjo, HIPOTESES_VAGAS_PADRAO, planejarVagas, type HipotesesDeVagas } from '../utils/blueprintVagasAutomaticas';

function garagem(): { m: BlueprintModel; t: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Subsolo', elevationMm: -2800, defaultHeightMm: 2600 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 200, heightMm: 2600 });
  m = applyBatch(m, [w(0, 0, 30000, 0), w(30000, 0, 30000, 16000), w(30000, 16000, 0, 16000), w(0, 16000, 0, 0)]).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Garagem' }).model;
  return { m, t };
}

const semSobreposicao = (vagas: { at: { x: number; y: number }; larguraMm: number; comprimentoMm: number; rotacaoGraus: number }[]) => {
  for (let i = 0; i < vagas.length; i++) for (let j = i + 1; j < vagas.length; j++) {
    const a = Math.abs(polygonArea(recorteComum(contornoDaVaga(vagas[i]), contornoDaVaga(vagas[j]))));
    if (a > 1000) return false; // 1 000 mm² = 3 cm × 3 cm de tolerância de arredondamento
  }
  return true;
};

describe('arranjos de vagas (P2.7)', () => {
  it('geometria: de ré (c × l, giro 0), espinha ((l+c)·sen45 × l/sen45, 45°/135°), fila (l × c+1,00 m, 90°); ausente = de ré', () => {
    const dere = geometriaDoArranjo({});
    expect([dere.profundidadeMm(2500, 5000), dere.passoMm(2500, 5000), dere.giroGraus(1), dere.giroGraus(-1)]).toEqual([5000, 2500, 0, 0]);
    const esp = geometriaDoArranjo({ arranjo: 'ESPINHA_45' });
    expect(esp.profundidadeMm(2500, 5000)).toBe(5303);
    expect(esp.passoMm(2500, 5000)).toBe(3536);
    expect([esp.giroGraus(1), esp.giroGraus(-1)]).toEqual([45, 135]);
    const fila = geometriaDoArranjo({ arranjo: 'PARALELA' });
    expect([fila.profundidadeMm(2500, 5000), fila.passoMm(2500, 5000), fila.giroGraus(1)]).toEqual([2500, 5000 + FOLGA_DA_FILA_MM, 90]);
  });

  it('espinha de peixe: vagas a 45°/135° por banda, sem se sobrepor, com circulação de 3,50 m; cabem menos que de ré por metro, mais bandas por profundidade', () => {
    const { m, t } = garagem();
    const dere = planejarVagas(m, t, HIPOTESES_VAGAS_PADRAO);
    const hip: HipotesesDeVagas = { ...HIPOTESES_VAGAS_PADRAO, arranjo: 'ESPINHA_45', circulacaoMm: 3500 };
    const esp = planejarVagas(m, t, hip);
    expect(esp.motivo).toBeNull();
    expect(esp.vagas.length).toBeGreaterThan(10);
    const giros = new Set(esp.vagas.map((v) => v.rotacaoGraus));
    expect([...giros].sort()).toEqual([135, 45]);
    expect(semSobreposicao(esp.vagas)).toBe(true);
    expect(semSobreposicao(dere.vagas)).toBe(true);
    // Toda vaga dentro da garagem (o anel corre no eixo das paredes; folga da meia espessura + recuo).
    for (const v of esp.vagas) for (const p of contornoDaVaga(v)) { expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(30000); expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(16000); }
    // O plano grava o giro de cada vaga no comando.
    const adds = esp.comandos.filter((c) => c.type === 'AddVaga') as { rotacaoGraus: number }[];
    expect(adds.every((c) => c.rotacaoGraus === 45 || c.rotacaoGraus === 135)).toBe(true);
  });

  it('em fila: vagas deitadas (90°) com 1,00 m de manobra entre elas, banda rasa (2,50 m) e sem sobreposição', () => {
    const { m, t } = garagem();
    const fila = planejarVagas(m, t, { ...HIPOTESES_VAGAS_PADRAO, arranjo: 'PARALELA', circulacaoMm: 3500 });
    expect(fila.motivo).toBeNull();
    expect(fila.vagas.every((v) => v.rotacaoGraus === 90)).toBe(true);
    expect(semSobreposicao(fila.vagas)).toBe(true);
    // Duas vagas consecutivas na mesma banda distam c + folga no eixo da fileira (X).
    // A PCD (mais funda) se ancora fora da linha das comuns; a fileira se lê pelas comuns.
    const comuns = fila.vagas.filter((v) => v.tipo === 'COMUM');
    const primeiraBanda = comuns.filter((v) => v.at.y === comuns[0].at.y).sort((a, b) => a.at.x - b.at.x);
    expect(primeiraBanda.length).toBeGreaterThanOrEqual(2);
    expect(primeiraBanda[1].at.x - primeiraBanda[0].at.x).toBe(5000 + FOLGA_DA_FILA_MM);
    // Mais bandas que de ré: a banda tem 2,50 m em vez de 5,00 m.
    const bandasFila = new Set(fila.vagas.map((v) => v.at.y)).size;
    const bandasDere = new Set(planejarVagas(m, t, HIPOTESES_VAGAS_PADRAO).vagas.map((v) => v.at.y)).size;
    expect(bandasFila).toBeGreaterThan(bandasDere);
  });
});
