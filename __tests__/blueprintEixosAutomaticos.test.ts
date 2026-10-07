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

  it('linha que já tem eixo é pulada; os nomes continuam depois dos usados', () => {
    const { m, t } = casa();
    const comA = applyCommand(m, { type: 'AddEixo', a: point(0, -1000), b: point(0, 16000) }).model; // nasce "A"
    expect(comA.eixos[0].nome).toBe('A');
    const p = propostaDeEixos(comA, t);
    expect(p.jaTinhamEixo).toBe(1);
    expect(p.eixos.filter((e) => e.vertical).map((e) => [e.nome, e.coordenadaMm])).toEqual([
      ['B', 4000],
      ['C', 7000],
      ['D', 10000],
    ]);
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
    expect(HIPOTESES_EIXOS_PADRAO).toEqual({ alemDoDesenhoMm: 3000, comprimentoMinimoDaParedeMm: 1500, juntarAMenosDeMm: 100, usarLadosDoLote: true });
    expect(normalizarHipotesesDeEixos({ alemDoDesenhoMm: 'x', comprimentoMinimoDaParedeMm: -5, juntarAMenosDeMm: 99999, usarLadosDoLote: 'sim' })).toEqual({
      alemDoDesenhoMm: 3000,
      comprimentoMinimoDaParedeMm: 0,
      juntarAMenosDeMm: 2000,
      usarLadosDoLote: true,
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
