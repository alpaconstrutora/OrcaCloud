/**
 * O FUNDO QUE VEIO DO ARQUIVO NÃO É UM ESCANEAMENTO (24/09/2026, P2.57).
 *
 * ⚠️ O relato: importando um DXF, a tela dizia *"a escala aferida num ponto
 * pode não valer no resto da folha"*, *"Aferido em 76,35 m"* e *"equivale a
 * 1:110,1 num escaneamento de 150 dpi"*. O usuário perguntou se devia declarar
 * 1:110,1 — com as paredes já corretas.
 *
 * As três frases são sobre papel escaneado, e nenhuma se aplica: o fundo de DXF
 * é rasterizado por nós A PARTIR DO VETOR. E a sugestão era perigosa: declarar
 * 1:100 recalcularia o mm/px para 16,93 e encolheria a imagem 9% — um fundo
 * certo virando errado por causa de um texto que não era sobre ele.
 *
 * Os números destes casos são os do banco do usuário: 4097 px, 18,636 mm/px,
 * 76.350 mm aferidos, `p1 (0,0)` → `p2 (4097,0)`.
 */
import { describe, expect, it } from 'vitest';
import {
  aplicarMmPorPixel,
  escalaVeioDoArquivo,
  mmPorPixelDaEscala,
  pixelParaModelo,
  type Underlay,
} from '../utils/blueprintUnderlay';

/** O fundo do usuário, como está gravado. */
const DO_DXF = {
  pdf_pagina: null,
  calib_p1_px: 0,
  calib_p1_py: 0,
  calib_p2_px: 4097,
  calib_p2_py: 0,
  calib_alinhado: true,
};

const UNDERLAY: Underlay = { origemXMm: 1000, origemYMm: 2000, mmPorPixel: 18.636, rotacaoMrad: 0 };

describe('reconhecer o fundo cuja escala veio do arquivo', () => {
  it('a assinatura de máquina identifica o fundo de DXF', () => {
    expect(escalaVeioDoArquivo(DO_DXF)).toBe(true);
  });

  it('⚠️ prancha de PDF e planta aferida A DEDO continuam sendo o outro caso', () => {
    // PDF: tem página, e ali "1:100" é a via certa.
    expect(escalaVeioDoArquivo({ ...DO_DXF, pdf_pagina: 1 })).toBe(false);
    // Aferição humana: ninguém clica em (0,0) e (4097,0) exatos.
    expect(escalaVeioDoArquivo({ ...DO_DXF, calib_p1_px: 312, calib_p1_py: 880 })).toBe(false);
    expect(escalaVeioDoArquivo({ ...DO_DXF, calib_p2_py: 7 })).toBe(false);
    // Sem calibração nenhuma (imagem recém-importada).
    expect(escalaVeioDoArquivo({ ...DO_DXF, calib_p2_px: null, calib_alinhado: null })).toBe(false);
  });

  it('⚠️ o número que a tela sugeria: declarar 1:100 encolheria a imagem 9%', () => {
    // É a conta que estava por trás de "equivale a 1:110,1 num escaneamento de
    // 150 dpi" — e o motivo de ela não servir ao fundo de DXF.
    expect(mmPorPixelDaEscala(100)).toBeCloseTo(16.933, 3);
    const encolhimento = 1 - mmPorPixelDaEscala(100) / 18.636;
    expect(encolhimento).toBeGreaterThan(0.08);
    expect(encolhimento).toBeLessThan(0.1);
    // E 1:110,1 é só a leitura inversa do mm/px que o rasterizador escolheu.
    expect((18.636 * 150) / 25.4).toBeCloseTo(110.06, 1);
  });
});

describe('corrigir o milímetro por pixel', () => {
  it('troca a escala mantendo o pivô no lugar — o traçado não sai do lugar', () => {
    const pivo = { px: 0, py: 0 };
    const antes = pixelParaModelo(UNDERLAY, pivo);
    const novo = aplicarMmPorPixel(1.8636, UNDERLAY, pivo);
    expect(novo.mmPorPixel).toBeCloseTo(1.8636, 4);
    expect(pixelParaModelo(novo, pivo)).toEqual(antes);
  });

  it('o caso que motiva: arquivo em centímetro lido como milímetro fica 10× fora', () => {
    const corrigido = aplicarMmPorPixel(UNDERLAY.mmPorPixel * 10, UNDERLAY, { px: 0, py: 0 });
    // A largura de 4097 px passa de 76,35 m para 763,5 m — é o gesto de quem
    // descobriu que a unidade do arquivo estava errada.
    expect((4097 * corrigido.mmPorPixel) / 1000).toBeCloseTo(763.5, 1);
  });

  it('mm por pixel não positivo é recusado, com mensagem', () => {
    expect(() => aplicarMmPorPixel(0, UNDERLAY)).toThrow(/maior que zero/);
    expect(() => aplicarMmPorPixel(-1, UNDERLAY)).toThrow(/maior que zero/);
  });
});
