/**
 * EIXOS AUTOMÁTICOS (07/10/2026) — *"veja que também tem eixos identificados com números e letras"*: o botão "Gerar
 * eixos" propõe a malha a partir da edificação; letras nos VERTICAIS (A, B… da esquerda para a direita) e números
 * nos HORIZONTAIS (1, 2… de cima para baixo), como na planta de referência.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_EIXOS_PADRAO, normalizarHipotesesDeEixos, propostaDeEixos } from '../utils/blueprintEixosAutomaticos';
import { cruzamentosDeEixos } from '../utils/blueprintPilaresAutomaticos';

function nivel(): { m: BlueprintModel; t: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}
const w = (t: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });

/** Casa 10 × 15 com divisórias em x = 4000 e 7000 e em y = 6000 e 11000 (a referência, simplificada). */
function casa() {
  const { m, t } = nivel();
  return {
    t,
    m: applyBatch(m, [
      w(t, 0, 0, 10000, 0),
      w(t, 10000, 0, 10000, 15000),
      w(t, 10000, 15000, 0, 15000),
      w(t, 0, 15000, 0, 0),
      w(t, 4000, 0, 4000, 15000),
      w(t, 7000, 0, 7000, 6000),
      w(t, 0, 6000, 10000, 6000),
      w(t, 0, 11000, 4000, 11000),
    ]).model,
  };
}

describe('propostaDeEixos', () => {
  it('casa 10 × 15: A–D nos verticais da esquerda para a direita, 1–4 nos horizontais de cima para baixo', () => {
    const { m, t } = casa();
    const p = propostaDeEixos(m, t);
    expect(p.eixos.filter((e) => e.vertical).map((e) => [e.nome, e.coordenadaMm])).toEqual([
      ['A', 0],
      ['B', 4000],
      ['C', 7000],
      ['D', 10000],
    ]);
    expect(p.eixos.filter((e) => !e.vertical).map((e) => [e.nome, e.coordenadaMm])).toEqual([
      ['1', 15000],
      ['2', 11000],
      ['3', 6000],
      ['4', 0],
    ]);
    // Atravessam o desenho e passam 3 m de cada lado.
    const a = p.eixos.find((e) => e.nome === 'A')!;
    expect([a.a.y, a.b.y]).toEqual([-3000, 18000]);
    const um = p.eixos.find((e) => e.nome === '1')!;
    expect([um.a.x, um.b.x]).toEqual([-3000, 13000]);
    expect(p.motivoVazio).toBeNull();
  });

  it('gravar = um lote de AddEixo com os nomes; os cruzamentos valem para os pilares', () => {
    const { m, t } = casa();
    const p = propostaDeEixos(m, t);
    const com = applyBatch(m, p.comandos).model;
    expect(com.eixos.map((e) => e.nome)).toEqual(['A', 'B', 'C', 'D', '1', '2', '3', '4']);
    expect(cruzamentosDeEixos(com)).toHaveLength(16);
  });

  it('parede curta não gera eixo; linhas próximas viram uma; parede oblíqua fica de fora e é contada', () => {
    const { m, t } = nivel();
    const x = applyBatch(m, [
      w(t, 0, 0, 8000, 0),
      w(t, 8000, 0, 8000, 6000),
      w(t, 8000, 6000, 0, 6000),
      w(t, 0, 6000, 0, 0),
      w(t, 3000, 0, 3000, 1000), // mureta de 1 m
      w(t, 5000, 6000, 5050, 3000), // quase vertical, mas a 50 mm: oblíqua
      w(t, 8050, 2000, 8050, 5000), // a 5 cm da fachada leste: junta com ela
    ]).model;
    const p = propostaDeEixos(x, t);
    expect(p.eixos.filter((e) => e.vertical).map((e) => e.coordenadaMm)).toEqual([0, 8000]);
    expect(p.paredesCurtas).toBe(1);
    expect(p.paredesObliquas).toBe(1);
    // Com "parede mínima" 50 cm, a mureta entra.
    expect(propostaDeEixos(x, t, { comprimentoMinimoDaParedeMm: 500 }).eixos.filter((e) => e.vertical).map((e) => e.coordenadaMm)).toEqual([0, 3000, 8000]);
    // Sem juntar, a parede a 5 cm vira outro eixo.
    expect(propostaDeEixos(x, t, { juntarAMenosDeMm: 0 }).eixos.filter((e) => e.vertical).map((e) => e.coordenadaMm)).toEqual([0, 8000, 8050]);
  });

  it('bloco de massa sem parede: 2 + 2 eixos pelos lados do bloco', () => {
    const { m, t } = nivel();
    const x = applyBatch(m, [{ type: 'AddBloco', levelId: t, nome: 'Torre', pontos: [point(1000, 4000), point(11000, 4000), point(11000, 24000), point(1000, 24000)], pavimentos: 4 }]).model;
    const p = propostaDeEixos(x, t);
    expect(p.eixos.map((e) => `${e.nome}@${e.coordenadaMm}`)).toEqual(['A@1000', 'B@11000', '1@24000', '2@4000']);
    expect(p.eixos.every((e) => e.origem === 'BLOCO')).toBe(true);
  });

  it('o eixo atravessa também o LOTE', () => {
    const { m, t } = nivel();
    const d = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO' });
    const x = applyBatch(m, [
      d(0, 0, 12000, 0),
      d(12000, 0, 12000, 30000),
      d(12000, 30000, 0, 30000),
      d(0, 30000, 0, 0),
      { type: 'AddBloco', levelId: t, nome: 'Torre', pontos: [point(1000, 4000), point(11000, 4000), point(11000, 24000), point(1000, 24000)], pavimentos: 4 },
    ]).model;
    const a = propostaDeEixos(x, t).eixos.find((e) => e.nome === 'A')!;
    expect([a.a.y, a.b.y]).toEqual([-3000, 33000]);
  });

  it('linha que já tem eixo não ganha outro; o existente entra na sequência; sem renumerar, os novos continuam depois dos usados', () => {
    const { m, t } = casa();
    const comA = applyCommand(m, { type: 'AddEixo', a: point(0, -1000), b: point(0, 16000) }).model; // nasce "A"
    expect(comA.eixos[0].nome).toBe('A');
    const p = propostaDeEixos(comA, t);
    expect(p.jaTinhamEixo).toBe(1);
    expect(p.eixos.filter((e) => e.vertical).map((e) => [e.nome, e.coordenadaMm, e.existenteId ? 'existente' : 'novo'])).toEqual([
      ['A', 0, 'existente'],
      ['B', 4000, 'novo'],
      ['C', 7000, 'novo'],
      ['D', 10000, 'novo'],
    ]);
    expect(p.novos).toBe(7);
    expect(p.renomeados).toBe(0);
    // Sem renumerar (o comportamento de antes): só os novos, com nome depois dos usados.
    const semRenumerar = propostaDeEixos(comA, t, { renumerar: false });
    expect(semRenumerar.eixos.filter((e) => e.vertical).map((e) => e.nome)).toEqual(['B', 'C', 'D']);
    expect(semRenumerar.comandos.every((c) => c.type === 'AddEixo')).toBe(true);
    // Tudo gerado: nada a criar, e o motivo diz por quê.
    const tudo = applyBatch(m, propostaDeEixos(m, t).comandos).model;
    const de_novo = propostaDeEixos(tudo, t);
    expect(de_novo.comandos).toEqual([]);
    expect(de_novo.motivoVazio).toMatch(/já têm eixo/);
  });

  it('sem edificação, o motivo do botão desligado diz o que fazer', () => {
    const { m, t } = nivel();
    expect(propostaDeEixos(m, t).motivoVazio).toMatch(/Desenhe paredes, blocos ou um lote fechado/);
    expect(propostaDeEixos(m, t, { usarLadosDoLote: false }).motivoVazio).toMatch(/ligue "Usar o lote"/);
  });

  /** 08/10/2026 — *"quero"*: sem paredes nem blocos, os eixos saem dos lados do lote fechado. */
  describe('só o lote', () => {
    const soLote = (pontos: [number, number][]) => {
      const { m, t } = nivel();
      const cmds: Command[] = pontos.map(([ax, ay], i) => {
        const [bx, by] = pontos[(i + 1) % pontos.length];
        return { type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO' };
      });
      return { m: applyBatch(m, cmds).model, t };
    };

    it('lote 10 × 30: A e B nas laterais, 1 nos fundos e 2 na frente, passando 3 m além', () => {
      const { m, t } = soLote([[0, 0], [10000, 0], [10000, 30000], [0, 30000]]);
      const p = propostaDeEixos(m, t);
      expect(p.eixos.map((e) => `${e.nome}@${e.coordenadaMm}`)).toEqual(['A@0', 'B@10000', '1@30000', '2@0']);
      expect(p.eixos.every((e) => e.origem === 'LOTE')).toBe(true);
      const a = p.eixos.find((e) => e.nome === 'A')!;
      expect([a.a.y, a.b.y]).toEqual([-3000, 33000]);
    });

    it('desligado, o lote não gera eixo', () => {
      const { m, t } = soLote([[0, 0], [10000, 0], [10000, 30000], [0, 30000]]);
      expect(propostaDeEixos(m, t, { usarLadosDoLote: false }).eixos).toEqual([]);
    });

    it('com edificação desenhada, o lote NÃO entra (a malha é da estrutura)', () => {
      const { m, t } = soLote([[0, 0], [10000, 0], [10000, 30000], [0, 30000]]);
      const comBloco = applyBatch(m, [{ type: 'AddBloco', levelId: t, nome: 'Torre', pontos: [point(1000, 4000), point(9000, 4000), point(9000, 24000), point(1000, 24000)], pavimentos: 4 }]).model;
      expect(propostaDeEixos(comBloco, t).eixos.map((e) => e.coordenadaMm)).toEqual([1000, 9000, 24000, 4000]);
    });

    it('lado oblíquo do lote fica de fora; lote aberto não gera nada e o motivo diz', () => {
      const trapezio = soLote([[0, 0], [12000, 0], [10000, 30000], [0, 30000]]);
      expect(propostaDeEixos(trapezio.m, trapezio.t).eixos.map((e) => e.nome)).toEqual(['A', '1', '2']);
      const { m, t } = nivel();
      const aberto = applyBatch(m, [{ type: 'AddBoundary', levelId: t, a: point(0, 0), b: point(10000, 0), kind: 'TERRENO' }]).model;
      expect(propostaDeEixos(aberto, t).motivoVazio).toMatch(/lote fechado/);
    });
  });

  it('hipóteses: padrão 3 m / 1,50 m / 10 cm; o que vem do navegador é validado', () => {
    expect(HIPOTESES_EIXOS_PADRAO).toEqual({ alemDoDesenhoMm: 3000, comprimentoMinimoDaParedeMm: 1500, juntarAMenosDeMm: 100, usarLadosDoLote: true, renumerar: true });
    expect(normalizarHipotesesDeEixos({ alemDoDesenhoMm: 'x', comprimentoMinimoDaParedeMm: -5, juntarAMenosDeMm: 99999, usarLadosDoLote: 'sim' })).toEqual({
      alemDoDesenhoMm: 3000,
      comprimentoMinimoDaParedeMm: 0,
      juntarAMenosDeMm: 2000,
      usarLadosDoLote: true,
      renumerar: true,
    });
    expect(normalizarHipotesesDeEixos({ usarLadosDoLote: false }).usarLadosDoLote).toBe(false);
  });
});

/** Os eixos na EXPORTAÇÃO (07/10/2026): a prancha e o DXF levam a malha como a tela, e seguem o "Eixos" de Exibir. */
describe('eixos na exportação', () => {
  const comEixos = () => {
    const { m, t } = casa();
    return applyBatch(m, propostaDeEixos(m, t).comandos).model;
  };
  const opcoes = async (extra: Record<string, unknown> = {}) => {
    const { PAPEIS } = await import('../utils/blueprintExport');
    return { denominador: 100, papel: PAPEIS[0], titulo: 't', revisao: 1, hash: 'abc', data: new Date('2026-10-07T12:00:00Z'), ...extra };
  };

  it('PDF: uma bolha em cada ponta com o nome; "Eixos" desligado ou planta humanizada = nada', async () => {
    const { DesenhistaDeProva, desenharPlanta, enquadrar, PAPEIS } = await import('../utils/blueprintExport');
    const m = comEixos();
    const desenhar = async (extra: Record<string, unknown>) => {
      const d = new DesenhistaDeProva();
      desenharPlanta(d, m, (await opcoes(extra)) as never, enquadrar(m, 100, PAPEIS[0]));
      return d;
    };
    const d = await desenhar({});
    expect(d.chamadas.filter((c) => c.tipo === 'circulo')).toHaveLength(16);
    for (const nome of ['A', 'B', 'C', 'D', '1', '2', '3', '4']) expect(d.textos().filter((x) => x === nome)).toHaveLength(2);
    for (const extra of [{ eixos: false }, { humanizada: true }]) {
      const sem = await desenhar(extra);
      expect(sem.chamadas.filter((c) => c.tipo === 'circulo')).toHaveLength(0);
      expect(sem.textos()).not.toContain('D');
    }
  });

  it('a bolha cabe no enquadramento: a caixa do modelo inclui os eixos', async () => {
    const { boundingBox } = await import('../utils/blueprintExport');
    const bb = boundingBox(comEixos())!;
    expect([bb.minX, bb.maxX, bb.minY, bb.maxY]).toEqual([-3000, 13000, -3000, 18000]);
  });

  it('Desenhista sem círculo: a bolha vira um polígono de 24 lados', async () => {
    const { circuloOuPoligono } = await import('../utils/blueprintExport');
    const chamadas: string[] = [];
    const d = {
      linha: () => chamadas.push('linha'),
      poligono: (p: unknown[]) => chamadas.push(`poligono:${p.length}`),
      texto: () => chamadas.push('texto'),
      retangulo: () => chamadas.push('retangulo'),
    };
    circuloOuPoligono(d, 0, 0, 3.5, { espessuraMm: 0.18, cor: '#000' }, '#fff');
    expect(chamadas.filter((c) => c === 'poligono:24')).toHaveLength(1);
    expect(chamadas.filter((c) => c === 'linha')).toHaveLength(24);
  });

  it('DXF: camada PLANTA-MALHA-EIXOS com a linha, a bolha (CIRCLE) e o nome; eixos: false = sem nenhuma entidade dela', async () => {
    const { gerarDxf } = await import('../utils/blueprintDxf');
    const m = comEixos();
    const dxf = gerarDxf(m, { titulo: 't', revisao: 1, hash: 'h' });
    const v = dxf.split(/\r?\n/).map((s) => s.trim());
    const entidades: string[] = [];
    for (let i = 0; i + 3 < v.length; i += 2) if (v[i] === '0' && v[i + 2] === '8' && v[i + 3] === 'PLANTA-MALHA-EIXOS') entidades.push(v[i + 1]);
    expect(entidades.filter((x) => x === 'LINE')).toHaveLength(8);
    expect(entidades.filter((x) => x === 'CIRCLE')).toHaveLength(16);
    expect(entidades.filter((x) => x === 'TEXT')).toHaveLength(16);
    const sem = gerarDxf(m, { titulo: 't', revisao: 1, hash: 'h', eixos: false });
    expect(sem.split(/\r?\n/).filter((s) => s.trim() === 'PLANTA-MALHA-EIXOS')).toHaveLength(1); // só a declaração da camada
  });

  it('template de vista: "Eixos" entra na configuração; template antigo (sem a chave) = ligado', async () => {
    const { CONFIGURACAO_PADRAO, configuracaoDaColuna, diferencas } = await import('../utils/blueprintTemplatesDeVista');
    expect(CONFIGURACAO_PADRAO.planta.eixos).toBe(true);
    expect(configuracaoDaColuna({ planta: { medidas: true } }).planta.eixos).toBe(true);
    expect(configuracaoDaColuna({ planta: { eixos: false } }).planta.eixos).toBe(false);
    const sem = { ...CONFIGURACAO_PADRAO, planta: { ...CONFIGURACAO_PADRAO.planta, eixos: false } };
    expect(diferencas(CONFIGURACAO_PADRAO, sem).join(' ')).toMatch(/Eixos/);
  });
});


/**
 * DETALHES DO LOTE (08/10/2026) — *"as medidas e eixos contemplam início e fim do terreno e isso está correto, porém
 * tem que considerar outros pontos. como por exemplo na imagem existe um recuo"*; *"todos os detalhes devem ser
 * considerados, seja recuo ou outra informação semelhante"*. Sem edificação, os eixos saem também da linha de cada
 * recuo (o envelope), das faixas de restrição e das divisas internas.
 */
describe('eixos pelos detalhes do lote', () => {
  const lote10x30 = (extra: Command[] = []) => {
    const { m, t } = nivel();
    const d = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO' });
    return { m: applyBatch(m, [d(0, 0, 10000, 0), d(10000, 0, 10000, 30000), d(10000, 30000, 0, 30000), d(0, 30000, 0, 0), ...extra]).model, t };
  };
  /** Recuo de frente 5 m e de fundos 3 m, laterais 0 — o envelope que o editor calcula com os recuos da zona. */
  const envelope = [[point(0, 5000), point(10000, 5000), point(10000, 27000), point(0, 27000)]];

  it('a linha de cada recuo vira eixo: 1 (fundos), 2 (recuo de fundos), 3 (recuo de frente), 4 (frente)', () => {
    const { m, t } = lote10x30();
    const p = propostaDeEixos(m, t, {}, { envelope });
    expect(p.eixos.map((e) => `${e.nome}@${e.coordenadaMm}:${e.origem}`)).toEqual([
      'A@0:LOTE', // o lado do envelope com recuo lateral 0 cai sobre o lado do lote: um eixo só, "Lado do lote"
      'B@10000:LOTE',
      '1@30000:LOTE',
      '2@27000:RECUO',
      '3@5000:RECUO',
      '4@0:LOTE',
    ]);
  });

  it('faixa de restrição e divisa interna também viram eixo', () => {
    const { m, t } = lote10x30();
    const x = applyBatch(m, [
      { type: 'AddBoundary', levelId: t, a: point(10000, 30000), b: point(0, 30000), kind: 'RESTRICAO', restricao: { tipo: 'APP', faixaMm: 4000 } },
      { type: 'AddBoundary', levelId: t, a: point(6000, 0), b: point(6000, 12000), kind: 'DIVISA' },
    ] as Command[]).model;
    const p = propostaDeEixos(x, t);
    expect(p.eixos.filter((e) => e.vertical).map((e) => `${e.coordenadaMm}:${e.origem}`)).toEqual(['0:LOTE', '6000:DIVISA', '10000:LOTE']);
    expect(p.eixos.filter((e) => !e.vertical).map((e) => `${e.coordenadaMm}:${e.origem}`)).toEqual(['30000:LOTE', '26000:RESTRICAO', '0:LOTE']);
  });

  it('com edificação, os detalhes do lote não entram (a malha é da estrutura)', () => {
    const { m, t } = lote10x30();
    const comBloco = applyBatch(m, [{ type: 'AddBloco', levelId: t, nome: 'Torre', pontos: [point(1000, 6000), point(9000, 6000), point(9000, 24000), point(1000, 24000)], pavimentos: 4 }]).model;
    expect(propostaDeEixos(comBloco, t, {}, { envelope }).eixos.every((e) => e.origem === 'BLOCO')).toBe(true);
  });
});

/**
 * RENUMERAR (09/10/2026) — print do usuário: o lote com os eixos 1 e 2 já criados e o recuo sem eixo. Gerar de novo
 * dava "3" e "4" ENTRE o 1 e o 2; com `renumerar`, a sequência fica em ordem de cima para baixo.
 */
describe('renumerar os eixos existentes', () => {
  const lote10x30 = () => {
    const { m, t } = nivel();
    const d = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO' });
    return { m: applyBatch(m, [d(0, 0, 10000, 0), d(10000, 0, 10000, 30000), d(10000, 30000, 0, 30000), d(0, 30000, 0, 0)]).model, t };
  };
  const envelope = [[point(0, 1500), point(10000, 1500), point(10000, 28500), point(0, 28500)]];

  it('o caso do print: 1 e 2 já existem; os recuos entram como 2 e 3 e o antigo "2" vira 4 — um lote só', () => {
    const { m, t } = lote10x30();
    const antes = applyBatch(m, propostaDeEixos(m, t).comandos).model; // A, B, 1, 2 — sem recuo
    expect(antes.eixos.map((e) => e.nome).sort()).toEqual(['1', '2', 'A', 'B']);
    const p = propostaDeEixos(antes, t, {}, { envelope });
    expect(p.eixos.filter((e) => !e.vertical).map((e) => `${e.nome}@${e.coordenadaMm}${e.nomeAnterior ? ` (era ${e.nomeAnterior})` : ''}`)).toEqual([
      '1@30000',
      '2@28500',
      '3@1500',
      '4@0 (era 2)',
    ]);
    expect([p.novos, p.renomeados]).toEqual([2, 1]);
    const depois = applyBatch(antes, p.comandos).model;
    const horizontais = depois.eixos.filter((e) => e.a.y === e.b.y).sort((x, y) => y.a.y - x.a.y);
    expect(horizontais.map((e) => e.nome)).toEqual(['1', '2', '3', '4']);
    // E não há mais nada a fazer.
    expect(propostaDeEixos(depois, t, {}, { envelope }).motivoVazio).toMatch(/já estão em ordem/);
  });

  it('nome dado à mão fica como está (e não é reusado); linha de referência sem nome também', () => {
    const { m, t } = lote10x30();
    const x = applyBatch(m, [
      { type: 'AddEixo', a: point(-3000, 30000), b: point(13000, 30000), nome: 'Divisa' },
      { type: 'AddEixo', a: point(-3000, 15000), b: point(13000, 15000), nome: '' },
      { type: 'AddEixo', a: point(-3000, 0), b: point(13000, 0), nome: '7' },
    ]).model;
    const p = propostaDeEixos(x, t, {}, { envelope });
    const h = p.eixos.filter((e) => !e.vertical).map((e) => `${e.nome}@${e.coordenadaMm}${e.existenteId ? '*' : ''}`);
    // "Divisa" (y=30000) e a linha sem nome não entram na sequência; o "7" vira o último número.
    expect(h).toEqual(['1@28500', '2@1500', '3@0*']);
    expect(p.eixos.find((e) => e.nomeAnterior === '7')?.nome).toBe('3');
  });

  it('eixo vertical com número (a convenção antiga, antes de 07/10) é renomeado para letra', () => {
    const { m, t } = casa();
    const velho = applyCommand(m, { type: 'AddEixo', a: point(0, -1000), b: point(0, 16000), nome: '1' }).model;
    const p = propostaDeEixos(velho, t);
    expect(p.eixos.find((e) => e.existenteId)?.nome).toBe('A');
    expect(p.eixos.find((e) => e.existenteId)?.nomeAnterior).toBe('1');
  });
});

describe('bolhasDoEixo — a bolha por fora das cotas', () => {
  it('sem cotas: a bolha fica a raio + folga da ponta', async () => {
    const { bolhasDoEixo } = await import('../utils/blueprintEixosAutomaticos');
    const b = bolhasDoEixo({ x: 0, y: 0 }, { x: 0, y: 100 }, 10, null, 2);
    expect(b.centroA).toEqual({ x: 0, y: -12 });
    expect(b.centroB).toEqual({ x: 0, y: 112 });
    expect(b.linhaA).toEqual({ x: 0, y: -2 });
  });

  it('a ponta cai dentro da faixa das cotas: a bolha sai inteira por fora dela', async () => {
    const { bolhasDoEixo } = await import('../utils/blueprintEixosAutomaticos');
    const faixa = { minX: -50, minY: -40, maxX: 150, maxY: 160 };
    const b = bolhasDoEixo({ x: 0, y: 0 }, { x: 0, y: 100 }, 10, faixa, 2);
    expect(b.centroA.y).toBeCloseTo(-40 - 12, 6);
    expect(b.centroB.y).toBeCloseTo(160 + 12, 6);
    expect(b.linhaB.y).toBeCloseTo(160 + 2, 6); // a linha vai até a borda da bolha
  });

  it('eixo longe da faixa (não a cruza): fica como sempre', async () => {
    const { bolhasDoEixo } = await import('../utils/blueprintEixosAutomaticos');
    const b = bolhasDoEixo({ x: 500, y: 0 }, { x: 500, y: 100 }, 10, { minX: -50, minY: -40, maxX: 150, maxY: 160 }, 2);
    expect(b.centroA).toEqual({ x: 500, y: -12 });
  });

  it('PDF e DXF: a bolha fica por fora das cotas do lote', async () => {
    const { DesenhistaDeProva, desenharPlanta, enquadrar, PAPEIS } = await import('../utils/blueprintExport');
    const { gerarDxf } = await import('../utils/blueprintDxf');
    const { m, t } = (() => {
      const { m, t } = nivel();
      const d = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO' });
      return { m: applyBatch(m, [d(0, 0, 10000, 0), d(10000, 0, 10000, 30000), d(10000, 30000, 0, 30000), d(0, 30000, 0, 0)]).model, t };
    })();
    // Um eixo que passa só 0,5 m além do lote: com as cotas do lote, a bolha cairia em cima delas.
    const x = applyCommand(m, { type: 'AddEixo', a: point(0, -500), b: point(0, 30500) }).model;
    void t;
    const papel = new DesenhistaDeProva();
    const op = { denominador: 200, papel: PAPEIS[1], titulo: 't', revisao: 1, hash: 'abc', data: new Date('2026-10-09T12:00:00Z'), cotas: true } as Parameters<typeof desenharPlanta>[2];
    desenharPlanta(papel, x, op, enquadrar(x, 200, PAPEIS[1], true));
    const cotaYs = papel.chamadas.filter((c) => c.tipo === 'linha' && ['#333333', '#999999'].includes((c.args[4] as { cor: string }).cor)).flatMap((c) => [c.args[1] as number, c.args[3] as number]);
    const circulos = papel.chamadas.filter((c) => c.tipo === 'circulo').map((c) => ({ y: c.args[1] as number, r: c.args[2] as number }));
    expect(circulos).toHaveLength(2);
    const [topo, base] = [...circulos].sort((p, q) => p.y - q.y);
    expect(topo.y + topo.r).toBeLessThan(Math.min(...cotaYs));
    expect(base.y - base.r).toBeGreaterThan(Math.max(...cotaYs));
    // DXF: os centros das bolhas ficam além da cota mais externa (mm reais, Y para cima).
    const dxf = gerarDxf(x, { titulo: 't', revisao: 1, hash: 'h', cotas: true });
    const v = dxf.split(/\r?\n/).map((s) => s.trim());
    const centros: number[] = [];
    const cotas: number[] = [];
    for (let i = 0; i + 1 < v.length; i += 2) {
      if (v[i] !== '0') continue;
      const campos: Record<string, string> = {};
      for (let k = i + 2; k + 1 < v.length && v[k] !== '0'; k += 2) campos[v[k]] = v[k + 1];
      if (v[i + 1] === 'CIRCLE' && campos['8'] === 'PLANTA-MALHA-EIXOS') centros.push(Number(campos['20']));
      if (v[i + 1] === 'LINE' && campos['8'] === 'PLANTA-COTAS') cotas.push(Number(campos['20']), Number(campos['21']));
    }
    expect(centros).toHaveLength(2);
    expect(Math.max(...centros)).toBeGreaterThan(Math.max(...cotas));
    expect(Math.min(...centros)).toBeLessThan(Math.min(...cotas));
  });
});

/** ESCALONAR (09/10/2026) — *"escalonar bolhas"*: bolhas vizinhas que se encostariam vão para a fileira de fora. */
describe('bolhasDosEixos — escalonadas', () => {
  // Quatro horizontais como no lote 10 × 30 com recuo de 1,5 m, vistos de longe: 0, 3, 57 e 60 px (raio 10).
  const horizontais = [60, 57, 3, 0].map((y, i) => ({ a: { x: 0, y }, b: { x: 200, y }, nome: String(i + 1) }));

  it('zigue-zague: 1 dentro, 2 fora, 3 dentro, 4 fora — nos dois lados; a linha vai até a bolha', async () => {
    const { bolhasDosEixos } = await import('../utils/blueprintEixosAutomaticos');
    const b = bolhasDosEixos(horizontais, 10, null, 2, 4);
    const passo = 2 * 10 + 4;
    const direita = b.map((x) => x!.centroB.x);
    const esquerda = b.map((x) => x!.centroA.x);
    // Ordenadas por y (0, 3, 57, 60): a de y=0 fica dentro, a de y=3 encostaria → fora; 57 dentro; 60 fora.
    expect(direita).toEqual([212 + passo, 212, 212 + passo, 212]);
    expect(esquerda).toEqual([-12 - passo, -12, -12 - passo, -12]);
    expect(b[0]!.linhaB.x).toBeCloseTo(212 + passo - 10, 6);
  });

  it('bolhas afastadas não se mexem; eixo sem nome não tem bolha', async () => {
    const { bolhasDosEixos } = await import('../utils/blueprintEixosAutomaticos');
    const b = bolhasDosEixos(
      [
        { a: { x: 0, y: 0 }, b: { x: 0, y: 100 }, nome: 'A' },
        { a: { x: 50, y: 0 }, b: { x: 50, y: 100 }, nome: 'B' },
        { a: { x: 60, y: 0 }, b: { x: 60, y: 100 }, nome: '' },
      ],
      10,
      null,
      2,
    );
    expect(b[0]!.centroB).toEqual({ x: 0, y: 112 });
    expect(b[1]!.centroB).toEqual({ x: 50, y: 112 });
    expect(b[2]).toBeNull();
  });

  it('PDF: no lote com recuo de 1,5 m em 1:500, as bolhas dos eixos vizinhos não se sobrepõem', async () => {
    const { DesenhistaDeProva, desenharPlanta, enquadrar, PAPEIS } = await import('../utils/blueprintExport');
    const { m } = nivel();
    const t = m.levels[0].id;
    const d = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO' });
    const x = applyBatch(m, [
      d(0, 0, 10000, 0), d(10000, 0, 10000, 30000), d(10000, 30000, 0, 30000), d(0, 30000, 0, 0),
      ...[30000, 28500, 1500, 0].map((y) => ({ type: 'AddEixo', a: point(-3000, y), b: point(13000, y) }) as Command),
    ]).model;
    const papel = new DesenhistaDeProva();
    const op = { denominador: 500, papel: PAPEIS[0], titulo: 't', revisao: 1, hash: 'abc', data: new Date('2026-10-09T12:00:00Z'), cotas: true } as Parameters<typeof desenharPlanta>[2];
    desenharPlanta(papel, x, op, enquadrar(x, 500, PAPEIS[0], true));
    const circulos = papel.chamadas.filter((c) => c.tipo === 'circulo').map((c) => ({ x: c.args[0] as number, y: c.args[1] as number, r: c.args[2] as number }));
    expect(circulos).toHaveLength(8);
    for (let i = 0; i < circulos.length; i++)
      for (let j = i + 1; j < circulos.length; j++) {
        const p = circulos[i];
        const q = circulos[j];
        expect(Math.hypot(p.x - q.x, p.y - q.y), `bolhas ${i} e ${j}`).toBeGreaterThanOrEqual(p.r + q.r - 1e-6);
      }
  });
});

