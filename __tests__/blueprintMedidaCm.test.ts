/**
 * ESQUADRIA EM CENTÍMETRO (23/09/2026, P2.46).
 *
 * ⚠️ O risco que estes casos travam é a PERDA SILENCIOSA. O campo de medida
 * confirma no `blur`: se 2105 mm fosse exibido como "211 cm", bastaria clicar
 * dentro do campo e sair para gravar 2110 mm — a medida do usuário mudaria
 * sozinha, sem ninguém ter digitado nada. Ida e volta tem de ser exata.
 */
import { describe, expect, it } from 'vitest';
import { casasEmCm, cmParaMm, mmParaCm, textoEmCm } from '../utils/blueprintMedidaCm';
import { nomeDaEsquadria } from '../utils/blueprintKernel';

describe('medida de esquadria em centímetro', () => {
  it('a ida e volta é exata, inclusive na medida que não é múltiplo de 10 mm', () => {
    for (const mm of [600, 700, 800, 900, 1000, 1100, 1200, 1500, 2000, 2100, 2105, 2107, 1, 9, 15]) {
      expect(cmParaMm(mmParaCm(mm))).toBe(mm);
    }
  });

  it('a casa decimal aparece só quando existe — 90, e 210,5 quando há milímetro', () => {
    expect(casasEmCm(900)).toBe(0);
    expect(textoEmCm(900)).toBe('90');
    expect(textoEmCm(2100)).toBe('210');
    expect(casasEmCm(2105)).toBe(1);
    expect(textoEmCm(2105)).toBe('210,5');
    // Vírgula, não ponto: é a cota que o resto da planta usa.
    expect(textoEmCm(2105)).not.toContain('.');
  });

  it('o milímetro solto não some: 5 mm é 0,5 cm e volta a 5', () => {
    expect(textoEmCm(5)).toBe('0,5');
    expect(cmParaMm(0.5)).toBe(5);
    expect(cmParaMm(mmParaCm(5))).toBe(5);
  });

  it('o que o usuário digita vira milímetro INTEIRO — o kernel recusa qualquer outra coisa', () => {
    expect(cmParaMm(90)).toBe(900);
    expect(cmParaMm(82.5)).toBe(825);
    // Duas casas em centímetro seriam décimos de milímetro: arredonda, não quebra.
    expect(Number.isInteger(cmParaMm(82.54))).toBe(true);
    expect(cmParaMm(82.54)).toBe(825);
  });

  /**
   * ⚠️ A MESMA CONTA EM DOIS LUGARES. `nomeDaEsquadria` mora no kernel, que
   * não importa nada de fora de si, então a formatação em centímetro está
   * duplicada lá. Este caso trava as duas juntas: se uma mudar sozinha, ele cai.
   */
  it('o nome automático da esquadria usa exatamente esta formatação', () => {
    expect(nomeDaEsquadria({ kind: 'door', widthMm: 800, heightMm: 2100, embutida: false })).toBe(
      `Porta ${textoEmCm(800)}×${textoEmCm(2100)}`,
    );
    expect(nomeDaEsquadria({ kind: 'window', widthMm: 1205, heightMm: 1000, embutida: false })).toBe(
      `Janela ${textoEmCm(1205)}×${textoEmCm(1000)}`,
    );
    // E o resultado é legível para quem desenha: "Porta 80×210", não "800×2100".
    expect(nomeDaEsquadria({ kind: 'door', widthMm: 800, heightMm: 2100, embutida: false })).toBe('Porta 80×210');
  });
});
