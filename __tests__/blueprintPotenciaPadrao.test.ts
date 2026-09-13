/**
 * A potência da norma já preenchida ao criar o ponto (13/09/2026) — "se o
 * usuário quiser alterar, ele altera". E o LEGADO: "verifique por que alguns
 * pontos não têm potência" — eram pontos anteriores ao padrão; agora se
 * preenchem pelo mesmo critério, sem sobrescrever nada.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import {
  aplicarPotenciaPadrao,
  comandosDePotenciaPadrao,
  contextoDoAmbiente,
  pontosSemPotencia,
  potenciaPadraoVA,
} from '../utils/blueprintPotenciaPadrao';

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

type Tipo = 'TUG' | 'TUE' | 'ILUMINACAO_TETO' | 'ILUMINACAO_PAREDE' | 'INTERRUPTOR';
const add = (t: string, x: number, y: number, tipoEletrico: Tipo, potenciaW?: number): Command => ({
  type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(x, y), cotaMm: 300, tipoEletrico, ...(potenciaW != null ? { potenciaW } : {}),
});
const potencias = (cmds: Command[]) => cmds.map((c) => (c.type === 'AddTerminal' ? (c.potenciaW ?? null) : 'x'));

describe('potenciaPadraoVA — a regra', () => {
  it('tomada: 100 VA; em banheiro/cozinha 600 VA até haver 3 de 600 (2, se o conjunto passa de seis)', () => {
    const cozinha = { tipo: 'COZINHA_SERVICO' as const, areaM2: 10, tomadasDe600Ja: 0, luzDeclaradaVA: 0 };
    expect(potenciaPadraoVA('TUG', cozinha)).toBe(600);
    expect(potenciaPadraoVA('TUE', { ...cozinha, tomadasDe600Ja: 2 })).toBe(600);
    expect(potenciaPadraoVA('TUG', { ...cozinha, tomadasDe600Ja: 3 })).toBe(100);
    expect(potenciaPadraoVA('TUG', { ...cozinha, tomadasDe600Ja: 2 }, true)).toBe(100);
    expect(potenciaPadraoVA('TUG', { tipo: 'SALA_DORMITORIO', areaM2: 20, tomadasDe600Ja: 0, luzDeclaradaVA: 0 })).toBe(100);
    expect(potenciaPadraoVA('TUG', null)).toBe(100); // fora de ambiente: o mínimo genérico
  });

  it('luz: o mínimo da área menos o já declarado, nunca abaixo de 100 VA (12 m² → 160; com 160 já declarados → 100)', () => {
    const sala = { tipo: 'SALA_DORMITORIO' as const, areaM2: 12, tomadasDe600Ja: 0, luzDeclaradaVA: 0 };
    expect(potenciaPadraoVA('ILUMINACAO_TETO', sala)).toBe(160);
    expect(potenciaPadraoVA('ILUMINACAO_PAREDE', { ...sala, luzDeclaradaVA: 160 })).toBe(100);
    expect(potenciaPadraoVA('ILUMINACAO_TETO', { ...sala, luzDeclaradaVA: 60 })).toBe(100);
    expect(potenciaPadraoVA('ILUMINACAO_TETO', null)).toBe(100);
  });

  it('interruptor, dados e ligação direta: sem padrão — é função do equipamento', () => {
    const ctx = { tipo: 'BANHEIRO' as const, areaM2: 3, tomadasDe600Ja: 0, luzDeclaradaVA: 0 };
    expect(potenciaPadraoVA('INTERRUPTOR', ctx)).toBeNull();
    expect(potenciaPadraoVA('DADOS_TV', ctx)).toBeNull();
    expect(potenciaPadraoVA('LIGACAO_DIRETA', ctx)).toBeNull();
    expect(potenciaPadraoVA(null, ctx)).toBeNull();
  });
});

describe('aplicarPotenciaPadrao — o lote', () => {
  it('"distribuir 4" na cozinha dá 600, 600, 600, 100; a 5ª vinda depois dá 100', () => {
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

  it('na sala: tomada 100; luz de teto o mínimo da área; segunda luz 100; interruptor sem potência', () => {
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

describe('comandosDePotenciaPadrao — o legado', () => {
  it('cozinha antiga com 6 tomadas sem potência: as três primeiras viram 600, as outras 100; a luz sem potência leva o mínimo', () => {
    const { m, t } = casa();
    // Criadas SEM potência — como todo ponto anterior a 13/09/2026.
    const legado = applyBatch(m, [
      add(t, 500, 200, 'TUG'), add(t, 1500, 200, 'TUG'), add(t, 2500, 200, 'TUG'),
      add(t, 500, 3800, 'TUG'), add(t, 1500, 3800, 'TUG'), add(t, 2500, 3800, 'TUG'),
      add(t, 1500, 2000, 'ILUMINACAO_TETO'),
      add(t, 200, 200, 'INTERRUPTOR'),
    ]).model;
    expect(pontosSemPotencia(legado, t)).toHaveLength(7); // o interruptor não entra
    const cmds = comandosDePotenciaPadrao(legado, t);
    // A luz leva o mínimo do cômodo: a cozinha tem ~11 m² úteis → 100 + 60 × 1 = 160 VA.
    expect(cmds.map((c) => (c.type === 'SetTerminalProps' ? c.potenciaW : 'x'))).toEqual([600, 600, 600, 100, 100, 100, 160]);
    const depois = applyBatch(legado, cmds).model;
    expect(pontosSemPotencia(depois, t)).toHaveLength(0);
    expect(comandosDePotenciaPadrao(depois, t)).toEqual([]); // idempotente
  });

  it('respeita o que já tem 600: com uma de 600 declarada, só mais duas viram 600', () => {
    const { m, t } = casa();
    const legado = applyBatch(m, [
      add(t, 500, 200, 'TUG', 600),
      add(t, 1500, 200, 'TUG'), add(t, 2500, 200, 'TUG'), add(t, 500, 3800, 'TUG'),
    ]).model;
    expect(comandosDePotenciaPadrao(legado, t).map((c) => (c.type === 'SetTerminalProps' ? c.potenciaW : 'x'))).toEqual([600, 600, 100]);
  });
});
