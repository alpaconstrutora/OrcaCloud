/**
 * A potência da norma já preenchida ao criar o ponto (13/09/2026) — "se o
 * usuário quiser alterar, ele altera".
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { aplicarPotenciaPadrao, contextoDoAmbiente, potenciaPadraoVA } from '../utils/blueprintPotenciaPadrao';

/** Cozinha 3 × 4 (0–3000) e sala 6 × 4 (3000–9000), com tipos. */
function casa() {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  let m = applyBatch(base, [w(0, 0, 9000, 0), w(9000, 0, 9000, 4000), w(9000, 4000, 0, 4000), w(0, 4000, 0, 0), w(3000, 0, 3000, 4000)]).model;
  const cozinha = m.spaces.find((s) => s.ring.some((p) => p.x === 0))!;
  const sala = m.spaces.find((s) => s.id !== cozinha.id)!;
  m = applyCommand(m, { type: 'NameSpace', spaceId: cozinha.id, name: 'Cozinha', tipoDeAmbiente: 'COZINHA_SERVICO' }).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: sala.id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' }).model;
  return { m, t };
}

const add = (t: string, x: number, y: number, tipoEletrico: Command extends { tipoEletrico?: infer T } ? T : never, potenciaW?: number): Command => ({
  type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: String(tipoEletrico), at: point(x, y), cotaMm: 300, tipoEletrico, ...(potenciaW != null ? { potenciaW } : {}),
});
const potencias = (cmds: Command[]) => cmds.map((c) => (c.type === 'AddTerminal' ? (c.potenciaW ?? null) : 'x'));

describe('potenciaPadraoVA — a regra', () => {
  it('tomada: 100 VA; em banheiro/cozinha 600 VA até a 3ª (ou 2ª, se o conjunto passa de seis)', () => {
    const cozinha = { tipo: 'COZINHA_SERVICO' as const, areaM2: 10, tomadasJa: 0, luzesJa: 0 };
    expect(potenciaPadraoVA('TUG', cozinha)).toBe(600);
    expect(potenciaPadraoVA('TUE', { ...cozinha, tomadasJa: 2 })).toBe(600);
    expect(potenciaPadraoVA('TUG', { ...cozinha, tomadasJa: 3 })).toBe(100);
    expect(potenciaPadraoVA('TUG', { ...cozinha, tomadasJa: 2 }, true)).toBe(100);
    expect(potenciaPadraoVA('TUG', { tipo: 'SALA_DORMITORIO', areaM2: 20, tomadasJa: 0, luzesJa: 0 })).toBe(100);
    expect(potenciaPadraoVA('TUG', null)).toBe(100); // fora de ambiente: o mínimo genérico
  });

  it('luz: a primeira do cômodo leva o mínimo da área (12 m² → 160 VA); as demais 100 VA; sem contexto 100 VA', () => {
    const sala = { tipo: 'SALA_DORMITORIO' as const, areaM2: 12, tomadasJa: 0, luzesJa: 0 };
    expect(potenciaPadraoVA('ILUMINACAO_TETO', sala)).toBe(160);
    expect(potenciaPadraoVA('ILUMINACAO_PAREDE', { ...sala, luzesJa: 1 })).toBe(100);
    expect(potenciaPadraoVA('ILUMINACAO_TETO', null)).toBe(100);
  });

  it('interruptor, dados e ligação direta: sem padrão — é função do equipamento', () => {
    const ctx = { tipo: 'BANHEIRO' as const, areaM2: 3, tomadasJa: 0, luzesJa: 0 };
    expect(potenciaPadraoVA('INTERRUPTOR', ctx)).toBeNull();
    expect(potenciaPadraoVA('DADOS_TV', ctx)).toBeNull();
    expect(potenciaPadraoVA('LIGACAO_DIRETA', ctx)).toBeNull();
    expect(potenciaPadraoVA(null, ctx)).toBeNull();
  });
});

describe('aplicarPotenciaPadrao — o lote', () => {
  it('"distribuir 4" na cozinha dá 600, 600, 600, 100; a 5ª vinda depois (já existem 4) dá 100', () => {
    const { m, t } = casa();
    const lote = aplicarPotenciaPadrao(m, [
      add(t, 500, 200, 'TUG'),
      add(t, 1500, 200, 'TUG'),
      add(t, 2500, 200, 'TUG'),
      add(t, 500, 3800, 'TUG'),
    ]);
    expect(potencias(lote)).toEqual([600, 600, 600, 100]);
    const depois = applyBatch(m, lote).model;
    expect(potencias(aplicarPotenciaPadrao(depois, [add(t, 1500, 3800, 'TUG')]))).toEqual([100]);
  });

  it('na sala: tomada 100; luz de teto 160 (área ~22 m² útil → 100 + 60 × 4); segunda luz 100; interruptor sem potência', () => {
    const { m, t } = casa();
    const ctx = contextoDoAmbiente(m, t, point(6000, 2000));
    expect(ctx?.tipo).toBe('SALA_DORMITORIO');
    const lote = aplicarPotenciaPadrao(m, [
      add(t, 6000, 200, 'TUG'),
      add(t, 6000, 2000, 'ILUMINACAO_TETO'),
      add(t, 8000, 2000, 'ILUMINACAO_TETO'),
      add(t, 3200, 200, 'INTERRUPTOR'),
    ]);
    const esperadoLuz = 100 + 60 * Math.floor((ctx!.areaM2 - 6) / 4);
    expect(potencias(lote)).toEqual([100, esperadoLuz, 100, null]);
  });

  it('o que já vem com potência passa intacto; ponto fora de ambiente recebe o mínimo genérico', () => {
    const { m, t } = casa();
    const lote = aplicarPotenciaPadrao(m, [add(t, 500, 200, 'TUG', 1500), add(t, 20000, 20000, 'TUG')]);
    expect(potencias(lote)).toEqual([1500, 100]);
  });
});
