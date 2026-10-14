/**
 * Motor NBR 12721 (13/10/2026, Fase 1 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`) conferido contra a
 * TESTEMUNHA: o que o SQL `calculate_area_version` vigente no banco calculou
 * para cada caso de `__tests__/fixtures/nbr12721/` (capturado por
 * `scripts/nbr12721-testemunha.mjs`). Campo a campo, tolerância 1e-9.
 *
 * Divergir daqui não é "ajustar o teste": é mudar a regra de cálculo de um
 * documento de cartório — decisão registrada no plano.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { arredondar, calcularNbr12721, milesimosPeloMaiorResto } from '../utils/nbr12721/quadros';
import type { CoberturaNbr, EntradaNbr12721 } from '../utils/nbr12721/tipos';

const dir = path.resolve(process.cwd(), '__tests__', 'fixtures', 'nbr12721');
const TOL = 1e-9;

type Linha = Record<string, unknown>;
interface Caso {
  descricao: string;
  entrada: {
    blocks: { code: string; name: string; sort_order?: number }[];
    floors: { code: string; block: string; name: string; sort_order?: number; label?: string }[];
    units: { code: string; block: string; is_autonomous?: boolean; is_active?: boolean }[];
    spaces: {
      code: string; name: string; block: string; floor: string; unit: string | null;
      use_class: 'private' | 'common'; private_nature: string; coverage_class: string;
      common_division_class: string; ownership_accounting_mode: string;
      real_area_m2_raw: number; coefficient_value: number | null;
    }[];
    accessory_links?: { parent_unit: string; accessory_space: string; affects_private_area?: boolean; affects_coefficient?: boolean }[];
    common_allocations?: { common_space: string; target_unit: string; allocated_real_area_m2_raw?: number | null; allocated_equivalent_area_m2_raw?: number | null; percentage?: number | null }[];
    distribution_scopes?: { common_space: string; distribution_scope: 'global' | 'block'; block: string | null }[];
  };
  testemunha: {
    calculo: { status: string; blocking_errors: { code: string }[] };
    payload: { quadro_i: Linha[]; quadro_ii: Linha[]; quadro_ivb: Linha[]; fractions: Linha[] } | null;
  };
}

const COBERTURA: Record<string, CoberturaNbr> = { covered_standard: 'PADRAO', covered_different: 'DIFERENTE', uncovered: 'DESCOBERTA' };

/** O vocabulário das tabelas antigas → o do motor. É a ÚNICA tradução, e só existe no teste. */
function entradaDoCaso(c: Caso): EntradaNbr12721 {
  const e = c.entrada;
  return {
    blocos: e.blocks.map((b) => ({ codigo: b.code, nome: b.name, ordem: b.sort_order ?? 1 })),
    pavimentos: e.floors.map((f) => ({ codigo: f.code, bloco: f.block, nome: f.label ?? f.name, ordem: f.sort_order ?? 1 })),
    unidades: e.units.map((u) => ({ codigo: u.code, bloco: u.block, autonoma: u.is_autonomous ?? true, ativa: u.is_active ?? true })),
    espacos: e.spaces.map((s) => ({
      codigo: s.code,
      nome: s.name,
      bloco: s.block,
      pavimento: s.floor,
      unidade: s.unit,
      uso: s.use_class === 'private' ? 'PRIVATIVO' : 'COMUM',
      natureza: s.private_nature === 'main' ? 'PRINCIPAL' : s.private_nature === 'accessory' ? 'ACESSORIA' : null,
      cobertura: COBERTURA[s.coverage_class],
      divisao: s.common_division_class === 'proportional' ? 'PROPORCIONAL' : s.common_division_class === 'non_proportional' ? 'NAO_PROPORCIONAL' : null,
      contabilizacao:
        s.ownership_accounting_mode === 'linked_accessory' ? 'ACESSORIO_VINCULADO' : s.ownership_accounting_mode === 'common_area' ? 'COMUM' : 'UNIDADE',
      areaRealM2: s.real_area_m2_raw,
      coeficiente: s.coefficient_value,
    })),
    vinculos: (e.accessory_links ?? []).map((l) => ({
      unidade: l.parent_unit,
      espaco: l.accessory_space,
      afetaPrivativa: l.affects_private_area ?? true,
      afetaCoeficiente: l.affects_coefficient ?? true,
    })),
    alocacoes: (e.common_allocations ?? []).map((a) => ({
      espaco: a.common_space,
      unidade: a.target_unit,
      areaRealM2: a.allocated_real_area_m2_raw ?? null,
      areaEquivalenteM2: a.allocated_equivalent_area_m2_raw ?? null,
      percentual: a.percentage ?? null,
    })),
    escopos: (e.distribution_scopes ?? []).map((d) => ({ espaco: d.common_space, escopo: d.distribution_scope === 'global' ? 'GLOBAL' : 'BLOCO', bloco: d.block })),
  };
}

/** Compara toda coluna numérica que a testemunha tem; as de identidade/ordem ficam de fora. */
function conferirLinhas(nome: string, nossas: Linha[], deles: Linha[], chave: string, chaveNossa = chave) {
  expect(nossas.map((l) => l[chaveNossa]).sort(), `${nome}: linhas`).toEqual(deles.map((l) => l[chave]).sort());
  const divergencias: string[] = [];
  for (const d of deles) {
    const n = nossas.find((l) => l[chaveNossa] === d[chave])!;
    for (const [campo, valor] of Object.entries(d)) {
      if (typeof valor !== 'number' || campo === 'row_order') continue;
      const nosso = n[campo];
      if (typeof nosso !== 'number' || Math.abs(nosso - valor) > TOL) divergencias.push(`${d[chave]}.${campo}: motor ${nosso} × SQL ${valor}`);
    }
  }
  expect(divergencias, nome).toEqual([]);
}

const arquivos = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const casos = arquivos.map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as Caso] as const);

describe('motor NBR 12721 × testemunha do SQL', () => {
  it('tem os 16 casos capturados', () => {
    expect(casos.length).toBeGreaterThanOrEqual(16);
    for (const [, c] of casos) expect(c.testemunha?.calculo?.status).toMatch(/^(success|failed)$/);
  });

  it.each(casos)('%s', (nome, c) => {
    const saida = calcularNbr12721(entradaDoCaso(c));
    const t = c.testemunha;
    expect(saida.status, `${nome}: status`).toBe(t.calculo.status);

    const bloqueantes = [...new Set(saida.pendencias.filter((p) => p.bloqueante).map((p) => p.codigo))].sort();
    expect(bloqueantes, `${nome}: códigos`).toEqual([...new Set(t.calculo.blocking_errors.map((x) => x.code))].sort());
    if (!t.payload) return;

    conferirLinhas(`${nome} Quadro I`, saida.quadroI as unknown as Linha[], t.payload.quadro_i, 'floor_label');
    conferirLinhas(`${nome} Quadro II`, saida.quadroII as unknown as Linha[], t.payload.quadro_ii, 'unit_label');
    conferirLinhas(`${nome} Quadro IV-B`, saida.quadroIVB as unknown as Linha[], t.payload.quadro_ivb, 'unit_label');
    conferirLinhas(`${nome} frações`, saida.fracoes as unknown as Linha[], t.payload.fractions, 'unit_code', 'unidade');
  });
});

describe('o que o motor acrescenta ao SQL', () => {
  const sucesso = casos.filter(([, c]) => c.testemunha.calculo.status === 'success');

  it.each(sucesso)('%s: milésimos fecham exatamente 1000', (_nome, c) => {
    const saida = calcularNbr12721(entradaDoCaso(c));
    const soma = saida.fracoes.reduce((s, f) => s + f.milesimos * 10_000, 0);
    expect(Math.round(soma)).toBe(10_000_000);
    for (const f of saida.fracoes) expect(Math.abs(f.milesimos - f.fraction_thousandths_raw)).toBeLessThanOrEqual(0.0001 + 1e-9);
  });

  it('maior resto: sobra vai ao maior resto, empate pela ordem', () => {
    expect(milesimosPeloMaiorResto([1 / 3, 1 / 3, 1 / 3], 0)).toEqual([334, 333, 333]);
    expect(milesimosPeloMaiorResto([0.5, 0.5], 0)).toEqual([500, 500]);
    expect(milesimosPeloMaiorResto([0, 0])).toEqual([0, 0]);
  });

  it('avisa por que o prédio não fecha (casos 12, 14 e 15 da testemunha)', () => {
    const avisos = (nome: string) => {
      const c = casos.find(([n]) => n === nome)![1];
      return calcularNbr12721(entradaDoCaso(c)).pendencias.filter((p) => !p.bloqueante).map((p) => p.codigo);
    };
    expect(avisos('12-acessorio-fora-do-coeficiente')).toEqual(expect.arrayContaining(['FECH_002', 'FECH_001']));
    expect(avisos('14-varios-pavimentos-duplex')).toContain('FECH_001');
    expect(avisos('15-unidade-inativa-equivalente-informado')).toEqual(expect.arrayContaining(['FECH_001', 'FECH_003']));
    expect(avisos('01-edificio-simples')).toEqual([]);
    expect(avisos('09-dois-blocos-fechamento')).toEqual([]);
  });

  it('é puro: mesma entrada, mesma saída, entrada intacta', () => {
    const c = casos.find(([n]) => n === '14-varios-pavimentos-duplex')![1];
    const e = entradaDoCaso(c);
    const copia = JSON.parse(JSON.stringify(e));
    expect(calcularNbr12721(e)).toEqual(calcularNbr12721(e));
    expect(e).toEqual(copia);
  });

  it('referência inexistente é defeito do adaptador, não pendência', () => {
    const c = casos.find(([n]) => n === '01-edificio-simples')![1];
    const e = entradaDoCaso(c);
    e.espacos[0] = { ...e.espacos[0], unidade: 'NAO-EXISTE' };
    expect(() => calcularNbr12721(e)).toThrow(/unidade inexistente/);
  });

  it('arredonda como o Postgres: meio para longe do zero, sem ruído binário', () => {
    expect(arredondar(2.0000005, 6)).toBe(2.000001);
    expect(arredondar(0.1 + 0.2, 6)).toBe(0.3);
    expect(arredondar(-1.5, 0)).toBe(-2);
  });
});
