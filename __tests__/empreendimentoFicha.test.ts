import { describe, it, expect } from 'vitest';
import { fichaDe, payloadDaFicha, mudancasDaFicha, semVazios } from '../utils/empreendimentoFicha';
import type { Empreendimento } from '../types/empreendimento';

const base = {
  id: 'e1', organization_id: 'org1', name: 'Garden', code: 'GD-01', status: 'EM_OBRAS',
  tipo: 'VERTICAL', objetivo: 'VENDAS', matricula: '123', spe_cnpj: '00.000.000/0001-00',
  imovib_study_id: 'imo1', blueprint_study_id: 'bp1', project_id: 'p1',
  terreno_area: 1500, vgv_total: 2000000, launch_date: '2026-01-10',
  created_at: '', updated_at: '',
} as unknown as Empreendimento;

describe('fichaDe', () => {
  it('editar copia o registro como está', () => {
    const f = fichaDe(base);
    expect(f).toMatchObject({ name: 'Garden', code: 'GD-01', status: 'EM_OBRAS', objetivo: 'VENDAS', terreno_area: '1500', vgv_total: '2000000' });
  });
  it('duplicar limpa identificadores e vínculos e volta ao Planejamento', () => {
    const f = fichaDe(base, { duplicar: true });
    expect(f).toMatchObject({ name: 'Garden (cópia)', code: '', matricula: '', spe_cnpj: '', status: 'PLANEJAMENTO', imovib_study_id: '', blueprint_study_id: '', project_id: '', launch_date: '' });
    expect(f.objetivo).toBe('VENDAS');
  });
  it('registro sem objetivo nasce Misto', () => {
    expect(fichaDe({ ...base, objetivo: null }).objetivo).toBe('MISTO');
    expect(fichaDe(null).objetivo).toBe('MISTO');
  });
});

describe('payloadDaFicha + mudancasDaFicha', () => {
  it('sem alteração, nada a gravar', () => {
    const antes = payloadDaFicha(fichaDe(base), 'org1');
    expect(mudancasDaFicha(antes, payloadDaFicha(fichaDe(base), 'org1'))).toEqual({});
  });
  it('grava só o campo alterado', () => {
    const antes = payloadDaFicha(fichaDe(base), 'org1');
    const f = { ...fichaDe(base), matricula: '999', objetivo: 'MISTO' as const };
    expect(mudancasDaFicha(antes, payloadDaFicha(f, 'org1'))).toEqual({ matricula: '999', objetivo: 'MISTO' });
  });
  it('campo apagado vai como null (limpa a coluna)', () => {
    const antes = payloadDaFicha(fichaDe(base), 'org1');
    const f = { ...fichaDe(base), code: '  ', vgv_total: '' };
    expect(mudancasDaFicha(antes, payloadDaFicha(f, 'org1'))).toEqual({ code: null, vgv_total: null });
  });
  it('campo que já era vazio no banco (undefined) não conta como mudança', () => {
    const semCrea = { ...base, crea_cau: undefined } as Empreendimento;
    const antes = payloadDaFicha(fichaDe(semCrea), 'org1');
    expect(mudancasDaFicha(antes, payloadDaFicha(fichaDe(semCrea), 'org1'))).toEqual({});
  });
  it('criar deixa fora as chaves vazias', () => {
    const p = semVazios(payloadDaFicha(fichaDe(null), 'org1'));
    expect(p).toEqual({ organization_id: 'org1', name: '', status: 'PLANEJAMENTO', objetivo: 'MISTO' });
  });
});
