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
  treinamentoVigente,
  motivoDoProcedimentoNaoContar,
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
    id: 'p1', nome: 'PE-01', revisao: '2', status: 'ativo', approval_status: 'aprovado',
    versao_ativa_em: '2026-11-20T10:00:00Z', aprovado_em: '2026-11-21T09:00:00Z',
  };
  it('só conta aprovado com versão ativa', () => {
    expect(procedimentoConta(null)).toBe(false);
    expect(procedimentoConta({ ...base, approval_status: 'rascunho' })).toBe(false);
    expect(procedimentoConta({ ...base, versao_ativa_em: null })).toBe(false);
    expect(procedimentoConta(base)).toBe(true);
  });
  it('aprovação anterior à versão ativa não conta (revisão nova aguardando aprovação)', () => {
    // No GED a aprovação é do documento; subir versão nova troca active_version_id sem mexer em approval_status.
    expect(procedimentoConta({ ...base, aprovado_em: '2026-11-19T23:00:00Z' })).toBe(false);
    expect(procedimentoConta({ ...base, aprovado_em: null })).toBe(false);
    expect(procedimentoConta({ ...base, aprovado_em: '2026-11-20T10:00:00Z' })).toBe(true);
    expect(rotuloDoProcedimento({ ...base, aprovado_em: '2026-11-19T23:00:00Z' }))
      .toBe('PE-01 rev.2 nova revisão aguardando aprovação');
    expect(motivoDoProcedimentoNaoContar({ ...base, aprovado_em: '2026-11-19T23:00:00Z' }))
      .toBe('A revisão nova deste procedimento ainda não foi aprovada no GED; até lá, ele não conta.');
  });
  it('documento arquivado no GED não conta e o rótulo diz que está arquivado', () => {
    const arquivado = { ...base, status: 'arquivado' };
    expect(procedimentoConta(arquivado)).toBe(false);
    expect(rotuloDoProcedimento(arquivado)).toBe('PE-01 rev.2 arquivado no GED');
    expect(motivoDoProcedimentoNaoContar(arquivado)).toBe('Este procedimento está arquivado no GED e não conta.');
  });
  it('motivo de não contar: rascunho e sem versão ativa; nenhum quando conta', () => {
    expect(motivoDoProcedimentoNaoContar(base)).toBeNull();
    expect(motivoDoProcedimentoNaoContar({ ...base, approval_status: 'rascunho' }))
      .toBe('Este procedimento só conta quando aprovado no GED.');
    expect(motivoDoProcedimentoNaoContar({ ...base, approval_status: 'rascunho', versao_ativa_em: null }))
      .toBe('Este procedimento só conta quando aprovado no GED e com uma versão ativa.');
  });
  it('rotula', () => {
    expect(rotuloDoProcedimento(null)).toBe('sem procedimento');
    expect(rotuloDoProcedimento({ ...base, versao_ativa_em: null })).toBe('sem procedimento');
    expect(rotuloDoProcedimento(base)).toBe('PE-01 rev.2 aprovado');
    expect(rotuloDoProcedimento({ ...base, revisao: null })).toBe('PE-01 rev.— aprovado');
  });
});

describe('contarTreinados', () => {
  const r = (
    employee_id: string, data_realizacao: string, aprovado = true, externo = false, registrado_em: string | null = null,
  ): RegistroTreinamento => ({ employee_id, data_realizacao, aprovado, externo, registrado_em });

  it('separa vigentes, empreiteira e revisão anterior', () => {
    const registros = [
      r('A', '2026-11-21'),
      r('A', '2026-11-22'),
      r('B', '2026-11-20', true, true, '2026-11-20T12:00:00Z'), // mesmo dia da versão, registrado depois dela
      r('C', '2026-10-01'),
      r('D', '2026-10-01'),
      r('D', '2026-11-25'),
      r('E', '2026-11-25', false),
    ];
    expect(contarTreinados(registros, '2026-11-20T10:00:00Z')).toEqual({ proprios: 2, empreiteira: 1, revisaoAnterior: 1 });
  });

  it('vigência no mesmo dia da revisão nova decide pelo horário do registro', () => {
    const versao = '2026-11-20T10:00:00Z';
    // dia seguinte: vigente
    expect(treinamentoVigente(r('A', '2026-11-21'), versao)).toBe(true);
    // mesmo dia, registrado depois da versão: vigente
    expect(treinamentoVigente(r('A', '2026-11-20', true, false, '2026-11-20T15:00:00Z'), versao)).toBe(true);
    expect(treinamentoVigente(r('A', '2026-11-20', true, false, '2026-11-20T10:00:00Z'), versao)).toBe(true);
    // mesmo dia, registrado antes da versão: revisão anterior
    expect(treinamentoVigente(r('A', '2026-11-20', true, false, '2026-11-20T08:00:00Z'), versao)).toBe(false);
    // mesmo dia sem horário de registro: revisão anterior
    expect(treinamentoVigente(r('A', '2026-11-20'), versao)).toBe(false);
    // dia anterior: revisão anterior (mesmo registrado depois)
    expect(treinamentoVigente(r('A', '2026-11-19', true, false, '2026-11-20T15:00:00Z'), versao)).toBe(false);
    // sem versão ativa: nunca vigente
    expect(treinamentoVigente(r('A', '2026-11-21'), null)).toBe(false);

    expect(contarTreinados([
      r('A', '2026-11-20', true, false, '2026-11-20T15:00:00Z'),
      r('B', '2026-11-20', true, false, '2026-11-20T08:00:00Z'),
      r('C', '2026-11-20', true, true),
    ], versao)).toEqual({ proprios: 1, empreiteira: 0, revisaoAnterior: 2 });
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
