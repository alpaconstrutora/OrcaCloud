/**
 * CLIMATIZAÇÃO E4.2 + E4.3 (04/10/2026): o split nasce no lugar certo — a
 * evaporadora numa parede livre (sem porta, fora dos vãos, externa de
 * preferência), a condensadora do lado de fora, o ponto elétrico com a potência
 * da placa, o sistema ligado no MESMO lote; tudo sugerido, relançar é
 * idempotente, aceitar fixa.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { pointInPolygon } from '../utils/blueprintKernel/geom';
import { HIPOTESES_CLIMATIZACAO_PADRAO, HIPOTESES_DE_SELECAO_PADRAO, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';
import { cargaTermicaDoNivel } from '../utils/blueprintCargaTermica';
import { SEMENTES_DE_TIPOS } from '../utils/blueprintCatalogoDeTipos';
import { modelosDoCatalogo, selecaoDoNivel } from '../utils/blueprintSelecaoClimatizacao';
import { giroParaSoprarParaDentro, planejarEquipamentosSplit } from '../utils/blueprintPosicaoSplit';
import { pontoEletricoDaEvaporadoraExistente } from '../utils/blueprintPontosHidraulicos';

const catalogo = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
const hip = HIPOTESES_DE_SELECAO_PADRAO;
const hipClima: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } };

/** Sala 4 × 4 à esquerda (porta na divisa com a cozinha, janela ao sul) e Cozinha à direita. */
function casa() {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(0, 0, 8000, 0), w(8000, 0, 8000, 4000), w(8000, 4000, 0, 4000), w(0, 4000, 0, 0), w(4000, 0, 4000, 4000)]).model;
  const sala = m.spaces.find((s) => s.ring.every((p) => p.x <= 4100))!;
  const coz = m.spaces.find((s) => s.id !== sala.id)!;
  const divisa = m.walls.find((x) => x.a.x === 4000 && x.b.x === 4000)!;
  const sul = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala' },
    { type: 'NameSpace', spaceId: coz.id, name: 'Cozinha' },
    { type: 'AddOpening', wallId: divisa.id, kind: 'door', offsetMm: 1500, widthMm: 800, heightMm: 2100, sillMm: 0 } as never,
    { type: 'AddOpening', wallId: sul.id, kind: 'window', offsetMm: 1000, widthMm: 2000, heightMm: 1000, sillMm: 1000 } as never,
  ]).model;
  return { m, t, sala: m.spaces.find((s) => s.ring.every((p) => p.x <= 4100))!, divisa, sul };
}
const planejar = (m: BlueprintModel, t: string) => {
  const carga = cargaTermicaDoNivel(m, hipClima, t);
  return planejarEquipamentosSplit(m, selecaoDoNivel(m, carga, hip, catalogo), carga, hip);
};
const terminais = (m: BlueprintModel) => m.terminais ?? [];

describe('climatização E4.2/E4.3 · posição automática do split', () => {
  it('a evaporadora vai para uma parede EXTERNA sem porta, a 2,20 m, dentro da Sala e fora do vão; a condensadora fica do lado de fora; o sistema nasce ligado e o ponto elétrico leva a potência da placa — num lote só', () => {
    const { m, t, sala, divisa, sul } = casa();
    const plano = planejar(m, t);
    expect(plano.motivo).toBeNull();
    expect(plano.aCriar).toHaveLength(1);
    expect(plano.aCriar[0]).toMatchObject({ nome: 'Sala', lugarDaCondensadora: 'FACHADA' });
    const depois = applyBatch(m, plano.comandos).model;
    const evap = terminais(depois).find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
    const cond = terminais(depois).find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
    const ac = terminais(depois).find((x) => x.tipoEletrico === 'AR_CONDICIONADO')!;
    expect(evap).toBeTruthy();
    expect(evap.cotaMm).toBe(2200);
    expect(evap.sugerida).toBe(true);
    expect(pointInPolygon(sala.ring, evap.at)).toBe(true);
    // Não na divisa (tem porta) nem na parede sul no trecho da janela: oeste (x≈0) ou norte (y≈4000) são as externas sem porta.
    expect(Math.abs(evap.at.x - 4000)).toBeGreaterThan(500);
    const naSulForaDaJanela = evap.at.y < 300 && (evap.at.x < 1000 - 300 || evap.at.x > 3000 + 300);
    const naOeste = evap.at.x < 300;
    const naNorte = evap.at.y > 3700;
    expect(naSulForaDaJanela || naOeste || naNorte).toBe(true);
    expect([divisa.id].includes(evap.id)).toBe(false);
    // A condensadora do lado de fora: fora de todo ambiente, a menos de 1,5 m da evaporadora em projeção da parede.
    expect(cond).toBeTruthy();
    expect(depois.spaces.some((s) => pointInPolygon(s.ring, cond.at))).toBe(false);
    expect(cond.capacidadeBtuH).toBe(evap.capacidadeBtuH);
    // O SISTEMA, no mesmo lote.
    expect(evap.condensadoraId).toBe(cond.id);
    // E4.3: a potência da placa do modelo escolhido (não 1400 fixos), no ponto elétrico e na peça.
    const modelo = plano.aCriar[0].modelo;
    expect(ac.potenciaW).toBe(modelo.potenciaVA);
    expect(ac.potenciaW).not.toBe(1400);
    // 11/10/2026 (teste no app real): no centro da evaporadora ficava escondido sob ela — agora na face
    // da parede (norte, y = 4000 − 75), meia largura + 150 mm ao lado; e segue reconhecido como o dela.
    expect(ac.at).toEqual({ x: evap.at.x - 600, y: 3925 });
    expect(pontoEletricoDaEvaporadoraExistente(depois, evap)?.id).toBe(ac.id);
    expect(ac.sugerida).toBe(true);
    expect(evap.capacidadeBtuH).toBe(modelo.capacidadeBtuH);
    expect(evap.capacidadeBtuH).toBeGreaterThanOrEqual(plano.aCriar[0].modelo.capacidadeBtuH);
  });

  it('relançar é idempotente: apaga as sugestões anteriores e cria as mesmas de novo; aceitar fixa e o planejador não mexe mais', () => {
    const { m, t } = casa();
    const p1 = planejar(m, t);
    const m1 = applyBatch(m, p1.comandos).model;
    const p2 = planejar(m1, t);
    expect(p2.apagados).toBe(3);
    expect(p2.aCriar).toHaveLength(1);
    const m2 = applyBatch(m1, p2.comandos).model;
    expect(terminais(m2)).toHaveLength(3);
    expect(terminais(m2).map((x) => [x.tipoHidraulico ?? x.tipoEletrico, x.at.x, x.at.y]).sort()).toEqual(terminais(m1).map((x) => [x.tipoHidraulico ?? x.tipoEletrico, x.at.x, x.at.y]).sort());
    // Aceitar a evaporadora: relançar não apaga nem duplica ela. 11/10/2026: atendido é o SISTEMA aceito —
    // com a condensadora ainda sugerida, ela é refeita no mesmo lugar, ligada à evaporadora aceita.
    const evap = terminais(m2).find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
    const aceito = applyCommand(m2, { type: 'SetTerminalProps', terminalId: evap.id, sugerida: false }).model;
    const p3 = planejar(aceito, t);
    expect(p3.aCriar).toHaveLength(0);
    expect(p3.comandos.filter((c) => c.type === 'DeleteTerminal').map((c) => (c as { terminalId: string }).terminalId)).not.toContain(evap.id);
    expect(p3.condensadorasParaExistentes).toEqual([expect.objectContaining({ nome: 'Sala', evaporadoraId: evap.id })]);
    const m3 = applyBatch(aceito, p3.comandos).model;
    // A evaporadora e a condensadora no mesmo lugar; o ponto de força da evaporadora volta (na face da
    // parede, como na inserção pelo menu) — antes, aceitar só a evaporadora e relançar a deixava sozinha.
    const ass = (x: BlueprintModel) => terminais(x).map((y) => (y.tipoEletrico ? [y.tipoEletrico] : [y.tipoHidraulico, y.at.x, y.at.y])).sort();
    expect(ass(m3)).toEqual(ass(aceito));
    expect(terminais(m3).filter((x) => x.tipoEletrico === 'AR_CONDICIONADO')).toHaveLength(1);
    // Aceitar também a condensadora: agora sim "já atendido", e o planejador não mexe mais.
    const cond = terminais(m3).find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
    expect(terminais(m3).find((x) => x.id === evap.id)!.condensadoraId).toBe(cond.id);
    const tudo = applyCommand(m3, { type: 'SetTerminalProps', terminalId: cond.id, sugerida: false }).model;
    const p4 = planejar(tudo, t);
    expect(p4.jaAtendidos).toEqual(['Sala']);
    expect(p4.condensadorasParaExistentes).toEqual([]);
    expect(p4.comandos.filter((c) => c.type === 'DeleteTerminal').map((c) => (c as { terminalId: string }).terminalId)).not.toContain(evap.id);
  });

  it('trocar o modelo muda a potência do ponto elétrico (9.000 → 24.000 BTU/h): é o que muda a seção do circuito depois', () => {
    const so = (btu: number) => modelosDoCatalogo(SEMENTES_DE_TIPOS.filter((s) => s.nome.includes(btu.toLocaleString('pt-BR'))).map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
    const { m, t } = casa();
    const carga = cargaTermicaDoNivel(m, hipClima, t);
    const semFolga = { ...hip, folgaPct: 0, superPct: 200 };
    const c9 = selecaoDoNivel(m, carga, semFolga, so(9000));
    // 9.000 não alcança a Sala (carga > 10.000): o planejador diz por quê e não inventa.
    const p9 = planejarEquipamentosSplit(m, c9, carga, semFolga);
    expect(p9.aCriar).toHaveLength(0);
    expect(p9.motivo).toMatch(/nenhum modelo alcança/);
    const p24 = planejarEquipamentosSplit(m, selecaoDoNivel(m, carga, semFolga, so(24000)), carga, semFolga);
    expect(p24.aCriar[0].potenciaVA).toBe(2300);
    const p60 = planejarEquipamentosSplit(m, selecaoDoNivel(m, carga, semFolga, so(60000)), carga, semFolga);
    expect(p60.aCriar[0].potenciaVA).toBe(5900);
    // Sem placa, a potência vem do EER (hipótese).
    const semPlaca = modelosDoCatalogo([{ id: 'x', nome: 'Genérico 24k', familia: 'TERMINAL', active: true, propriedades: { tipoHidraulico: 'EVAPORADORA_HI_WALL', capacidadeBtuH: 24000 } }]);
    expect(planejarEquipamentosSplit(m, selecaoDoNivel(m, carga, semFolga, semPlaca), carga, semFolga).aCriar[0].potenciaVA).toBe(Math.round(24000 / 3.412142 / 3));
  });

  it('sem parede livre o relatório pede; sem fachada externa a condensadora vai ao ambiente técnico pelo nome', () => {
    // Um quarto interno 3 × 3 cercado por outros ambientes (nenhuma parede externa), com "Área técnica" ao lado.
    const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = a.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
    // Grade 3 × 3 de 3 m: o do meio é interno.
    const cmds: Command[] = [];
    for (let i = 0; i <= 3; i++) {
      cmds.push(w(0, i * 3000, 9000, i * 3000));
      cmds.push(w(i * 3000, 0, i * 3000, 9000));
    }
    let m = applyBatch(a, cmds).model;
    const meio = m.spaces.find((s) => pointInPolygon(s.ring, point(4500, 4500)))!;
    const lado = m.spaces.find((s) => pointInPolygon(s.ring, point(7500, 4500)))!;
    m = applyBatch(m, [
      { type: 'NameSpace', spaceId: meio.id, name: 'Sala' },
      { type: 'NameSpace', spaceId: lado.id, name: 'Área técnica' },
    ]).model;
    const plano = planejar(m, t);
    expect(plano.aCriar).toHaveLength(1);
    expect(plano.aCriar[0].lugarDaCondensadora).toBe('AMBIENTE_TECNICO');
    expect(pointInPolygon(lado.ring, plano.aCriar[0].condensadora!)).toBe(true);
    // Agora com portas em TODAS as paredes do meio: não há parede livre, e o motivo diz.
    const paredesDoMeio = m.walls.filter((x) => (x.a.x === 3000 && x.b.x === 3000 && Math.min(x.a.y, x.b.y) <= 3000 && Math.max(x.a.y, x.b.y) >= 6000) || (x.a.x === 6000 && x.b.x === 6000) || (x.a.y === 3000 && x.b.y === 3000) || (x.a.y === 6000 && x.b.y === 6000));
    const comPortas = applyBatch(m, paredesDoMeio.map((x) => ({ type: 'AddOpening', wallId: x.id, kind: 'door', offsetMm: 4000, widthMm: 800, heightMm: 2100, sillMm: 0 }) as never)).model;
    const p2 = planejar(comPortas, t);
    expect(p2.aCriar).toHaveLength(0);
    expect(p2.motivo).toMatch(/Sala \(nenhuma parede sem porta/);
  });

  it('F14d (app real, 16/10/2026): na parede externa, a cama encostada não ocupa a parede — o armário alto ocupa', () => {
    // Oeste e norte inteiras com um móvel encostado; a sul tem a janela. Com a CAMA (50 cm), o split fica na parede
    // cheia (oeste ou norte); com o ARMÁRIO (2,20 m, acima da base da evaporadora), só sobra a sul, sobre a janela.
    const com = (tipoId: 'CAMA_CASAL' | 'ARMARIO', familia: 'MOBILIARIO' | 'ARMARIO', alturaMm: number) => {
      const { m, t } = casa();
      const bloco = (x: number, y: number, larguraMm: number, profundidadeMm: number): Command => ({ type: 'AddComponente', levelId: t, tipoId, familia, at: point(x, y), larguraMm, profundidadeMm, alturaMm, rotacaoGraus: 0 });
      const m2 = applyBatch(m, [bloco(575, 1500, 1000, 2850), bloco(2000, 3425, 3850, 1000)]).model;
      const carga = cargaTermicaDoNivel(m2, hipClima, t);
      const plano = planejarEquipamentosSplit(m2, selecaoDoNivel(m2, carga, hip, catalogo), carga, hip, { naParedeExterna: { topoMaximoMm: 2600 } });
      return terminais(applyBatch(m2, plano.comandos).model).find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
    };
    const naCama = com('CAMA_CASAL', 'MOBILIARIO', 500);
    expect(naCama.at.x < 300 || naCama.at.y > 3700, JSON.stringify(naCama.at)).toBe(true);
    const noArmario = com('ARMARIO', 'ARMARIO', 2200);
    expect(noArmario.at.y, JSON.stringify(noArmario.at)).toBeLessThan(300);
  });

  it('F17 (térrea a 30°): na parede externa, a evaporadora não fica sobre uma TOMADA — a descida do eletroduto atravessaria o aparelho e o dreno', () => {
    const { m, t } = casa();
    // Uma tomada baixa no meio de cada parede externa sem porta (oeste e norte), na face.
    const tug = (x: number, y: number): Command => ({ type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', tipoEletrico: 'TUG', at: point(x, y), cotaMm: 300 } as Command);
    const m2 = applyBatch(m, [tug(75, 2000), tug(2000, 3925)]).model;
    const carga = cargaTermicaDoNivel(m2, hipClima, t);
    const plano = planejarEquipamentosSplit(m2, selecaoDoNivel(m2, carga, hip, catalogo), carga, hip, { naParedeExterna: { topoMaximoMm: 2600 } });
    const evap = terminais(applyBatch(m2, plano.comandos).model).find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
    // Meia evaporadora (450) + a folga (300) longe da tomada, ao longo da parede em que ela ficou.
    if (evap.at.x < 300) expect(Math.abs(evap.at.y - 2000), JSON.stringify(evap.at)).toBeGreaterThanOrEqual(750);
    if (evap.at.y > 3700) expect(Math.abs(evap.at.x - 2000), JSON.stringify(evap.at)).toBeGreaterThanOrEqual(750);
  });

  it('F26 (sobrado 12 × 30): na parede externa, a evaporadora não fica sobre uma PRUMADA de água dentro da parede', () => {
    const { m, t } = casa();
    // Uma coluna de água fria descendo dentro de cada parede externa sem porta (oeste e norte), do forro ao piso.
    const prumada = (x: number, y: number): Command => ({ type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(x, y), b: point(x, y), cotaAMm: 2800, cotaBMm: 0, bitolaMm: 25 });
    const m2 = applyBatch(m, [prumada(0, 2000), prumada(2000, 4000)]).model;
    const carga = cargaTermicaDoNivel(m2, hipClima, t);
    const plano = planejarEquipamentosSplit(m2, selecaoDoNivel(m2, carga, hip, catalogo), carga, hip, { naParedeExterna: { topoMaximoMm: 2600 } });
    const evap = terminais(applyBatch(m2, plano.comandos).model).find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
    // Meia evaporadora (450) + meio tubo (12,5) + afastamento (60) + folga (300) = 822,5 longe da prumada.
    if (evap.at.x < 300) expect(Math.abs(evap.at.y - 2000), JSON.stringify(evap.at)).toBeGreaterThanOrEqual(822);
    if (evap.at.y > 3700) expect(Math.abs(evap.at.x - 2000), JSON.stringify(evap.at)).toBeGreaterThanOrEqual(822);
  });

  it('o giro aponta as lâminas para dentro: normal interna +y (parede sul) → 180°; −y (norte) → 0°; +x (oeste) → 90°', () => {
    expect(giroParaSoprarParaDentro({ x: 0, y: 1 })).toBe(180);
    expect(giroParaSoprarParaDentro({ x: 0, y: -1 })).toBe(0);
    expect(giroParaSoprarParaDentro({ x: 1, y: 0 })).toBe(90);
    expect(giroParaSoprarParaDentro({ x: -1, y: 0 })).toBe(-90);
  });
});
