/**
 * RF-126 (DXF), RF-127 (IFC parcial) e as cotas.
 *
 * Os dois formatos são TEXTO, e é por isso que os testes daqui conseguem
 * verificar conteúdo em vez de comparar bytes. Teste de exportação binária vira
 * comparação que ninguém sabe interpretar quando falha.
 *
 * O caso mais importante não é "gera arquivo". É que o DXF saia em ESCALA 1:1 e
 * que o IFC diga o que NÃO contém — as duas coisas que, se estiverem erradas,
 * produzem um arquivo que parece bom e leva a decisão errada.
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
  CAMADAS,
  COBERTURA_DXF,
  gerarDxf,
  retanguloDaParede,
} from '../utils/blueprintDxf';
import { COBERTURA_IFC, gerarIfc, ifcGuid } from '../utils/blueprintIfc';
import {
  AVISO_COTA_POR_FACE,
  cadeiasDoModelo,
  rotuloDeCota,
} from '../utils/blueprintCotas';
import {
  DesenhistaDeProva,
  FAIXA_COTA_MM,
  PAPEIS,
  desenharPlanta,
  enquadrar,
  type OpcoesExportacao,
} from '../utils/blueprintExport';

const H = 2800;
const T = 150;
const A4 = PAPEIS[0];

function comNivel() {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: r.model, levelId: r.model.levels[0].id };
}

function parede(levelId: string, ax: number, ay: number, bx: number, by: number, t = T): Command {
  return { type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: t, heightMm: H };
}

function sala(levelId: string, x0: number, y0: number, x1: number, y1: number): Command[] {
  return [
    parede(levelId, x0, y0, x1, y0),
    parede(levelId, x1, y0, x1, y1),
    parede(levelId, x1, y1, x0, y1),
    parede(levelId, x0, y1, x0, y0),
  ];
}

function planta(l: number, a: number): BlueprintModel {
  const { model, levelId } = comNivel();
  return applyBatch(model, sala(levelId, 0, 0, l * 1000, a * 1000)).model;
}

const OPC = { titulo: 'Casa térrea', revisao: 3, hash: 'abcdef0123456789' };

// ─────────────────────────────────────────────────────────────────────────────
// Cotas
// ─────────────────────────────────────────────────────────────────────────────

describe('cotas · a cadeia tem de fechar contra o total', () => {
  // ⚠️ O motor GLOBAL por eixo (`cadeiasDeCotas`) foi REMOVIDO em 24/08/2026,
  // quando a cota passou a ser por LADO e pela face. Ele tinha ficado sem
  // nenhum consumidor de produção — vivo só por estes testes, que é o pior
  // estado possível: código morto que parece mantido.
  //
  // O que ele garantia e continua valendo está em
  // `__tests__/blueprintCotasPorLado.test.ts`; o que sobra aqui é o que é
  // específico do papel.

  it('o rótulo sai em metro com vírgula, como manda a convenção', () => {
    expect(rotuloDeCota(4000)).toBe('4,00');
    expect(rotuloDeCota(3150)).toBe('3,15');
    // 0,075 em ponto flutuante é 0,07499…; `toFixed` devolveria "0,07".
    expect(rotuloDeCota(75)).toBe('0,08');
    expect(rotuloDeCota(-75)).toBe('-0,08');
  });

  it('abertura NÃO entra na cadeia da estrutura', () => {
    // Cotar vão de porta junto com eixo de parede dobra o número de segmentos e
    // é outra cadeia no desenho técnico, mais perto da folha de esquadrias.
    const base = planta(4, 3);
    const comPorta = applyCommand(base, {
      type: 'AddOpening',
      wallId: base.walls[0].id,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;

    const antes = cadeiasDoModelo(base);
    const depois = cadeiasDoModelo(comPorta);
    // A porta não acrescenta quebra nenhuma às cadeias de estrutura.
    expect(depois.map((c) => c.parcial.length)).toEqual(antes.map((c) => c.parcial.length));
  });

  it('planta vazia não produz cadeia', () => {
    expect(cadeiasDoModelo(emptyModel())).toHaveLength(0);
  });
});

describe('cotas · no papel', () => {
  function opcoes(over: Partial<OpcoesExportacao> = {}): OpcoesExportacao {
    return {
      denominador: 100,
      papel: A4,
      titulo: 'Casa',
      revisao: 1,
      hash: 'abc123',
      data: new Date('2026-08-09T12:00:00Z'),
      ...over,
    };
  }

  it('LIGAR COTA ENCOLHE A ÁREA ÚTIL — não estica o desenho', () => {
    // A cota tem o mesmo tamanho em 1:50 e em 1:200: ela é fixa em milímetro de
    // PAPEL. Se crescesse com a escala, em 1:200 viraria um risco.
    const m = planta(4, 3);
    const sem = enquadrar(m, 100, A4, false);
    const com = enquadrar(m, 100, A4, true);

    expect(sem.utilLarguraMm - com.utilLarguraMm).toBe(FAIXA_COTA_MM);
    expect(sem.utilAlturaMm - com.utilAlturaMm).toBe(FAIXA_COTA_MM);
    // O desenho em si não muda de tamanho: a escala é a mesma.
    expect(com.desenhoLarguraMm).toBe(sem.desenhoLarguraMm);
  });

  it('ligar cota pode fazer uma escala que cabia deixar de caber', () => {
    // E é por isso que o enquadramento precisa saber ANTES de desenhar.
    // 18,00 m + 0,15 de folga = 181,5 mm em 1:100. Cabe nos 186 de área útil,
    // mas não nos 172 que sobram depois da faixa de cota.
    const m = planta(18, 12);
    expect(enquadrar(m, 100, A4, false).cabe).toBe(true);
    expect(enquadrar(m, 100, A4, true).cabe).toBe(false);
  });

  it('a cota aparece no desenho, com o número certo', () => {
    const { model, levelId } = comNivel();
    const m = applyBatch(model, [
      ...sala(levelId, 0, 0, 6000, 3000),
      parede(levelId, 3000, 0, 3000, 3000),
    ]).model;

    const op = opcoes({ cotas: true });
    const d = new DesenhistaDeProva();
    desenharPlanta(d, m, op, enquadrar(m, 100, A4, true));

    // CONTRATO NOVO (24/08/2026): a cota não é mais de eixo.
    //
    // Sala de eixo 6000 dividida em 3000+3000, parede de 150:
    //   total   = 6000 + 150            = 6,15  (face externa a face externa)
    //   parcial = 3075 e 3075           = 3,08  (face externa → eixo → face externa)
    //   interna = 2850 e 2850           = 2,85  (face interna a face interna)
    //
    // O número de eixo ('3,00' / '6,00') NÃO pode mais aparecer: é justamente o
    // que o pedido mandou trocar.
    const textos = d.textos();
    expect(textos).toContain('6,15');
    expect(textos.filter((t) => t === '3,08').length).toBeGreaterThanOrEqual(2);
    expect(textos.filter((t) => t === '2,85').length).toBeGreaterThanOrEqual(2);
    expect(textos).not.toContain('6,00');
  });

  it('COTA SEM DIZER DE ONDE É MEDIDA ENGANA — a legenda declara', () => {
    // Quem mede a face vai achar meia espessura a menos de cada lado e concluir
    // que o desenho está errado.
    const m = planta(4, 3);
    const d = new DesenhistaDeProva();
    const op = opcoes({ cotas: true });
    desenharPlanta(d, m, op, enquadrar(m, 100, A4, true));

    expect(d.textos()).toContain(AVISO_COTA_POR_FACE);
  });

  it('sem cota, o aviso de cota não polui o carimbo', () => {
    const m = planta(4, 3);
    const d = new DesenhistaDeProva();
    desenharPlanta(d, m, opcoes(), enquadrar(m, 100, A4, false));
    expect(d.textos()).not.toContain(AVISO_COTA_POR_FACE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DXF
// ─────────────────────────────────────────────────────────────────────────────

describe('DXF · unidade e escala', () => {
  it('O DXF É 1:1 EM MILÍMETRO REAL — não na escala do papel', () => {
    // Dividir as coordenadas pela escala produziria um arquivo em que uma parede
    // de 4 m mede 4 cm, e toda medição feita nele sairia errada por duas ordens
    // de grandeza.
    const dxf = gerarDxf(planta(4, 3), OPC);

    // O eixo da parede inferior vai de (0,0) a (4000,0).
    expect(dxf).toContain('4000.0000');
    expect(dxf, 'coordenada em escala de papel não pode aparecer').not.toContain('40.0000\n20\n');
  });

  it('a unidade é EXPLÍCITA no cabeçalho', () => {
    // Sem `$INSUNITS` o AutoCAD assume o que estiver configurado na máquina de
    // quem abre, e a mesma geometria vira metro ou polegada.
    const dxf = gerarDxf(planta(4, 3), OPC);
    expect(dxf).toContain('$INSUNITS');
    expect(dxf).toMatch(/\$INSUNITS\n70\n4\n/);
    expect(dxf).toMatch(/\$MEASUREMENT\n70\n1\n/);
  });

  it('declara a versão R12, que é a que todo programa lê', () => {
    expect(gerarDxf(planta(4, 3), OPC)).toMatch(/\$ACADVER\n1\nAC1009\n/);
  });
});

describe('DXF · camadas previsíveis', () => {
  it('todas as camadas são declaradas na tabela', () => {
    const dxf = gerarDxf(planta(4, 3), OPC);
    for (const camada of Object.values(CAMADAS)) {
      expect(dxf, `camada ${camada} não declarada`).toContain(`0\nLAYER\n2\n${camada}\n`);
    }
  });

  it('parede vai como sólido fechado E o eixo em camada própria', () => {
    // O sólido é o material; o eixo é por onde se reeditam as paredes.
    const dxf = gerarDxf(planta(4, 3), OPC);

    const polilinhas = dxf.split('0\nPOLYLINE\n').length - 1;
    const eixos = (dxf.match(new RegExp(`8\n${CAMADAS.EIXOS}\n`, 'g')) ?? []).length;

    // 4 paredes + 1 ambiente derivado.
    expect(polilinhas).toBe(5);
    expect(eixos).toBe(4);
  });

  it('o sólido da parede tem meia espessura para cada lado do eixo', () => {
    const m = planta(4, 3);
    const inferior = m.walls.find((w) => w.a.y === 0 && w.b.y === 0)!;
    const r = retanguloDaParede(m, inferior);

    expect(r).toHaveLength(4);
    const ys = r.map((p) => p.y).sort((a, b) => a - b);
    // Parede de 150 mm sobre y = 0: faces em −75 e +75.
    expect(ys[0]).toBe(-75);
    expect(ys[3]).toBe(75);
    // E as pontas estendidas em meia espessura nas junções: −75 a 4075.
    const xs = r.map((p) => p.x).sort((a, b) => a - b);
    expect(xs[0]).toBe(-75);
    expect(xs[3]).toBe(4075);
  });

  it('abertura sai como as duas bordas do vão, não como bloco de porta', () => {
    // Inventar um bloco de porta seria acrescentar informação que o modelo não
    // tem: a planta sabe onde é o vão, não qual é a folha.
    const base = planta(4, 3);
    const comPorta = applyCommand(base, {
      type: 'AddOpening',
      wallId: base.walls[0].id,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;

    const dxf = gerarDxf(comPorta, OPC);
    const bordas = (dxf.match(new RegExp(`8\n${CAMADAS.ABERTURAS}\n`, 'g')) ?? []).length;
    expect(bordas).toBe(2);
  });

  it('o nome do ambiente vai para a camada de texto', () => {
    const base = planta(4, 3);
    const nomeada = applyCommand(base, {
      type: 'NameSpace',
      spaceId: base.spaces[0].id,
      name: 'Cozinha',
    }).model;

    const dxf = gerarDxf(nomeada, OPC);
    expect(dxf).toContain(`8\n${CAMADAS.TEXTO}\n`);
    expect(dxf).toContain('1\nCozinha\n');
  });

  it('cotas só entram quando pedidas', () => {
    const m = planta(4, 3);
    expect(gerarDxf(m, OPC)).not.toContain(`8\n${CAMADAS.COTAS}\n`);
    expect(gerarDxf(m, { ...OPC, cotas: true })).toContain(`8\n${CAMADAS.COTAS}\n`);
  });

  it('a estrutura do arquivo fecha', () => {
    const dxf = gerarDxf(planta(4, 3), OPC);
    expect(dxf.startsWith('0\nSECTION\n')).toBe(true);
    expect(dxf.endsWith('0\nEOF\n')).toBe(true);
    expect(dxf.split('0\nSECTION\n').length - 1).toBe(3);
    expect(dxf.split('0\nENDSEC\n').length - 1).toBe(3);
  });

  it('nenhuma coordenada sai em notação exponencial', () => {
    // `1e-7` é aceito por alguns leitores e quebra outros.
    const dxf = gerarDxf(planta(4, 3), { ...OPC, cotas: true });
    expect(dxf).not.toMatch(/\d[eE][+-]\d/);
  });

  it('a cobertura diz que a parede NÃO está aparada', () => {
    // Nas junções os retângulos se sobrepõem. Não é erro, é geometria honesta —
    // mas quem abre o arquivo precisa saber antes de hachurar.
    expect(COBERTURA_DXF.join(' ')).toMatch(/NÃO APARADO/i);
    expect(COBERTURA_DXF.join(' ')).toMatch(/MILÍMETRO/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IFC
// ─────────────────────────────────────────────────────────────────────────────

describe('IFC · a cobertura É o requisito', () => {
  it('A COBERTURA VAI DENTRO DO ARQUIVO, EM DOIS LUGARES', () => {
    // O que um IFC não contém é indistinguível do que não existe. Um editor de
    // texto mostra o cabeçalho; um visualizador mostra a descrição do projeto.
    // Quem abre de um jeito não vê o outro.
    const ifc = gerarIfc(planta(4, 3), OPC);

    expect(ifc).toContain('FILE_DESCRIPTION');
    expect(ifc).toMatch(/FILE_DESCRIPTION[\s\S]*COBERTURA PARCIAL/);
    expect(ifc).toMatch(/IFCPROJECT[\s\S]*NÃO CONTÉM telhado/);
  });

  it('diz que TEM portas e janelas, e o que continua de fora', () => {
    // Até 04/09/2026 a frase era "NÃO CONTÉM portas nem janelas" e o teste
    // travava a ausência de IFCDOOR. Agora a porta SAI (ver
    // `blueprintIfcBim.test.ts`), e a cobertura tem de dizer isso — e continuar
    // dizendo o que falta, porque o que um IFC não contém é indistinguível do
    // que não existe.
    const base = planta(4, 3);
    const comPorta = applyCommand(base, {
      type: 'AddOpening',
      wallId: base.walls[0].id,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;

    const ifc = gerarIfc(comPorta, OPC);
    expect(ifc).toContain('IFCDOOR(');
    expect(COBERTURA_IFC.join(' ')).toMatch(/CONTÉM portas e janelas/);
    expect(COBERTURA_IFC.join(' ')).not.toMatch(/NÃO CONTÉM portas/);
    expect(COBERTURA_IFC.join(' ')).toMatch(/NÃO CONTÉM telhado, escada, forro/);
    expect(COBERTURA_IFC.join(' ')).toMatch(/NÃO CONTÉM ARMADURA/);
    expect(COBERTURA_IFC.join(' ')).toMatch(/NÃO CONTÉM tipos/);
  });

  it('avisa que o contorno do ambiente é do EIXO, e que a área de piso vai na quantidade', () => {
    expect(COBERTURA_IFC.join(' ')).toMatch(/pelo EIXO das paredes/);
    expect(COBERTURA_IFC.join(' ')).toMatch(/NetFloorArea é a área de PISO/);
  });
});

describe('IFC · estrutura e determinismo', () => {
  it('a hierarquia espacial mínima está completa', () => {
    const ifc = gerarIfc(planta(4, 3), OPC);
    for (const tipo of [
      'IFCPROJECT',
      'IFCSITE',
      'IFCBUILDING',
      'IFCBUILDINGSTOREY',
      'IFCWALL',
      'IFCSPACE',
    ]) {
      expect(ifc, `falta ${tipo}`).toContain(tipo);
    }
  });

  it('a unidade é MILÍMETRO, declarada', () => {
    expect(gerarIfc(planta(4, 3), OPC)).toContain(
      'IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)',
    );
  });

  it('é IfcWall e NÃO IfcWallStandardCase', () => {
    // StandardCase promete um eixo material com camadas declaradas. Sem material,
    // usá-lo diria ao receptor que existe uma composição construtiva que não
    // existe.
    const ifc = gerarIfc(planta(4, 3), OPC);
    expect(ifc).toContain('IFCWALL(');
    expect(ifc).not.toContain('IFCWALLSTANDARDCASE');
  });

  it('REEXPORTAR A MESMA VERSÃO DÁ O MESMO ARQUIVO', () => {
    // GUID aleatório seria mais fácil e estaria errado: duas exportações do
    // mesmo snapshot ficariam impossíveis de comparar, e a comparação é metade
    // do motivo de exportar IFC.
    const m = planta(4, 3);
    const data = new Date('2026-08-09T12:00:00Z');
    expect(gerarIfc(m, { ...OPC, data })).toBe(gerarIfc(m, { ...OPC, data }));
  });

  it('versões diferentes produzem GUIDs diferentes', () => {
    expect(ifcGuid('a')).not.toBe(ifcGuid('b'));
    expect(ifcGuid('a')).toHaveLength(22);
    expect(ifcGuid('a')).toMatch(/^[0-9A-Za-z_$]{22}$/);
  });

  it('o arquivo abre e fecha como STEP', () => {
    const ifc = gerarIfc(planta(4, 3), OPC);
    expect(ifc.startsWith('ISO-10303-21;')).toBe(true);
    expect(ifc.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true);
    expect(ifc).toContain("FILE_SCHEMA(('IFC4'));");
  });

  it('cada linha de dados tem id próprio e termina em ponto e vírgula', () => {
    const ifc = gerarIfc(planta(4, 3), OPC);
    const dados = ifc.split('DATA;\n')[1].split('\nENDSEC;')[0].split('\n');
    const ids = new Set<string>();

    for (const linha of dados) {
      expect(linha, `linha malformada: ${linha}`).toMatch(/^#\d+= IFC[A-Z0-9]+\(.*\);$/);
      const id = linha.split('=')[0];
      expect(ids.has(id), `id repetido: ${id}`).toBe(false);
      ids.add(id);
    }
  });

  it('planta vazia gera arquivo válido, sem parede nem ambiente', () => {
    const { model } = comNivel();
    const ifc = gerarIfc(model, OPC);
    expect(ifc).toContain('IFCBUILDINGSTOREY');
    expect(ifc).not.toContain('IFCWALL(');
  });
});
