/**
 * CUB: a coluna de `cub_parametric_data` vem do MAPA EXPLÍCITO (03/10/2026). Montar o nome pela chave ("PP-N" → "pp_n",
 * "CSL8-N" → "csl8_n") não achava a coluna (a tabela grava `pp_4_n`, `csl_8_n`): o orçamento paramétrico saía vazio,
 * o total caía no estimado, o histórico e a comparação regional davam 400 — tudo em silêncio. E a simulação do CNO
 * nunca leu o CUB: encargos `com_desoneracao` × "Com Desoneração", mês "AAAA-MM" × "MM/AAAA" e 5 linhas por mês
 * (`maybeSingle`). Supabase de mentira: registra os filtros e devolve as linhas da tabela.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Linha = Record<string, unknown>;
const chamadas: { metodo: string; args: unknown[] }[] = [];
let linhas: Linha[] = [];

vi.mock('../lib/supabase', () => {
  const builder = () => {
    let filtradas = [...linhas];
    let colunas = '*';
    const b: Record<string, unknown> = {};
    const reg = (metodo: string, args: unknown[]) => chamadas.push({ metodo, args });
    b.select = (c: string) => {
      reg('select', [c]);
      colunas = c;
      return b;
    };
    b.eq = (k: string, v: unknown) => {
      reg('eq', [k, v]);
      filtradas = filtradas.filter((l) => l[k] === v);
      return b;
    };
    b.ilike = (k: string, v: string) => {
      reg('ilike', [k, v]);
      filtradas = filtradas.filter((l) => String(l[k]).toLowerCase() === v.toLowerCase());
      return b;
    };
    b.in = (k: string, vs: unknown[]) => {
      reg('in', [k, vs]);
      filtradas = filtradas.filter((l) => vs.includes(l[k]));
      return b;
    };
    b.order = () => b;
    b.limit = () => b;
    // Coluna que não existe é erro do PostgREST (42703) — como no banco.
    const resultado = () => {
      const pedidas = colunas === '*' ? [] : colunas.split(',').map((x) => x.trim());
      const faltando = pedidas.find((c) => linhas.length > 0 && !(c in linhas[0]));
      if (faltando) return { data: null, error: { code: '42703', message: `column cub_parametric_data.${faltando} does not exist` } };
      return { data: filtradas, error: null };
    };
    b.maybeSingle = async () => {
      const r = resultado();
      if (r.error) return r;
      if (r.data!.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
      return { data: r.data![0] ?? null, error: null };
    };
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, ko);
    return b;
  };
  return { supabase: { from: () => builder() } };
});

import { CUB_STANDARDS_DATA } from '../constants';
import { colunaDoPadraoCub, encargosDoCub, linhaDoMesOuAnterior, mesDe } from '../services/cubService';
import { parametricService } from '../services/parametricService';
import { cnoService } from '../services/cnoService';

/** As colunas de padrão da tabela no banco (information_schema, 03/10/2026). */
const COLUNAS_DO_BANCO = ['r1_b', 'pp_4_b', 'r8_b', 'pis', 'r1_n', 'pp_4_n', 'r8_n', 'r16_n', 'r1_a', 'r8_a', 'r16_a', 'cal_8_n', 'csl_8_n', 'csl_16_n', 'cal_8_a', 'csl_8_a', 'csl_16_a', 'rp1q', 'gi'];

/** Uma linha por natureza + a "Total", com valor distinto por coluna (Total = 1000 + índice). */
function mesDeLinhas(state: string, ref: string, encargos: string, base = 0): Linha[] {
  return ['Materiais', 'Mão de Obra', 'Despesas Administrativas', 'Equipamentos', 'Total'].map((nature, n) => {
    const l: Linha = { state, reference_date: ref, social_charges: encargos, nature, created_at: '2026-01-01' };
    COLUNAS_DO_BANCO.forEach((c, i) => (l[c] = nature === 'Total' ? 1000 + i + base : 100 * (n + 1) + i));
    return l;
  });
}

beforeEach(() => {
  chamadas.length = 0;
  linhas = [...mesDeLinhas('MG', '01/2025', 'Com Desoneração'), ...mesDeLinhas('SP', '01/2025', 'Com Desoneração', 500)];
});

describe('o mapa padrão → coluna', () => {
  it('todo padrão do app tem coluna, e ela existe no banco', () => {
    for (const padrao of Object.keys(CUB_STANDARDS_DATA)) {
      const c = colunaDoPadraoCub(padrao);
      expect(c, padrao).not.toBeNull();
      expect(COLUNAS_DO_BANCO, padrao).toContain(c);
    }
    expect(colunaDoPadraoCub('PP-N')).toBe('pp_4_n');
    expect(colunaDoPadraoCub('csl8-n')).toBe('csl_8_n');
    expect(colunaDoPadraoCub(null)).toBe('r8_n');
    expect(colunaDoPadraoCub('X-9')).toBeNull();
  });

  it('mês nos dois formatos, encargos do formulário, e o mês pedido ou o anterior mais recente', () => {
    expect(mesDe('02/2026')).toBe(202602);
    expect(mesDe('2026-02')).toBe(202602);
    expect(mesDe('fev')).toBe(0);
    expect(encargosDoCub('sem_desoneracao')).toBe('Sem Desoneração');
    expect(encargosDoCub('Com Desoneração')).toBe('Com Desoneração');
    const ls = [{ reference_date: '01/2025' }, { reference_date: '12/2025' }, { reference_date: '01/2026' }];
    expect(linhaDoMesOuAnterior(ls, '2026-02')!.reference_date).toBe('01/2026');
    expect(linhaDoMesOuAnterior(ls, '2025-11')!.reference_date).toBe('01/2025');
    expect(linhaDoMesOuAnterior(ls, '2024-01')!.reference_date).toBe('01/2026');
    expect(linhaDoMesOuAnterior([], '2026-01')).toBeNull();
  });
});

describe('parametricService lê a coluna certa', () => {
  const settings = (standard: string) => ({ area: 100, standard, location: 'MG', referenceMonth: '01/2025', socialChargesMode: 'Com Desoneração' }) as never;
  const indice = (c: string) => COLUNAS_DO_BANCO.indexOf(c);

  it('orçamento paramétrico de PP-N e CSL8-N: as 4 naturezas, com o valor da coluna do padrão', async () => {
    for (const [padrao, coluna] of [['PP-N', 'pp_4_n'], ['CSL8-N', 'csl_8_n'], ['CAL8-A', 'cal_8_a']]) {
      const itens = await parametricService.generateParametricBudgetAsync(settings(padrao));
      expect(itens, padrao).toHaveLength(4);
      expect(itens[0].sinapiItem.price).toBe(100 * (100 + indice(coluna)));
    }
  });

  it('total estimado de PP-N usa a TABELA (não o estimado)', async () => {
    const total = await parametricService.calculateTotalEstimatedValueAsync({ ...(settings('PP-N') as object), bdi: 0 } as never);
    expect(total).toBe(100 * (1000 + indice('pp_4_n')));
  });

  it('histórico e comparação regional pedem a coluna que existe (antes: 400 e tela vazia)', async () => {
    const hist = await parametricService.getHistoricalCubDataAsync(settings('CSL16-N'));
    expect(hist).toEqual([{ date: '01/2025', rate: 1000 + indice('csl_16_n') }]);
    expect(chamadas.find((c) => c.metodo === 'select')!.args[0]).toContain('csl_16_n');
    const reg = await parametricService.getRegionalComparisonDataAsync(settings('PP-B'));
    expect(reg).toEqual([
      { state: 'SP', rate: 1500 + indice('pp_4_b') },
      { state: 'MG', rate: 1000 + indice('pp_4_b') },
    ]);
  });
});

describe('a simulação do CNO lê o CUB', () => {
  const sim = (over: Record<string, unknown> = {}) =>
    cnoService.calculateSimulation({ projectId: 'p', state: 'MG', referenceDate: '2025-03', socialCharges: 'com_desoneracao', areaConstruida: 100, padrao: 'normal', metodoConstrutivo: 'convencional', regimeContratacao: 'empreitada_global', ...over } as never);

  it('formulário com "com_desoneracao" e "AAAA-MM": usa a "Total" do mês anterior mais recente, e diz qual', async () => {
    const r = await sim();
    expect(r.cubValor).toBe(1000 + COLUNAS_DO_BANCO.indexOf('r1_n'));
    expect(r.cubOrigem).toBe('tabela 01/2025 · Com Desoneração');
  });

  it('UF sem tabela: a estimativa fixa, dita', async () => {
    const r = await sim({ state: 'AC' });
    expect(r.cubValor).toBe(2500);
    expect(r.cubOrigem).toMatch(/estimativa fixa/);
  });
});
