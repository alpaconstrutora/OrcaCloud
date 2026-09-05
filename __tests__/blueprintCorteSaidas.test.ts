/**
 * As SAÍDAS do corte: papel (PDF/PNG), DXF e diff entre versões.
 *
 * O que se prova aqui não é a projeção — isso é `blueprintCorte.test.ts`. É o
 * caminho da projeção até o arquivo, que é onde as três armadilhas moram:
 *
 *   1. o corte entra pelo MESMO enquadramento e pelo MESMO desenhista da
 *      elevação, e por isso não pode ser recusado por "vazio" quando só tem
 *      face cortada e nenhuma parede atrás;
 *   2. no DXF as camadas do corte são SEPARADAS das de elevação, senão quem
 *      plota escolhe uma espessura só e perde o que faz o corte se ler;
 *   3. no diff, a linha de corte pesa ZERO — mover um desenho não move um metro
 *      quadrado, e com peso ela empurraria para baixo a parede que mudou o
 *      orçamento.
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
import { projetarCorte } from '../utils/blueprintCorte';
import { projetarElevacao } from '../utils/blueprintElevation';
import {
  desenharElevacao,
  enquadrarElevacao,
  PAPEIS,
  type Desenhista,
  type OpcoesExportacao,
} from '../utils/blueprintExport';
import { CAMADAS, gerarDxf } from '../utils/blueprintDxf';
import { diffSnapshots } from '../utils/blueprintDiff';

const H = 2800;
const T = 150;

function casa(): { model: BlueprintModel; levelId: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const levelId = base.model.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  });
  return {
    model: applyBatch(base.model, [
      p(0, 0, 6000, 0),
      p(6000, 0, 6000, 4000),
      p(6000, 4000, 0, 4000),
      p(0, 4000, 0, 0),
    ]).model,
    levelId,
  };
}

/** Corte horizontal em y = 2000, olhando para os fundos. */
function comCorte(m: BlueprintModel) {
  const r = applyCommand(m, {
    type: 'AddCorte',
    a: point(-1000, 2000),
    b: point(7000, 2000),
  });
  return { model: r.model, corte: r.model.sections[0] };
}

const OPCOES = (denominador: number): OpcoesExportacao => ({
  denominador,
  papel: PAPEIS[0],
  titulo: 'Casa',
  revisao: 1,
  hash: 'h',
});

/** Desenhista que só ANOTA — é assim que se testa desenho sem renderizar. */
class Espia implements Desenhista {
  readonly linhas: { x1: number; y1: number; x2: number; y2: number; espessuraMm: number }[] = [];
  readonly poligonos: { pontos: { x: number; y: number }[]; cor: string }[] = [];
  readonly textos: string[] = [];
  readonly retangulos: { x: number; y: number; w: number; h: number; cor: string }[] = [];

  linha(x1: number, y1: number, x2: number, y2: number, e: { espessuraMm: number; cor: string }) {
    this.linhas.push({ x1, y1, x2, y2, espessuraMm: e.espessuraMm });
  }
  poligono(pontos: { x: number; y: number }[], cor: string) {
    this.poligonos.push({ pontos, cor });
  }
  texto(_x: number, _y: number, t: string) {
    this.textos.push(t);
  }
  retangulo(x: number, y: number, w: number, h: number, e: { cor: string }) {
    this.retangulos.push({ x, y, w, h, cor: e.cor });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('corte no papel', () => {
  it('desenha as duas faces cortadas por CIMA, com traço mais grosso que a vista', () => {
    // As duas laterais são cortadas (ver `blueprintCorte.test.ts` caso 2); a
    // parede dos fundos fica atrás e sai como elevação.
    const { model, corte } = comCorte(casa().model);
    const proj = projetarCorte(model, { corte });
    const enq = enquadrarElevacao(proj, 100, PAPEIS[0]);
    const d = new Espia();
    desenharElevacao(d, proj, OPCOES(100), enq);

    // Uma linha de contorno por lado de cada face cortada: 2 faces × 4 lados.
    const grossas = d.linhas.filter((l) => l.espessuraMm === 0.5);
    expect(grossas).toHaveLength(8);

    // E nenhuma parede da vista atinge essa espessura — é o que separa os dois.
    const daVista = d.linhas.filter((l) => l.espessuraMm > 0 && l.espessuraMm < 0.5);
    expect(daVista.length).toBeGreaterThan(0);
  });

  it('ENQUADRA um corte que só tem face cortada e nenhuma parede atrás', () => {
    // Corte em y = 3990, rente à parede dos fundos: as laterais são cortadas e
    // NÃO SOBRA parede nenhuma atrás. Recusar por "vazio" seria recusar o
    // desenho certo.
    const { model } = casa();
    const comLinha = applyCommand(model, {
      type: 'AddCorte',
      a: point(-1000, 3990),
      b: point(7000, 3990),
    }).model;
    const proj = projetarCorte(comLinha, { corte: comLinha.sections[0] });

    expect(proj.paredes.filter((p) => !p.degenerada)).toHaveLength(0);
    expect(proj.cortados.length).toBeGreaterThan(0);
    expect(enquadrarElevacao(proj, 100, PAPEIS[0]).vazio).toBe(false);
  });

  it('a elevação da mesma casa NÃO ganha face cortada nenhuma', () => {
    // A guarda de que o `if ('cortados' in projecao)` não vaza para a elevação.
    const proj = projetarElevacao(casa().model, { direcao: 'FRENTE' });
    const enq = enquadrarElevacao(proj, 100, PAPEIS[0]);
    const d = new Espia();
    desenharElevacao(d, proj, OPCOES(100), enq);
    expect(d.linhas.filter((l) => l.espessuraMm === 0.5)).toHaveLength(0);
  });
});

describe('corte no DXF', () => {
  it('a MARCA sai em planta mesmo sem a vista pedida', () => {
    // É a informação que a planta deve: "corte A é por aqui". Sem ela, quem
    // recebe o arquivo não consegue situar o desenho do corte.
    const { model } = comCorte(casa().model);
    const dxf = gerarDxf(model, { titulo: 'Casa', revisao: 1, hash: 'h' });

    expect(dxf).toContain(CAMADAS.CORTE_MARCA);
    // A letra do corte, nas duas pontas.
    const letras = dxf.split('\n').filter((l) => l.trim() === 'A');
    expect(letras.length).toBeGreaterThanOrEqual(2);
    // Sem vista pedida, nenhuma ENTIDADE na camada de corte. A camada em si é
    // sempre declarada na tabela — `CAMADAS` é fechada —, então a asserção tem
    // de ser sobre o uso (`8` é o código do par "camada" numa entidade), e não
    // sobre o nome aparecer no arquivo.
    expect(dxf).not.toContain(`\n8\n${CAMADAS.CORTE_PAREDES}\n`);
  });

  it('planta SEM corte não traz a camada de marca em uso', () => {
    const dxf = gerarDxf(casa().model, { titulo: 'Casa', revisao: 1, hash: 'h' });
    // A camada é DECLARADA sempre (a tabela é fechada), mas nada a usa.
    expect(dxf).not.toContain(`\n8\n${CAMADAS.CORTE_MARCA}\n10\n`);
  });

  it('a vista do corte usa camadas CORTE-*, separadas das ELEVACAO-*', () => {
    const { model, corte } = comCorte(casa().model);
    const dxf = gerarDxf(model, {
      titulo: 'Casa',
      revisao: 1,
      hash: 'h',
      elevacoes: [projetarCorte(model, { corte })],
    });

    expect(dxf).toContain(CAMADAS.CORTE_PAREDES);
    expect(dxf).toContain('CORTE A');
    // A parede dos fundos, que está ATRÁS do plano, continua em camada de
    // elevação: é vista, não corte.
    expect(dxf).toContain(CAMADAS.ELEV_PAREDES);
  });

  it('a elevação continua saindo sem camada de corte', () => {
    const { model } = casa();
    const dxf = gerarDxf(model, {
      titulo: 'Casa',
      revisao: 1,
      hash: 'h',
      elevacoes: [projetarElevacao(model, { direcao: 'FRENTE' })],
    });
    expect(dxf).toContain('ELEVACAO FRENTE');
    expect(dxf).not.toContain(`\n8\n${CAMADAS.CORTE_PAREDES}\n`);
  });
});

describe('corte no diff', () => {
  it('adicionar um corte é UMA frase, e pesa zero', () => {
    const antes = casa().model;
    const { model: depois } = comCorte(antes);
    const d = diffSnapshots(antes, depois);

    const cortes = d.alteracoes.filter((a) => a.tipo.startsWith('CORTE_'));
    expect(cortes).toHaveLength(1);
    expect(cortes[0].tipo).toBe('CORTE_ADICIONADO');
    expect(cortes[0].descricao).toContain('Corte A');
    expect(cortes[0].pesoM2).toBe(0);
    expect(d.identicos).toBe(false);
  });

  it('inverter o lado é frase PRÓPRIA, e não "movido"', () => {
    // A linha ficou onde estava e o desenho inteiro mudou. Dizer "movido"
    // mandaria procurar a linha no lugar errado.
    const { model: antes, corte } = comCorte(casa().model);
    const depois = applyCommand(antes, {
      type: 'SetCorteProps',
      corteId: corte.id,
      olharPara: 'DIREITA',
    }).model;
    const d = diffSnapshots(antes, depois);

    const cortes = d.alteracoes.filter((a) => a.tipo.startsWith('CORTE_'));
    expect(cortes).toHaveLength(1);
    expect(cortes[0].tipo).toBe('CORTE_LADO');
    expect(cortes[0].descricao).toContain('direita');
  });

  it('mover a linha casa por uid: 1 frase, e não removido + adicionado', () => {
    const { model: antes, corte } = comCorte(casa().model);
    const depois = applyCommand(antes, {
      type: 'MoveCorteVertex',
      corteId: corte.id,
      end: 'a',
      to: point(-2000, 2500),
    }).model;
    const d = diffSnapshots(antes, depois);

    const cortes = d.alteracoes.filter((a) => a.tipo.startsWith('CORTE_'));
    expect(cortes.map((c) => c.tipo)).toEqual(['CORTE_MOVIDO']);
  });

  it('remover o corte não mexe no resumo de área', () => {
    // A prova de que corte é desenho: o quantitativo não sente.
    const { model: comLinha } = comCorte(casa().model);
    const semLinha = applyCommand(comLinha, {
      type: 'DeleteCorte',
      corteId: comLinha.sections[0].id,
    }).model;
    const d = diffSnapshots(comLinha, semLinha);

    expect(d.alteracoes.map((a) => a.tipo)).toEqual(['CORTE_REMOVIDO']);
    expect(d.resumo.deltaAreaM2).toBe(0);
    expect(d.resumo.paredesAntes).toBe(d.resumo.paredesDepois);
  });
});
