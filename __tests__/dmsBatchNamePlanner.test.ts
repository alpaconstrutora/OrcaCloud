import { describe, it, expect } from 'vitest';
import { planBatchFileNames, validateFileNameAgainstMask } from '../utils/dmsUtils';

describe('planBatchFileNames', () => {
  const mask = '[OBRA]-[DISCIPLINA]-[NUMERO]-R[REVISAO]';

  it('sem máscara, mantém os nomes originais e marca tudo como válido', () => {
    const result = planBatchFileNames(['planta.pdf', 'memorial.docx'], '', {}, []);
    expect(result).toEqual([
      { originalName: 'planta.pdf', tokens: {}, suggestedName: 'planta.pdf', alreadyValid: true },
      { originalName: 'memorial.docx', tokens: {}, suggestedName: 'memorial.docx', alreadyValid: true },
    ]);
  });

  it('nome já válido é mantido como está e os tokens são extraídos', () => {
    const result = planBatchFileNames(['ALPA-ESTR-001-R2.pdf'], mask, { obraCode: 'ALPA' }, []);
    expect(result[0].alreadyValid).toBe(true);
    expect(result[0].suggestedName).toBe('ALPA-ESTR-001-R2.pdf');
    expect(result[0].tokens['[NUMERO]']).toBe('001');
    expect(result[0].tokens['[REVISAO]']).toBe('2');
  });

  it('nome fora do padrão é renomeado com sequencial a partir do próximo número livre da pasta', () => {
    const existing = [{ nome: 'ALPA-ESTR-005-R0.pdf' }];
    const result = planBatchFileNames(['foto1.jpg', 'foto2.jpg'], mask, { obraCode: 'ALPA', defaultDiscipline: 'ARQ' }, existing);

    expect(result[0].alreadyValid).toBe(false);
    expect(result[0].suggestedName).toBe('ALPA-ARQ-006-R00.jpg'); // getInitialRevision pad default = 2
    expect(result[1].suggestedName).toBe('ALPA-ARQ-007-R00.jpg');
    result.forEach((item) => expect(validateFileNameAgainstMask(item.suggestedName, mask)).toBe(true));
  });

  it('mistura de nomes válidos e inválidos não colide: o sequencial pula os números já usados por itens válidos do próprio lote', () => {
    const result = planBatchFileNames(
      ['ALPA-ESTR-001-R0.pdf', 'foto.jpg', 'ALPA-ESTR-002-R0.pdf', 'planta.dwg'],
      mask,
      { obraCode: 'ALPA', defaultDiscipline: 'ARQ' },
      []
    );

    const suggested = result.map((r) => r.suggestedName);
    // únicos e todos válidos contra a máscara — nenhuma colisão de nome final
    expect(new Set(suggested).size).toBe(suggested.length);
    suggested.forEach((name) => expect(validateFileNameAgainstMask(name, mask)).toBe(true));

    expect(result[0].suggestedName).toBe('ALPA-ESTR-001-R0.pdf'); // já válido, mantido
    expect(result[2].suggestedName).toBe('ALPA-ESTR-002-R0.pdf'); // já válido, mantido
    // os dois inválidos avançam a partir do maior NUMERO já ocupado — 002, usado
    // pelo item já válido do próprio lote (a pasta em si está vazia) — sem colidir
    expect(result[1].suggestedName).toBe('ALPA-ARQ-003-R00.jpg');
    expect(result[3].suggestedName).toBe('ALPA-ARQ-004-R00.dwg');
  });

  it('nome fora do padrão sempre usa a disciplina padrão do seed (não há extração parcial)', () => {
    // extractTokenFromFileName só extrai de nomes que já validam contra a máscara inteira —
    // um nome inválido não tem como "emprestar" só o pedaço da disciplina.
    const result = planBatchFileNames(['XXX-INST-abc-Rzz.jpg'], mask, { obraCode: 'ALPA', defaultDiscipline: 'ARQ' }, []);
    expect(result[0].alreadyValid).toBe(false);
    expect(result[0].tokens['[DISCIPLINA]']).toBe('ARQ');
  });

  it('respeita o padding de [NUMERO{3}]', () => {
    const maskPadded = '[OBRA{3}]-[DISCIPLINA{3}]-[NUMERO{3}]-R[REVISAO{2}]';
    const result = planBatchFileNames(['solto.pdf'], maskPadded, { obraCode: 'ALP', defaultDiscipline: 'EST' }, []);
    expect(result[0].suggestedName).toBe('ALP-EST-001-R00.pdf');
  });
});
