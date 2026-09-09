/**
 * As MEDIDAS de quadro e terminal (09/09/2026).
 *
 * ─── O PEDIDO ───────────────────────────────────────────────────────────────
 *
 * "o quadro de distribuição aparece com dimensões muito reduzidas. Implemente
 * opção de definir dimensões e dimensionar a caixa tanto em planta como em 3d
 * nestas dimensões. o mesmo serve para os demais componentes."
 *
 * Antes disto, o quadro era um quadrado de 9 PIXELS e o ponto um círculo de 4 —
 * tamanho fixo na tela, que num zoom de trabalho fica menor que a espessura da
 * parede ao lado.
 *
 * ─── ⚠️ O QUE ESTE ARQUIVO PROTEGE ──────────────────────────────────────────
 *
 * Campo novo em família existente tem um jeito clássico de quebrar tudo: entrar
 * no payload canônico de quem nunca o declarou. O hash mudaria, e o acervo
 * inteiro apareceria como alterado sem que ninguém tivesse mexido nele.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  assertModelInvariants,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  payloadDoHash,
  point,
  snapshotHash,
  type BlueprintModel,
} from '../utils/blueprintKernel';
import {
  MEDIDAS_PADRAO_QUADRO,
  MEDIDAS_PADRAO_TERMINAL,
  caixaDaPeca,
  medidasDoQuadro,
  medidasDoTerminal,
  quadroSob,
  terminalSob,
} from '../utils/blueprintRede';

/** Um desenho com um quadro e um ponto, sem medida declarada. */
function comRede(): { model: BlueprintModel; quadroId: string; terminalId: string } {
  let m = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const levelId = m.levels[0].id;
  m = applyCommand(m, {
    type: 'AddQuadro',
    levelId,
    nome: 'QDC',
    at: point(1000, 1000),
    cotaMm: 1600,
  }).model;
  m = applyCommand(m, {
    type: 'AddTerminal',
    levelId,
    disciplina: 'ELETRICA',
    tipo: 'Tomada baixa',
    at: point(2000, 2000),
    cotaMm: 300,
  }).model;
  return { model: m, quadroId: m.quadros[0].id, terminalId: m.terminais[0].id };
}

describe('medidas · o padrão', () => {
  it('⚠️ o padrão é o que o IFC JÁ emitia — 400 × 300 × 200', () => {
    // Um padrão "melhor" aqui teria mudado o arquivo de todo desenho publicado
    // sem que ninguém pedisse.
    expect(MEDIDAS_PADRAO_QUADRO).toEqual({
      larguraMm: 400,
      alturaMm: 300,
      profundidadeMm: 200,
    });
    expect(MEDIDAS_PADRAO_TERMINAL).toEqual({
      larguraMm: 100,
      alturaMm: 100,
      profundidadeMm: 100,
    });
  });

  it('peça sem declaração usa o padrão; declaração PARCIAL só substitui o declarado', () => {
    expect(medidasDoQuadro({})).toEqual(MEDIDAS_PADRAO_QUADRO);
    // Declarar só a largura não pode zerar as outras duas — seria uma caixa
    // plana, e plana some de perfil em vez de dar erro.
    expect(medidasDoQuadro({ larguraMm: 600 })).toEqual({
      larguraMm: 600,
      alturaMm: 300,
      profundidadeMm: 200,
    });
  });
});

describe('medidas · o canônico', () => {
  it('⚠️ desenho sem medida declarada tem o payload BYTE A BYTE igual ao de antes', () => {
    // O caso que quebraria o acervo. Se a chave entrasse com o padrão, o hash
    // de todo desenho anterior mudaria, e cada um apareceria como alterado.
    const { model } = comRede();
    const payload = JSON.parse(payloadDoHash(model));
    for (const chave of ['larguraMm', 'alturaMm', 'profundidadeMm']) {
      expect(Object.keys(payload.quadros[0]), chave).not.toContain(chave);
      expect(Object.keys(payload.terminais[0]), chave).not.toContain(chave);
    }
  });

  it('declarar uma medida MUDA o hash — é conteúdo do desenho', () => {
    const { model, quadroId } = comRede();
    const antes = snapshotHash(model);
    const depois = applyCommand(model, {
      type: 'SetQuadroProps',
      quadroId,
      larguraMm: 600,
    }).model;
    expect(snapshotHash(depois)).not.toBe(antes);
  });

  it('a medida sobrevive ao ida e volta pelo payload', () => {
    const { model, quadroId, terminalId } = comRede();
    let m = applyCommand(model, {
      type: 'SetQuadroProps',
      quadroId,
      larguraMm: 600,
      alturaMm: 450,
      profundidadeMm: 250,
    }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId, larguraMm: 150 }).model;

    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(m)));
    expect(medidasDoQuadro(volta.quadros[0])).toEqual({
      larguraMm: 600,
      alturaMm: 450,
      profundidadeMm: 250,
    });
    // O terminal declarou SÓ a largura: as outras duas voltam nulas, não 100.
    expect(volta.terminais[0].larguraMm).toBe(150);
    expect(volta.terminais[0].alturaMm).toBeNull();
    expect(medidasDoTerminal(volta.terminais[0]).alturaMm).toBe(100);
  });
});

describe('medidas · o comando', () => {
  it('⚠️ `null` volta ao padrão e AUSENTE não mexe — são três estados', () => {
    const { model, quadroId } = comRede();
    let m = applyCommand(model, { type: 'SetQuadroProps', quadroId, larguraMm: 600 }).model;

    // Ausente: trocar o nome não pode apagar a medida.
    m = applyCommand(m, { type: 'SetQuadroProps', quadroId, nome: 'QDC 2' }).model;
    expect(m.quadros[0].larguraMm).toBe(600);

    // `null`: volta ao padrão. Sem isto não há como desfazer uma medida errada
    // sem apagar a peça.
    m = applyCommand(m, { type: 'SetQuadroProps', quadroId, larguraMm: null }).model;
    expect(m.quadros[0].larguraMm).toBeNull();
    expect(medidasDoQuadro(m.quadros[0]).larguraMm).toBe(400);
  });

  it('⚠️ ZERO e negativo são recusados — zero não some, vira um traço', () => {
    const { model, quadroId } = comRede();
    expect(() => applyCommand(model, { type: 'SetQuadroProps', quadroId, larguraMm: 0 })).toThrow(
      /larguraMm/,
    );
    expect(() =>
      applyCommand(model, { type: 'SetQuadroProps', quadroId, profundidadeMm: -100 }),
    ).toThrow();
  });

  it('a invariante pega a medida ruim posta à mão no modelo', () => {
    const { model } = comRede();
    const sujo = { ...model, quadros: [{ ...model.quadros[0], alturaMm: 0 }] };
    // Pelo CÓDIGO, e não pela mensagem: o código é o contrato, a mensagem é
    // texto para humano e pode ser reescrita sem aviso.
    expect(() => assertModelInvariants(sujo)).toThrow();
    try {
      assertModelInvariants(sujo);
    } catch (e) {
      expect((e as { code?: string }).code).toBe('BAD_DIMENSION');
    }
  });
});

describe('medidas · a caixa em 3D', () => {
  it('⚠️ a COTA é o CENTRO da peça, não a base', () => {
    // É a convenção que o IFC já usava (`emitirQuadro` nasce em cota − altura/2
    // e extruda a altura inteira). Tratá-la como base moveria meia altura toda
    // peça de todo desenho publicado, calado, e faria o 3D discordar do arquivo.
    const c = caixaDaPeca({ x: 1000, y: 2000 }, 1600, 0, MEDIDAS_PADRAO_QUADRO);
    expect(c.centro[1]).toBeCloseTo(1.6, 6);
    expect(c.tamanho).toEqual([0.4, 0.3, 0.2]);
  });

  it('a elevação do PAVIMENTO entra na altura — senão o 2º andar cai no térreo', () => {
    const c = caixaDaPeca({ x: 0, y: 0 }, 1600, 2800, MEDIDAS_PADRAO_QUADRO);
    expect(c.centro[1]).toBeCloseTo(4.4, 6);
  });

  it('x e y da planta viram X e Z do 3D, em metros', () => {
    const c = caixaDaPeca({ x: 1500, y: -2500 }, 0, 0, MEDIDAS_PADRAO_TERMINAL);
    expect(c.centro[0]).toBeCloseTo(1.5, 6);
    expect(c.centro[2]).toBeCloseTo(-2.5, 6);
  });
});

describe('medidas · o clique acompanha o desenho', () => {
  it('⚠️ um quadro de 600 mm é clicável na BORDA, e não só no centro', () => {
    // O defeito que a correção quase criou: com a caixa desenhada em escala e o
    // acerto ainda por um raio fixo de poucos pixels, clicar na borda de um
    // quadro grande não faria nada — "não consigo selecionar", de volta pela
    // outra ponta.
    const q = [{ at: { x: 0, y: 0 }, larguraMm: 600, profundidadeMm: 400 }];
    expect(quadroSob(q, { x: 290, y: 0 }, 0)).not.toBeNull();
    expect(quadroSob(q, { x: 0, y: 190 }, 0)).not.toBeNull();
    // E além da pegada mais a folga, não.
    expect(quadroSob(q, { x: 400, y: 0 }, 50)).toBeNull();
  });

  it('a folga de clique soma à pegada, e não a substitui', () => {
    const q = [{ at: { x: 0, y: 0 }, larguraMm: 400, profundidadeMm: 200 }];
    expect(quadroSob(q, { x: 240, y: 0 }, 50)).not.toBeNull(); // 200 + 50 = 250
    expect(quadroSob(q, { x: 260, y: 0 }, 50)).toBeNull();
  });

  it('o TERMINAL é redondo: pega pelo raio declarado mais a folga', () => {
    const t = [{ at: { x: 0, y: 0 }, larguraMm: 300 }];
    expect(terminalSob(t, { x: 140, y: 0 }, 0)).not.toBeNull();
    expect(terminalSob(t, { x: 160, y: 0 }, 0)).toBeNull();
  });

  it('peça sem medida declarada continua clicável pelo padrão', () => {
    expect(quadroSob([{ at: { x: 0, y: 0 } }], { x: 150, y: 0 }, 0)).not.toBeNull();
    expect(terminalSob([{ at: { x: 0, y: 0 } }], { x: 40, y: 0 }, 0)).not.toBeNull();
  });
});

describe('medidas · o IFC segue o que foi declarado', () => {
  /** O IFC de um desenho com um quadro só. */
  async function ifcDoQuadro(campos: Record<string, number> = {}): Promise<string> {
    const { gerarIfc } = await import('../utils/blueprintIfc');
    const { model, quadroId } = comRede();
    const m = Object.keys(campos).length
      ? applyCommand(model, { type: 'SetQuadroProps', quadroId, ...campos } as never).model
      : model;
    return gerarIfc(m, {
      titulo: 'medidas',
      revisao: 1,
      hash: 'm'.repeat(64),
      data: new Date('2026-09-09T12:00:00Z'),
    });
  }

  /** Os perfis retangulares do arquivo, como pares (largura, profundidade). */
  const perfis = (ifc: string): [number, number][] =>
    [...ifc.matchAll(/IFCRECTANGLEPROFILEDEF\(\.AREA\.,\$,#\d+,([\d.]+),([\d.]+)\)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);

  it('sem declaração, sai a caixa de sempre — 400 × 200, extrudada 300', async () => {
    const ifc = await ifcDoQuadro();
    expect(perfis(ifc)).toContainEqual([400, 200]);
    expect(ifc).toMatch(/IFCEXTRUDEDAREASOLID\([^)]*,300\.\)/);
  });

  it('⚠️ com medidas declaradas, o ARQUIVO leva as declaradas', async () => {
    // É o ponto do pedido: o que se define na tela tem de chegar em quem recebe
    // o modelo. Um desenho que mostra 600 e exporta 400 é pior que não ter a
    // opção, porque ninguém confere o arquivo.
    const ifc = await ifcDoQuadro({ larguraMm: 600, profundidadeMm: 250, alturaMm: 450 });
    expect(perfis(ifc)).toContainEqual([600, 250]);
    expect(ifc).toMatch(/IFCEXTRUDEDAREASOLID\([^)]*,450\.\)/);
    expect(perfis(ifc)).not.toContainEqual([400, 200]);
  });
});
