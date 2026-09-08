/**
 * BCF 2.1 — a pendência saindo do OrçaCloud (08/09/2026).
 *
 * ─── ⚠️ O CASO QUE VALE POR TODOS OS OUTROS ─────────────────────────────────
 *
 * "O `IfcGuid` do tópico é o MESMO que o do IFC." O BCF não descreve o
 * elemento: ele o APONTA. Um guid que não bate faz o receptor abrir a pendência
 * e não selecionar nada — e isso é pior que não exportar, porque o arquivo
 * parece funcionar e a coordenação segue com todo mundo achando que avisou.
 */
import { describe, expect, it } from 'vitest';
import {
  arquivosDoBcf,
  guidDoTopico,
  markupDoTopico,
  topicosDeComentarios,
  topicosDeConflitos,
  versaoBcf,
  viewpointDoTopico,
  type TopicoBcf,
} from '../utils/blueprintBcf';
import { gerarIfc, ifcGuidDeUid } from '../utils/blueprintIfc';
import {
  applyCommand,
  conflitosDoModelo,
  emptyModel,
  point,
  type BlueprintModel,
} from '../utils/blueprintKernel';

/** Uma viga com um cano atravessando — o conflito que a Etapa 6 já provava. */
function comConflito(): BlueprintModel {
  const m0 = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const nivel = m0.levels[0].id;
  const m1 = applyCommand(m0, {
    type: 'AddStructural',
    levelId: nivel,
    kind: 'VIGA',
    pontos: [point(0, 2000), point(6000, 2000)],
    larguraMm: 200,
    alturaMm: 400,
    baseMm: 2400,
  }).model;
  return applyCommand(m1, {
    type: 'AddTrecho',
    levelId: nivel,
    disciplina: 'ELETRICA',
    a: point(3000, 0),
    b: point(3000, 4000),
    cotaAMm: 2600,
    cotaBMm: 2600,
    bitolaMm: 25,
  }).model;
}

const AGORA = new Date('2026-09-08T15:00:00Z');

describe('⚠️ o GUID é a ponte, e ele tem de bater com o IFC', () => {
  it('o IfcGuid do tópico está DENTRO do IFC gerado do mesmo desenho', () => {
    // É a prova de ponta a ponta: quem receber o par (IFC + BCF) vai casar os
    // dois por esta string. Se ela divergir, o receptor não seleciona nada.
    const model = comConflito();
    const conflitos = conflitosDoModelo(model);
    expect(conflitos).toHaveLength(1);

    const [t] = topicosDeConflitos(model, conflitos, 'eu@empresa.com', AGORA);
    const ifc = gerarIfc(model, {
      titulo: 'Casa',
      revisao: 1,
      hash: 'a'.repeat(64),
      data: AGORA,
    });

    expect(t.componentes).toHaveLength(2);
    for (const guid of t.componentes) {
      expect(ifc).toContain(`'${guid}'`);
    }
  });

  it('e ele sai da MESMA função do exportador de IFC, não de uma cópia', () => {
    const model = comConflito();
    const [t] = topicosDeConflitos(model, conflitosDoModelo(model), 'eu', AGORA);
    expect(t.componentes[0]).toBe(ifcGuidDeUid(model.trechos[0].uid));
    expect(t.componentes[1]).toBe(ifcGuidDeUid(model.structures[0].uid));
  });
});

describe('⚠️ exportar duas vezes não duplica a pendência', () => {
  it('o guid do tópico é DERIVADO do que ele aponta', () => {
    // Sem isto, cada rodada de coordenação encheria a caixa de entrada de quem
    // recebe com cópias, e ninguém conseguiria dizer o que é novo.
    const model = comConflito();
    const a = topicosDeConflitos(model, conflitosDoModelo(model), 'eu', AGORA);
    const b = topicosDeConflitos(model, conflitosDoModelo(model), 'eu', new Date());
    expect(a[0].guid).toBe(b[0].guid);
  });

  it('mas pendências DIFERENTES têm guids diferentes', () => {
    expect(guidDoTopico('clash:a:b')).not.toBe(guidDoTopico('clash:a:c'));
  });

  it('e o guid tem o formato que o BCF 2.1 espera', () => {
    expect(guidDoTopico('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('o conteúdo dos arquivos', () => {
  const topico = (extra: Partial<TopicoBcf> = {}): TopicoBcf => ({
    guid: guidDoTopico('t'),
    titulo: 'Cano encontra viga',
    tipo: 'Clash',
    status: 'Open',
    autor: 'eu@empresa.com',
    criadoEm: AGORA,
    descricao: 'Interferência de 200 mm.',
    componentes: ['0aBcD1234567890123456A'],
    alvo: { x: 3000, y: 2000, z: 2600 },
    ...extra,
  });

  it('a versão declara 2.1 — é o que Revit, Navisworks e Solibri leem', () => {
    expect(versaoBcf().conteudo).toContain('VersionId="2.1"');
  });

  it('o markup traz título, autor, data e o tipo de tópico', () => {
    const x = markupDoTopico(topico()).conteudo;
    expect(x).toContain('TopicType="Clash"');
    expect(x).toContain('TopicStatus="Open"');
    expect(x).toContain('<Title>Cano encontra viga</Title>');
    expect(x).toContain('<CreationAuthor>eu@empresa.com</CreationAuthor>');
    expect(x).toContain('2026-09-08T15:00:00Z');
  });

  it('⚠️ o viewpoint traz a SELEÇÃO — sem ela, o receptor não sabe o que olhar', () => {
    const x = viewpointDoTopico(topico()).conteudo;
    expect(x).toContain('<Selection>');
    expect(x).toContain('IfcGuid="0aBcD1234567890123456A"');
  });

  it('⚠️ a câmera está em METRO, e o kernel em milímetro', () => {
    // Errar a unidade põe a câmera a 3 km do modelo, e quem abre vê o vazio.
    const x = viewpointDoTopico(topico()).conteudo;
    expect(x).toContain('<X>3.000000</X>');
    expect(x).toContain('<Y>2.000000</Y>');
  });

  it('o XML escapa o que precisa — título com & não quebra o arquivo', () => {
    const x = markupDoTopico(topico({ titulo: 'Cano & viga <x>' })).conteudo;
    expect(x).toContain('Cano &amp; viga &lt;x&gt;');
    expect(x).not.toContain('<x>');
  });
});

describe('os comentários', () => {
  it('⚠️ o RESOLVIDO viaja como Closed, e não é omitido', () => {
    // Quem recebe precisa saber que aquilo já foi decidido; omitir reabriria a
    // discussão do outro lado.
    const [aberto, fechado] = topicosDeComentarios([
      {
        id: 'c1',
        elementUid: '11111111-2222-4333-8444-555555555555',
        texto: 'Conferir a espessura',
        autorEmail: 'a@b.com',
        criadoEm: '2026-09-01T10:00:00Z',
        resolvidoEm: null,
        ponto: { x: 100, y: 200, z: 0 },
      },
      {
        id: 'c2',
        elementUid: null,
        texto: 'Já decidido em reunião\ncom o cliente',
        autorEmail: null,
        criadoEm: '2026-09-01T10:00:00Z',
        resolvidoEm: '2026-09-02T10:00:00Z',
        ponto: null,
      },
    ]);
    expect(aberto.status).toBe('Open');
    expect(fechado.status).toBe('Closed');
    // O título é a PRIMEIRA LINHA; o texto inteiro fica na descrição.
    expect(fechado.titulo).toBe('Já decidido em reunião');
    expect(fechado.descricao).toContain('com o cliente');
    // Comentário sem elemento não aponta para nada — e não inventa um alvo.
    expect(fechado.componentes).toEqual([]);
  });
});

describe('o pacote', () => {
  it('tem a versão e dois arquivos por tópico', () => {
    const model = comConflito();
    const topicos = topicosDeConflitos(model, conflitosDoModelo(model), 'eu', AGORA);
    const arquivos = arquivosDoBcf(topicos);
    expect(arquivos[0].caminho).toBe('bcf.version');
    expect(arquivos).toHaveLength(1 + topicos.length * 2);
    // ⚠️ Cada tópico numa PASTA com o guid dele: é assim que o BCF 2.1 se
    // organiza, e um caminho plano faz o receptor não achar o viewpoint.
    expect(arquivos[1].caminho).toBe(`${topicos[0].guid}/markup.bcf`);
    expect(arquivos[2].caminho).toBe(`${topicos[0].guid}/viewpoint.bcfv`);
  });

  it('sem pendência nenhuma, o pacote tem só a versão', () => {
    expect(arquivosDoBcf([])).toHaveLength(1);
  });
});

describe('o ZIP de verdade', () => {
  it('⚠️ o `.bcfzip` abre, e traz os arquivos nos caminhos certos', async () => {
    // Montar os arquivos e zipá-los são duas coisas, e a segunda pode falhar
    // sozinha: caminho com barra invertida, conteúdo vazio, `generate` com o
    // tipo errado. Aqui o pacote é lido DE VOLTA, que é o que o receptor faz.
    const { montarBcf } = await import('../services/blueprintExportService');
    const model = comConflito();
    const topicos = topicosDeConflitos(model, conflitosDoModelo(model), 'eu', AGORA);

    const [artefato] = await montarBcf(topicos, {
      denominador: 100,
      papel: { id: 'A4', larguraMm: 210, alturaMm: 297 },
      titulo: 'Casa',
      revisao: 3,
      hash: 'a'.repeat(64),
      data: AGORA,
    });
    expect(artefato.nome.endsWith('.bcfzip')).toBe(true);
    expect(artefato.tipo).toBe('bcf');

    const { default: PizZip } = await import('pizzip');
    const zip = new PizZip(await artefato.blob.arrayBuffer());
    expect(zip.file('bcf.version')?.asText()).toContain('2.1');

    const guid = topicos[0].guid;
    const markup = zip.file(`${guid}/markup.bcf`)?.asText();
    expect(markup).toContain('TopicType="Clash"');
    const viewpoint = zip.file(`${guid}/viewpoint.bcfv`)?.asText();
    // ⚠️ E o guid do elemento SOBREVIVE ao zip: é a ponta do fio que liga o
    // BCF ao IFC, e um encoding errado a cortaria em silêncio.
    expect(viewpoint).toContain(topicos[0].componentes[0]);
  });
});
