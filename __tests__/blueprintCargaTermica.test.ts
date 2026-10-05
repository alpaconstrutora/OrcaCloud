/**
 * CARGA TÉRMICA (04/10/2026, E2.1/E2.2 da climatização): cada parcela conferida
 * à mão numa sala de 6 × 4 m, térreo, com janela ao sul, cozinha ao lado e
 * cobertura em cima; e a psicrometria mínima contra valores de tabela.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_CLIMATIZACAO_PADRAO, hipotesesClimatizacaoDaColuna, HIPOTESES_DO_MOTOR_PADRAO, type HipotesesClimatizacao } from '../utils/blueprintClimatizacao';
import {
  CALOR_POR_ATIVIDADE,
  IRRADIANCIA_POR_ORIENTACAO,
  PESO_SOLAR_DA_ORIENTACAO,
  cargaTermicaDoEstudo,
  cargaTermicaDoNivel,
  pressaoAtmosfericaPa,
  pressaoDeSaturacaoPa,
  umidadeAbsolutaPorTbu,
  umidadeAbsolutaPorUr,
} from '../utils/blueprintCargaTermica';

/** Térreo 8 × 4: Sala (0–4000) e Cozinha (4000–8000); janela ao sul da Sala; telhado sobre tudo. */
function casa(): { m: BlueprintModel; t: string; sala: string; cozinha: string } {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(0, 0, 8000, 0), w(8000, 0, 8000, 4000), w(8000, 4000, 0, 4000), w(0, 4000, 0, 0), w(4000, 0, 4000, 4000)]).model;
  const sala = m.spaces.find((s) => s.ring.every((p) => p.x <= 4100))!;
  const cozinha = m.spaces.find((s) => s.id !== sala.id)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala' },
    { type: 'NameSpace', spaceId: cozinha.id, name: 'Cozinha' },
    { type: 'AddOpening', wallId: m.walls[0].id, kind: 'window', offsetMm: 1000, widthMm: 2000, heightMm: 1000, sillMm: 1000 } as never,
    { type: 'AddAgua', levelId: t, pontos: [point(-500, -500), point(8500, -500), point(8500, 4500), point(-500, 4500)], beiralIndex: 0, inclinacaoPct: 30, baseMm: 2800, espessuraMm: 150 } as never,
  ]).model;
  return { m, t, sala: sala.id, cozinha: cozinha.id };
}

const hipComClima = (over: Partial<HipotesesClimatizacao> = {}): HipotesesClimatizacao => ({
  ...HIPOTESES_CLIMATIZACAO_PADRAO,
  clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 },
  ...over,
});

describe('psicrometria mínima', () => {
  it('saturação a 20 °C ≈ 2,34 kPa; pressão ao nível do mar; umidade absoluta por TBU e por UR batem com a carta', () => {
    expect(pressaoDeSaturacaoPa(20) / 1000).toBeCloseTo(2.34, 1);
    expect(pressaoAtmosfericaPa(0)).toBe(101325);
    expect(pressaoAtmosfericaPa(850) / 1000).toBeCloseTo(91.4, 0);
    // 34 °C TBS / 25 °C TBU ao nível do mar: w ≈ 16,5 g/kg (carta psicrométrica).
    expect(umidadeAbsolutaPorTbu(34, 25, 101325) * 1000).toBeCloseTo(16.5, 0);
    // 24 °C / 50 % UR: w ≈ 9,3 g/kg.
    expect(umidadeAbsolutaPorUr(24, 50, 101325) * 1000).toBeCloseTo(9.3, 0);
  });
});

describe('carga térmica da sala', () => {
  it('sem TBS, nada de condução é inventado: parcelas NÃO AVALIADAS, pendência dita, cargas internas contam', () => {
    const { m, t } = casa();
    const n = cargaTermicaDoNivel(m, HIPOTESES_CLIMATIZACAO_PADRAO, t);
    expect(n.deltaTExternoK).toBeNull();
    const sala = n.ambientes.find((a) => a.nome === 'Sala')!;
    expect(sala.teto.origem).toBe('NAO_AVALIADA');
    expect(sala.paredes.every((p) => p.parcela.origem === 'NAO_AVALIADA')).toBe(true);
    expect(sala.pendencias.join(' ')).toMatch(/Sem temperatura externa/);
    // Sala: 4 pessoas sentadas em repouso (padrão do uso) → 260 + 140 W; iluminação 5 W/m² × área; TV 300 W.
    expect(sala.pessoas).toMatchObject({ sensivelW: 4 * 65, latenteW: 4 * 35 });
    expect(sala.equipamentos.sensivelW).toBe(300);
    expect(sala.sensivelW).toBe(260 + sala.iluminacao.sensivelW + 300);
    expect(sala.latenteW).toBe(140);
    expect(sala.totalBtuH).toBe(Math.round(sala.totalW * 3.412142));
  });

  it('com TBS 34 / setpoint 24: cada parcela confere com a conta à mão', () => {
    const { m, t } = casa();
    const n = cargaTermicaDoNivel(m, hipComClima(), t);
    expect(n.deltaTExternoK).toBe(10);
    const sala = n.ambientes.find((a) => a.nome === 'Sala')!;
    const mot = HIPOTESES_DO_MOTOR_PADRAO;
    // Parede sul (externa, orientação S): área líquida = (comprimento × 2,8) − janela 2 m²; U típico 2,5; ΔTeq = 10 + 6 × 0,3.
    const sul = sala.paredes.find((p) => p.descricao === 'parede S')!;
    expect(sul.uWm2K).toBe(mot.uParedePadraoWm2K);
    expect(sul.deltaTeqK).toBeCloseTo(10 + mot.acrescimoSolarParedeK * PESO_SOLAR_DA_ORIENTACAO.S, 2);
    expect(sul.parcela.sensivelW).toBe(Math.round(2.5 * sul.areaLiquidaM2 * sul.deltaTeqK));
    expect(sul.parcela.origem).toBe('HIPOTESE');
    // Parede para a Cozinha (não climatizada pelo uso): ΔT × 0,5.
    const coz = sala.paredes.find((p) => p.descricao === 'parede p/ Cozinha')!;
    expect(coz.deltaTeqK).toBe(5);
    expect(coz.parcela.memoria).toMatch(/Cozinha não climatizado/);
    // Janela 2 m² ao sul: condução 5,7 × 2 × 10 = 114 W; insolação 2 × 0,87 × 1 × 120 = 208,8 → 209 W.
    const jan = sala.vaos[0];
    expect(jan.descricao).toBe('janela S');
    expect(jan.conducao.sensivelW).toBe(114);
    expect(jan.insolacao.sensivelW).toBe(Math.round(2 * mot.fatorSolarPadrao * IRRADIANCIA_POR_ORIENTACAO.S));
    // Teto sob a cobertura sem camadas: U 2,0 × área × (10 + 10).
    expect(sala.teto.sensivelW).toBe(Math.round(mot.uCoberturaPadraoWm2K * sala.areaPisoM2 * 20));
    expect(sala.teto.memoria).toMatch(/cobertura sem camadas/);
    // Piso sobre o solo: zero, dito como hipótese.
    expect(sala.piso).toMatchObject({ sensivelW: 0, origem: 'HIPOTESE' });
    // Infiltração: 0,34 × V × 0,5 × 10 sensível; latente > 0 com TBU 25 (Δw ≈ 16,5 − 9,3 g/kg).
    expect(sala.infiltracao.sensivelW).toBe(Math.round(0.34 * sala.volumeM3 * 0.5 * 10));
    expect(sala.infiltracao.latenteW).toBeGreaterThan(0);
    // Δw pelas mesmas funções (16,1 − 9,3 ≈ 6,8 g/kg — a conta de cabeça "7,2" era a arredondada).
    const dw = (umidadeAbsolutaPorTbu(34, 25, 101325) - umidadeAbsolutaPorUr(24, 50, 101325)) * 1000;
    expect(dw).toBeGreaterThan(6);
    expect(dw).toBeLessThan(8);
    expect(sala.infiltracao.latenteW).toBe(Math.round(833 * sala.volumeM3 * 0.5 * (dw / 1000)));
    // Totais fecham: soma das parcelas; W/m² coerente; CONFERIR aceso (há hipótese).
    const soma = [...sala.paredes.map((p) => p.parcela), ...sala.vaos.flatMap((v) => [v.conducao, v.insolacao]), sala.teto, sala.piso, sala.pessoas, sala.iluminacao, sala.equipamentos, sala.fonteExtra, sala.infiltracao];
    expect(sala.sensivelW).toBe(soma.reduce((s, x) => s + x.sensivelW, 0));
    expect(sala.latenteW).toBe(soma.reduce((s, x) => s + x.latenteW, 0));
    expect(sala.wPorM2).toBe(Math.round(sala.totalW / sala.areaPisoM2));
    expect(sala.conferir).toBe(true);
    // A Cozinha não é climatizada: entra na lista com carga zero e não soma no pavimento.
    const cozinha = n.ambientes.find((a) => a.nome === 'Cozinha')!;
    expect(cozinha.climatizado).toBe(false);
    expect(cozinha.totalW).toBe(0);
    expect(n.totalW).toBe(sala.totalW);
  });

  it('o declarado vence: vidro com U e FS declarados, camadas da cobertura com λ, cozinha declarada climatizada', () => {
    const { m, t, cozinha } = casa();
    const materiais = [{ id: 'conc', organizationId: 'o', codigo: 'conc', nome: 'Concreto', fonte: 'SINAPI', unidade: 'm3', custo: 0, fabricante: null, densidadeKgM3: null, condutividadeWmK: 1.75, cor: null }] as never;
    let com = applyCommand(m, { type: 'SetOpeningVidro', openingId: m.openings[0].id, vidro: { fatorSolar: 0.4, uWm2K: 2.8, protecao: 'PELICULA_CORTINA', fatorSombreamento: null } }).model;
    com = applyCommand(com, { type: 'SetAguaProps', aguaId: com.roofs![0].id, camadas: [{ espessuraMm: 100, itemCode: 'conc', descricao: 'Laje', funcao: 'ESTRUTURAL' }] }).model;
    const uidCozinha = com.spaces.find((s) => s.id === cozinha)!.labelUid!;
    const hip = hipComClima({ ambientes: { [uidCozinha]: { climatizado: true, temperaturaInternaC: null, pessoas: null, atividade: null, iluminacaoWm2: null, equipamentosW: null, fonteSensivelW: null, fonteLatenteW: null } } });
    const n = cargaTermicaDoNivel(com, hip, t, { materiais });
    const sala = n.ambientes.find((a) => a.nome === 'Sala')!;
    expect(sala.vaos[0].conducao).toMatchObject({ sensivelW: Math.round(2.8 * 2 * 10), origem: 'DECLARADA' });
    expect(sala.vaos[0].insolacao.sensivelW).toBe(Math.round(2 * 0.4 * 0.55 * 120));
    // Cobertura: U = 1/(0,17 + 0,1/1,75 + 0,04) = 1/0,267 ≈ 3,74 — vem das camadas, não do típico.
    expect(sala.teto.memoria).toMatch(/U 3,74 das camadas|U 3\.74 das camadas/);
    // Cozinha climatizada: a parede entre as duas vale zero e a cozinha passa a somar.
    expect(sala.paredes.find((p) => p.descricao === 'parede p/ Cozinha')!.parcela.sensivelW).toBe(0);
    expect(n.ambientes.find((a) => a.nome === 'Cozinha')!.climatizado).toBe(true);
    expect(n.totalW).toBeGreaterThan(sala.totalW);
  });

  it('hipóteses do motor são lidas da coluna com faixa, e `cargaTermicaDoEstudo` percorre os pavimentos em ordem', () => {
    const h = hipotesesClimatizacaoDaColuna({ motor: { trocasDeArPorHora: 1, uVidroPadraoWm2K: 99, fatorDeUsoInterno: 0.8 } });
    expect(h.motor.trocasDeArPorHora).toBe(1);
    expect(h.motor.uVidroPadraoWm2K).toBe(HIPOTESES_DO_MOTOR_PADRAO.uVidroPadraoWm2K);
    expect(h.motor.fatorDeUsoInterno).toBe(0.8);
    expect(Object.keys(CALOR_POR_ATIVIDADE)).toHaveLength(5);
    const { m } = casa();
    const todos = cargaTermicaDoEstudo(m, hipComClima(), {});
    expect(todos).toHaveLength(1);
    expect(todos[0].ambientes.map((a) => a.nome).sort()).toEqual(['Cozinha', 'Sala']);
  });
});
