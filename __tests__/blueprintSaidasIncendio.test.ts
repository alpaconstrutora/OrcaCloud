/**
 * INCÊNDIO E6.1 (01/10/2026): saídas de emergência — população por pavimento,
 * unidades de passagem e a largura das escadas, corredores e descarga contra o
 * desenho. Desde a D1.2, as tabelas são as da IT 08 do CBMMG (célula a célula em
 * `incendioSaidasMG.test.ts`); aqui se fixa a CADEIA.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_SAIDAS_PADRAO as HS, analisarSaidas, hipotesesDeSaidasDaColuna, larguraExigida } from '../utils/blueprintSaidasIncendio';
import { HIPOTESES_INCENDIO_PADRAO, hipotesesIncendioDaColuna } from '../utils/blueprintIncendioClassificacao';

describe('E6.1 · unidades de passagem', () => {
  it('N = ⌈P ÷ C⌉ × 0,55 m, com 2 unidades no mínimo em escada e acesso; a porta pela luz da 5.5.4.3', () => {
    expect(larguraExigida(8, 'A-2', 'escada')).toEqual({ unidades: 2, larguraMm: 1100 });
    expect(larguraExigida(100, 'A-2', 'escada')).toEqual({ unidades: 3, larguraMm: 1650 }); // 100 ÷ 45
    expect(larguraExigida(200, 'C-1', 'escada')).toEqual({ unidades: 4, larguraMm: 2200 }); // 200 ÷ 60 (IT 08, Tabela 4)
    expect(larguraExigida(8, 'A-2', 'porta')).toEqual({ unidades: 1, larguraMm: 800 }); // 0,80 m para 1 UP
    expect(larguraExigida(45, 'A-2', 'escada').unidades).toBe(2); // exatamente a capacidade não sobe
  });

  it('as premissas: só número positivo entra; o estudo traz o grupo', () => {
    expect(hipotesesDeSaidasDaColuna({ pessoasPorDormitorio: -1, areaPorPessoaM2: 3 })).toEqual({ ...HS, areaPorPessoaM2: 3 });
    expect(HIPOTESES_INCENDIO_PADRAO.saidas).toEqual(HS);
    expect(hipotesesIncendioDaColuna({ saidas: { pessoasPorDormitorio: 3 } }).saidas.pessoasPorDormitorio).toBe(3);
  });
});

/**
 * Pavimento-tipo de 20 × 10 m sobre um térreo: circulação de 1,20 m embaixo e
 * quatro dormitórios de 5 m acima, cada um com porta para a circulação. A
 * escada sobe do térreo ao tipo, com `larguraEscada`. O térreo tem uma porta de
 * 0,90 m para fora.
 */
function predio(larguraEscada: number): { m: BlueprintModel; escadaId: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2880 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Tipo', elevationMm: 2880, defaultHeightMm: 2880 }).model;
  const [t, tipo] = m.levels.map((l) => l.id);
  const w = (l: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2880 }) as Command;
  const caixa = (l: string) => [w(l, 0, 0, 20000, 0), w(l, 20000, 0, 20000, 10000), w(l, 20000, 10000, 0, 10000), w(l, 0, 10000, 0, 0)];
  m = applyBatch(m, [...caixa(t), ...caixa(tipo), w(tipo, 0, 1200, 20000, 1200), ...[5000, 10000, 15000].map((x) => w(tipo, x, 1200, x, 10000))]).model;
  // Portas: os dormitórios para a circulação; o térreo para fora (parede de baixo).
  const portas: Command[] = m.walls
    .filter((x) => (x.levelId === tipo && x.a.y === 1200 && x.b.y === 1200) || (x.levelId === t && x.a.y === 0 && x.b.y === 0))
    .flatMap((x) => (x.levelId === tipo ? [1000, 6000, 11000, 16000] : [9000]).map((off) => ({ type: 'AddOpening', wallId: x.id, kind: 'door', offsetMm: off, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command));
  m = applyBatch(m, portas).model;
  m = applyBatch(
    m,
    m.spaces
      .filter((s) => s.levelId === tipo)
      .map((s) => {
        const y = Math.min(...s.ring.map((p) => p.y));
        const x = Math.min(...s.ring.map((p) => p.x));
        return { type: 'NameSpace', spaceId: s.id, name: y < 1000 ? 'Circulação' : `Dormitório ${Math.round(x / 5000) + 1}` } as Command;
      }),
  ).model;
  m = applyCommand(m, { type: 'AddEscada', levelId: t, pontos: [point(17000, 3000), point(17000, 8000)], larguraMm: larguraEscada, rotulo: 'E1' } as Command).model;
  return { m, escadaId: m.stairs[0].id };
}

describe('E6.1 · o pavimento-tipo', () => {
  it('⚠️ PRONTO QUANDO: a escada de 0,90 m vira FALTA com a largura exigida (8 pessoas → 2 unidades → 1,10 m)', () => {
    const { m, escadaId } = predio(900);
    const a = analisarSaidas(m, 'A-2', HS);
    expect(a.populacao.find((p) => p.nome === 'Tipo')).toMatchObject({ pessoas: 8, origem: 'DORMITORIOS', base: 4 });
    const e = a.itens.find((i) => i.tipo === 'ESCADA' && i.alvoId === escadaId)!;
    expect(e).toMatchObject({ rotulo: 'E1', pessoas: 8, pavimentoCritico: 'Tipo', unidades: 2, exigidaMm: 1100, desenhadaMm: 900, atende: false });
    // Com 1,20 m atende.
    expect(analisarSaidas(predio(1200).m, 'A-2', HS).itens.find((i) => i.tipo === 'ESCADA')!.atende).toBe(true);
  });

  it('o corredor confere pela menor dimensão; a descarga soma as portas para fora contra o pior pavimento', () => {
    const { m } = predio(1200);
    const a = analisarSaidas(m, 'A-2', HS);
    const c = a.itens.find((i) => i.tipo === 'CORREDOR')!;
    // Paredes de 15 cm no EIXO a 0 e a 1,20 m: o vão livre é 1,20 − 2 × 0,075 = 1,05 m < 1,10 m — FALTA.
    expect(c).toMatchObject({ desenhadaMm: 1050, exigidaMm: 1100, atende: false });
    const d = a.itens.find((i) => i.tipo === 'DESCARGA')!;
    expect(d).toMatchObject({ desenhadaMm: 900, exigidaMm: 800, pavimentoCritico: 'Tipo', atende: true }); // porta de 1 UP: luz de 0,80 m
  });

  it('comércio (C): a população sai da área SEM a circulação (1 pessoa por 3 m², nota E) e a escada pede mais unidades (60 por UP)', () => {
    const { m } = predio(1200);
    const a = analisarSaidas(m, 'C-1', HS);
    const tipo = a.populacao.find((p) => p.nome === 'Tipo')!;
    const area = m.spaces.filter((s) => s.levelId === m.levels[1].id && s.name !== 'Circulação').reduce((t, s) => t + s.areaMm2, 0) / 1e6;
    expect(tipo).toMatchObject({ origem: 'AREA', pessoas: Math.ceil(area / 3 - 1e-9) });
    expect(a.itens.find((i) => i.tipo === 'ESCADA')!.unidades).toBe(Math.max(2, Math.ceil(tipo.pessoas / 60)));
    // m² por pessoa declarado vence a tabela.
    expect(analisarSaidas(m, 'C-1', { ...HS, areaPorPessoaM2: 1 }).populacao.find((p) => p.nome === 'Tipo')!.pessoas).toBe(Math.ceil(area));
  });

  it('sem divisão: a pendência diz; prédio sem escada também', () => {
    const { m } = predio(1200);
    expect(analisarSaidas(m, null, HS).pendencias[0]).toMatch(/sem a divisão/);
    const sem = { ...m, stairs: [] };
    expect(analisarSaidas(sem, 'A-2', HS).pendencias).toContain('o prédio tem mais de um pavimento e nenhuma escada desenhada');
  });
});
