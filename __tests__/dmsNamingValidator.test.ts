import { describe, it, expect } from 'vitest';
import { validateFileNameAgainstMask } from '../utils/dmsUtils';

describe('validateFileNameAgainstMask', () => {
  it('Sem máscara (livre) deve permitir qualquer nome', () => {
    expect(validateFileNameAgainstMask('qualquer_nome.pdf', '')).toBe(true);
    expect(validateFileNameAgainstMask('relatório_revisado_v2_final_final.xlsx', '')).toBe(true);
  });

  it('Padrão Construtora: [OBRA]-[DISCIPLINA]-[NUMERO]-R[REVISAO]', () => {
    const mask = '[OBRA]-[DISCIPLINA]-[NUMERO]-R[REVISAO]';
    
    // Casos válidos
    expect(validateFileNameAgainstMask('ALPA-ESTR-001-R2.pdf', mask)).toBe(true);
    expect(validateFileNameAgainstMask('alpa-estr-001-r2.pdf', mask)).toBe(true); // Case insensitivity
    expect(validateFileNameAgainstMask('OBRA123-ARQ-9999-R1A.dwg', mask)).toBe(true);
    expect(validateFileNameAgainstMask('OBRA-INST-55-R0.jpg', mask)).toBe(true);

    // Casos inválidos
    expect(validateFileNameAgainstMask('ALPA-ESTR-001.pdf', mask)).toBe(false); // Sem revisão
    expect(validateFileNameAgainstMask('ALPA-ESTR-R2.pdf', mask)).toBe(false); // Sem número
    expect(validateFileNameAgainstMask('ALPA--001-R2.pdf', mask)).toBe(false); // Sem disciplina
    expect(validateFileNameAgainstMask('ESTR-001-R2.pdf', mask)).toBe(false); // Faltou o campo Obra
  });

  it('Padrão Simples: [DISCIPLINA]-[NUMERO]', () => {
    const mask = '[DISCIPLINA]-[NUMERO]';

    // Casos válidos
    expect(validateFileNameAgainstMask('ESTR-001.pdf', mask)).toBe(true);
    expect(validateFileNameAgainstMask('ARQ-12345.dwg', mask)).toBe(true);
    expect(validateFileNameAgainstMask('inst-9.png', mask)).toBe(true);

    // Casos inválidos
    expect(validateFileNameAgainstMask('ESTR.pdf', mask)).toBe(false);
    expect(validateFileNameAgainstMask('001.pdf', mask)).toBe(false);
    expect(validateFileNameAgainstMask('ESTR-abc.pdf', mask)).toBe(false); // Número não numérico
  });

  it('Padrão Versão: [OBRA]-[DISCIPLINA]-[NUMERO]-V[REVISAO]', () => {
    const mask = '[OBRA]-[DISCIPLINA]-[NUMERO]-V[REVISAO]';

    // Casos válidos
    expect(validateFileNameAgainstMask('ALPA-ESTR-001-V2.pdf', mask)).toBe(true);
    expect(validateFileNameAgainstMask('OBRA2-ARQ-15-V10.dwg', mask)).toBe(true);

    // Casos inválidos
    expect(validateFileNameAgainstMask('ALPA-ESTR-001-R2.pdf', mask)).toBe(false); // Usa R em vez de V
  });
});
