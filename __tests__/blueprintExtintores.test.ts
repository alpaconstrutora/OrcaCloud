/**
 * INCÊNDIO E7.1 (01/10/2026): o extintor no kernel (0.85.0) e a regra —
 * classes por ambiente, distância a percorrer pelo risco (CONFERIR NA IT),
 * capacidade mínima, pavimento sem extintor, e a proposta que cobre o resto.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, capacidadeExtintoraValida, emptyModel, modelFromCanonicalPayload, parseCanonicalPayload, point, pointInPolygon, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_EXTINTORES_PADRAO as HE, analisarExtintores, classesDoAmbiente, lerCapacidade, proporExtintores } from '../utils/blueprintExtintores';

/**
 * Corredor de 60 × 2 m (y 0–2) com 10 salas de 6 × 6 m em cima, porta de cada
 * sala para o corredor. A sala 1 se chama "Cozinha"; a sala 10, "Casa de
 * máquinas".
 */
function andar(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command;
  const cmds: Command[] = [w(0, 0, 60000, 0), w(60000, 0, 60000, 8000), w(60000, 8000, 0, 8000), w(0, 8000, 0, 0)];
  for (let k = 0; k < 10; k++) cmds.push(w(k * 6000, 2000, (k + 1) * 6000, 2000));
  for (let k = 1; k < 10; k++) cmds.push(w(k * 6000, 2000, k * 6000, 8000));
  m = applyBatch(m, cmds).model;
  m = applyBatch(m, m.walls.filter((x) => x.a.y === 2000 && x.b.y === 2000).map((x) => ({ type: 'AddOpening', wallId: x.id, kind: 'door', offsetMm: 2500, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command)).model;
  return applyBatch(
    m,
    m.spaces.map((s) => {
      const x = Math.min(...s.ring.map((p) => p.x));
      const corredor = s.ring.every((p) => p.y <= 2000);
      const k = Math.round(x / 6000) + 1;
      return { type: 'NameSpace', spaceId: s.id, name: corredor ? 'Corredor' : k === 1 ? 'Cozinha' : k === 10 ? 'Casa de máquinas' : `Sala ${k}` } as Command;
    }),
  ).model;
}
const ext = (m: BlueprintModel, x: number, y: number, extra: Record<string, unknown> = {}) =>
  applyCommand(m, { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'INCENDIO', tipo: 'EXTINTOR', tipoHidraulico: 'EXTINTOR', at: point(x, y), cotaMm: 1600, ...extra } as Command).model;

describe('E7.1 · o kernel (0.85.0)', () => {
  it('a capacidade extintora: A, B, C na ordem, cada uma uma vez', () => {
    for (const s of ['2-A:20-B:C', '20-B:C', '2-A', '4-A:80-B']) expect(capacidadeExtintoraValida(s)).toBe(true);
    for (const s of ['', 'C:2-A', '2-A:2-A', 'A', '2A', '2-A::C']) expect(capacidadeExtintoraValida(s)).toBe(false);
  });

  it('agente, carga e capacidade só no extintor; a capacidade vai maiúscula; trocar de tipo leva os três', () => {
    let m = ext(andar(), 3000, 1000, { agenteExtintor: 'PQS_ABC', cargaExtintorKg: 4, capacidadeExtintora: '2-a:20-b:c' });
    const t = m.terminais![0];
    expect(t).toMatchObject({ agenteExtintor: 'PQS_ABC', cargaExtintorKg: 4, capacidadeExtintora: '2-A:20-B:C' });
    expect(() => applyCommand(m, { type: 'SetTerminalProps', terminalId: t.id, capacidadeExtintora: 'X' } as Command)).toThrow(/Capacidade extintora inválida/);
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: t.id, tipoHidraulico: 'HIDRANTE_SIMPLES' } as Command).model;
    expect(m.terminais![0]).toMatchObject({ agenteExtintor: null, cargaExtintorKg: null, capacidadeExtintora: null });
  });

  it('ida e volta pelo canônico preserva o extintor; sem agente, as chaves nem aparecem', () => {
    const sem = ext(andar(), 3000, 1000);
    expect(canonicalPayload(sem)).not.toMatch(/agenteExtintor|cargaExtintorKg|capacidadeExtintora/);
    const m = ext(andar(), 3000, 1000, { agenteExtintor: 'CO2', cargaExtintorKg: 6, capacidadeExtintora: '5-B:C' });
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    expect(volta.terminais![0]).toMatchObject({ agenteExtintor: 'CO2', cargaExtintorKg: 6, capacidadeExtintora: '5-B:C' });
    expect(canonicalPayload(volta)).toBe(canonicalPayload(m));
  });
});

describe('E7.1 · a regra', () => {
  it('as classes: A sempre; cozinha pede B; casa de máquinas pede C', () => {
    const m = andar();
    const pelo = (n: string) => classesDoAmbiente(m, m.spaces.find((s) => s.name === n)!).classes;
    expect(pelo('Sala 5')).toEqual(['A']);
    expect(pelo('Cozinha')).toEqual(['A', 'B']);
    expect(pelo('Casa de máquinas')).toEqual(['A', 'C']);
    expect(lerCapacidade('2-A:20-B:C')).toEqual({ A: 2, B: 20, C: true });
  });

  it('⚠️ PRONTO QUANDO: um extintor ABC na ponta do corredor cobre as salas perto (risco médio, 20 m) e a do fundo vira FALTA com a distância', () => {
    const m = ext(andar(), 1000, 1000, { agenteExtintor: 'PQS_ABC', cargaExtintorKg: 4, capacidadeExtintora: '3-A:40-B:C' });
    const a = analisarExtintores(m, 'MEDIA', HE);
    expect(a.distanciaMaximaM).toBe(20);
    const amb = (n: string) => a.ambientes.find((x) => x.rotulo === n)!;
    expect(amb('Cozinha').atende).toBe(true);
    expect(amb('Casa de máquinas').atende).toBe(false);
    // Pelo corredor e pela porta — mais que os 54 m em linha reta até a parede do fundo.
    expect(amb('Casa de máquinas').distanciaM!).toBeGreaterThan(54);
    expect(a.extintores[0].capacidadeAtende).toBe(true);
    // Risco baixo: 25 m — cobre mais salas.
    const baixo = analisarExtintores(m, 'BAIXA', HE);
    expect(baixo.ambientes.filter((x) => x.atende).length).toBeGreaterThan(a.ambientes.filter((x) => x.atende).length);
  });

  it('o extintor de água não cobre a cozinha (B) nem a casa de máquinas (C); a capacidade abaixo da mínima é dita', () => {
    const m = ext(andar(), 30000, 1000, { agenteExtintor: 'AGUA', cargaExtintorKg: 10, capacidadeExtintora: '2-A' });
    const a = analisarExtintores(m, 'MEDIA', HE);
    expect(a.ambientes.find((x) => x.rotulo === 'Cozinha')!.distanciaM).toBeNull();
    expect(a.ambientes.find((x) => x.rotulo === 'Casa de máquinas')!.atende).toBe(false);
    // Médio pede 3-A.
    expect(a.extintores[0].capacidadeAtende).toBe(false);
  });

  it('pavimento sem extintor é dito; sem carga de incêndio, o risco médio com a pendência', () => {
    const a = analisarExtintores(andar(), null, HE);
    expect(a.pavimentosSemExtintor.map((p) => p.nome)).toEqual(['T']);
    expect(a.risco).toBe('MEDIO');
    expect(a.pendencias[0]).toMatch(/não definida/);
  });

  it('a proposta cobre todos os ambientes, e depois de aplicada a análise fecha', () => {
    const m = andar();
    const p = proporExtintores(m, analisarExtintores(m, 'MEDIA', HE), HE);
    expect(p.semCobertura).toEqual([]);
    // O corredor de 60 m sozinho já pede mais de um (20 m a percorrer de cada ponto).
    expect(p.comandos.length).toBeGreaterThanOrEqual(2);
    expect(p.comandos.length).toBeLessThanOrEqual(5);
    // Nenhum no vão de porta nem encostado na parede: todo extintor a 15 cm ou mais do contorno do ambiente dele.
    for (const q of p.pontos) {
      const s = m.spaces.find((x) => x.ring.some(() => true) && x.levelId === q.levelId && x.ring.length && pointInPolygon(x.ring, q.at))!;
      const borda = Math.min(...s.ring.map((a, i) => {
        const b = s.ring[(i + 1) % s.ring.length];
        const dx = b.x - a.x, dy = b.y - a.y, c2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((q.at.x - a.x) * dx + (q.at.y - a.y) * dy) / c2));
        return Math.hypot(q.at.x - (a.x + t * dx), q.at.y - (a.y + t * dy));
      }));
      expect(borda).toBeGreaterThanOrEqual(150);
    }
    const depois = applyBatch(m, p.comandos).model;
    const a = analisarExtintores(depois, 'MEDIA', HE);
    expect(a.ambientes.every((x) => x.atende)).toBe(true);
    // A1 (plano pós-roadmap): a proposta lança a capacidade que o risco pede — antes lançava o padrão
    // 2-A, que a própria análise reprovava no médio (3-A), e este teste AFIRMAVA a reprovação.
    expect(a.extintores.every((x) => x.agente === 'PQS_ABC' && x.capacidade === '3-A:40-B:C' && x.capacidadeAtende === true)).toBe(true);
  });
});

describe('E7.1 · o ponto entre dois extintores', () => {
  it('extintores a 10 e a 50 m do corredor: o meio dele (30 m) está a 20 m de cada — cobre no limite; a 9 e a 51, não', () => {
    const corr = (a: number, b: number) => {
      const m = ext(ext(andar(), a, 1000, { agenteExtintor: 'PQS_ABC' }), b, 1000, { agenteExtintor: 'PQS_ABC' });
      return analisarExtintores(m, 'MEDIA', { ...HE, distanciaMaximaM: 20.5 }).ambientes.find((x) => x.rotulo === 'Corredor')!;
    };
    expect(corr(10000, 50000).atende).toBe(true);
    const longe = corr(9000, 51000);
    expect(longe.atende).toBe(false);
    expect(longe.distanciaM!).toBeGreaterThan(20.5);
  });
});

