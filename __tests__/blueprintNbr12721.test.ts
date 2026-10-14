/**
 * Áreas NBR 12721 a partir do estudo da Planta (13/10/2026, Fase 4 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`): o adaptador
 * `entradaDoEstudo` alimentando o motor puro da Fase 1.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { areaConstruidaMm2 } from '../utils/blueprintKernel/quantities';
import { classificacaoSugerida, entradaDoEstudo, hipotesesNbr12721DaColuna, HIPOTESES_NBR12721_PADRAO } from '../utils/blueprintNbr12721';
import { quadroDeUnidades } from '../utils/blueprintUnidades';
import { unidadesDoPredio } from '../utils/blueprintUnidadesDoPredio';
import { calcularNbr12721 } from '../utils/nbr12721/quadros';

/** Pavimento "1º" (cota 3000) sobre o Térreo: 2 apartamentos de 6 × 6 m sobre um hall de 12 × 2 m. */
function predio() {
  let m = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 },
    { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 3000 },
  ]).model;
  const t = m.levels.find((l) => l.name === '1º')!.id;
  const w = (ax: number, ay: number, bx: number, by: number, e: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: e, heightMm: 3000 });
  m = applyBatch(m, [w(0, 0, 12000, 0, 200), w(12000, 0, 12000, 8000, 200), w(12000, 8000, 0, 8000, 200), w(0, 8000, 0, 0, 200), w(0, 6000, 12000, 6000, 150), w(6000, 0, 6000, 6000, 150)]).model;
  const sala = (x: number) => m.spaces.find((s) => s.levelId === t && s.areaMm2 === 36_000_000 && Math.min(...s.ring.map((p) => p.x)) === x)!.id;
  const hall = m.spaces.find((s) => s.levelId === t && s.areaMm2 === 24_000_000)!.id;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala(0), name: 'Sala 101' },
    { type: 'NameSpace', spaceId: sala(6000), name: 'Sala 102' },
    { type: 'NameSpace', spaceId: hall, name: 'Hall' },
  ]).model;
  m = applyBatch(m, [
    { type: 'AddUnidade', numero: '101', labelIds: [m.labels.find((l) => l.name === 'Sala 101')!.id] },
    { type: 'AddUnidade', numero: '102', labelIds: [m.labels.find((l) => l.name === 'Sala 102')!.id] },
  ]).model;
  return { m, t };
}

const somaDoPavimento = (saida: ReturnType<typeof calcularNbr12721>, nome: string) => saida.quadroI.find((l) => l.floor_label === nome)!.qi_17_floor_real_total_raw;

describe('o estudo vira a entrada do motor', () => {
  it('privativa principal (IV-B b) = a privativa da Planta (eixo + metade externa); o Quadro I do pavimento fecha com a área construída', () => {
    const { m, t } = predio();
    const { entrada, aClassificar } = entradaDoEstudo(m);
    const saida = calcularNbr12721(entrada);
    expect(saida.status).toBe('success');
    const quadro = quadroDeUnidades(m);
    for (const numero of ['101', '102']) {
      const daPlanta = quadro.unidades.find((u) => u.numero === numero)!.areaPrivativaMm2 / 1e6;
      expect(saida.quadroIVB.find((l) => l.unit_label === numero)!.qivb_b_private_main_area_raw).toBeCloseTo(daPlanta, 6);
    }
    const nivel = m.levels.find((l) => l.id === t)!;
    expect(somaDoPavimento(saida, '1º')).toBeCloseTo(areaConstruidaMm2(m, nivel) / 1e6, 6);
    // Nada classificado: tudo entrou pela sugestão, e a tela é avisada.
    expect(aClassificar).toEqual(expect.arrayContaining(['Hall (1º)', 'Sala 101 (1º)']));
    // E a soma das partes fecha com o todo: frações = 1, prédio = Σ unidades.
    expect(saida.pendencias.filter((p) => p.codigo.startsWith('FECH'))).toEqual([]);
  });

  it('a classificação gravada vence a sugestão; coeficiente ausente usa a hipótese do estudo; sem hipótese é MOTOR_007', () => {
    const { m } = predio();
    const hall = m.labels.find((l) => l.name === 'Hall')!;
    const x = applyCommand(m, { type: 'SetNbr12721DoAmbiente', labelIds: [hall.id], nbr12721: { cobertura: 'DIFERENTE', divisao: 'PROPORCIONAL' } }).model;
    expect(calcularNbr12721(entradaDoEstudo(x).entrada).pendencias.map((p) => p.codigo)).toContain('MOTOR_007');
    const hip = { ...HIPOTESES_NBR12721_PADRAO, coeficientesPadrao: { DIFERENTE: 0.5, DESCOBERTA: null } };
    const { entrada, aClassificar } = entradaDoEstudo(x, hip);
    expect(entrada.espacos.find((e) => e.nome === 'Hall')).toMatchObject({ cobertura: 'DIFERENTE', coeficiente: 0.5, divisao: 'PROPORCIONAL' });
    expect(aClassificar).not.toContain('Hall (1º)');
    expect(calcularNbr12721(entrada).status).toBe('success');
  });

  it('unidades dos andares copiados entram com os ambientes e o fechamento de cada andar', () => {
    const { m, t } = predio();
    const x = applyBatch(m, [2, 3].map((i) => ({ type: 'AddLevel', name: `${i}º`, elevationMm: 3000 * i, defaultHeightMm: 3000, tipoDeId: t }) as Command)).model;
    const saida = calcularNbr12721(entradaDoEstudo(x).entrada);
    expect(saida.quadroII.map((l) => l.unit_label).sort()).toEqual(['101', '102', '201', '202', '301', '302']);
    for (const nome of ['1º', '2º', '3º']) expect(somaDoPavimento(saida, nome)).toBeCloseTo(somaDoPavimento(saida, '1º'), 6);
    expect(saida.fracoes.reduce((s, f) => s + f.milesimos, 0)).toBeCloseTo(1000, 6);
  });

  it('a vaga vinculada sai da garagem e entra como acessório da unidade, com a cobertura da garagem; o pavimento não muda', () => {
    const { m } = predio();
    const terreo = m.levels.find((l) => l.name === 'Térreo')!.id;
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: terreo, a: point(ax, ay), b: point(bx, by), thicknessMm: 200, heightMm: 3000 });
    let x = applyBatch(m, [w(0, 0, 12000, 0), w(12000, 0, 12000, 8000), w(12000, 8000, 0, 8000), w(0, 8000, 0, 0)]).model;
    const garagem = x.spaces.find((s) => s.levelId === terreo)!;
    x = applyBatch(x, [
      { type: 'NameSpace', spaceId: garagem.id, name: 'Garagem' },
      { type: 'AddVaga', levelId: terreo, at: point(3000, 3000) },
    ]).model;
    x = applyBatch(x, [
      { type: 'SetNbr12721DoAmbiente', labelIds: [x.labels.find((l) => l.name === 'Garagem')!.id], nbr12721: { cobertura: 'DIFERENTE', coeficiente: 0.5, divisao: 'PROPORCIONAL' } },
      { type: 'SetAcessoriosDaUnidade', unidadeId: x.unidades.find((u) => u.numero === '101')!.id, acessorios: [{ uid: x.vagas[0].uid, afetaPrivativa: true, afetaCoeficiente: true }] },
    ]).model;
    const antes = calcularNbr12721(entradaDoEstudo(m).entrada);
    const { entrada } = entradaDoEstudo(x);
    const vaga = entrada.espacos.find((e) => e.codigo.startsWith('vaga:'))!;
    expect(vaga).toMatchObject({ contabilizacao: 'ACESSORIO_VINCULADO', cobertura: 'DIFERENTE', coeficiente: 0.5 });
    const areaDaVaga = x.vagas[0].larguraMm * x.vagas[0].comprimentoMm / 1e6;
    expect(vaga.areaRealM2).toBeCloseTo(areaDaVaga, 9);
    expect(entrada.espacos.find((e) => e.nome === 'Garagem')!.areaRealM2).toBeCloseTo(garagem.areaMm2 / 1e6 - areaDaVaga, 9);
    const saida = calcularNbr12721(entrada);
    expect(somaDoPavimento(saida, 'Térreo')).toBeCloseTo(areaConstruidaMm2(x, x.levels.find((l) => l.id === terreo)!) / 1e6, 6);
    expect(saida.quadroIVB.find((l) => l.unit_label === '101')!.qivb_c_private_accessory_area_raw).toBeCloseTo(areaDaVaga, 6);
    expect(antes.quadroIVB.find((l) => l.unit_label === '101')!.qivb_c_private_accessory_area_raw).toBe(0);
  });

  it('comum não proporcional rateado pela hipótese do estudo; rateio órfão é avisado e ignorado', () => {
    const { m } = predio();
    const hall = m.labels.find((l) => l.name === 'Hall')!;
    const x = applyCommand(m, { type: 'SetNbr12721DoAmbiente', labelIds: [hall.id], nbr12721: { cobertura: 'PADRAO', divisao: 'NAO_PROPORCIONAL' } }).model;
    const u101 = x.unidades.find((u) => u.numero === '101')!.uid;
    const hip = { ...HIPOTESES_NBR12721_PADRAO, alocacoes: [{ alvoUid: hall.uid, unidadeChave: u101, areaM2: null, percentual: 1 }, { alvoUid: 'sumiu', unidadeChave: u101, areaM2: 3, percentual: null }] };
    const { entrada, avisos } = entradaDoEstudo(x, hip);
    expect(avisos.some((a) => a.includes('não existe mais'))).toBe(true);
    const saida = calcularNbr12721(entrada);
    expect(saida.quadroII.find((l) => l.unit_label === '101')!.qii_25_common_nonprop_covered_standard_raw).toBeCloseTo(24, 6);
    const semRateio = entradaDoEstudo(x);
    expect(semRateio.avisos.some((a) => a.startsWith('Hall: comum não proporcional sem rateio'))).toBe(true);
  });
});

describe('sugestão de classificação', () => {
  it('varanda → coberta de padrão diferente; ambiente com pavimento acima e nada sobre ele → descoberta; fora de unidade → comum proporcional', () => {
    const { m, t } = predio();
    // Um "2º" que só cobre a Sala 101: a Sala 102 e o hall ficam descobertos.
    let x = applyCommand(m, { type: 'AddLevel', name: '2º', elevationMm: 6000, defaultHeightMm: 3000 }).model;
    const p2 = x.levels.find((l) => l.name === '2º')!.id;
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: p2, a: point(ax, ay), b: point(bx, by), thicknessMm: 200, heightMm: 3000 });
    x = applyBatch(x, [w(0, 0, 6000, 0), w(6000, 0, 6000, 6000), w(6000, 6000, 0, 6000), w(0, 6000, 0, 0)]).model;
    x = applyCommand(x, { type: 'NameSpace', spaceId: x.spaces.find((s) => s.levelId === p2)!.id, name: 'Quarto' }).model;
    const sala101 = x.labels.find((l) => l.name === 'Sala 101')!;
    x = applyCommand(x, { type: 'SetSpaceLabelProps', labelId: sala101.id, tipoDeAmbiente: 'VARANDA' }).model;
    const s = classificacaoSugerida(x);
    const de = (nome: string) => s.get(x.labels.find((l) => l.name === nome && l.levelId === t)!.uid);
    expect(de('Sala 101')).toEqual({ cobertura: 'DIFERENTE' });
    expect(de('Sala 102')).toEqual({ cobertura: 'DESCOBERTA' });
    expect(de('Hall')).toEqual({ cobertura: 'DESCOBERTA', divisao: 'PROPORCIONAL' });
  });
});

describe('estudo SEM desenho: só ambientes declarados', () => {
  it('reproduz o caso 02 da testemunha (varanda 0,75) — mesmos Quadros I, II e IV-B do SQL', () => {
    const caso = JSON.parse(readFileSync(path.resolve(process.cwd(), '__tests__/fixtures/nbr12721/02-varanda-coeficiente.json'), 'utf8'));
    let m: BlueprintModel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Terreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
    const t = m.levels[0].id;
    m = applyBatch(m, [{ type: 'AddUnidade', numero: 'Apto 101' }, { type: 'AddUnidade', numero: 'Apto 102' }]).model;
    const un = (n: string) => m.unidades.find((u) => u.numero === n)!.id;
    m = applyBatch(m, [
      { type: 'AddAmbienteDeclarado', levelId: t, nome: 'Area privativa Apto 101', areaMm2: 50_000_000, unidadeId: un('Apto 101'), nbr12721: { cobertura: 'PADRAO' } },
      { type: 'AddAmbienteDeclarado', levelId: t, nome: 'Varanda Apto 101', areaMm2: 10_000_000, unidadeId: un('Apto 101'), nbr12721: { cobertura: 'DESCOBERTA', coeficiente: 0.75 } },
      { type: 'AddAmbienteDeclarado', levelId: t, nome: 'Area privativa Apto 102', areaMm2: 50_000_000, unidadeId: un('Apto 102'), nbr12721: { cobertura: 'PADRAO' } },
      { type: 'AddAmbienteDeclarado', levelId: t, nome: 'Varanda Apto 102', areaMm2: 10_000_000, unidadeId: un('Apto 102'), nbr12721: { cobertura: 'DESCOBERTA', coeficiente: 0.75 } },
      { type: 'AddAmbienteDeclarado', levelId: t, nome: 'Hall comum', areaMm2: 20_000_000, nbr12721: { cobertura: 'PADRAO', divisao: 'PROPORCIONAL', escopo: 'GLOBAL' } },
    ]).model;
    const { entrada, aClassificar } = entradaDoEstudo(m);
    expect(aClassificar).toEqual([]);
    const saida = calcularNbr12721(entrada);
    const confere = (nossas: Record<string, unknown>[], deles: Record<string, unknown>[], chave: string) => {
      for (const d of deles) {
        const n = nossas.find((l) => l[chave] === d[chave])!;
        for (const [campo, v] of Object.entries(d)) if (typeof v === 'number' && campo !== 'row_order') expect(n[campo] as number, `${d[chave]}.${campo}`).toBeCloseTo(v, 9);
      }
    };
    confere(saida.quadroI as never, caso.testemunha.payload.quadro_i, 'floor_label');
    confere(saida.quadroII as never, caso.testemunha.payload.quadro_ii, 'unit_label');
    confere(saida.quadroIVB as never, caso.testemunha.payload.quadro_ivb, 'unit_label');
  });
});

describe('hipóteses do estudo (coluna JSONB)', () => {
  it('sanitiza: chave estranha cai no padrão; coeficiente fora de (0, 10] vira nulo; rateio sem alvo ou sem valor some', () => {
    expect(hipotesesNbr12721DaColuna(null)).toEqual(HIPOTESES_NBR12721_PADRAO);
    const h = hipotesesNbr12721DaColuna({
      coeficientesPadrao: { DIFERENTE: 0.6, DESCOBERTA: -1 },
      escopoPadrao: 'BLOCO',
      areaDaVagaMm2: 12.5,
      numeracao: { regra: 'PAVIMENTO_E_NUMERO' },
      alocacoes: [{ alvoUid: 'a', unidadeChave: 'u', percentual: 0.5 }, { alvoUid: '', unidadeChave: 'u', areaM2: 3 }, { alvoUid: 'b', unidadeChave: 'u' }],
    });
    expect(h).toEqual({
      coeficientesPadrao: { DIFERENTE: 0.6, DESCOBERTA: null },
      escopoPadrao: 'BLOCO',
      areaDaVagaMm2: null,
      numeracao: { regra: 'PAVIMENTO_E_NUMERO' },
      alocacoes: [{ alvoUid: 'a', unidadeChave: 'u', areaM2: null, percentual: 0.5 }],
    });
  });
});

describe('acessório de unidade de andar copiado (Fase 6b)', () => {
  it('a vaga vinculada ao 201 (derivada) entra no IV-B do 201, não do 101; comandosDoAcessorio troca a dona num lote', async () => {
    const { acessoriosParaVincular, comandosDoAcessorio } = await import('../utils/blueprintNbr12721');
    const { m, t } = predio();
    let x = applyBatch(m, [
      { type: 'AddLevel', name: '2º', elevationMm: 6000, defaultHeightMm: 3000, tipoDeId: t },
      { type: 'AddVaga', levelId: m.levels.find((l) => l.name === 'Térreo')!.id, at: point(3000, 3000) },
    ]).model;
    const { linhas, unidades } = acessoriosParaVincular(x);
    const vaga = linhas.find((l) => l.tipo === 'VAGA')!;
    expect(vaga.donaChave).toBeNull();
    const u201 = unidades.find((u) => u.numero === '201')!;
    x = applyBatch(x, comandosDoAcessorio(x, vaga.uid, u201.chave, { afetaPrivativa: true, afetaCoeficiente: true })).model;
    expect(acessoriosParaVincular(x).linhas.find((l) => l.uid === vaga.uid)).toMatchObject({ donaChave: u201.chave, donaNumero: '201' });
    // A vaga fica fora de qualquer ambiente (o Térreo não tem paredes): entra como padrão diferente — com a hipótese do coeficiente.
    const s = calcularNbr12721(entradaDoEstudo(x, { ...HIPOTESES_NBR12721_PADRAO, coeficientesPadrao: { DIFERENTE: 0.5, DESCOBERTA: null } }).entrada);
    expect(s.status).toBe('success');
    const area = x.vagas[0].larguraMm * x.vagas[0].comprimentoMm / 1e6;
    expect(s.quadroIVB.find((l) => l.unit_label === '201')!.qivb_c_private_accessory_area_raw).toBeCloseTo(area, 6);
    expect(s.quadroIVB.find((l) => l.unit_label === '101')!.qivb_c_private_accessory_area_raw).toBe(0);
    // Passa para o 102 (origem): sai do 101/201 e entra no 102, num lote só.
    const u102 = acessoriosParaVincular(x).unidades.find((u) => u.numero === '102')!;
    const lote = comandosDoAcessorio(x, vaga.uid, u102.chave, { afetaPrivativa: true, afetaCoeficiente: false });
    x = applyBatch(x, lote).model;
    expect(x.unidades.find((u) => u.numero === '101')!.acessorios ?? []).toEqual([]);
    expect(x.unidades.find((u) => u.numero === '102')!.acessorios).toEqual([{ uid: vaga.uid, afetaPrivativa: true, afetaCoeficiente: false }]);
    // E sem dona.
    x = applyBatch(x, comandosDoAcessorio(x, vaga.uid, null, { afetaPrivativa: true, afetaCoeficiente: true })).model;
    expect(acessoriosParaVincular(x).linhas.find((l) => l.uid === vaga.uid)!.donaChave).toBeNull();
  });
});

describe('planilha de ambientes declarados (Fase 6b)', () => {
  it('casa pavimento por nome e unidade por número (sem caixa nem acento); área com vírgula; o que não casa é erro da LINHA', async () => {
    const { comandosDaPlanilhaDeDeclarados, COLUNAS_DA_PLANILHA_DE_DECLARADOS } = await import('../utils/blueprintNbr12721');
    expect(COLUNAS_DA_PLANILHA_DE_DECLARADOS[0]).toBe('Pavimento');
    const { m } = predio();
    const { comandos, erros } = comandosDaPlanilhaDeDeclarados(m, [
      { Pavimento: 'TERREO', Ambiente: 'Depósito 101', 'Área (m²)': '4,5', Unidade: '101', Cobertura: '', Coeficiente: '', Divisão: '' },
      { Pavimento: 'Térreo', Ambiente: 'Piscina', 'Área (m²)': 40, Unidade: '', Cobertura: 'descoberta', Coeficiente: '0,5', Divisão: 'não proporcional' },
      { Pavimento: '', Ambiente: '', 'Área (m²)': '', Unidade: '', Cobertura: '', Coeficiente: '', Divisão: '' },
      { Pavimento: 'Cobertura', Ambiente: 'X', 'Área (m²)': 'abc', Unidade: '999', Cobertura: 'telhado', Coeficiente: '20', Divisão: '' },
      { Pavimento: '1º', Ambiente: 'Grande', 'Área (m²)': '1.234,5', Unidade: '', Cobertura: 'padrão', Coeficiente: '', Divisão: '' },
    ]);
    expect(comandos).toHaveLength(3);
    expect(comandos[0]).toMatchObject({ type: 'AddAmbienteDeclarado', nome: 'Depósito 101', areaMm2: 4_500_000, unidadeId: m.unidades.find((u) => u.numero === '101')!.id, nbr12721: { cobertura: 'PADRAO' } });
    expect(comandos[1]).toMatchObject({ nome: 'Piscina', areaMm2: 40_000_000, nbr12721: { cobertura: 'DESCOBERTA', coeficiente: 0.5, divisao: 'NAO_PROPORCIONAL' } });
    expect(comandos[2]).toMatchObject({ nome: 'Grande', areaMm2: 1_234_500_000, nbr12721: { cobertura: 'PADRAO', divisao: 'PROPORCIONAL' } });
    expect(erros).toHaveLength(1);
    expect(erros[0]).toMatch(/^Linha 5: pavimento "Cobertura" não existe.*área "abc" inválida.*unidade "999" não existe.*cobertura "telhado" desconhecida.*coeficiente "20" fora/);
    // E aplicar: entra no modelo e o declarado com dona é privativo dela.
    const x = applyBatch(m, comandos).model;
    expect(x.ambientesDeclarados).toHaveLength(3);
  });
});

describe('congelamento na versão publicada (Fase 7)', () => {
  it('sem unidade nem declarado não congela nada; com unidades, hash estável que muda quando o quadro muda', async () => {
    const { congelamentoNbr12721 } = await import('../utils/blueprintNbr12721');
    const { VERSAO_DO_MOTOR_NBR12721 } = await import('../utils/nbr12721/quadros');
    const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
    expect(congelamentoNbr12721(vazio, HIPOTESES_NBR12721_PADRAO)).toBeNull();
    const { m } = predio();
    const a = congelamentoNbr12721(m, HIPOTESES_NBR12721_PADRAO)!;
    expect(a.saida.status).toBe('success');
    expect(a.versaoMotor).toBe(VERSAO_DO_MOTOR_NBR12721);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(congelamentoNbr12721(m, HIPOTESES_NBR12721_PADRAO)!.hash).toBe(a.hash);
    const hall = m.labels.find((l) => l.name === 'Hall')!;
    const outro = applyCommand(m, { type: 'SetNbr12721DoAmbiente', labelIds: [hall.id], nbr12721: { cobertura: 'DESCOBERTA', coeficiente: 0.5, divisao: 'PROPORCIONAL' } }).model;
    expect(congelamentoNbr12721(outro, HIPOTESES_NBR12721_PADRAO)!.hash).not.toBe(a.hash);
  });

  it('Fase 9: congela código ↔ chave ↔ número de cada unidade, inclusive as dos andares copiados', async () => {
    const { congelamentoNbr12721 } = await import('../utils/blueprintNbr12721');
    const { m: base, t } = predio();
    const m = applyBatch(base, [2, 3].map((i) => ({ type: 'AddLevel', name: `${i}º`, elevationMm: 3000 * i, defaultHeightMm: 3000, tipoDeId: t }) as Command)).model;
    const q = congelamentoNbr12721(m, HIPOTESES_NBR12721_PADRAO)!;
    expect(q.unidades.map((u) => u.numero).sort()).toEqual(['101', '102', '201', '202', '301', '302']);
    const predioDoModelo = unidadesDoPredio(m).unidades;
    for (const u of q.unidades) {
      expect(predioDoModelo.find((x) => x.chave === u.chave)?.numero).toBe(u.numero);
      expect(q.saida.fracoes.some((f) => f.unidade === u.codigo)).toBe(true);
    }
    expect(q.unidades.find((u) => u.numero === '201')!.chave).toMatch(/:/);
    expect(q.unidades.find((u) => u.numero === '101')!.chave).not.toMatch(/:/);
  });
});
