import { describe, expect, it } from 'vitest';
import {
  ANEXO4_SERVICOS,
  SUGESTAO_MATERIAIS,
  MINIMO_MATERIAIS,
  metaDoNivel,
  procedimentoConta,
  rotuloDoProcedimento,
  contarTreinados,
  rotuloDosTreinados,
} from '../utils/qualidadeSiac';
import type { ProcedimentoResumo, RegistroTreinamento } from '../types/qualidadeSiac';

describe('listas fixas do Anexo 4', () => {
  it('traz os 27 serviços, numerados de 1 a 27 sem buraco', () => {
    expect(ANEXO4_SERVICOS.length).toBe(27);
    expect(ANEXO4_SERVICOS.map((s) => s.numero)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
    expect(ANEXO4_SERVICOS[0].chave).toBe('ANEXO4-01');
    expect(ANEXO4_SERVICOS[26].chave).toBe('ANEXO4-27');
    expect(ANEXO4_SERVICOS[5].nome).toBe('concretagem de peça estrutural');
    expect(new Set(ANEXO4_SERVICOS.map((s) => s.etapa)).size).toBe(8);
  });

  it('traz as 24 sugestões de materiais com chaves únicas', () => {
    expect(SUGESTAO_MATERIAIS.length).toBe(24);
    expect(new Set(SUGESTAO_MATERIAIS.map((m) => m.chave)).size).toBe(24);
    expect(SUGESTAO_MATERIAIS[0].chave).toBe('MAT-01');
    expect(SUGESTAO_MATERIAIS[23].chave).toBe('MAT-24');
    expect(MINIMO_MATERIAIS).toBe(20);
  });
});

describe('metaDoNivel', () => {
  it('calcula com arredondamento para cima', () => {
    expect(metaDoNivel(27, 'SERVICO', 'B')).toEqual({ comProcedimento: 11, aplicadosComRegistro: 6, emObraEmAndamento: 3 });
    expect(metaDoNivel(25, 'SERVICO', 'B')).toEqual({ comProcedimento: 10, aplicadosComRegistro: 5, emObraEmAndamento: 3 });
    expect(metaDoNivel(27, 'SERVICO', 'A')).toEqual({ comProcedimento: 27, aplicadosComRegistro: 14, emObraEmAndamento: 7 });
    expect(metaDoNivel(20, 'MATERIAL', 'B')).toEqual({ comProcedimento: 10, aplicadosComRegistro: 5, emObraEmAndamento: 3 });
    expect(metaDoNivel(20, 'MATERIAL', 'A')).toEqual({ comProcedimento: 20, aplicadosComRegistro: 10, emObraEmAndamento: 5 });
    expect(metaDoNivel(0, 'SERVICO', 'B')).toEqual({ comProcedimento: 0, aplicadosComRegistro: 0, emObraEmAndamento: 0 });
  });
});

describe('procedimento', () => {
  const base: ProcedimentoResumo = {
    id: 'p1', nome: 'PE-01', revisao: '2', approval_status: 'aprovado', versao_ativa_em: '2026-11-20T10:00:00Z',
  };
  it('só conta aprovado com versão ativa', () => {
    expect(procedimentoConta(null)).toBe(false);
    expect(procedimentoConta({ ...base, approval_status: 'rascunho' })).toBe(false);
    expect(procedimentoConta({ ...base, versao_ativa_em: null })).toBe(false);
    expect(procedimentoConta(base)).toBe(true);
  });
  it('rotula', () => {
    expect(rotuloDoProcedimento(null)).toBe('sem procedimento');
    expect(rotuloDoProcedimento({ ...base, versao_ativa_em: null })).toBe('sem procedimento');
    expect(rotuloDoProcedimento(base)).toBe('PE-01 rev.2 aprovado');
    expect(rotuloDoProcedimento({ ...base, revisao: null })).toBe('PE-01 rev.— aprovado');
  });
});

describe('contarTreinados', () => {
  const r = (employee_id: string, data_realizacao: string, aprovado = true, externo = false): RegistroTreinamento =>
    ({ employee_id, data_realizacao, aprovado, externo });

  it('separa vigentes, empreiteira e revisão anterior', () => {
    const registros = [
      r('A', '2026-11-21'),
      r('A', '2026-11-22'),
      r('B', '2026-11-20', true, true),
      r('C', '2026-10-01'),
      r('D', '2026-10-01'),
      r('D', '2026-11-25'),
      r('E', '2026-11-25', false),
    ];
    expect(contarTreinados(registros, '2026-11-20T10:00:00Z')).toEqual({ proprios: 2, empreiteira: 1, revisaoAnterior: 1 });
  });

  it('sem versão ativa, todos caem em revisão anterior', () => {
    expect(contarTreinados([r('A', '2026-11-21'), r('B', '2026-11-22', true, true)], null))
      .toEqual({ proprios: 0, empreiteira: 0, revisaoAnterior: 2 });
  });

  it('rotula', () => {
    expect(rotuloDosTreinados({ proprios: 5, empreiteira: 3, revisaoAnterior: 0 })).toBe('8 (5 próprios, 3 empreit.)');
    expect(rotuloDosTreinados({ proprios: 0, empreiteira: 0, revisaoAnterior: 4 })).toBe('—');
  });
});
