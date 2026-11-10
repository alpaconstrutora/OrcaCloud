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
