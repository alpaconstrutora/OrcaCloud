/**
 * As REGRAS do copiar/colar da Planta Inteligente.
 *
 * `blueprintDuplicateEntities.test.ts` cobre o comando do kernel — o que a
 * cópia produz no modelo. Aqui está a camada de cima: o que ENTRA na cópia,
 * onde fica a âncora e em que offset a porta cai. É onde moram os erros que o
 * kernel nunca veria, porque para ele já chegam decididos.
 *
 * O caso que obriga esta separação é o da abertura avulsa: o delta no plano não
 * diz nada sobre onde uma porta cai numa parede. Sem estes testes, a única prova
 * seria arrastar o mouse num navegador.
 */

import { describe, expect, it } from 'vitest';
import {
  type BlueprintModel,
  type Command,
  applyCommand,
  emptyModel,
  point,
} from '../utils/blueprintKernel';
import {
  comandoDeColagem,
  copiarSelecao,
  type AreaDeTransferencia,
} from '../utils/blueprintAreaDeTransferencia';

const T = 150;
const H = 2800;

function wall(levelId: string, ax: number, ay: number, bx: number, by: number): Command {
  return {
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  };
}

/**
 * Duas paredes paralelas (y=0 e y=4000), a de baixo com uma porta em 2000 e uma
 * janela em 4000, e uma divisa de terreno bem longe da origem.
 */
function cenario() {
  const nivel = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const levelId = nivel.model.levels[0].id;

  const a = applyCommand(nivel.model, wall(levelId, 1000, 2000, 7000, 2000));
  const paredeBaixa = a.diff.created[0];
  const b = applyCommand(a.model, wall(levelId, 1000, 6000, 7000, 6000));
  const paredeAlta = b.diff.created[0];

  const c = applyCommand(b.model, {
    type: 'AddOpening',
    wallId: paredeBaixa,
    kind: 'PORTA',
    offsetMm: 1000,
    widthMm: 900,
    heightMm: 2100,
    sillMm: 0,
  });
  const porta = c.diff.created[0];
  const d = applyCommand(c.model, {
    type: 'AddOpening',
    wallId: paredeBaixa,
    kind: 'JANELA',
    offsetMm: 3000,
    widthMm: 1200,
    heightMm: 1200,
    sillMm: 900,
  });
  const janela = d.diff.created[0];

  const e = applyCommand(d.model, {
    type: 'AddBoundary',
    levelId,
    a: point(0, 0),
    b: point(20_000, 0),
    kind: 'TERRENO',
  });

  return {
    model: e.model as BlueprintModel,
    levelId,
    paredeBaixa,
    paredeAlta,
    porta,
    janela,
    divisa: e.diff.created[0],
  };
}

describe('copiarSelecao', () => {
  it('a porta hospedada na parede copiada NÃO entra como avulsa', () => {
    const c = cenario();
    const r = copiarSelecao(c.model, [c.paredeBaixa, c.porta]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.area.wallIds).toEqual([c.paredeBaixa]);
    // Se ela entrasse aqui, seriam DUAS portas coladas no mesmo vão — e o
    // kernel recusaria o gesto inteiro por sobreposição.
    expect(r.area.openingIds).toEqual([]);
  });

  it('a porta de uma parede que NÃO foi copiada entra como avulsa', () => {
    const c = cenario();
    const r = copiarSelecao(c.model, [c.paredeAlta, c.porta]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.area.wallIds).toEqual([c.paredeAlta]);
    expect(r.area.openingIds).toEqual([c.porta]);
  });

  it('a âncora é o canto (x mín, y mín) do conjunto, não o centro', () => {
    const c = cenario();
    const r = copiarSelecao(c.model, [c.paredeBaixa, c.paredeAlta]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.area.ancora).toEqual({ x: 1000, y: 2000 });
  });

  it('a âncora enxerga os limites, não só as paredes', () => {
    const c = cenario();
    const r = copiarSelecao(c.model, [c.paredeBaixa, c.divisa]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // A divisa começa em (0,0), mais baixa e mais à esquerda que a parede.
    expect(r.area.ancora).toEqual({ x: 0, y: 0 });
  });

  it('recusa seleção sem nada geométrico — medição é de outra camada', () => {
    const c = cenario();
    const r = copiarSelecao(c.model, ['med-1', 'med-2']);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.aviso).toMatch(/Nada que se possa copiar/);
  });
});

describe('comandoDeColagem — paredes e limites', () => {
  it('o delta leva a âncora até o cursor', () => {
    const c = cenario();
    const copia = copiarSelecao(c.model, [c.paredeBaixa, c.paredeAlta]);
    if (!copia.ok) throw new Error('cópia falhou');

    const r = comandoDeColagem(
      c.model,
      copia.area,
      { ponto: point(10_000, 12_000), parede: null },
      c.levelId,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cmd = r.comando;
    if (cmd.type !== 'DuplicateEntities') throw new Error('comando errado');
    // (10000,12000) − âncora (1000,2000).
    expect(cmd.delta).toEqual({ x: 9000, y: 10_000 });
    expect(cmd.wallIds).toHaveLength(2);
    expect(r.aviso).toBeNull();
  });

  it('descarta o que foi apagado entre o Ctrl+C e o Ctrl+V', () => {
    const c = cenario();
    const copia = copiarSelecao(c.model, [c.paredeBaixa, c.paredeAlta]);
    if (!copia.ok) throw new Error('cópia falhou');

    const semUma = applyCommand(c.model, { type: 'DeleteWall', wallId: c.paredeAlta }).model;
    const r = comandoDeColagem(
      semUma,
      copia.area,
      { ponto: point(1000, 12_000), parede: null },
      c.levelId,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cmd = r.comando;
    if (cmd.type !== 'DuplicateEntities') throw new Error('comando errado');
    expect(cmd.wallIds).toEqual([c.paredeBaixa]);
  });

  it('avisa, em vez de estourar id inexistente, quando tudo foi apagado', () => {
    const c = cenario();
    const copia = copiarSelecao(c.model, [c.paredeAlta]);
    if (!copia.ok) throw new Error('cópia falhou');

    const semNada = applyCommand(c.model, { type: 'DeleteWall', wallId: c.paredeAlta }).model;
    const r = comandoDeColagem(
      semNada,
      copia.area,
      { ponto: point(0, 0), parede: null },
      c.levelId,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.aviso).toMatch(/não existe mais/);
  });
});

describe('comandoDeColagem — abertura avulsa', () => {
  const destinoNaParede = (id: string, dist: number) => ({
    ponto: point(0, 0),
    parede: { id, comprimentoMm: 6000, distanciaNoEixoMm: dist },
  });

  it('centra a abertura no cursor, e não no delta do plano', () => {
    const c = cenario();
    const copia = copiarSelecao(c.model, [c.porta]);
    if (!copia.ok) throw new Error('cópia falhou');

    const r = comandoDeColagem(
      c.model,
      copia.area,
      destinoNaParede(c.paredeAlta, 3000),
      c.levelId,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cmd = r.comando;
    if (cmd.type !== 'DuplicateEntities') throw new Error('comando errado');
    // Porta de 900 centrada em 3000 → começa em 2550.
    expect(cmd.openings).toEqual([
      { openingId: c.porta, wallId: c.paredeAlta, offsetMm: 2550 },
    ]);
  });

  it('duas aberturas coladas juntas PRESERVAM a distância entre elas', () => {
    const c = cenario();
    const copia = copiarSelecao(c.model, [c.porta, c.janela]);
    if (!copia.ok) throw new Error('cópia falhou');

    const r = comandoDeColagem(
      c.model,
      copia.area,
      destinoNaParede(c.paredeAlta, 1000),
      c.levelId,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cmd = r.comando;
    if (cmd.type !== 'DuplicateEntities') throw new Error('comando errado');
    const porta = cmd.openings.find((o) => o.openingId === c.porta)!;
    const janela = cmd.openings.find((o) => o.openingId === c.janela)!;
    // Porta de 900 centrada em 1000 → 550. A janela estava 2000 mm adiante
    // (3000 − 1000) e continua 2000 mm adiante. Empilhá-las no mesmo offset
    // faria o kernel recusar o lote inteiro por sobreposição.
    expect(porta.offsetMm).toBe(550);
    expect(janela.offsetMm - porta.offsetMm).toBe(2000);
  });

  it('grampeia na parede em vez de deixar o kernel recusar depois do gesto', () => {
    const c = cenario();
    const copia = copiarSelecao(c.model, [c.porta]);
    if (!copia.ok) throw new Error('cópia falhou');

    const r = comandoDeColagem(
      c.model,
      copia.area,
      // Cursor na ponta da parede: sem grampo, a porta começaria em 5950 e
      // passaria dos 6000 da parede.
      destinoNaParede(c.paredeAlta, 6400),
      c.levelId,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cmd = r.comando;
    if (cmd.type !== 'DuplicateEntities') throw new Error('comando errado');
    expect(cmd.openings[0].offsetMm).toBe(5100); // 6000 − 900
  });

  it('sem parede sob o cursor: recusa quando SÓ havia abertura copiada', () => {
    const c = cenario();
    const copia = copiarSelecao(c.model, [c.porta]);
    if (!copia.ok) throw new Error('cópia falhou');

    const r = comandoDeColagem(
      c.model,
      copia.area,
      { ponto: point(0, 0), parede: null },
      c.levelId,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.aviso).toMatch(/sobre uma parede/);
  });

  it('sem parede sob o cursor: cola as paredes e AVISA sobre a abertura', () => {
    const c = cenario();
    const copia = copiarSelecao(c.model, [c.paredeAlta, c.porta]);
    if (!copia.ok) throw new Error('cópia falhou');

    const r = comandoDeColagem(
      c.model,
      copia.area,
      { ponto: point(1000, 12_000), parede: null },
      c.levelId,
    );
    // Recusar o gesto inteiro por causa da porta faria perder também a parede.
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cmd = r.comando;
    if (cmd.type !== 'DuplicateEntities') throw new Error('comando errado');
    expect(cmd.wallIds).toEqual([c.paredeAlta]);
    expect(cmd.openings).toEqual([]);
    expect(r.aviso).toMatch(/sobre uma parede/);
  });
});

describe('o ciclo inteiro: copiar → colar → aplicar', () => {
  it('a sala copiada nasce inteira, com as duas aberturas, um nível acima', () => {
    const c = cenario();
    const copia = copiarSelecao(c.model, [c.paredeBaixa, c.paredeAlta]);
    if (!copia.ok) throw new Error('cópia falhou');

    const r = comandoDeColagem(
      c.model,
      copia.area,
      { ponto: point(1000, 12_000), parede: null },
      c.levelId,
    );
    if (!r.ok) throw new Error('colagem recusada');

    const depois = applyCommand(c.model, r.comando);
    expect(depois.model.walls).toHaveLength(4);
    // As duas aberturas da parede de baixo vieram junto, sem terem sido pedidas.
    expect(depois.model.openings).toHaveLength(4);
    const novas = depois.model.walls.filter((w) => depois.diff.created.includes(w.id));
    expect(novas.map((w) => w.a.y).sort((x, y) => x - y)).toEqual([12_000, 16_000]);
  });
});

/** A área de transferência é um dado simples — nada de classe nem de mutação. */
describe('AreaDeTransferencia', () => {
  it('é serializável, o que a torna guardável em estado de React sem surpresa', () => {
    const c = cenario();
    const copia = copiarSelecao(c.model, [c.paredeBaixa]);
    if (!copia.ok) throw new Error('cópia falhou');
    const ida: AreaDeTransferencia = JSON.parse(JSON.stringify(copia.area));
    expect(ida).toEqual(copia.area);
  });
});
