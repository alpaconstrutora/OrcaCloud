/**
 * As instalações na tela — a parte que dá para provar (Etapa 6, fatia 2).
 *
 * ⚠️ Estes casos existem porque `Blueprint3DViewer.tsx` está sob `@ts-nocheck`:
 * um sinal trocado lá não é acusado por nada, e o sintoma é um cano que aparece
 * atravessado ou num andar errado — plausível, e por isso silencioso. Toda a
 * geometria mora aqui, onde o compilador olha e o teste alcança.
 */
import { describe, expect, it } from 'vitest';
import {
  BITOLA_PADRAO_MM,
  COR_DA_DISCIPLINA,
  COTA_PADRAO_MM,
  cilindroDoTrecho,
  comprimentoDoTrecho,
  cotaAoEncaixar,
  ehPrumada,
  encaixarNoTerminal,
  pontoDoTerminal3D,
  redeDoNivel,
} from '../utils/blueprintRede';
import type { BlueprintModel, Terminal, Trecho } from '../utils/blueprintKernel';

const trecho = (t: Partial<Trecho>): Trecho => ({
  id: 'trc_0001',
  uid: 'u-1',
  levelId: 'lvl_0001',
  disciplina: 'ELETRICA',
  a: { x: 0, y: 0 },
  b: { x: 1000, y: 0 },
  cotaAMm: 2500,
  cotaBMm: 2500,
  bitolaMm: 25,
  itemCode: null,
  rotulo: null,
  ...t,
});

const terminal = (t: Partial<Terminal>): Terminal => ({
  id: 'trm_0001',
  uid: 'u-t1',
  levelId: 'lvl_0001',
  disciplina: 'ELETRICA',
  tipo: 'Tomada baixa',
  at: { x: 0, y: 0 },
  cotaMm: 300,
  itemCode: null,
  rotulo: null,
  ...t,
});

describe('o cilindro no 3D', () => {
  it('a corrida horizontal fica na cota, com o eixo na planta', () => {
    const c = cilindroDoTrecho(trecho({ a: { x: 0, y: 0 }, b: { x: 4000, y: 0 } }), 0);
    // Centro: metade do percurso, na altura da cota. Y é a ALTURA no 3D.
    expect(c.centro).toEqual([2, 2.5, 0]);
    expect(c.eixo).toEqual([1, 0, 0]);
    expect(c.comprimentoM).toBeCloseTo(4, 9);
    expect(c.raioM).toBeCloseTo(0.0125, 9);
  });

  it('⚠️ a PRUMADA é o caso TRIVIAL — eixo (0,1,0), rotação identidade', () => {
    // O `CylinderGeometry` do three nasce alinhado ao Y. Se a convenção fosse
    // outra, a prumada — o trecho mais comum de uma instalação — seria o caso
    // que exige rotação, e o mais fácil de errar.
    const c = cilindroDoTrecho(
      trecho({ a: { x: 1000, y: 2000 }, b: { x: 1000, y: 2000 }, cotaAMm: 0, cotaBMm: 2800 }),
      0,
    );
    expect(c.eixo).toEqual([0, 1, 0]);
    expect(c.comprimentoM).toBeCloseTo(2.8, 9);
    expect(c.centro[0]).toBeCloseTo(1, 9);
    expect(c.centro[1]).toBeCloseTo(1.4, 9);
    expect(c.centro[2]).toBeCloseTo(2, 9);
  });

  it('⚠️ a ELEVAÇÃO DO PAVIMENTO entra na cota — senão o andar de cima cai no térreo', () => {
    // A cota é medida do PISO DO PAVIMENTO; o 3D empilha os pavimentos. Somar
    // errado põe toda a instalação do superior no térreo, e o desenho continua
    // plausível — o pior tipo de erro.
    const t = trecho({ cotaAMm: 500, cotaBMm: 500 });
    expect(cilindroDoTrecho(t, 0).centro[1]).toBeCloseTo(0.5, 9);
    expect(cilindroDoTrecho(t, 2800).centro[1]).toBeCloseTo(3.3, 9);
  });

  it('⚠️ o Y da planta vira o Z do 3D, e não o Y', () => {
    // A convenção do visualizador é `(x, cota, y)`. Trocar os dois põe a
    // instalação deitada, e sem erro nenhum.
    const c = cilindroDoTrecho(trecho({ a: { x: 0, y: 0 }, b: { x: 0, y: 3000 } }), 0);
    expect(c.eixo).toEqual([0, 0, 1]);
    expect(c.centro).toEqual([0, 2.5, 1.5]);
  });

  it('o caimento inclina o eixo, e o comprimento é o inclinado', () => {
    const c = cilindroDoTrecho(
      trecho({ b: { x: 10000, y: 0 }, cotaAMm: 0, cotaBMm: -200 }),
      0,
    );
    expect(c.comprimentoM).toBeCloseTo(Math.hypot(10, 0.2), 9);
    // Descendo: a componente vertical do eixo é NEGATIVA.
    expect(c.eixo[1]).toBeLessThan(0);
  });

  it('o terminal fica onde a peça está, na cota dela', () => {
    expect(pontoDoTerminal3D(terminal({ at: { x: 500, y: 1500 }, cotaMm: 300 }), 2800)).toEqual([
      0.5, 3.1, 1.5,
    ]);
  });
});

describe('o comprimento e a prumada', () => {
  it('mede em três dimensões', () => {
    expect(comprimentoDoTrecho(trecho({ b: { x: 3000, y: 4000 }, cotaAMm: 0, cotaBMm: 0 }))).toBe(
      5000,
    );
    expect(
      comprimentoDoTrecho(
        trecho({ a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, cotaAMm: 0, cotaBMm: 2800 }),
      ),
    ).toBe(2800);
  });

  it('reconhece a prumada pelo lugar em planta, não pela cota', () => {
    expect(ehPrumada(trecho({ a: { x: 5, y: 5 }, b: { x: 5, y: 5 }, cotaAMm: 0, cotaBMm: 100 }))).toBe(
      true,
    );
    expect(ehPrumada(trecho({ b: { x: 6, y: 5 } }))).toBe(false);
  });
});

describe('o encaixe no terminal', () => {
  const model = {
    terminais: [
      terminal({ id: 'trm_1', at: { x: 1000, y: 0 }, cotaMm: 300 }),
      terminal({ id: 'trm_2', at: { x: 5000, y: 0 }, cotaMm: 1100 }),
      terminal({ id: 'trm_3', at: { x: 1010, y: 0 }, levelId: 'lvl_0002' }),
    ],
  } as unknown as BlueprintModel;

  it('puxa a ponta para o terminal quando está perto', () => {
    const { ponto, terminal: achado } = encaixarNoTerminal(
      { x: 1030, y: 20 },
      model,
      'lvl_0001',
      100,
    );
    expect(ponto).toEqual({ x: 1000, y: 0 });
    expect(achado?.id).toBe('trm_1');
  });

  it('não puxa de longe — mover o traço para onde ninguém clicou é pior', () => {
    const { ponto, terminal: achado } = encaixarNoTerminal(
      { x: 3000, y: 0 },
      model,
      'lvl_0001',
      100,
    );
    expect(ponto).toEqual({ x: 3000, y: 0 });
    expect(achado).toBeNull();
  });

  it('⚠️ ignora terminal de OUTRO pavimento, mesmo colado', () => {
    // `trm_3` está a 10 mm do clique, e é do pavimento de cima. Encaixar nele
    // ligaria o cano a uma tomada que não está neste piso.
    const { terminal: achado } = encaixarNoTerminal({ x: 1012, y: 0 }, model, 'lvl_0001', 100);
    expect(achado?.id).toBe('trm_1');
  });

  it('⚠️ a COTA vem junto do encaixe', () => {
    // Encaixar em planta e não trazer a cota faria o cano passar exatamente por
    // cima da tomada, dois metros acima dela — e o desenho pareceria ligado.
    const { terminal: achado } = encaixarNoTerminal({ x: 5000, y: 0 }, model, 'lvl_0001', 100);
    expect(cotaAoEncaixar(achado, 2500)).toBe(1100);
    // Sem terminal, fica o padrão da disciplina.
    expect(cotaAoEncaixar(null, 2500)).toBe(2500);
  });
});

describe('a rede de um pavimento', () => {
  it('devolve só o que é daquele piso', () => {
    const model = {
      trechos: [trecho({ id: 'a' }), trecho({ id: 'b', levelId: 'lvl_0002' })],
      terminais: [terminal({ id: 'c' })],
    } as unknown as BlueprintModel;
    const r = redeDoNivel(model, 'lvl_0001');
    expect(r.trechos.map((t) => t.id)).toEqual(['a']);
    expect(r.terminais.map((t) => t.id)).toEqual(['c']);
  });
});

describe('os padrões de partida', () => {
  it('cobrem as quatro disciplinas — nenhuma nasce sem cota nem sem bitola', () => {
    // Um campo vazio aqui mandaria o trecho ao banco com cota zero sem ninguém
    // ter decidido, que é pior que um padrão discutível.
    for (const d of ['ELETRICA', 'AGUA_FRIA', 'AGUA_QUENTE', 'ESGOTO'] as const) {
      expect(Number.isInteger(COTA_PADRAO_MM[d])).toBe(true);
      expect(BITOLA_PADRAO_MM[d]).toBeGreaterThan(0);
      expect(COR_DA_DISCIPLINA[d]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('o esgoto nasce ABAIXO do piso, que é onde ele corre', () => {
    expect(COTA_PADRAO_MM.ESGOTO).toBeLessThan(0);
  });

  it('as quatro cores são distintas', () => {
    expect(new Set(Object.values(COR_DA_DISCIPLINA)).size).toBe(4);
  });
});
