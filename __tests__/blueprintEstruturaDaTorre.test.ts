/**
 * A ESTRUTURA DE CADA TORRE do Empreendimento para a massa da Planta (27/10/2026): *"os dados do empreendimento …
 * aba torres e unidades deve-se ser vinculados. Torre A e Torre B, quantidade de pavimentos, nome dos pavimentos"*.
 * Fixture: o 011 - Garden Cambuhy como estava no banco em 27/10/2026 (sem cadastro de pavimentos).
 */
import { describe, expect, it } from 'vitest';
import { estruturaDaTorre, estruturasDoEmpreendimento, type TorreParaEstrutura } from '../utils/blueprintEstruturaDaTorre';
import type { EmpreendimentoFloor } from '../types/empreendimento';

const unidades = (andar: number, n: number, tipo: string | null) => Array.from({ length: n }, () => ({ floor: andar, floor_tipo: tipo as never }));

/** Torre A do Garden: 2 garagens, térreo, 3 tipos; `floors_count` vazio. */
const TORRE_A: TorreParaEstrutura = {
  id: 'tA',
  name: 'Torre A',
  floors_count: null,
  sort_order: 0,
  units: [...unidades(-2, 1, 'GARAGEM'), ...unidades(-1, 1, 'GARAGEM'), ...unidades(0, 2, 'TERREO'), ...unidades(0, 1, null), ...unidades(1, 4, 'TIPO'), ...unidades(2, 4, 'TIPO'), ...unidades(3, 4, 'TIPO')],
};
/** Torre B do Garden: andares 0–5, o 2 marcado TERREO por engano. */
const TORRE_B: TorreParaEstrutura = {
  id: 'tB',
  name: 'Torre B',
  floors_count: 6,
  sort_order: 1,
  units: [...unidades(0, 4, 'TIPO'), ...unidades(1, 4, 'TIPO'), ...unidades(2, 4, 'TERREO'), ...unidades(3, 4, 'TIPO'), ...unidades(4, 4, 'TIPO'), ...unidades(5, 4, 'TIPO')],
};

const pav = (extra: Partial<EmpreendimentoFloor>): EmpreendimentoFloor => ({
  id: 'f',
  tower_id: 'tA',
  name: '',
  tipo: 'TIPO',
  floor_number: 1,
  repeat_count: 1,
  sort_order: 0,
  created_at: '',
  updated_at: '',
  ...extra,
});

describe('estruturaDaTorre — pelos andares das unidades (Garden)', () => {
  it('Torre A: 4 acima do solo com nomes, 2 garagens da mais funda para a mais rasa', () => {
    const e = estruturaDaTorre(TORRE_A, []);
    expect(e.fonte).toBe('UNIDADES');
    expect(e.acima.map((p) => p.nome)).toEqual(['Térreo', 'Pavimento 1', 'Pavimento 2', 'Pavimento 3']);
    expect(e.garagens.map((p) => [p.numero, p.nome])).toEqual([[-2, 'Garagem 2'], [-1, 'Garagem 1']]);
    expect(e.avisos.join(' ')).toMatch(/Torre A.*sem número de pavimentos/);
  });

  it('Torre B: 6 acima do solo, sem garagem, e o aviso do Térreo fora do andar 0', () => {
    const e = estruturaDaTorre(TORRE_B, []);
    expect(e.acima).toHaveLength(6);
    expect(e.acima[0].nome).toBe('Térreo');
    expect(e.garagens).toEqual([]);
    expect(e.avisos.join(' ')).toMatch(/andar 2 está marcado como Térreo/);
    expect(e.avisos.join(' ')).not.toMatch(/cadastro diz/);
  });

  it('andar sem unidade no meio entra na lista, com aviso', () => {
    const e = estruturaDaTorre({ id: 't', name: 'T', units: [...unidades(0, 1, null), ...unidades(2, 1, null)] }, []);
    expect(e.acima.map((p) => p.numero)).toEqual([0, 1, 2]);
    expect(e.avisos.join(' ')).toMatch(/andar 1 sem unidade/);
  });

  it('floors_count diferente do que as unidades dizem: avisa', () => {
    const e = estruturaDaTorre({ ...TORRE_B, floors_count: 8 }, []);
    expect(e.avisos.join(' ')).toMatch(/cadastro da torre diz 8 pavimentos e as unidades dizem 6 acima do solo — vale o que as unidades dizem/);
  });
});

describe('estruturaDaTorre — cadastro de pavimentos e floors_count', () => {
  it('o cadastro de pavimentos manda: nome digitado e repetição expandida', () => {
    const e = estruturaDaTorre({ ...TORRE_A, units: [] }, [
      pav({ name: 'Garagem', tipo: 'GARAGEM', floor_number: -1 }),
      pav({ name: 'Térreo', tipo: 'TERREO', floor_number: 0 }),
      pav({ name: 'Tipo', tipo: 'TIPO', floor_number: 1, repeat_count: 3 }),
      pav({ name: '', tipo: 'COBERTURA', floor_number: 4 }),
    ]);
    expect(e.fonte).toBe('CADASTRO');
    expect(e.acima.map((p) => p.nome)).toEqual(['Térreo', 'Tipo 1', 'Tipo 2', 'Tipo 3', 'Pavimento 4']);
    expect(e.garagens.map((p) => p.nome)).toEqual(['Garagem']);
  });

  it('sem cadastro nem unidades: floors_count vira Térreo + Pavimento 1..N-1', () => {
    const e = estruturaDaTorre({ id: 't', name: 'T', floors_count: 3, units: [] }, []);
    expect(e.fonte).toBe('FLOORS_COUNT');
    expect(e.acima.map((p) => p.nome)).toEqual(['Térreo', 'Pavimento 1', 'Pavimento 2']);
  });

  it('sem nada: estrutura vazia com aviso', () => {
    const e = estruturaDaTorre({ id: 't', name: 'T', units: [] }, []);
    expect(e.acima).toEqual([]);
    expect(e.avisos.join(' ')).toMatch(/sem pavimentos/);
  });
});

describe('estruturasDoEmpreendimento', () => {
  it('na ordem das torres, sem as quadras do loteamento', () => {
    const es = estruturasDoEmpreendimento([TORRE_B, TORRE_A, { id: 'q', name: 'Quadra A', blueprint_quadra_uid: 'u', units: [] }], new Map());
    expect(es.map((e) => e.nome)).toEqual(['Torre A', 'Torre B']);
  });
});

describe('pé-direito por pavimento (27/10/2026)', () => {
  it('o do pavimento cadastrado; sem ele, o padrão da torre', () => {
    const e = estruturaDaTorre({ id: 't', name: 'T', pe_direito_padrao_m: 3, units: [] }, [
      pav({ name: 'Térreo', tipo: 'TERREO', floor_number: 0, pe_direito_m: 4.5 }),
      pav({ name: 'Tipo', tipo: 'TIPO', floor_number: 1, repeat_count: 2, pe_direito_m: null }),
    ]);
    expect(e.acima.map((p) => p.peDireitoMm)).toEqual([4500, 3000, 3000]);
  });
  it('sem cadastro de pavimentos: o padrão da torre em todos os andares das unidades; sem padrão, null', () => {
    expect(estruturaDaTorre({ ...TORRE_A, pe_direito_padrao_m: 2.9 }, []).garagens.map((p) => p.peDireitoMm)).toEqual([2900, 2900]);
    expect(estruturaDaTorre(TORRE_A, []).acima[0].peDireitoMm).toBeNull();
  });
});

describe('as unidades de cada andar (27/10/2026)', () => {
  it('cada piso leva as unidades do andar dele, na ordem da aba', () => {
    const e = estruturaDaTorre(
      {
        id: 't',
        name: 'Torre A',
        units: [
          { id: 'u2', name: '102', floor: 1, floor_tipo: 'TIPO', typology: 'Tipo 4', private_area: 127, sort_order: 1 },
          { id: 'u1', name: '101', floor: 1, floor_tipo: 'TIPO', typology: 'Tipo 3', private_area: 127, sort_order: 0, sun_orientation: 'NORTE' },
          { id: 'u0', name: '002', floor: 0, floor_tipo: 'TERREO', typology: 'Tipo 4', private_area: 127 },
          { id: 'ac', name: 'Área Comum Horizontal', floor: 0, floor_tipo: null },
        ] as never,
      },
      [],
    );
    expect(e.acima[0].unidades.map((u) => [u.nome, u.areaPrivativaM2])).toEqual([['002', 127], ['Área Comum Horizontal', null]]);
    expect(e.acima[1].unidades.map((u) => u.nome)).toEqual(['101', '102']);
    expect(e.acima[1].unidades[0]).toMatchObject({ id: 'u1', tipologia: 'Tipo 3', orientacao: 'NORTE' });
  });
});


describe('elevação do pavimento (27/10/2026)', () => {
  /** Torre com cadastro: 2 garagens de 3 m, térreo de 4,5 m, tipo ×3 de 3 m. */
  const CADASTRO = [
    pav({ name: 'Garagem', tipo: 'GARAGEM', floor_number: -2, repeat_count: 2, pe_direito_m: 3 }),
    pav({ name: 'Térreo', tipo: 'TERREO', floor_number: 0, pe_direito_m: 4.5, sort_order: 1 }),
    pav({ name: 'Tipo', tipo: 'TIPO', floor_number: 1, repeat_count: 3, pe_direito_m: 3, sort_order: 2 }),
  ];
  const TORRE = { id: 't', name: 'T', units: [] };

  it('calculada: térreo em 0 (ou na elevação da torre), os de cima somando os pés-direitos, os subsolos negativos', () => {
    const e = estruturaDaTorre(TORRE, CADASTRO);
    expect(e.acima.map((p) => p.elevacaoMm)).toEqual([0, 4500, 7500, 10500]);
    expect(e.garagens.map((p) => p.elevacaoMm)).toEqual([-6000, -3000]);
    expect([...e.acima, ...e.garagens].every((p) => !p.elevacaoDigitada)).toBe(true);
    const ref = estruturaDaTorre({ ...TORRE, elevacao_terreo_m: 745.3 }, CADASTRO);
    expect(ref.acima.map((p) => p.elevacaoMm)).toEqual([745300, 749800, 752800, 755800]);
    expect(ref.garagens[0].elevacaoMm).toBe(739300);
  });

  it('digitada vale no lugar do cálculo, os de cima seguem dela, e a altura do de baixo passa a ser a diferença', () => {
    const e = estruturaDaTorre(TORRE, [
      CADASTRO[0],
      CADASTRO[1],
      pav({ name: 'Tipo', tipo: 'TIPO', floor_number: 1, repeat_count: 3, pe_direito_m: 3, sort_order: 2, elevacao_m: 5 }),
    ]);
    expect(e.acima.map((p) => p.elevacaoMm)).toEqual([0, 5000, 8000, 11000]);
    expect(e.acima[1].elevacaoDigitada).toBe(true);
    expect(e.acima[2].elevacaoDigitada).toBe(false);
    // O térreo tem pé-direito 4,50 m cadastrado, mas o de cima foi digitado em +5,00: a massa usa 5 m.
    expect(e.acima[0].alturaMm).toBe(5000);
    expect(e.acima[1].alturaMm).toBe(3000);
    expect(e.avisos.join(' ')).toContain('Torre "T": Tipo 1 está em +5,00 m (digitada), mas o Térreo (+0,00 m, pé-direito 4,50 m) termina em +4,50 m — vale a elevação digitada.');
  });

  it('subsolo digitado: a altura dele é a distância até o de cima', () => {
    const e = estruturaDaTorre(TORRE, [
      pav({ name: 'Garagem', tipo: 'GARAGEM', floor_number: -1, pe_direito_m: null, elevacao_m: -3.5 }),
      CADASTRO[1],
    ]);
    expect(e.garagens.map((p) => [p.elevacaoMm, p.alturaMm])).toEqual([[-3500, 3500]]);
    // Sem pé-direito no subsolo, a digitada não discorda de nada.
    expect(e.avisos.filter((a) => a.includes('digitada'))).toEqual([]);
  });

  it('sem pé-direito cadastrado, a altura continua null (a massa usa a do bloco) e a elevação é calculada com 3,00 m', () => {
    const e = estruturaDaTorre(TORRE_A, []);
    expect(e.acima.map((p) => p.elevacaoMm)).toEqual([0, 3000, 6000, 9000]);
    expect(e.acima.map((p) => p.alturaMm)).toEqual([null, null, null, null]);
  });

  it('digitada que daria altura fora de 2–15 m: avisa e a massa fica com o pé-direito', () => {
    const e = estruturaDaTorre(TORRE, [CADASTRO[1], pav({ name: 'Tipo', floor_number: 1, pe_direito_m: 3, elevacao_m: 1 })]);
    expect(e.acima[0].alturaMm).toBe(4500);
    expect(e.avisos.join(' ')).toContain('Tipo está em +1,00 m (digitada) — o Térreo ficaria com 1,00 m de altura, fora de 2 a 15 m; a massa usa o pé-direito.');
  });
});

describe('cadastro com o andar trocado (Garden, 27/10/2026)', () => {
  /** O cadastro da Torre A como estava no banco: garagens nos andares 1 e 2, tipos em 100/200/300. */
  const GARDEN = [
    pav({ name: 'Pavimento Térreo', tipo: 'TERREO', floor_number: 0, elevacao_m: -0.3, sort_order: 0 }),
    pav({ name: 'Pavimento 1', tipo: 'TIPO', floor_number: 100, elevacao_m: 2.7, sort_order: 1 }),
    pav({ name: 'Pavimento 2', tipo: 'TIPO', floor_number: 200, elevacao_m: 5.7, sort_order: 2 }),
    pav({ name: 'Pavimento 3', tipo: 'TIPO', floor_number: 300, elevacao_m: 8.7, sort_order: 3 }),
    pav({ name: 'Estacionamento 1', tipo: 'GARAGEM', floor_number: 1, elevacao_m: -3.3, sort_order: 4 }),
    pav({ name: 'Estacionamento 2', tipo: 'GARAGEM', floor_number: 2, elevacao_m: -6.3, sort_order: 5 }),
  ];
  const e = estruturaDaTorre(TORRE_A, GARDEN);
  const avisos = e.avisos.join('\n');

  it('a elevação digitada abaixo do de baixo diz que o ANDAR está trocado — não uma altura negativa', () => {
    expect(avisos).not.toMatch(/ficaria com -/);
    expect(avisos).toContain(
      'Torre "Torre A": Estacionamento 1 está em -3,30 m (digitada), abaixo do Pavimento Térreo (-0,30 m), mas o andar dele (1) o põe acima — confira o Nº inicial.',
    );
  });

  it('garagem com andar positivo: avisa que garagem e subsolo têm andar negativo', () => {
    expect(avisos).toContain('Torre "Torre A": Estacionamento 1 é garagem, mas está no andar 1 — garagem e subsolo ficam abaixo do térreo, com andar negativo (-1, -2…).');
  });

  it('andares do cadastro que não casam com os das unidades: avisa (o andar é 1, não 101)', () => {
    expect(avisos).toContain(
      'Torre "Torre A": as unidades estão nos andares -2, -1, 0, 1, 2, 3, mas o cadastro de pavimentos não tem -2, -1, 3 e tem 100, 200, 300 — o andar é o número do pavimento (1, 2, 3…), não o da unidade (101).',
    );
  });
});

describe('como a Planta arruma as unidades da torre (28/10/2026)', () => {
  it('leva a escolha da torre; sem nada gravado, pela posição', () => {
    expect(estruturaDaTorre({ ...TORRE_A, ordem_das_unidades_na_planta: 'SETAS' }, []).ordemDasUnidades).toBe('SETAS');
    expect(estruturaDaTorre(TORRE_A, []).ordemDasUnidades).toBe('POSICAO');
  });
});
