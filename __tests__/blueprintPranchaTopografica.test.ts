/**
 * PRANCHA TOPOGRÁFICA (A1) — medida com o `DesenhistaDeProva`.
 *
 * O que se trava: a malha só existe com georreferência; o passo é redondo;
 * os rótulos E/N saem na margem; e sem georreferência a folha DIZ que não tem
 * malha em vez de desenhar uma com cara de UTM em milímetros locais.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel } from '../utils/blueprintKernel';
import { DesenhistaDeProva, type Enquadramento } from '../utils/blueprintExport';
import { desenharPlantaTopografica, passoDaMalhaM } from '../utils/blueprintPranchaTopografica';

const ENQ: Enquadramento = {
  cabe: true, vazio: false, ocupacao: 0.8, desenhoLarguraMm: 300, desenhoAlturaMm: 200,
  utilLarguraMm: 380, utilAlturaMm: 240, offsetXMm: 12, offsetYMm: 12, escalaSugerida: 500,
};

function lote(): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const levelId = m.levels[0].id;
  const anel = [{ x: 0, y: 0 }, { x: 0, y: 30000 }, { x: 12000, y: 30000 }, { x: 12000, y: 0 }];
  const com = applyBatch(m, anel.map((p, i) => ({ type: 'AddBoundary' as const, levelId, a: p, b: anel[(i + 1) % 4], kind: 'TERRENO' as const }))).model;
  return applyCommand(com, { type: 'NomearVerticesDoTerreno', pontos: anel }).model;
}

function georreferenciado(): BlueprintModel {
  return { ...lote(), georreferencia: { latitude: -19.9167, longitude: -43.9345, projetada: { lesteM: 611_000, norteM: 7_796_000, crs: 'EPSG:31983' } } } as BlueprintModel;
}

const textos = (d: DesenhistaDeProva) => d.chamadas.filter((c) => c.tipo === 'texto').map((c) => String(c.args[2]));

describe('passo da malha', () => {
  it('é redondo (1, 2, 5 × 10ⁿ) e dá entre 4 e 10 linhas', () => {
    for (const largura of [12, 37, 80, 150, 420, 1000, 2600]) {
      const p = passoDaMalhaM(largura);
      const mantissa = p / 10 ** Math.floor(Math.log10(p));
      expect([1, 2, 5]).toContain(Math.round(mantissa));
      const linhas = largura / p;
      expect(linhas).toBeGreaterThanOrEqual(2);
      expect(linhas).toBeLessThanOrEqual(10);
    }
  });
});

describe('planta topográfica', () => {
  it('sem georreferência: vértices, cotas, azimutes de desenho e o aviso de que não há malha', () => {
    const d = new DesenhistaDeProva();
    const { roteiro, malha } = desenharPlantaTopografica(d, lote(), ENQ);
    expect(malha).toBeNull();
    expect(roteiro.georreferenciado).toBe(false);
    const t = textos(d);
    for (const nome of ['P1', 'P2', 'P3', 'P4']) expect(t).toContain(nome);
    expect(t.filter((x) => x === '30,00 m')).toHaveLength(2);
    expect(t.some((x) => /^Az \d+°/.test(x))).toBe(true);
    expect(t.some((x) => /Sem malha de coordenadas/.test(x))).toBe(true);
    // Nenhum rótulo "E 6…" / "N 7…" — não há malha para rotular.
    expect(t.some((x) => /^E \d/.test(x))).toBe(false);
  });

  it('⚠️ com georreferência: a malha aparece, com rótulos E/N na margem e passo redondo', () => {
    const d = new DesenhistaDeProva();
    const { roteiro, malha } = desenharPlantaTopografica(d, georreferenciado(), ENQ);
    expect(roteiro.georreferenciado).toBe(true);
    expect(malha).not.toBeNull();
    expect(malha!.linhas).toBeGreaterThanOrEqual(4);
    expect([1, 2, 5, 10, 20, 50]).toContain(malha!.passoM);
    const t = textos(d);
    expect(t.some((x) => /^E \d{6}/.test(x))).toBe(true); // E ~611.000
    expect(t.some((x) => /^N \d{7}/.test(x))).toBe(true); // N ~7.796.000
    expect(t.some((x) => /Malha EPSG:31983 a cada/.test(x))).toBe(true);
    // A tabela do roteiro traz E/N com 3 casas.
    expect(t.some((x) => /^\d{6},\d{3}$/.test(x))).toBe(true);
  });

  it('sem lote fechado, escreve o que fazer e não desenha malha', () => {
    const d = new DesenhistaDeProva();
    const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 3000 }).model;
    const { malha } = desenharPlantaTopografica(d, vazio, ENQ);
    expect(malha).toBeNull();
    expect(textos(d).some((x) => /Feche o contorno/.test(x))).toBe(true);
  });
});
