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
    expect(ac.at).toEqual(evap.at);
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
    // Aceitar: a evaporadora deixa de ser sugerida → "já atendido", e relançar não apaga nada dela.
    const evap = terminais(m2).find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
    const aceito = applyCommand(m2, { type: 'SetTerminalProps', terminalId: evap.id, sugerida: false }).model;
    const p3 = planejar(aceito, t);
    expect(p3.jaAtendidos).toEqual(['Sala']);
    expect(p3.aCriar).toHaveLength(0);
    expect(p3.comandos.filter((c) => c.type === 'DeleteTerminal').map((c) => (c as { terminalId: string }).terminalId)).not.toContain(evap.id);
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

  it('o giro aponta as lâminas para dentro: normal interna +y (parede sul) → 180°; −y (norte) → 0°; +x (oeste) → 90°', () => {
    expect(giroParaSoprarParaDentro({ x: 0, y: 1 })).toBe(180);
    expect(giroParaSoprarParaDentro({ x: 0, y: -1 })).toBe(0);
    expect(giroParaSoprarParaDentro({ x: 1, y: 0 })).toBe(90);
    expect(giroParaSoprarParaDentro({ x: -1, y: 0 })).toBe(-90);
  });
});
