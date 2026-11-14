/**
 * PIX Copia e Cola do ÒPURA Pro (14/11/2026, crítica de design — P0).
 *
 * Antes, a chave era montada por PALPITE: qualquer valor de 11 dígitos com "-"
 * ou "(" virava telefone `+55…` — ou seja, todo CPF digitado com máscara gerava
 * um QR que o banco do cliente recusava ("chave não encontrada") ou, pior,
 * apontava para o celular de um terceiro. Agora quem decide é o TIPO cadastrado.
 */
import { describe, it, expect } from 'vitest';
import {
  crc16Pix,
  normalizarChavePix,
  montarPixCopiaECola,
  formatarChavePixParaExibir,
} from '../utils/pixCopiaECola';

// CPF e CNPJ válidos de teste (dígitos verificadores corretos, sem titular real).
const CPF_VALIDO = '52998224725';
const CNPJ_VALIDO = '11222333000181';

describe('crc16Pix', () => {
  it('CRC-16/CCITT-FALSE do vetor padrão "123456789" é 29B1', () => {
    expect(crc16Pix('123456789')).toBe('29B1');
  });

  it('confere com o exemplo do manual do BR Code do Banco Central (CRC 1D3D)', () => {
    const semCrc = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
    expect(crc16Pix(semCrc)).toBe('1D3D');
  });

  it('sempre devolve 4 caracteres hexadecimais maiúsculos', () => {
    expect(crc16Pix('')).toMatch(/^[0-9A-F]{4}$/);
  });
});

describe('normalizarChavePix', () => {
  it('CPF com máscara vira 11 dígitos — NUNCA telefone +55', () => {
    const r = normalizarChavePix('CPF', '529.982.247-25');
    expect(r).toEqual({ ok: true, chave: CPF_VALIDO });
  });

  it('CPF começando com 8 ou 9 continua CPF', () => {
    // 935.411.347-80 tem DV válido
    expect(normalizarChavePix('CPF', '93541134780')).toEqual({ ok: true, chave: '93541134780' });
  });

  it('CPF com dígito verificador errado é recusado com motivo', () => {
    const r = normalizarChavePix('CPF', '529.982.247-26');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/CPF/);
  });

  it('CPF com todos os dígitos iguais é recusado', () => {
    expect(normalizarChavePix('CPF', '111.111.111-11').ok).toBe(false);
  });

  it('CNPJ com máscara vira 14 dígitos', () => {
    expect(normalizarChavePix('CNPJ', '11.222.333/0001-81')).toEqual({ ok: true, chave: CNPJ_VALIDO });
  });

  it('CNPJ com dígito verificador errado é recusado', () => {
    expect(normalizarChavePix('CNPJ', '11.222.333/0001-82').ok).toBe(false);
  });

  it('celular com DDD vira +55 + DDD + número', () => {
    expect(normalizarChavePix('CELULAR', '(65) 99999-8888')).toEqual({ ok: true, chave: '+5565999998888' });
  });

  it('celular já com 55 na frente não duplica o país', () => {
    expect(normalizarChavePix('CELULAR', '+55 65 99999-8888')).toEqual({ ok: true, chave: '+5565999998888' });
  });

  it('celular sem DDD é recusado', () => {
    const r = normalizarChavePix('CELULAR', '99999-8888');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/DDD/);
  });

  it('e-mail é aparado e vai em minúsculas', () => {
    expect(normalizarChavePix('EMAIL', '  Fulano@Exemplo.COM ')).toEqual({ ok: true, chave: 'fulano@exemplo.com' });
  });

  it('e-mail sem @ é recusado', () => {
    expect(normalizarChavePix('EMAIL', 'fulano.exemplo.com').ok).toBe(false);
  });

  it('chave aleatória (UUID) vai em minúsculas', () => {
    expect(normalizarChavePix('ALEATORIA', '123E4567-E12B-12D1-A456-426655440000'))
      .toEqual({ ok: true, chave: '123e4567-e12b-12d1-a456-426655440000' });
  });

  it('chave aleatória fora do formato é recusada', () => {
    expect(normalizarChavePix('ALEATORIA', 'abc-123').ok).toBe(false);
  });

  it('sem tipo ou sem chave, recusa com motivo — não chuta', () => {
    expect(normalizarChavePix(undefined, CPF_VALIDO).ok).toBe(false);
    expect(normalizarChavePix('CPF', '   ').ok).toBe(false);
  });
});

describe('montarPixCopiaECola', () => {
  const base = { tipo: 'CPF' as const, chave: '529.982.247-25', valor: 150, nome: 'João Refrigeração', cidade: 'Cuiabá' };

  it('monta o BR Code com a chave normalizada, valor, nome e cidade sem acento', () => {
    const r = montarPixCopiaECola(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.startsWith('000201')).toBe(true);
    expect(r.payload).toContain('0014br.gov.bcb.pix0111' + CPF_VALIDO);
    expect(r.payload).toContain('5406150.00');
    expect(r.payload).toContain('5917JOAO REFRIGERACAO');
    expect(r.payload).toContain('6006CUIABA');
    expect(r.payload).not.toContain('+55');
  });

  it('o CRC do fim confere com o resto do payload', () => {
    const r = montarPixCopiaECola(base);
    if (!r.ok) throw new Error(r.motivo);
    const semCrc = r.payload.slice(0, -4);
    expect(semCrc.endsWith('6304')).toBe(true);
    expect(r.payload.slice(-4)).toBe(crc16Pix(semCrc));
  });

  it('valor zero omite o campo 54 (o pagador digita o valor)', () => {
    const r = montarPixCopiaECola({ ...base, valor: 0 });
    if (!r.ok) throw new Error(r.motivo);
    expect(r.payload).not.toMatch(/54\d{2}0\.00/);
  });

  it('nome é cortado em 25 caracteres e cidade em 15', () => {
    const r = montarPixCopiaECola({ ...base, nome: 'A'.repeat(40), cidade: 'B'.repeat(30) });
    if (!r.ok) throw new Error(r.motivo);
    expect(r.payload).toContain('5925' + 'A'.repeat(25));
    expect(r.payload).toContain('6015' + 'B'.repeat(15));
  });

  it('chave inválida não gera payload — devolve o motivo', () => {
    const r = montarPixCopiaECola({ ...base, chave: '529.982.247-26' });
    expect(r.ok).toBe(false);
  });
});

describe('formatarChavePixParaExibir', () => {
  it('formata CPF, CNPJ e celular como a pessoa reconhece', () => {
    expect(formatarChavePixParaExibir('CPF', CPF_VALIDO)).toBe('529.982.247-25');
    expect(formatarChavePixParaExibir('CNPJ', CNPJ_VALIDO)).toBe('11.222.333/0001-81');
    expect(formatarChavePixParaExibir('CELULAR', '+5565999998888')).toBe('(65) 99999-8888');
  });

  it('e-mail e aleatória saem como estão', () => {
    expect(formatarChavePixParaExibir('EMAIL', 'fulano@exemplo.com')).toBe('fulano@exemplo.com');
  });
});
