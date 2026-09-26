/**
 * LOTEAMENTO → EMPREENDIMENTO (B3): o planner com a origem `blueprint`.
 *
 * O que estes casos travam:
 *
 *  - a quadra vira torre e o lote vira unidade, com a proveniência no `uid`;
 *  - sincronizar DUAS VEZES o mesmo desenho não duplica nada (o defeito clássico
 *    desta classe: a segunda rodada recria tudo porque a coluna de proveniência
 *    não foi lida);
 *  - preço e status são do Empreendimento — o desenho nunca os sobrescreve;
 *  - um lote apagado do desenho vira ÓRFÃO reportado, nunca deletado;
 *  - a quadra é adotada por nome, o que impede a torre-fantasma.
 */
import { describe, expect, it } from 'vitest';
import { buildPlan } from '../services/sync/planner';
import { PROVENANCE, ORIGIN_LABEL, type CanonicalSide, type CanonicalTower, type TargetState } from '../services/sync/types';
import { SYNC_FIELDS, specsFor } from '../services/sync/fieldRegistry';
import type { Empreendimento, EmpreendimentoTower, EmpreendimentoUnit } from '../types/empreendimento';

const EMP = { id: 'emp_1', organization_id: 'org_1', name: 'Loteamento Alvorada' } as Empreendimento;

const UID_QUADRA = '11111111-1111-4111-8111-111111111111';
const UID_LOTE_1 = '22222222-2222-4222-8222-222222222222';
const UID_LOTE_2 = '33333333-3333-4333-8333-333333333333';

function loteCanonico(uid: string, numero: string, areaM2: number, testadaM: number) {
  return {
    sourceId: uid,
    fields: {
      name: `Quadra A · Lote ${numero}`,
      quadra: 'A',
      lote: numero,
      private_area: areaM2,
      common_area: 0,
      total_area: areaM2,
      testada_m: testadaM,
      position_type: 'FRENTE',
    },
    createOnly: {
      blueprint_lote_uid: uid,
      typology: 'LOTE',
      is_vendavel: true,
      status: 'DISPONIVEL',
      confrontantes: [{ papel: 'FRENTE', confrontante: 'Rua 1', comprimentoM: testadaM }],
    },
  };
}

function quadraCanonica(uids: { quadra: string; lotes: [string, string, number, number][] }): CanonicalTower {
  return {
    sourceId: uids.quadra,
    matchName: 'Quadra A',
    fields: {},
    createOnly: { blueprint_quadra_uid: uids.quadra, name: 'Quadra A' },
    units: uids.lotes.map(([uid, numero, area, testada]) => loteCanonico(uid, numero, area, testada)),
  };
}

function lado(towers: CanonicalTower[]): CanonicalSide {
  const lotes = towers.flatMap((t) => t.units.map((u) => u.sourceId));
  return {
    origin: 'blueprint',
    empreendimento: EMP,
    towers,
    commonAreaCandidates: [],
    liveTowerSourceIds: new Set(towers.map((t) => t.sourceId)),
    liveUnitSourceIds: new Set(lotes),
    warnings: [],
  };
}

const vazio: TargetState = { towers: [], units: [], commonAreas: [] };

function torre(over: Partial<EmpreendimentoTower> = {}): EmpreendimentoTower {
  return { id: 'tow_1', empreendimento_id: 'emp_1', name: 'Quadra A', created_at: '', updated_at: '', ...over };
}
function unidade(over: Partial<EmpreendimentoUnit> = {}): EmpreendimentoUnit {
  return { id: 'uni_1', tower_id: 'tow_1', name: 'Quadra A · Lote 1', status: 'DISPONIVEL', created_at: '', updated_at: '', ...over };
}

describe('a origem blueprint no motor de sync', () => {
  it('está declarada nas três tabelas que o compilador exige', () => {
    expect(PROVENANCE.blueprint).toEqual({ towerKey: 'blueprint_quadra_uid', unitKey: 'blueprint_lote_uid' });
    expect(ORIGIN_LABEL.blueprint).toBe('Loteamento');
    expect(SYNC_FIELDS.blueprint.length).toBeGreaterThan(0);
  });

  it('o registry propõe quadra, lote, testada e área — e NÃO preço nem status', () => {
    const campos = specsFor('blueprint', 'unit').map((s) => s.field);
    expect(campos).toContain('quadra');
    expect(campos).toContain('lote');
    expect(campos).toContain('testada_m');
    expect(campos).toContain('private_area');
    // O comercial é do Empreendimento — o desenho não sabe preço.
    expect(campos).not.toContain('price');
    expect(campos).not.toContain('status');
    // Tipologia é imutável (sempre LOTE): fora do diff, senão vira conflito eterno.
    expect(campos).not.toContain('typology');
  });

  it('a testada tem tolerância de centímetro, para não divergir por arredondamento', () => {
    const spec = specsFor('blueprint', 'unit').find((s) => s.field === 'testada_m');
    expect(spec?.compare).toBe('numeric');
    expect(spec?.tolerance).toBe(0.01);
  });
});

describe('primeira sincronização', () => {
  it('a quadra vira torre e os lotes nascem com ela', () => {
    const plano = buildPlan(lado([quadraCanonica({ quadra: UID_QUADRA, lotes: [[UID_LOTE_1, '1', 360, 12], [UID_LOTE_2, '2', 360, 12]] })]), vazio);

    expect(plano.towerCreates).toHaveLength(1);
    expect(plano.towerCreates[0].insert.name).toBe('Quadra A');
    expect(plano.towerCreates[0].insert.blueprint_quadra_uid).toBe(UID_QUADRA);
    expect(plano.towerCreates[0].units).toHaveLength(2);

    const primeiro = plano.towerCreates[0].units[0] as Record<string, unknown>;
    expect(primeiro.blueprint_lote_uid).toBe(UID_LOTE_1);
    expect(primeiro.quadra).toBe('A');
    expect(primeiro.lote).toBe('1');
    expect(primeiro.private_area).toBe(360);
    expect(primeiro.testada_m).toBe(12);
    expect(primeiro.typology).toBe('LOTE');
    expect(primeiro.status).toBe('DISPONIVEL');
  });
});

describe('segunda sincronização do MESMO desenho', () => {
  /** O destino como ele fica depois da primeira rodada. */
  const jaSincronizado: TargetState = {
    towers: [torre({ blueprint_quadra_uid: UID_QUADRA })],
    units: [
      unidade({ id: 'uni_1', blueprint_lote_uid: UID_LOTE_1, name: 'Quadra A · Lote 1', quadra: 'A', lote: '1', private_area: 360, common_area: 0, total_area: 360, testada_m: 12, position_type: 'FRENTE' }),
      unidade({ id: 'uni_2', blueprint_lote_uid: UID_LOTE_2, name: 'Quadra A · Lote 2', quadra: 'A', lote: '2', private_area: 360, common_area: 0, total_area: 360, testada_m: 12, position_type: 'FRENTE' }),
    ],
    commonAreas: [],
  };

  it('não cria nada e não propõe mudança nenhuma', () => {
    const plano = buildPlan(lado([quadraCanonica({ quadra: UID_QUADRA, lotes: [[UID_LOTE_1, '1', 360, 12], [UID_LOTE_2, '2', 360, 12]] })]), jaSincronizado);

    expect(plano.towerCreates).toHaveLength(0);
    expect(plano.unitCreates).toHaveLength(0);
    expect(plano.fills).toHaveLength(0);
    expect(plano.conflicts).toHaveLength(0);
    expect(plano.orphanTowers).toHaveLength(0);
    expect(plano.orphanUnits).toHaveLength(0);
  });

  it('mover um vértice (área muda) vira conflito, não escrita direta', () => {
    const plano = buildPlan(lado([quadraCanonica({ quadra: UID_QUADRA, lotes: [[UID_LOTE_1, '1', 400, 13], [UID_LOTE_2, '2', 360, 12]] })]), jaSincronizado);

    const campos = plano.conflicts.map((c) => c.field).sort();
    expect(campos).toContain('private_area');
    expect(campos).toContain('total_area');
    expect(campos).toContain('testada_m');
    expect(plano.conflicts.every((c) => c.origin === 'blueprint')).toBe(true);
    // Conflito NÃO é escrito: vai para a Curadoria.
    expect(plano.fills).toHaveLength(0);
  });

  it('um lote novo no desenho entra na quadra que já existe', () => {
    const UID_LOTE_3 = '44444444-4444-4444-8444-444444444444';
    const plano = buildPlan(
      lado([quadraCanonica({ quadra: UID_QUADRA, lotes: [[UID_LOTE_1, '1', 360, 12], [UID_LOTE_2, '2', 360, 12], [UID_LOTE_3, '3', 360, 12]] })]),
      jaSincronizado,
    );
    expect(plano.towerCreates).toHaveLength(0);
    expect(plano.unitCreates).toHaveLength(1);
    expect(plano.unitCreates[0].towerId).toBe('tow_1');
    expect((plano.unitCreates[0].insert as Record<string, unknown>).blueprint_lote_uid).toBe(UID_LOTE_3);
  });

  it('um lote APAGADO do desenho vira órfão reportado — nunca deletado', () => {
    const plano = buildPlan(lado([quadraCanonica({ quadra: UID_QUADRA, lotes: [[UID_LOTE_1, '1', 360, 12]] })]), jaSincronizado);
    expect(plano.orphanUnits.map((u) => u.id)).toEqual(['uni_2']);
  });
});

describe('o comercial é do Empreendimento', () => {
  it('lote vendido não é tocado pelo desenho', () => {
    const vendido: TargetState = {
      towers: [torre({ blueprint_quadra_uid: UID_QUADRA })],
      units: [
        unidade({
          id: 'uni_1',
          blueprint_lote_uid: UID_LOTE_1,
          name: 'Quadra A · Lote 1',
          quadra: 'A',
          lote: '1',
          private_area: 360,
          common_area: 0,
          total_area: 360,
          testada_m: 12,
          position_type: 'FRENTE',
          status: 'VENDIDO',
          price: 250000,
        }),
      ],
      commonAreas: [],
    };
    const plano = buildPlan(lado([quadraCanonica({ quadra: UID_QUADRA, lotes: [[UID_LOTE_1, '1', 360, 12]] })]), vendido);
    // Nada a propor: o desenho não manda em preço nem status, e o resto bate.
    expect(plano.fills).toHaveLength(0);
    expect(plano.conflicts).toHaveLength(0);
  });
});

describe('adoção por nome', () => {
  it('a quadra criada à mão é ADOTADA em vez de virar torre-fantasma', () => {
    const feitaAMao: TargetState = { towers: [torre({ id: 'tow_manual', name: 'Quadra A' })], units: [], commonAreas: [] };
    const plano = buildPlan(lado([quadraCanonica({ quadra: UID_QUADRA, lotes: [[UID_LOTE_1, '1', 360, 12]] })]), feitaAMao);

    expect(plano.towerCreates).toHaveLength(0);
    expect(plano.adoptions).toEqual([{ entity: 'tower', existingId: 'tow_manual', sourceId: UID_QUADRA }]);
    // E o lote entra nela, não numa torre nova.
    expect(plano.unitCreates).toHaveLength(1);
    expect(plano.unitCreates[0].towerId).toBe('tow_manual');
  });
});
