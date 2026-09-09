/**
 * LER BCF — e é aqui que a verificação deixa de depender de terceiro.
 *
 * ─── ⚠️ DOIS LADOS MEUS PODEM PARTILHAR O MESMO ENGANO ──────────────────────
 *
 * Escrever errado e ler errado do mesmo jeito passaria batido numa ida e volta.
 * Por isso este arquivo tem TRÊS fontes, e não duas:
 *
 * 1. o que o nosso escritor produz;
 * 2. o que o nosso leitor entende;
 * 3. ⭐ um `markup.bcf` e um `viewpoint.bcfv` **REAIS do buildingSMART** — o
 *    caso de teste oficial "Component Selection", escrito pela biblioteca
 *    `iabi.BCF` em 2017. Se o leitor entende o arquivo deles, ele não está
 *    entendendo só o meu dialeto.
 *
 * E as asserções sobre a ida e volta comparam com os DADOS DE ORIGEM (o
 * conflito que gerou o tópico), não com o texto intermediário.
 *
 * Sem as amostras, os casos que dependem delas PULAM declarando o motivo.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  casarComModelo,
  lerComponentes,
  lerMarkup,
  type PendenciaImportada,
} from '../utils/blueprintBcfLeitura';
import { markupDoTopico, topicosDeConflitos, viewpointDoTopico } from '../utils/blueprintBcf';
import { ifcGuidDoProjeto } from '../utils/blueprintIfc';
import {
  applyBatch,
  applyCommand,
  conflitosDoModelo,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';

const PASTA = process.env.BCF_AMOSTRAS ?? 'C:/D/ORÇACLOUD/bim-spike/samples/bcf';
const MARKUP_REAL = join(PASTA, 'markup.bcf');
const VIEWPOINT_REAL = join(PASTA, 'viewpoint.bcfv');
const TEM = existsSync(MARKUP_REAL) && existsSync(VIEWPOINT_REAL);

const AGORA = new Date('2026-09-08T15:00:00Z');

function casa(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId: t,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: 200,
    heightMm: 2800,
  });
  const m1 = applyBatch(base, [p(0, 0, 8000, 0), p(8000, 0, 8000, 5000)]).model;
  const m2 = applyCommand(m1, {
    type: 'AddStructural',
    levelId: t,
    kind: 'VIGA',
    pontos: [point(0, 2500), point(8000, 2500)],
    larguraMm: 200,
    alturaMm: 400,
    baseMm: 2400,
  }).model;
  return applyCommand(m2, {
    type: 'AddTrecho',
    levelId: t,
    disciplina: 'ELETRICA',
    a: point(4000, 200),
    b: point(4000, 4800),
    cotaAMm: 2600,
    cotaBMm: 2600,
    bitolaMm: 25,
    rotulo: 'E1',
  }).model;
}

describe('⚠️ o arquivo REAL do buildingSMART', () => {
  it.skipIf(!TEM)('o nosso leitor entende o markup deles', () => {
    // Se ele só entendesse o meu dialeto, a ida e volta seria um espelho.
    const t = lerMarkup(readFileSync(MARKUP_REAL, 'utf8'))!;
    expect(t).not.toBeNull();
    expect(t.guid).toBe('42929e02-f00f-4db8-918e-0fbbc64a45d3');
    expect(t.titulo).toBe('Component Selection');
    expect(t.autor).toBe('dangl@iabi.eu');
    expect(t.criadoEm).toBe('2015-10-16T12:13:15Z');
    expect(t.descricao).toContain('three selected components');
    // ⚠️ O nome do viewpoint deles NÃO é `viewpoint.bcfv` — é
    // `Viewpoint_<guid>.bcfv`. Um leitor que presumisse o nosso nome não
    // acharia o arquivo, e a seleção sumiria sem erro nenhum.
    expect(t.viewpoint).toBe('Viewpoint_817b50b5-f6b2-4e5d-8a37-b692d67cdd91.bcfv');
  });

  it.skipIf(!TEM)('e lê o Header deles — de que IFC a pendência fala', () => {
    const t = lerMarkup(readFileSync(MARKUP_REAL, 'utf8'))!;
    expect(t.ifcDeclarado?.projeto).toBe('3LIQL2UvjC6xkGKOQxhhVW');
    expect(t.ifcDeclarado?.nome).toBe('Estructura.ifc');
  });

  it.skipIf(!TEM)('e acha os TRÊS componentes do viewpoint deles', () => {
    const g = lerComponentes(readFileSync(VIEWPOINT_REAL, 'utf8'));
    expect(g).toEqual([
      '1GU8BMEqHBQxVAbwRD$4Jj',
      '0AQJSsoeDDvwVqSNcwjy55',
      '3DOu_tSXP6evQgY8Ml4CtC',
    ]);
  });
});

describe('a ida e volta pelo nosso par', () => {
  it('⚠️ o tópico volta apontando os MESMOS elementos do conflito de origem', () => {
    // A asserção é contra o CONFLITO, não contra o XML: comparar o lido com o
    // escrito aceitaria um engano simétrico.
    const model = casa();
    const conflitos = conflitosDoModelo(model);
    expect(conflitos).toHaveLength(1);

    const [escrito] = topicosDeConflitos(model, conflitos, 'eu@empresa.com', AGORA);
    const lido = lerMarkup(markupDoTopico(escrito).conteudo)!;
    const componentes = lerComponentes(viewpointDoTopico(escrito).conteudo);

    const [casado] = casarComModelo(
      [{ ...lido, componentes, uidsCasados: [] } as PendenciaImportada],
      model,
    );

    // Os uids casados são exatamente os dois lados do conflito ORIGINAL.
    expect([...casado.uidsCasados].sort()).toEqual(
      [conflitos[0].trechoUid, conflitos[0].outroUid].sort(),
    );
    expect(lido.tipo).toBe('Clash');
    expect(lido.status).toBe('Open');
    expect(lido.autor).toBe('eu@empresa.com');
  });

  it('o Header aponta o IfcProject do estudo', () => {
    const model = casa();
    const [t] = topicosDeConflitos(model, conflitosDoModelo(model), 'eu', AGORA);
    const lido = lerMarkup(
      markupDoTopico(t, { ifcProjectGuid: ifcGuidDoProjeto('estudo-1'), nome: 'planta.ifc' })
        .conteudo,
    )!;
    expect(lido.ifcDeclarado?.projeto).toBe(ifcGuidDoProjeto('estudo-1'));
    expect(lido.ifcDeclarado?.nome).toBe('planta.ifc');
  });

  it('sem Header, o campo volta nulo em vez de inventado', () => {
    const model = casa();
    const [t] = topicosDeConflitos(model, conflitosDoModelo(model), 'eu', AGORA);
    expect(lerMarkup(markupDoTopico(t).conteudo)!.ifcDeclarado).toBeNull();
  });
});

describe('⚠️ o que NÃO casa continua visível', () => {
  it('tópico sobre peça que este modelo não tem volta com a lista vazia', () => {
    // É normal numa coordenação: o projetista comenta o modelo DELE, que tem
    // coisas que não são nossas. Descartar o tópico esconderia o caso
    // interessante — a pendência sobre a peça que alguém apagou.
    const model = casa();
    const [casado] = casarComModelo(
      [
        {
          guid: 'x',
          titulo: 'De outro modelo',
          tipo: 'Issue',
          status: 'Open',
          autor: 'a',
          criadoEm: '',
          descricao: '',
          viewpoint: null,
          ifcDeclarado: null,
          componentes: ['1GU8BMEqHBQxVAbwRD$4Jj'],
          uidsCasados: [],
        },
      ],
      model,
    );
    expect(casado.uidsCasados).toEqual([]);
    expect(casado.titulo).toBe('De outro modelo');
  });

  it('casa só o que existe, quando o tópico mistura os dois', () => {
    const model = casa();
    const conflitos = conflitosDoModelo(model);
    const [t] = topicosDeConflitos(model, conflitos, 'eu', AGORA);
    const [casado] = casarComModelo(
      [
        {
          ...lerMarkup(markupDoTopico(t).conteudo)!,
          componentes: [...t.componentes, '1GU8BMEqHBQxVAbwRD$4Jj'],
          uidsCasados: [],
        },
      ],
      model,
    );
    expect(casado.uidsCasados).toHaveLength(2);
  });
});

describe('o leitor aguenta o mundo real', () => {
  it('⚠️ aceita PREFIXO DE NAMESPACE — metade das ferramentas o usa', () => {
    const xml =
      '<bcf:Markup xmlns:bcf="x"><bcf:Topic Guid="g1" TopicType="Issue" TopicStatus="Closed">' +
      '<bcf:Title>Com prefixo</bcf:Title><bcf:CreationAuthor>a@b</bcf:CreationAuthor>' +
      '</bcf:Topic></bcf:Markup>';
    const t = lerMarkup(xml)!;
    expect(t.guid).toBe('g1');
    expect(t.titulo).toBe('Com prefixo');
    expect(t.status).toBe('Closed');
  });

  it('aceita aspas simples nos atributos', () => {
    expect(lerComponentes("<Component IfcGuid='0aBcD1234567890123456A' />")).toEqual([
      '0aBcD1234567890123456A',
    ]);
  });

  it('desfaz o escape do XML no texto', () => {
    const xml = '<Markup><Topic Guid="g"><Title>Cano &amp; viga &lt;x&gt;</Title></Topic></Markup>';
    expect(lerMarkup(xml)!.titulo).toBe('Cano & viga <x>');
  });

  it('arquivo sem tópico devolve null em vez de um objeto vazio', () => {
    expect(lerMarkup('<Markup></Markup>')).toBeNull();
  });
});
