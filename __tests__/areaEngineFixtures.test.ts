import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const seedDir = path.resolve(process.cwd(), 'supabase', 'seed');

const expectedFixtures = [
  'area_engine_case1_fixture.sql',
  'area_engine_case2_varanda_fixture.sql',
  'area_engine_case3_vaga_vinculada_fixture.sql',
  'area_engine_case4_common_nonprop_fixture.sql',
  'area_engine_case5_error_common_without_division_fixture.sql',
  'area_engine_case6_error_missing_coefficient_fixture.sql',
  'area_engine_case7_lock_hash_fixture.sql',
  'area_engine_case8_deterministic_recalculation_fixture.sql',
  'area_engine_case9_accounting_closure_fixture.sql',
  'area_engine_case10_error_double_count_parking_fixture.sql',
];

function readFixture(name: string): string {
  return readFileSync(path.join(seedDir, name), 'utf8').replace(/\r\n/g, '\n');
}

describe('area engine SQL fixtures', () => {
  it('keeps the complete ordered fixture suite', () => {
    const files = readdirSync(seedDir)
      .filter((name) => name.startsWith('area_engine_case') && name.endsWith('_fixture.sql'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    expect(files).toEqual(expectedFixtures);
  });

  it.each(expectedFixtures)('%s is transactional and calculates a version', (name) => {
    const sql = readFixture(name).trim();

    expect(sql).toMatch(/^--[\s\S]*?\nBEGIN;/);
    expect(sql).toMatch(/COMMIT;$/);
    expect(sql).toContain('public.calculate_area_version(');
    expect(sql).toContain('DELETE FROM public.organizations');
  });

  it.each([
    ['area_engine_case5_error_common_without_division_fixture.sql', 'MOTOR_012'],
    ['area_engine_case6_error_missing_coefficient_fixture.sql', 'MOTOR_007'],
    ['area_engine_case10_error_double_count_parking_fixture.sql', 'ACC_VAL_003'],
  ])('%s asserts expected blocking error %s', (name, code) => {
    const sql = readFixture(name);

    expect(sql).toContain(code);
    expect(sql).toContain('jsonb_path_exists');
    expect(sql).toContain('calculation_status');
  });

  it('case 7 verifies lock hash and mutation blocking', () => {
    const sql = readFixture('area_engine_case7_lock_hash_fixture.sql');

    expect(sql).toContain('public.approve_area_version');
    expect(sql).toContain('public.lock_area_version');
    expect(sql).toContain('has_identity_hash_after_lock');
    expect(sql).toContain('mutation_blocked');
    expect(sql).toContain('mutation_sqlstate');
    expect(sql).toContain('SQLSTATE');
  });

  it('case 8 verifies deterministic recalculation and no duplicate result rows', () => {
    const sql = readFixture('area_engine_case8_deterministic_recalculation_fixture.sql');

    expect(sql).toContain('area_case8_run_determinism_check');
    expect(sql).toContain('hashes_equal');
    expect(sql).toContain('no_duplicate_rows');
    expect(sql).toContain('v_first_hash = v_second_hash');
  });

  it('case 9 verifies accounting closure across coefficients, fractions and quadro totals', () => {
    const sql = readFixture('area_engine_case9_accounting_closure_fixture.sql');

    expect(sql).toContain('coefficient_sum_is_one');
    expect(sql).toContain('fraction_sum_is_one');
    expect(sql).toContain('qii_matches_ivb_real_total');
    expect(sql).toContain('qii_matches_qi_equivalent_total');
  });

  it.each([
    'area_engine_case1_fixture.sql',
    'area_engine_case2_varanda_fixture.sql',
    'area_engine_case3_vaga_vinculada_fixture.sql',
    'area_engine_case4_common_nonprop_fixture.sql',
  ])('%s asserts successful calculation outputs and pre-lock hash behavior', (name) => {
    const sql = readFixture(name);

    expect(sql).toContain('expected_');
    expect(sql).toContain('has_payload_hash');
    expect(sql).toContain('identity_hash_is_null_before_lock');
  });
});