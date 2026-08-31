/**
 * A ORDEM de pintura da elevação — o que esconde o quê.
 *
 * Este arquivo existe porque a suíte estava verde com a fachada errada. Havia
 * três passes independentes (todas as paredes, depois todas as estruturas,
 * depois todos os vãos), e cada um reordenava a profundidade do zero. Nada
 * afirmava a ordem, então nada quebrou — e o defeito só aparecia olhando.
 *
 * Os três casos abaixo são os três defeitos que isso produzia. Cada um afirma
 * uma ORDEM, não um pixel: `DesenhistaDeProva` grava as chamadas, e é a
 * sequência delas que diz o que fica por cima.
 */

import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import {
  DesenhistaDeProva,
  PAPEIS,
  desenharElevacao,
  enquadrarElevacao,
  type OpcoesExportacao,
} from '../utils/blueprintExport';
import { projetarElevacao } from '../utils/blueprintElevation';

const T = 150;
const H = 2800;

const OPCOES: OpcoesExportacao = {
  denominador: 100,
  papel: PAPEIS[0],
  titulo: 'Prova de ordem',
  revisao: 1,
  hash: 'h',
};

/**
 * Duas paredes PARALELAS à fachada, uma atrás da outra, e uma janela SÓ na de
 * trás. Na vista FRENTE (olhando em +Y), a parede em y=6000 está atrás da de
 * y=0 — e a janela dela não pode aparecer.
 */
function duasParedesUmaJanelaAtras(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const levelId = base.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  });

  return applyBatch(base.model, [
    w(0, 0, 6000, 0), // frente — wal_0001
    w(0, 6000, 6000, 6000), // fundo — wal_0002
    {
      type: 'AddOpening',
      wallId: 'wal_0002',
      kind: 'window',
      offsetMm: 2000,
      widthMm: 1200,
      heightMm: 1200,
      sillMm: 900,
    },
  ] as Command[]).model;
}

/**
 * O ROTEIRO da pintura: cada evento visível, na ordem em que saiu.
 *
 * Afirmar a sequência inteira, e não "A vem antes de B", é o que torna o teste
 * capaz de reprovar. As duas primeiras versões destes casos passavam TAMBÉM no
 * código defeituoso — `findIndex` do primeiro polígono é o primeiro polígono em
 * qualquer ordem, e comparar contra `lastIndexOf` é quase sempre verdade.
 * Conferido stashando o conserto e rodando: só um dos três reprovava.
 *
 * ⚠️ SÓ A ELEVAÇÃO. `desenharCarimbo` roda no fim e desenha a ESCALA GRÁFICA
 * como retângulos brancos e pretos alternados — e retângulo branco é
 * exatamente a marca de um vão. Sem recortar, o roteiro ganhava dois "vao"
 * fantasmas no fim, vindos da réguazinha do carimbo. Por isso os casos abaixo
 * afirmam o PREFIXO: o carimbo é sempre o último, então o prefixo é a elevação
 * inteira e nada mais.
 */
function roteiro(d: DesenhistaDeProva): string[] {
  const POR_COR: Record<string, string> = {
    '#e8e8e8': 'parede',
    '#b8b8b8': 'estrutura',
    '#d8d0c4': 'fundacao',
  };
  const eventos: string[] = [];
  for (const c of d.chamadas) {
    if (c.tipo === 'poligono') {
      const nome = POR_COR[String(c.args[1])];
      if (nome) eventos.push(nome);
    }
    if (c.tipo === 'retangulo' && (c.args[4] as { cor?: string })?.cor === '#ffffff') {
      eventos.push('vao');
    }
  }
  return eventos;
}

function pintar(model: BlueprintModel) {
  const proj = projetarElevacao(model, { direcao: 'FRENTE' });
  const enq = enquadrarElevacao(proj, OPCOES.denominador, OPCOES.papel);
  const d = new DesenhistaDeProva();
  desenharElevacao(d, proj, OPCOES, enq);
  return { proj, d };
}

describe('elevação · a ordem de pintura esconde o que está atrás', () => {
  it('O VÃO DA PAREDE DO FUNDO é pintado ANTES da parede da frente', () => {
    // Era o defeito visível: a janela dos fundos aparecia como um buraco branco
    // no meio de uma fachada que não tem janela nenhuma. O recorte branco é
    // `retangulo` com cor '#ffffff'.
    const { proj, d } = pintar(duasParedesUmaJanelaAtras());

    // A projeção enxerga as duas paredes e o vão.
    expect(proj.paredes.filter((p) => !p.degenerada)).toHaveLength(2);
    expect(proj.aberturas).toHaveLength(1);

    const iVaoBranco = d.chamadas.findIndex(
      // `DesenhistaDeProva` grava os argumentos crus: em `retangulo` o estilo é
      // o 5º (x, y, w, h, estilo).
      (c) => c.tipo === 'retangulo' && (c.args[4] as { cor?: string })?.cor === '#ffffff',
    );
    // O preenchimento das paredes é `poligono`; o da frente é o ÚLTIMO deles.
    const iUltimaParede = d.chamadas.map((c) => c.tipo).lastIndexOf('poligono');

    expect(iVaoBranco).toBeGreaterThanOrEqual(0);
    expect(
      iVaoBranco,
      'o vão da parede do fundo tem de ser pintado ANTES da parede da frente, senão fura a fachada',
    ).toBeLessThan(iUltimaParede);
  });

  it('O ROTEIRO INTEIRO: parede do fundo, o vão dela, e só então a da frente', () => {
    // Esta é a asserção que reprova o código antigo, onde o roteiro saía
    // ['parede','parede','vao'] — os dois vãos depois de todas as paredes.
    const { d } = pintar(duasParedesUmaJanelaAtras());
    expect(roteiro(d).slice(0, 3)).toEqual(['parede', 'vao', 'parede']);
  });

  it('a ESTRUTURA entra na mesma ordenação, não num passe próprio', () => {
    // Uma viga ATRÁS das duas paredes tem de ser pintada ANTES delas. No código
    // antigo o roteiro era ['parede','parede','estrutura','vao'].
    const base = duasParedesUmaJanelaAtras();
    const levelId = base.levels[0].id;
    const comViga = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId,
        kind: 'VIGA',
        // y = 9000: mais longe que as duas paredes na vista FRENTE.
        pontos: [point(0, 9000), point(6000, 9000)],
        larguraMm: 150,
        alturaMm: 500,
        baseMm: H - 500,
      },
    ] as Command[]).model;

    const { proj, d } = pintar(comViga);
    const maisFunda = Math.max(...proj.paredes.map((p) => p.profundidade));
    expect(proj.estruturas[0].profundidade, 'a viga tem de estar atrás').toBeGreaterThan(maisFunda);

    expect(roteiro(d).slice(0, 4)).toEqual(['estrutura', 'parede', 'vao', 'parede']);
  });
});

describe('elevação · o que a passada única NÃO resolve', () => {
  it('peça que atravessa PARCIALMENTE outra continua sem recorte', () => {
    // Honestidade sobre o limite: o algoritmo do pintor resolve oclusão TOTAL
    // entre formas opacas, e só isso. Uma viga que sai pela lateral da parede
    // aparece inteira do lado de fora — o que está certo — mas o pedaço de
    // dentro também é pintado inteiro, e só não se vê porque a parede vem
    // depois. Não há recorte de aresta em lugar nenhum, e este caso existe
    // para que ninguém leia "linha oculta" como mais do que é.
    const base = duasParedesUmaJanelaAtras();
    const levelId = base.levels[0].id;
    const comViga = applyBatch(base, [
      {
        type: 'AddStructural',
        levelId,
        kind: 'VIGA',
        pontos: [point(-2000, 3000), point(8000, 3000)],
        larguraMm: 150,
        alturaMm: 500,
        baseMm: H - 500,
      },
    ] as Command[]).model;

    const { proj } = pintar(comViga);
    const viga = proj.estruturas[0];
    // A viga é projetada INTEIRA, de -2000 a 8000, sem nenhum recorte contra a
    // parede que a cobre no meio.
    expect(viga.uMax - viga.uMin).toBe(10000);
  });
});
