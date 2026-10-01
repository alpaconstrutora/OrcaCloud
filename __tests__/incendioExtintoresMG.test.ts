/**
 * D1.2 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — extintores pela IT 16 do CBMMG. A
 * transcrição feita pela imagem das pp. 6–8 (`docs/normas/incendio-mg/it16-tabelas.txt`) é a
 * fonte: o teste a relê e confere as Tabelas 4, 5 e 6. Depois, a entrada (5.2.2.9) e o ABC (6.2.1).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { DISTANCIA_CLASSE_C_M, DISTANCIA_DA_ENTRADA_M, HIPOTESES_EXTINTORES_PADRAO as HE, TABELA_4_IT16, TABELA_5_IT16, analisarExtintores, proporExtintores } from '../utils/blueprintExtintores';

const texto = readFileSync(join(__dirname, '..', 'docs', 'normas', 'incendio-mg', 'it16-tabelas.txt'), 'utf-8').split(/\r?\n/);
const linhas = (p: string) => texto.filter((l) => l.startsWith(`${p} `)).map((l) => l.slice(p.length + 1).split('|').map((x) => x.trim()));
const RISCO = { Baixo: 'BAIXO', Médio: 'MEDIO', Alto: 'ALTO' } as const;

describe('D1.2 · as tabelas da IT 16 batem com a transcrição', () => {
  it('Tabelas 4 (A) e 5 (B): risco → capacidade mínima → distância', () => {
    for (const [p, tabela, sufixo] of [['T4', TABELA_4_IT16, '-A'], ['T5', TABELA_5_IT16, '-B']] as const) {
      const porRisco: Record<string, { capacidade: number; distanciaM: number }[]> = {};
      for (const [r, cap, d] of linhas(p)) (porRisco[RISCO[r as keyof typeof RISCO]] ??= []).push({ capacidade: Number(cap.replace(sufixo, '')), distanciaM: Number(d) });
      expect(tabela, p).toEqual(porRisco);
    }
  });

  it('Tabela 6: C 20 m; a entrada a 10 m (5.2.2.9)', () => {
    expect(linhas('T6').find((c) => c[0] === 'C')![1]).toBe(String(DISTANCIA_CLASSE_C_M));
    expect(texto.join('\n')).toMatch(/5\.2\.2\.9 No mínimo um extintor a não mais de 10 m/);
    expect(DISTANCIA_DA_ENTRADA_M).toBe(10);
  });
});

/** Um corredor de 30 × 2 m com a porta da rua na ponta x = 0 e uma sala de 6 × 6 m no fim (x 24–30). */
function corredor(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const l = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 }) as Command;
  m = applyBatch(m, [w(0, 0, 30000, 0), w(30000, 0, 30000, 8000), w(30000, 8000, 24000, 8000), w(24000, 8000, 24000, 2000), w(24000, 2000, 0, 2000), w(0, 2000, 0, 0), w(24000, 2000, 30000, 2000)]).model;
  const porta = (wallId: string, off: number): Command => ({ type: 'AddOpening', wallId, kind: 'door', offsetMm: off, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command;
  m = applyBatch(m, [porta(m.walls.find((x) => x.a.x === 0 && x.b.x === 0)!.id, 500), porta(m.walls.find((x) => x.a.y === 2000 && x.b.y === 2000 && x.a.x === 24000 && x.b.x === 30000)!.id, 2500)]).model;
  return applyBatch(m, m.spaces.map((s) => ({ type: 'NameSpace', spaceId: s.id, name: s.ring.every((p) => p.y <= 2000) ? 'Corredor' : 'Sala' }) as Command)).model;
}
const extintor = (m: BlueprintModel, x: number, y: number, agente = 'PQS_ABC'): BlueprintModel =>
  applyCommand(m, { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'INCENDIO', tipo: 'EXTINTOR', tipoHidraulico: 'EXTINTOR', at: point(x, y), cotaMm: 1600, agenteExtintor: agente, capacidadeExtintora: agente === 'PQS_ABC' ? '3-A:40-B:C' : agente === 'AGUA' ? '3-A' : '40-B:C' } as Command).model;

describe('D1.2 · IT 16: a entrada e o ABC', () => {
  it('⚠️ 5.2.2.9: o extintor do fundo deixa a entrada a mais de 10 m — falta; a proposta põe um junto da porta, e a 2ª sai vazia', () => {
    const m = extintor(corredor(), 22000, 1000);
    const a = analisarExtintores(m, 'MEDIA', HE);
    expect(a.entradasLonge).toHaveLength(1);
    expect(a.entradasLonge[0].distanciaM!).toBeGreaterThan(10);
    const p = proporExtintores(m, a, HE);
    expect(p.pontos.some((x) => x.at.x < 2000)).toBe(true);
    const m1 = applyBatch(m, p.comandos).model;
    const a1 = analisarExtintores(m1, 'MEDIA', HE);
    expect(a1.entradasLonge).toEqual([]);
    expect(proporExtintores(m1, a1, HE).comandos).toEqual([]);
  });

  it('6.2.1: só água e só BC no pavimento valem (A + BC); só água, não', () => {
    const agua = extintor(corredor(), 1000, 1000, 'AGUA');
    expect(analisarExtintores(agua, 'MEDIA', HE).pavimentosSemABC).toHaveLength(1);
    const aguaEBc = extintor(agua, 2000, 1000, 'PQS_BC');
    expect(analisarExtintores(aguaEBc, 'MEDIA', HE).pavimentosSemABC).toEqual([]);
    expect(analisarExtintores(aguaEBc, 'MEDIA', HE).pendencias.join(' ')).toMatch(/6\.2\.1\.2/);
  });
});
