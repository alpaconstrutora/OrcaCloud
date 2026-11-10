/**
 * VISTA DA JANELA (Espelho de Vendas 3D, F6 — 10/11/2026): qual foto de vista vale para uma unidade — a da faixa de
 * andares que contém o andar dela, a mais estreita; orientação igual vence a vista "de qualquer face". Puro. Plano:
 * docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import { describe, expect, it } from 'vitest';
import { orientacaoDoImovel, problemaDaVista, rotuloDaVista, vistaDaUnidade, type VistaDaTorre } from '../utils/espelhoVistaDaJanela';

const vista = (id: string, de: number, ate: number, orientacao: VistaDaTorre['orientacao'] = null): VistaDaTorre => ({
  id, andar_de: de, andar_ate: ate, orientacao, imagem_url: `https://x/${id}.jpg`, legenda: null,
});

describe('vistaDaUnidade', () => {
  it('a faixa que contém o andar; fora de toda faixa, nenhuma', () => {
    const vistas = [vista('baixos', 0, 3), vista('altos', 4, 12)];
    expect(vistaDaUnidade(vistas, 2, null)?.id).toBe('baixos');
    expect(vistaDaUnidade(vistas, 4, null)?.id).toBe('altos');
    expect(vistaDaUnidade(vistas, 13, null)).toBeNull();
    expect(vistaDaUnidade(vistas, -1, null)).toBeNull();
  });

  it('duas faixas contêm o andar: vale a mais estreita (a mais específica)', () => {
    const vistas = [vista('torre toda', 0, 20), vista('cobertura', 19, 20)];
    expect(vistaDaUnidade(vistas, 20, null)?.id).toBe('cobertura');
    expect(vistaDaUnidade(vistas, 10, null)?.id).toBe('torre toda');
  });

  it('orientação igual à da unidade vence a vista de qualquer face, mesmo com a faixa mais larga', () => {
    const vistas = [vista('qualquer', 5, 6), vista('norte', 0, 20, 'NORTE'), vista('sul', 0, 20, 'SUL')];
    expect(vistaDaUnidade(vistas, 5, 'NORTE')?.id).toBe('norte');
    expect(vistaDaUnidade(vistas, 5, 'SUL')?.id).toBe('sul');
  });

  it('vista de OUTRA face nunca serve; unidade sem orientação só recebe a vista de qualquer face', () => {
    const vistas = [vista('norte', 0, 20, 'NORTE')];
    expect(vistaDaUnidade(vistas, 5, 'SUL')).toBeNull();
    expect(vistaDaUnidade(vistas, 5, null)).toBeNull();
    expect(vistaDaUnidade([...vistas, vista('qualquer', 0, 20)], 5, 'LESTE')?.id).toBe('qualquer');
  });

  it('andar ausente, lista vazia, e vista sem imagem ou com a faixa invertida: nenhuma', () => {
    expect(vistaDaUnidade([vista('a', 0, 5)], null, null)).toBeNull();
    expect(vistaDaUnidade([], 3, null)).toBeNull();
    expect(vistaDaUnidade(null, 3, null)).toBeNull();
    expect(vistaDaUnidade([{ ...vista('sem', 0, 5), imagem_url: '' }, vista('invertida', 5, 0)], 3, null)).toBeNull();
  });

  it('empate (mesma largura, mesma orientação): a primeira da lista', () => {
    expect(vistaDaUnidade([vista('primeira', 0, 5), vista('segunda', 0, 5)], 3, null)?.id).toBe('primeira');
  });
});

// 10/11/2026, o usuário: "não seria melhor também opção para vincular a vista da janela com uma unidade específica?"
describe('vistaDaUnidade — vista de uma unidade específica', () => {
  const daUnidade = (id: string, unit_id: string, unit_name: string): VistaDaTorre => ({ ...vista(id, 3, 3), unit_id, unit_name });
  const vistas = [vista('faixa', 0, 9), vista('norte', 0, 9, 'NORTE'), daUnidade('canto', 'u304', '304')];

  it('a vista da unidade vence qualquer faixa, mesmo a da mesma face', () => {
    expect(vistaDaUnidade(vistas, 3, 'NORTE', { id: 'u304', nome: '304' })?.id).toBe('canto');
  });

  it('a vizinha do mesmo andar NÃO recebe a vista da unidade: fica com a faixa', () => {
    expect(vistaDaUnidade(vistas, 3, null, { id: 'u303', nome: '303' })?.id).toBe('faixa');
    expect(vistaDaUnidade([daUnidade('canto', 'u304', '304')], 3, null, { id: 'u303', nome: '303' })).toBeNull();
  });

  it('unidade com id casa só pelo id — o nome igual de outra unidade não serve', () => {
    expect(vistaDaUnidade([daUnidade('canto', 'u304', '304')], 3, null, { id: 'outra', nome: '304' })).toBeNull();
  });

  it('imóvel do estoque sem unidade ligada (sem id) casa pelo nome, sem ligar para espaço e caixa', () => {
    expect(vistaDaUnidade(vistas, 3, null, { nome: ' 304 ' })?.id).toBe('canto');
    expect(vistaDaUnidade([daUnidade('cob', 'u1', 'Cobertura A')], 9, null, { nome: 'cobertura  a' })?.id).toBe('cob');
    expect(vistaDaUnidade(vistas, 3, null, { nome: '' })?.id).toBe('faixa');
  });

  it('a vista da unidade vale mesmo sem andar cadastrado; quem não diz a unidade segue só pelas faixas', () => {
    expect(vistaDaUnidade([daUnidade('canto', 'u304', '304')], null, null, { id: 'u304' })?.id).toBe('canto');
    expect(vistaDaUnidade(vistas, 3, null)?.id).toBe('faixa');
  });

  it('o rótulo diz a unidade', () => {
    expect(rotuloDaVista(daUnidade('canto', 'u304', '304'))).toBe('Unidade 304');
    expect(rotuloDaVista({ ...vista('x', 1, 1), unit_id: 'u', unit_name: null })).toBe('Unidade específica');
  });
});

describe('orientacaoDoImovel', () => {
  it('traduz a orientação do imóvel do estoque (inglês) para a do Empreendimento', () => {
    expect(['NORTH', 'SOUTH', 'EAST', 'WEST'].map(orientacaoDoImovel)).toEqual(['NORTE', 'SUL', 'LESTE', 'OESTE']);
  });

  it('a do Empreendimento passa como está; o resto é sem orientação', () => {
    expect(orientacaoDoImovel('NORTE')).toBe('NORTE');
    expect([null, undefined, '', 'NE'].map(orientacaoDoImovel)).toEqual([null, null, null, null]);
  });
});

describe('rotuloDaVista e problemaDaVista', () => {
  it('diz a faixa pelo nome do andar (0 = Térreo, negativo = subsolo) e a face', () => {
    expect(rotuloDaVista(vista('a', 4, 12, 'NORTE'))).toBe('4º ao 12º pavimento · face Norte');
    expect(rotuloDaVista(vista('a', 0, 0))).toBe('Térreo · qualquer face');
    expect(rotuloDaVista(vista('a', -2, 3))).toBe('2º subsolo ao 3º pavimento · qualquer face');
    expect(rotuloDaVista(vista('a', 7, 7, 'OESTE'))).toBe('7º pavimento · face Oeste');
  });

  it('faixa inválida diz o motivo; válida = null', () => {
    expect(problemaDaVista({ andar_de: null, andar_ate: 3 })).toMatch(/andar inicial/);
    expect(problemaDaVista({ andar_de: 2, andar_ate: null })).toMatch(/andar final/);
    expect(problemaDaVista({ andar_de: 5, andar_ate: 2 })).toMatch(/não pode ser menor/);
    expect(problemaDaVista({ andar_de: 2.5, andar_ate: 3 })).toMatch(/inteiro/);
    expect(problemaDaVista({ andar_de: 0, andar_ate: 3 })).toBeNull();
  });
});
