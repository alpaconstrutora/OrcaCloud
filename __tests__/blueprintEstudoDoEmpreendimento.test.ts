/**
 * Estudo sem desenho a partir do Empreendimento (13/10/2026, Fase 5 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { entradaDoEstudo } from '../utils/blueprintNbr12721';
import { montarEstudoDoEmpreendimento } from '../utils/blueprintEstudoDoEmpreendimento';
import { calcularNbr12721 } from '../utils/nbr12721/quadros';
import type { EmpreendimentoFloor, EmpreendimentoTower, EmpreendimentoUnit, EmpreendimentoWithChildren } from '../types/empreendimento';

const unidade = (name: string, floor: number, private_area?: number, typology = '2 dorm.'): EmpreendimentoUnit =>
  ({ id: `u-${name}`, tower_id: 't1', name, floor, private_area, typology, status: 'DISPONIVEL' }) as EmpreendimentoUnit;
const torre = (id: string, name: string, units: EmpreendimentoUnit[], sort_order = 1): EmpreendimentoTower =>
  ({ id, empreendimento_id: 'e1', name, units, sort_order, created_at: '', updated_at: '' }) as EmpreendimentoTower;

function emp(towers: EmpreendimentoTower[], common_areas: EmpreendimentoWithChildren['common_areas'] = []) {
  return { name: 'Residencial Teste', towers, common_areas } as Pick<EmpreendimentoWithChildren, 'name' | 'towers' | 'common_areas'>;
}

describe('montar o estudo a partir do Empreendimento', () => {
  it('pavimentos dos andares das unidades; uma unidade e um ambiente privativo por unidade; privativa total = Σ private_area', () => {
    const e = emp(
      [torre('t1', 'Torre A', [unidade('101', 1, 62.5), unidade('102', 1, 58.25), unidade('201', 2, 62.5), unidade('202', 2, 58.25), unidade('Loja', 0, 140, 'Loja')])],
      [{ id: 'c1', empreendimento_id: 'e1', name: 'Hall', area: 40 } as EmpreendimentoWithChildren['common_areas'][number]],
    );
    const r = montarEstudoDoEmpreendimento(e);
    expect(r.model.levels.map((l) => l.name)).toEqual(['Térreo', 'Pavimento 1', 'Pavimento 2']);
    expect(r.model.levels.map((l) => l.elevationMm)).toEqual([0, 3000, 6000]);
    expect(r.contagem).toEqual({ pavimentos: 3, unidades: 5, ambientes: 6, privativaM2: 62.5 + 58.25 + 62.5 + 58.25 + 140 });
    const privativas = r.model.ambientesDeclarados.filter((a) => a.unidadeUid);
    expect(privativas.reduce((s, a) => s + a.areaMm2, 0) / 1e6).toBeCloseTo(r.contagem.privativaM2, 9);
    // Cada privativa na sua unidade e no seu andar.
    const u201 = r.model.unidades.find((u) => u.numero === '201')!;
    const a201 = r.model.ambientesDeclarados.find((a) => a.unidadeUid === u201.uid)!;
    expect(r.model.levels.find((l) => l.id === a201.levelId)!.name).toBe('Pavimento 2');
    expect(u201.tipologia).toBe('2 dorm.');
    // O hall entra comum proporcional.
    expect(r.model.ambientesDeclarados.find((a) => a.nome === 'Hall')!.nbr12721).toEqual({ cobertura: 'PADRAO', divisao: 'PROPORCIONAL' });
  });

  it('o estudo montado calcula: frações pela privativa (tudo padrão), comum rateado, sem nada a classificar', () => {
    const e = emp([torre('t1', 'Torre A', [unidade('101', 1, 60), unidade('102', 1, 40)])], [{ id: 'c1', empreendimento_id: 'e1', name: 'Hall', area: 20 } as never]);
    const { model } = montarEstudoDoEmpreendimento(e);
    const { entrada, aClassificar } = entradaDoEstudo(model);
    expect(aClassificar).toEqual([]);
    const s = calcularNbr12721(entrada);
    expect(s.status).toBe('success');
    expect(s.fracoes.find((f) => f.unidade === '101')!.fraction_decimal_raw).toBeCloseTo(0.6, 12);
    expect(s.quadroII.find((l) => l.unit_label === '101')!.qii_32_common_prop_covered_standard_raw).toBeCloseTo(12, 6);
  });

  it('Fase 9: cada unidade do Empreendimento sai ligada à sua Unidade da Planta — a mesma chave que o congelamento usa', async () => {
    const { congelamentoNbr12721, HIPOTESES_NBR12721_PADRAO } = await import('../utils/blueprintNbr12721');
    // Dois "101" (torres diferentes): o segundo entra como "101-2" e continua ligado à SUA unidade.
    const e = emp([torre('t1', 'Torre A', [unidade('101', 1, 60), unidade('102', 1, 40)]), torre('t2', 'Torre B', [{ ...unidade('101', 1, 50), id: 'u-101-B', tower_id: 't2' } as EmpreendimentoUnit], 2)], [
      { id: 'c1', empreendimento_id: 'e1', name: 'Hall', area: 20 } as never,
    ]);
    const r = montarEstudoDoEmpreendimento(e);
    expect(r.chaves).toHaveLength(3);
    const numeroDaChave = new Map(r.model.unidades.map((u) => [u.uid, u.numero] as const));
    expect(Object.fromEntries(r.chaves.map((c) => [c.unitId, numeroDaChave.get(c.chave)]))).toEqual({ 'u-101': '101', 'u-102': '102', 'u-101-B': '101-2' });
    const q = congelamentoNbr12721(r.model, HIPOTESES_NBR12721_PADRAO)!;
    for (const c of r.chaves) {
      const codigo = q.unidades.find((u) => u.chave === c.chave)!.codigo;
      expect(q.saida.fracoes.some((f) => f.unidade === codigo)).toBe(true);
    }
    expect(montarEstudoDoEmpreendimento(emp([])).chaves).toEqual([]);
  });

  it('template de pavimentos expande repeat_count e inclui andar sem unidade (garagem)', () => {
    const pav = (name: string, floor_number: number, repeat_count = 1): EmpreendimentoFloor =>
      ({ id: name, tower_id: 't1', name, tipo: 'TIPO', floor_number, repeat_count, sort_order: floor_number, created_at: '', updated_at: '' }) as EmpreendimentoFloor;
    const e = emp([torre('t1', 'Torre A', [unidade('101', 1, 50), unidade('301', 3, 50)])]);
    const r = montarEstudoDoEmpreendimento(e, new Map([['t1', [pav('Garagem', -1), pav('Tipo', 1, 3)]]]));
    expect(r.model.levels.map((l) => l.name)).toEqual(['Garagem', 'Tipo 1', 'Tipo 2', 'Tipo 3']);
    expect(r.avisos.some((a) => a.includes('tirados dos andares'))).toBe(false);
  });

  it('número acima de 16 caracteres é cortado e continua único; unidade sem privativa entra sem ambiente; tudo avisado', () => {
    const e = emp([
      torre('t1', 'Torre A', [unidade('Cobertura Duplex 1501', 15, 210), unidade('Cobertura Duplex 1502', 15, 200), unidade('101', 1)]),
    ]);
    const r = montarEstudoDoEmpreendimento(e);
    const numeros = r.model.unidades.map((u) => u.numero);
    expect(numeros.every((n) => n.length <= 16)).toBe(true);
    expect(new Set(numeros).size).toBe(3);
    expect(r.avisos.some((a) => a.includes('"Cobertura Duplex 1501"'))).toBe(true);
    expect(r.avisos.some((a) => a.includes('sem área privativa') && a.includes('101'))).toBe(true);
    expect(r.contagem.ambientes).toBe(2);
  });

  it('duas torres: pavimentos levam o nome da torre, com aviso do rateio global; sem torre nasce um Térreo vazio, com aviso', () => {
    const r = montarEstudoDoEmpreendimento(emp([torre('t1', 'Torre A', [unidade('101', 1, 50)]), torre('t2', 'Torre B', [{ ...unidade('101', 1, 50), id: 'u-b101', tower_id: 't2' }], 2)]));
    expect(r.model.levels.map((l) => l.name)).toEqual(['Torre A · Pavimento 1', 'Torre B · Pavimento 1']);
    expect(r.model.unidades.map((u) => u.numero).sort()).toEqual(['101', '101-2']);
    expect(r.avisos[0]).toMatch(/mais de uma torre/);
    const vazio = montarEstudoDoEmpreendimento(emp([]));
    expect(vazio.model.levels.map((l) => l.name)).toEqual(['Térreo']);
    expect(vazio.contagem).toEqual({ pavimentos: 1, unidades: 0, ambientes: 0, privativaM2: 0 });
    expect(vazio.avisos[0]).toMatch(/não tem torres/);
  });
});

// ── o serviço (banco simulado) ────────────────────────────────────────────────

const chamadas: string[] = [];
let empDoBanco: Record<string, unknown> | null = null;
let falharVinculo = false;

vi.mock('../services/empreendimentoService', () => ({
  empreendimentoService: {
    getById: async () => empDoBanco,
    listFloors: async () => [],
    update: async (id: string, patch: Record<string, unknown>) => {
      chamadas.push(`update ${id} ${JSON.stringify(patch)}`);
      if (falharVinculo) throw new Error('falhou o vínculo');
    },
  },
}));
vi.mock('../services/blueprintService', () => ({
  createStudy: async (i: { organizationId: string; name: string }) => {
    chamadas.push(`createStudy ${i.organizationId} ${i.name}`);
    return { study: { id: 'std_novo' }, branch: { id: 'br_1' } };
  },
  saveDraft: async (branchId: string) => {
    chamadas.push(`saveDraft ${branchId}`);
    return 'hash';
  },
  archiveStudy: async (id: string) => {
    chamadas.push(`archiveStudy ${id}`);
  },
}));

const { blueprintEstudoDoEmpreendimento } = await import('../services/blueprintEstudoDoEmpreendimento');

describe('serviço: criar estudo sem desenho', () => {
  beforeEach(() => {
    chamadas.length = 0;
    falharVinculo = false;
    empDoBanco = { id: 'e1', organization_id: 'org_do_emp', name: 'Residencial', blueprint_study_id: null, towers: [torre('t1', 'Torre A', [unidade('101', 1, 50)])], common_areas: [] };
  });

  it('cria na organização DO EMPREENDIMENTO, grava o rascunho e vincula', async () => {
    const r = await blueprintEstudoDoEmpreendimento.criar('e1');
    expect(r.studyId).toBe('std_novo');
    expect(chamadas).toEqual(['createStudy org_do_emp Áreas — Residencial', 'saveDraft br_1', 'update e1 {"blueprint_study_id":"std_novo"}']);
  });

  it('recusa quando já há estudo vinculado — não cria nada', async () => {
    empDoBanco = { ...empDoBanco!, blueprint_study_id: 'std_da_massa' };
    await expect(blueprintEstudoDoEmpreendimento.criar('e1')).rejects.toThrow(/já tem um estudo/);
    expect(chamadas).toEqual([]);
  });

  it('se o vínculo falha, o estudo criado é arquivado e o erro sobe', async () => {
    falharVinculo = true;
    await expect(blueprintEstudoDoEmpreendimento.criar('e1')).rejects.toThrow('falhou o vínculo');
    expect(chamadas.at(-1)).toBe('archiveStudy std_novo');
  });
});
