/**
 * D1.2 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — sinalização pela IT 15 do CBMMG. A
 * transcrição (`docs/normas/incendio-mg/it15-itens.txt`, Anexo B lido pela imagem) é a fonte dos
 * códigos; depois, a regra dos 15 m na rota (6.1.3 b), a isenção do térreo curto (6.1.3.5) e as
 * placas novas (VGA E11, acionador E2, avisador E1; o recalque sem placa).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { CATALOGO_DE_PLACAS, COTA_DA_PLACA_DE_EQUIPAMENTO_MM, DISTANCIA_MAXIMA_ATE_A_PLACA_MM, PLACA_DO_EQUIPAMENTO, analisarSinalizacao, pontosDeSinalizacaoDaRota } from '../utils/blueprintSinalizacao';
import { percursoDeFuga } from '../utils/blueprintRotaDeFuga';

const texto = readFileSync(join(__dirname, '..', 'docs', 'normas', 'incendio-mg', 'it15-itens.txt'), 'utf-8').split(/\r?\n/);
const anexoB = new Map(texto.filter((l) => l.startsWith('B ')).map((l) => { const [cod, sig] = l.slice(2).split('|').map((x) => x.trim()); return [cod, sig] as const; }));

describe('D1.2 · IT 15: os códigos do Anexo B', () => {
  it('todo código do catálogo está no Anexo B transcrito, com o mesmo significado', () => {
    for (const [cod, p] of Object.entries(CATALOGO_DE_PLACAS)) {
      expect(anexoB.has(cod), cod).toBe(true);
      const sig = anexoB.get(cod)!.toLowerCase();
      expect(p.nome.toLowerCase().includes(sig.split(' ')[0]) || sig.includes(p.nome.toLowerCase().split(' ')[0]), `${cod}: ${p.nome} × ${sig}`).toBe(true);
    }
  });

  it('o equipamento → a placa: extintor E5, mangotinho E7, abrigo E8, VGA E11, acionador E2, avisador E1 — e o recalque sem placa', () => {
    expect(PLACA_DO_EQUIPAMENTO).toMatchObject({ EXTINTOR: 'E5', MANGOTINHO: 'E7', HIDRANTE_SIMPLES: 'E8', HIDRANTE_DUPLO: 'E8', VGA: 'E11', ACIONADOR_MANUAL: 'E2', AVISADOR: 'E1' });
    expect(PLACA_DO_EQUIPAMENTO.HIDRANTE_RECALQUE).toBeUndefined();
    expect(COTA_DA_PLACA_DE_EQUIPAMENTO_MM).toBe(1800);
    expect(texto.join('\n')).toMatch(/6\.1\.3 b\).*no máximo, 15,0 m/);
    expect(DISTANCIA_MAXIMA_ATE_A_PLACA_MM).toBe(15000);
  });
});

/** Um corredor reto de `L` × 2 m com a porta da rua na ponta x = 0. */
function corredor(L: number): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const l = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 }) as Command;
  m = applyBatch(m, [w(0, 0, L, 0), w(L, 0, L, 2000), w(L, 2000, 0, 2000), w(0, 2000, 0, 0)]).model;
  m = applyCommand(m, { type: 'AddOpening', wallId: m.walls.find((x) => x.a.x === 0 && x.b.x === 0)!.id, kind: 'door', offsetMm: 500, widthMm: 900, heightMm: 2100, sillMm: 0 } as Command).model;
  return applyBatch(m, m.spaces.map((s) => ({ type: 'NameSpace', spaceId: s.id, name: 'Corredor' }) as Command)).model;
}

describe('D1.2 · IT 15: a rota', () => {
  it('⚠️ 6.1.3 b: no corredor reto de 40 m, placas de orientação até a saída a cada 15 m no máximo', () => {
    const m = corredor(40000);
    const desc = m.levels[0].id;
    const pontos = pontosDeSinalizacaoDaRota(percursoDeFuga(m, 'A', desc), desc);
    const saida = pontos.find((p) => p.codigo === 'S12')!;
    expect(saida).toBeTruthy();
    const orientacao = pontos.filter((p) => p.codigo === 'S1').map((p) => p.at.x).sort((a, b) => a - b);
    expect(orientacao.length).toBeGreaterThanOrEqual(2);
    // Da origem (o fundo, x ≈ 40 m) à saída (x = 0): nenhum trecho sem placa passa de 15 m.
    const marcos = [saida.at.x, ...orientacao, 40000];
    for (let i = 1; i < marcos.length; i++) expect(marcos[i] - marcos[i - 1]).toBeLessThanOrEqual(DISTANCIA_MAXIMA_ATE_A_PLACA_MM + 1);
  });

  it('6.1.3.5: o térreo de percurso curto e reto não pede orientação', () => {
    const m = corredor(10000);
    const desc = m.levels[0].id;
    expect(pontosDeSinalizacaoDaRota(percursoDeFuga(m, 'A', desc), desc)).toEqual([]);
  });

  it('a análise acusa a VGA e o acionador sem placa; o recalque não', () => {
    const m0 = corredor(10000);
    const l = m0.levels[0].id;
    const p = (tipo: string, x: number): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: point(x, 1000), cotaMm: 1300 }) as Command;
    const m = applyBatch(m0, [p('VGA', 3000), p('ACIONADOR_MANUAL', 5000), p('HIDRANTE_RECALQUE', 7000)]).model;
    const semPlaca = analisarSinalizacao(m, null, l).equipamentosSemPlaca.map((id) => m.terminais!.find((t) => t.id === id)!.tipoHidraulico).sort();
    expect(semPlaca).toEqual(['ACIONADOR_MANUAL', 'VGA']);
  });
});
