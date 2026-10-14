/**
 * Proposta de vínculo unidade do Empreendimento ↔ unidade da Planta (Fase 9 do
 * plano `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`): o gravado fica,
 * o número único dos dois lados é proposto, o resto fica sem par — nunca palpite.
 */
import { describe, expect, it } from 'vitest';
import { paresParaDevolver, propostaDeVinculos } from '../utils/nbr12721/vinculos';

const planta = [
  { codigo: '101', chave: 'u1', numero: '101' },
  { codigo: '102', chave: 'u2', numero: '102' },
  { codigo: '201', chave: 'u1:n2', numero: '201' },
  { codigo: 'Loja A', chave: 'u9', numero: 'Loja A' },
  { codigo: '301', chave: 'u1:n3', numero: '301' },
  { codigo: '301 [2]', chave: 'u7', numero: '301' },
];
const emp = (id: string, nome: string, chave: string | null = null, origem: 'MOTOR' | 'CONVENCAO' | null = null) => ({ id, nome, chave, origem });

describe('propostaDeVinculos', () => {
  it('mantém o gravado, propõe pelo número (sem acento, caixa e espaço) e deixa sem par o ambíguo', () => {
    const { vinculos, plantaSemPar } = propostaDeVinculos(
      [emp('a', '101', 'u2'), emp('b', '201'), emp('c', 'loja a'), emp('d', '301'), emp('e', '999'), emp('f', '102', null, 'CONVENCAO')],
      planta,
    );
    const por = Object.fromEntries(vinculos.map((v) => [v.unitId, v]));
    // O gravado vence o número: a "101" do Empreendimento está ligada à u2 de propósito.
    expect(por.a).toMatchObject({ chave: 'u2', situacao: 'GRAVADO' });
    expect(por.b).toMatchObject({ chave: 'u1:n2', situacao: 'PROPOSTO' });
    expect(por.c).toMatchObject({ chave: 'u9', situacao: 'PROPOSTO' });
    // Dois "301" na Planta: não escolhe.
    expect(por.d).toMatchObject({ chave: null, situacao: 'SEM_PAR' });
    expect(por.e).toMatchObject({ chave: null, situacao: 'SEM_PAR' });
    // A 102 da Planta já é da "101" gravada: a "102" do Empreendimento não a pega.
    expect(por.f).toMatchObject({ chave: null, situacao: 'SEM_PAR', convencao: true });
    expect(plantaSemPar.map((u) => u.chave).sort()).toEqual(['u1', 'u1:n3', 'u7']);
  });

  it('chave gravada que não existe mais na versão vira sem par (e pode ser proposta pelo número)', () => {
    const { vinculos } = propostaDeVinculos([emp('a', '101', 'sumiu')], planta);
    expect(vinculos[0]).toMatchObject({ chave: 'u1', situacao: 'PROPOSTO' });
  });

  it('dois do Empreendimento com o mesmo número: nenhum é proposto', () => {
    const { vinculos } = propostaDeVinculos([emp('a', '101'), emp('b', '101 ')], planta);
    expect(vinculos.map((v) => v.situacao)).toEqual(['SEM_PAR', 'SEM_PAR']);
  });

  it('os pares levam todas as unidades, inclusive as sem par (chave null desfaz o vínculo)', () => {
    expect(paresParaDevolver([{ unitId: 'a', chave: 'u1' }, { unitId: 'b', chave: null }])).toEqual([
      { unit_id: 'a', chave: 'u1' },
      { unit_id: 'b', chave: null },
    ]);
  });
});
