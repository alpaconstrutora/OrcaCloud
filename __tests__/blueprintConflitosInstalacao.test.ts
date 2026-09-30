/**
 * CLASH COMPLETO DA INSTALAÇÃO (E7.2 do roadmap elétrico, 29/09/2026).
 *
 * "trecho × parede/abertura (sem furo previsto)" SEM desmentir a regra do
 * módulo (cano dentro de parede comum é onde ele mora, não conflito):
 *  - trecho × VÃO: o eixo passa dentro do vão, entre peitoril e verga;
 *  - trecho × PAREDE ESTRUTURAL: pedaço NÃO vertical abaixo do topo;
 *  - PONTO/QUADRO × ESTRUTURA: o centro da peça dentro de pilar/viga (adiado da E0.4).
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, conflitosArquitetonicos, conflitosDoModelo, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { indexarAceites, uidsEmConflitoAberto } from '../utils/blueprintConflitoStatus';
import { topicosDeConflitos, topicosDeConflitosArquitetonicos } from '../utils/blueprintBcf';

/** Uma parede de 6 m em y = 0 (150 mm), porta de 900 × 2100 a 2 m da ponta; estrutural se pedido. */
function comParede(estrutural = false): { m: BlueprintModel; t: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  m = applyCommand(m, {
    type: 'AddWall', levelId: t, a: point(0, 0), b: point(6000, 0), thicknessMm: 150, heightMm: 2800,
    ...(estrutural ? { camadas: [{ espessuraMm: 150, itemCode: '', descricao: 'Bloco estrutural', funcao: 'ESTRUTURAL' }] } : {}),
  } as Command).model;
  m = applyCommand(m, { type: 'AddOpening', wallId: m.walls[0].id, kind: 'door', offsetMm: 2000, widthMm: 900, heightMm: 2100, sillMm: 0 }).model;
  return { m, t };
}
const tr = (m: BlueprintModel, t: string, a: [number, number, number], b: [number, number, number], disciplina: 'ELETRICA' | 'AGUA_FRIA' = 'AGUA_FRIA') =>
  applyCommand(m, { type: 'AddTrecho', levelId: t, disciplina, a: point(a[0], a[1]), b: point(b[0], b[1]), cotaAMm: a[2], cotaBMm: b[2], bitolaMm: 25 } as Command).model;

describe('trecho × VÃO de porta/janela', () => {
  it('⚠️ o tubo que atravessa a porta a 1 m do piso é conflito — "dentro" ≈ a espessura da parede', () => {
    const { m, t } = comParede();
    const c = conflitosDoModelo(tr(m, t, [2450, -1000, 1000], [2450, 1000, 1000]));
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ classe: 'ABERTURA', outroId: m.openings[0].id });
    expect(c[0].comprimentoDentroMm).toBeCloseTo(150, 0);
  });

  it('acima da verga (no teto), ao lado da porta (ombreira) ou numa parede SEM porta: nada', () => {
    const { m, t } = comParede();
    expect(conflitosDoModelo(tr(m, t, [2450, -1000, 2600], [2450, 1000, 2600]))).toEqual([]);
    expect(conflitosDoModelo(tr(m, t, [1500, -1000, 1000], [1500, 1000, 1000]))).toEqual([]);
    // A regra do módulo continua: parede comum não é conflito.
    expect(conflitosDoModelo(tr(m, t, [4000, -1000, 1000], [4000, 1000, 1000]))).toEqual([]);
  });
});

describe('trecho × PAREDE ESTRUTURAL', () => {
  it('⚠️ o horizontal que atravessa a parede estrutural abaixo do topo é rasgo não previsto', () => {
    const { m, t } = comParede(true);
    const c = conflitosDoModelo(tr(m, t, [4000, -1000, 1000], [4000, 1000, 1000]));
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ classe: 'PAREDE_ESTRUTURAL', outroId: m.walls[0].id });
  });

  it('no teto (passa por cima da parede), a prumada no bloco e o vão (o vão já diz): nada de parede estrutural', () => {
    const { m, t } = comParede(true);
    expect(conflitosDoModelo(tr(m, t, [4000, -1000, 2800], [4000, 1000, 2800]))).toEqual([]);
    expect(conflitosDoModelo(tr(m, t, [4000, 0, 300], [4000, 0, 2800], 'ELETRICA'))).toEqual([]);
    const pelaPorta = conflitosDoModelo(tr(m, t, [2450, -1000, 1000], [2450, 1000, 1000]));
    expect(pelaPorta.map((x) => x.classe)).toEqual(['ABERTURA']);
  });
});

describe('PONTO e QUADRO × ESTRUTURA', () => {
  function comPilarEViga() {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    m = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(1000, 1000)], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800 } as Command).model;
    m = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [point(3000, 0), point(3000, 4000)], larguraMm: 200, alturaMm: 400, baseMm: 2400 } as Command).model;
    return { m, t };
  }

  it('⚠️ a tomada com o centro dentro do pilar é conflito (medida: quanto está dentro); encostada na face, não', () => {
    const { m, t } = comPilarEViga();
    let dentro = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(1050, 1000), cotaMm: 300, tipoEletrico: 'TUG' }).model;
    const c = conflitosArquitetonicos(dentro).filter((x) => x.classe === 'PONTO_X_ESTRUTURA');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ familia: 'terminal', outroId: m.structures[0].id, outroFamilia: 'structural', levelId: t, medidaMm: 100 });
    // Na face do pilar (x = 1150): encostar não é invadir.
    dentro = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(1150, 1000), cotaMm: 300, tipoEletrico: 'TUG' }).model;
    expect(conflitosArquitetonicos(dentro).filter((x) => x.classe === 'PONTO_X_ESTRUTURA')).toEqual([]);
  });

  it('o quadro dentro da viga (na cota dela) é conflito; abaixo da viga, no mesmo lugar em planta, não', () => {
    const { m, t } = comPilarEViga();
    const naViga = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(3000, 2000), cotaMm: 2600 }).model;
    const c = conflitosArquitetonicos(naViga).filter((x) => x.classe === 'PONTO_X_ESTRUTURA');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ familia: 'quadro', outroId: m.structures[1].id });
    const abaixo = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(3000, 2000), cotaMm: 1600 }).model;
    expect(conflitosArquitetonicos(abaixo).filter((x) => x.classe === 'PONTO_X_ESTRUTURA')).toEqual([]);
  });
});

describe('destaque no 3D e BCF', () => {
  it('uidsEmConflitoAberto: as DUAS peças de cada conflito aberto; o aceito não pinta', () => {
    const { m, t } = comParede(true);
    const m2 = tr(m, t, [2450, -1000, 1000], [2450, 1000, 1000]);
    const mep = conflitosDoModelo(m2);
    const uids = uidsEmConflitoAberto(mep, [], new Map());
    expect(uids).toEqual(new Set([m2.trechos![0].uid, m2.openings[0].uid]));
    const aceito = indexarAceites([{ id: 'a', chave: `${mep[0].trechoUid}:${mep[0].outroUid}`, classe: 'ABERTURA', medidaMm: 150, justificativa: 'porta será trocada por parede', acceptedEmail: 'x@y', createdAt: '2026-09-29T12:00:00Z' } as never]);
    expect(uidsEmConflitoAberto(mep, [], aceito).size).toBe(0);
  });

  it('o BCF nomeia o vão, a parede estrutural e o ponto — e diz o que é cada um', () => {
    const { m, t } = comParede(true);
    const m2 = tr(tr(m, t, [2450, -1000, 1000], [2450, 1000, 1000]), t, [4000, -1000, 1000], [4000, 1000, 1000]);
    const topicos = topicosDeConflitos(m2, conflitosDoModelo(m2), 'x@y', new Date('2026-09-29T12:00:00Z'));
    expect(topicos.map((x) => x.titulo)).toEqual([expect.stringMatching(/ encontra V-/), expect.stringMatching(/ encontra P-/)]);
    expect(topicos[0].descricao).toMatch(/vão de porta\/janela/);
    expect(topicos[1].descricao).toMatch(/parede estrutural \(rasgo não previsto\)/);
    const comPonto = applyCommand(
      applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(5000, 1000)], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800 } as Command).model,
      { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(5000, 1000), cotaMm: 300, tipoEletrico: 'TUG' },
    ).model;
    const arq = conflitosArquitetonicos(comPonto).filter((x) => x.classe === 'PONTO_X_ESTRUTURA');
    const [tp] = topicosDeConflitosArquitetonicos(comPonto, arq, 'x@y', new Date('2026-09-29T12:00:00Z'));
    expect(tp.titulo).toMatch(/^O-.* encontra C-/);
    expect(tp.descricao).toMatch(/instalação e estrutura: ponto com o centro 150 mm dentro da estrutura/);
  });
});
