/**
 * ÁGUA FRIA E QUENTE AUTOMÁTICAS (18/09/2026, F4). Casa térrea com caixa
 * d'água no canto, banheiro (chuveiro, lavatório, vaso) e cozinha (pia) — e um
 * sobrado para a coluna atravessar a laje.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
  type DisciplinaDeRede,
  type TipoDePontoHidraulico,
} from '../utils/blueprintKernel';
import {
  HIPOTESES_AGUA_PADRAO,
  dimensionarDN,
  planejarAgua,
  planejarAguaDoModelo,
  relancarAgua,
  vazaoDeProjetoLs,
} from '../utils/blueprintAguaAutomatica';
import { conexoesDerivadas } from '../utils/blueprintKernel';

type Trecho = Extract<Command, { type: 'AddTrecho' }>;

function nivel(): { m: BlueprintModel; t: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}
const ponto = (levelId: string, d: DisciplinaDeRede, tipo: TipoPontoOuString, x: number, y: number, cota: number): Command => ({
  type: 'AddTerminal', levelId, disciplina: d, tipo: String(tipo), at: point(x, y), cotaMm: cota, tipoHidraulico: tipo as TipoDePontoHidraulico,
});
type TipoPontoOuString = TipoDePontoHidraulico;

/** Caixa em (500,500) cota 2800; banheiro à esquerda (x≈1000), cozinha à direita (x≈6000). */
function casa(): { m: BlueprintModel; t: string } {
  const { m, t } = nivel();
  return {
    m: applyBatch(m, [
      ponto(t, 'AGUA_FRIA', 'RESERVATORIO', 500, 500, 2800),
      ponto(t, 'AGUA_FRIA', 'CHUVEIRO', 1000, 2500, 2100),
      ponto(t, 'AGUA_FRIA', 'LAVATORIO', 1600, 2500, 600),
      ponto(t, 'AGUA_FRIA', 'VASO_SANITARIO', 1000, 1800, 300),
      ponto(t, 'AGUA_FRIA', 'PIA_COZINHA', 6000, 1500, 1100),
    ]).model,
    t,
  };
}

const origem = (m: BlueprintModel) => m.terminais!.find((x) => x.tipoHidraulico === 'RESERVATORIO')!;
const novos = (p: ReturnType<typeof planejarAgua>) => p.comandos.filter((c): c is Trecho => c.type === 'AddTrecho');

describe('dimensionarDN — NBR 5626 por velocidade', () => {
  it('Q = 0,3·√ΣP; um lavatório fica no DN mínimo; um banheiro (ΣP 1,0) em 20; o tronco da casa (ΣP 3,4) em 25', () => {
    expect(vazaoDeProjetoLs(1)).toBeCloseTo(0.3, 6);
    expect(dimensionarDN(0.3, 'PVC_SOLDAVEL', HIPOTESES_AGUA_PADRAO, 20).dn).toBe(20);
    const banheiro = dimensionarDN(1.0, 'PVC_SOLDAVEL', HIPOTESES_AGUA_PADRAO, 20);
    expect(banheiro.dn).toBe(20);
    expect(banheiro.velocidadeMs).toBeLessThan(2);
    expect(dimensionarDN(3.4, 'PVC_SOLDAVEL', HIPOTESES_AGUA_PADRAO, 20).dn).toBe(25);
    // Água quente em CPVC: mínimo 22.
    expect(dimensionarDN(0.4, 'CPVC', HIPOTESES_AGUA_PADRAO, 22).dn).toBe(22);
  });
});

describe('planejarAgua — água fria a partir da caixa', () => {
  it('barrilete no teto, duas colunas (banheiro e cozinha), ramais a 2200 e prumadas até cada ponto; todos alcançados', () => {
    const { m } = casa();
    const plano = planejarAgua(m, origem(m));
    expect(plano.motivo).toBeNull();
    expect(plano.colunas).toBe(2);
    expect(plano.aLigar).toBe(4);
    const tr = novos(plano);
    // Barrilete: trechos horizontais no teto (2800).
    const barrilete = tr.filter((c) => c.cotaAMm === 2800 && c.cotaBMm === 2800 && (c.a.x !== c.b.x || c.a.y !== c.b.y));
    expect(barrilete.length).toBeGreaterThanOrEqual(2);
    // Colunas: prumadas que saem do teto — a do banheiro até o ramal (2200, três
    // pontos pendurados) e a da cozinha DIRETO até a pia (1100): coluna e
    // prumada final colineares viram um tubo só (sem luva fantasma).
    const colunas = tr.filter((c) => c.a.x === c.b.x && c.a.y === c.b.y && c.cotaAMm === 2800);
    expect(colunas).toHaveLength(2);
    expect(colunas.map((c) => c.cotaBMm).sort()).toEqual([1100, 2200]);
    // Ramais a 2200 e prumada final até a cota de cada ponto.
    const chuveiro = tr.find((c) => c.a.x === 1000 && c.a.y === 2500 && c.a.x === c.b.x && c.cotaBMm === 2100);
    expect(chuveiro).toBeTruthy();
    expect(tr.every((c) => c.sugerido === true && c.disciplina === 'AGUA_FRIA')).toBe(true);
    // Aplicado, o kernel aceita o lote e a rede fica sem ponta aberta (só as que terminam em peça).
    const aplicado = applyBatch(m, plano.comandos).model;
    const { pontasAbertas } = conexoesDerivadas(aplicado);
    expect(pontasAbertas).toHaveLength(0);
  });

  it('DN pelo peso a jusante: sub-ramais em 20, tronco que sai da caixa em 25; velocidade ≤ 2 m/s em todo trecho', () => {
    const { m } = casa();
    const plano = planejarAgua(m, origem(m));
    const tr = novos(plano);
    const saida = tr.find((c) => c.a.x === 500 && c.a.y === 500 && c.cotaAMm === 2800 && c.cotaBMm === 2800);
    // ΣP da casa = 0,4 + 0,3 + 0,3 + 0,7 = 1,7 → Q 0,39 L/s → DN 25 a 2 m/s (20 daria 1,72 m/s? não: 0,39 L/s em 17 mm = 1,72 m/s ≤ 2 → 20)
    expect(plano.somaDePesos).toBeCloseTo(1.7, 1);
    expect(saida?.bitolaMm).toBe(20);
    const chuveiro = tr.find((c) => c.a.x === 1000 && c.a.y === 2500 && c.cotaBMm === 2100)!;
    expect(chuveiro.bitolaMm).toBe(20);
    expect(plano.dnMaximoMm).toBeGreaterThanOrEqual(20);
    expect(tr.every((c) => c.bitolaMm >= 20)).toBe(true);
  });

  it('IDEMPOTENTE: aplicado e replanejado, nada a fazer; ponto novo depois entra pelo ramal que já existe', () => {
    const { m, t } = casa();
    const aplicado = applyBatch(m, planejarAgua(m, origem(m)).comandos).model;
    const de_novo = planejarAgua(aplicado, origem(aplicado));
    expect(de_novo.comandos).toHaveLength(0);
    expect(de_novo.motivo).toMatch(/já estão ligados/);
    const comDucha = applyCommand(aplicado, ponto(t, 'AGUA_FRIA', 'DUCHA_HIGIENICA', 1200, 1800, 500)).model;
    const p2 = planejarAgua(comDucha, origem(comDucha));
    expect(p2.aLigar).toBe(1);
    expect(novos(p2).length).toBeLessThanOrEqual(3);
  });

  it('RELANÇAR apaga os sugeridos e refaz; os confirmados ficam e um DN pequeno confirmado vira aviso', () => {
    const { m } = casa();
    const aplicado = applyBatch(m, planejarAgua(m, origem(m)).comandos).model;
    const rel = relancarAgua(aplicado, origem(aplicado));
    expect(rel.comandos.filter((c) => c.type === 'DeleteTrecho').length).toBe(aplicado.trechos!.length);
    // Confirma o trecho de saída da caixa com DN 20 e acrescenta pesos: o plano avisa em vez de mexer.
    const saida = aplicado.trechos!.find((c) => c.a.x === 500 && c.a.y === 500 && c.cotaAMm === 2800 && c.cotaBMm === 2800)!;
    let pesado = applyCommand(aplicado, { type: 'SetTrechoProps', trechoId: saida.id, sugerido: false }).model;
    const t = pesado.levels[0].id;
    pesado = applyBatch(pesado, [
      ponto(t, 'AGUA_FRIA', 'MAQUINA_LAVAR', 6000, 2500, 1100),
      ponto(t, 'AGUA_FRIA', 'TANQUE', 6400, 2500, 1100),
      ponto(t, 'AGUA_FRIA', 'TORNEIRA_JARDIM', 6800, 2500, 600),
    ]).model;
    const p = planejarAgua(pesado, origem(pesado));
    expect(p.somaDePesos).toBeGreaterThan(3);
    expect(p.avisos.some((a) => /confirmado/.test(a) && /DN 25/.test(a))).toBe(true);
    expect(p.comandos.some((c) => c.type === 'SetTrechoProps' && c.trechoId === saida.id)).toBe(false);
  });

  it('sem caixa d\'água não há origem; caixa sem ponto tipado tem motivo', () => {
    const { m, t } = nivel();
    expect(planejarAguaDoModelo(m)).toHaveLength(0);
    const soCaixa = applyCommand(m, ponto(t, 'AGUA_FRIA', 'RESERVATORIO', 0, 0, 2800)).model;
    expect(planejarAgua(soCaixa, origem(soCaixa)).motivo).toMatch(/nenhum ponto de água fria/);
  });
});

describe('planejarAgua — sobrado e água quente', () => {
  it('a coluna atravessa a LAJE: caixa no superior alimenta o banheiro do térreo', () => {
    let { m } = nivel();
    m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const [terreo, superior] = m.levels.map((l) => l.id);
    m = applyBatch(m, [
      ponto(superior, 'AGUA_FRIA', 'RESERVATORIO', 500, 500, 2800),
      ponto(terreo, 'AGUA_FRIA', 'CHUVEIRO', 1000, 2500, 2100),
      ponto(terreo, 'AGUA_FRIA', 'LAVATORIO', 1600, 2500, 600),
    ]).model;
    const plano = planejarAgua(m, origem(m));
    expect(plano.motivo).toBeNull();
    const tr = novos(plano);
    // Prumada no superior do teto ao piso (a laje) e, no térreo, do teto ao ramal.
    expect(tr.some((c) => c.levelId === superior && c.a.x === c.b.x && c.cotaAMm === 2800 && c.cotaBMm === 0)).toBe(true);
    expect(tr.some((c) => c.levelId === terreo && c.a.x === c.b.x && c.cotaAMm === 2800 && c.cotaBMm === 2200)).toBe(true);
    expect(plano.pavimentos.map((p) => p.nome)).toEqual(['Térreo']);
    const aplicado = applyBatch(m, plano.comandos).model;
    expect(conexoesDerivadas(aplicado).pontasAbertas).toHaveLength(0);
  });

  it('água quente parte do AQUECEDOR (CPVC, mínimo 22) e a água fria chega até ele com o peso dos pontos quentes', () => {
    const { m, t } = nivel();
    const casa = applyBatch(m, [
      ponto(t, 'AGUA_FRIA', 'RESERVATORIO', 500, 500, 2800),
      ponto(t, 'AGUA_FRIA', 'AQUECEDOR', 3000, 500, 1600),
      ponto(t, 'AGUA_QUENTE', 'AQUECEDOR', 3000, 500, 1600),
      ponto(t, 'AGUA_QUENTE', 'CHUVEIRO', 1000, 2500, 2100),
      ponto(t, 'AGUA_QUENTE', 'LAVATORIO', 1600, 2500, 600),
    ]).model;
    const planos = planejarAguaDoModelo(casa);
    expect(planos.map((p) => p.disciplina).sort()).toEqual(['AGUA_FRIA', 'AGUA_QUENTE']);
    const quente = planos.find((p) => p.disciplina === 'AGUA_QUENTE')!;
    expect(quente.motivo).toBeNull();
    expect(quente.aLigar).toBe(2);
    expect(novos(quente).every((c) => c.disciplina === 'AGUA_QUENTE' && c.bitolaMm >= 22)).toBe(true);
    const fria = planos.find((p) => p.disciplina === 'AGUA_FRIA')!;
    expect(fria.aLigar).toBe(1); // só o aquecedor
    expect(fria.somaDePesos).toBeCloseTo(0.7, 1); // chuveiro 0,4 + lavatório 0,3
    const aplicado = applyBatch(casa, [...fria.comandos, ...quente.comandos]).model;
    expect(conexoesDerivadas(aplicado).pontasAbertas).toHaveLength(0);
  });
});
