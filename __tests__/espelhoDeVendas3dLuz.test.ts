/**
 * LUZ DO DIA (Espelho de Vendas 3D, F7 — 10/11/2026): os quatro momentos do dia e a trava que importa — a cor do
 * status continua LEGÍVEL em todos eles. Puro. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import { describe, expect, it } from 'vitest';
import { LUZES_DO_DIA, ORDEM_DAS_LUZES, corSobALuz, janelaAcesa, type LuzDoDia } from '../utils/espelhoDeVendas3dLuz';
import { COR_DO_PISO_SEM_UNIDADE, ORDEM_DOS_STATUS, PALETA_PADRAO_DO_ESPELHO } from '../utils/espelhoDeVendas3dMalha';
import { PALETA_DO_CORRETOR } from '../utils/espelhoDoEstoque';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const distancia = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
/** O matiz (0–360) — o que faz verde ser verde e vermelho ser vermelho, com mais ou menos luz. */
const matiz = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const diferencaDeMatiz = (a: string, b: string) => {
  const d = Math.abs(matiz(a) - matiz(b));
  return Math.min(d, 360 - d);
};

/** As faces de um prisma, pelo cosseno com o sol: de costas, de lado e de frente. */
const FACES = [0, 0.5, 1];
const PALETAS = { analise: PALETA_PADRAO_DO_ESPELHO, corretor: PALETA_DO_CORRETOR };

describe('LUZES_DO_DIA', () => {
  it('são quatro, na ordem do dia, e "Dia" é a padrão (a cena de antes da F7)', () => {
    expect(ORDEM_DAS_LUZES).toEqual(['amanhecer', 'dia', 'entardecer', 'noite']);
    expect(ORDEM_DAS_LUZES.map((k) => LUZES_DO_DIA[k].rotulo)).toEqual(['Amanhecer', 'Dia', 'Entardecer', 'Noite']);
    expect(LUZES_DO_DIA.dia).toMatchObject({
      ambiente: { cor: '#ffffff', intensidade: 2.1 },
      sol: { cor: '#ffffff', intensidade: 1.5, direcao: [1, 2, 0.8] },
      contraluz: { cor: '#ffffff', intensidade: 0.5 },
      chao: '#e8edf3',
      janelas: { fracao: 0 },
    });
  });

  it('só a noite acende janelas; o sol nunca vem de baixo do chão', () => {
    expect(ORDEM_DAS_LUZES.filter((k) => LUZES_DO_DIA[k].janelas.fracao > 0)).toEqual(['noite']);
    for (const k of ORDEM_DAS_LUZES) expect(LUZES_DO_DIA[k].sol.direcao[1]).toBeGreaterThan(0);
  });

  // De frente para o sol a luz soma 1,15 (2,1 + 1,5 sobre pi): a cor sai um pouco mais clara que a da legenda, nunca outra.
  it('o dia sob a luz padrão devolve praticamente a cor da legenda numa face de frente para o sol', () => {
    for (const k of ORDEM_DOS_STATUS) {
      const cor = PALETA_PADRAO_DO_ESPELHO[k].cor;
      expect(distancia(corSobALuz(cor, LUZES_DO_DIA.dia, { cosseno: 1 }), cor)).toBeLessThan(25);
    }
  });
});

describe('a cor do status continua legível em toda luz', () => {
  const casos: { luz: LuzDoDia; paleta: keyof typeof PALETAS; cosseno: number; acesa: boolean }[] = [];
  for (const luz of ORDEM_DAS_LUZES)
    for (const paleta of Object.keys(PALETAS) as (keyof typeof PALETAS)[])
      for (const cosseno of FACES)
        for (const acesa of LUZES_DO_DIA[luz].janelas.fracao > 0 ? [false, true] : [false]) casos.push({ luz, paleta, cosseno, acesa });

  it.each(casos)('$luz · paleta $paleta · face $cosseno · acesa=$acesa', ({ luz, paleta, cosseno, acesa }) => {
    const p = PALETAS[paleta];
    const visto = (cor: string) => corSobALuz(cor, LUZES_DO_DIA[luz], { cosseno, acesa });
    const status = ORDEM_DOS_STATUS.filter((k) => k !== 'other');
    for (let i = 0; i < status.length; i++) {
      // Não vira preto nem estoura para branco: sobra cor para ler.
      const [r, g, b] = rgb(visto(p[status[i]].cor));
      expect(Math.max(r, g, b), `${status[i]} escuro demais`).toBeGreaterThan(70);
      // Status que é COR na legenda (na paleta da Análise, "Permutada" é cinza-azulado: esse se lê pelo tom, não pelo matiz).
      const [lr, lg, lb] = rgb(p[status[i]].cor);
      if (Math.max(lr, lg, lb) - Math.min(lr, lg, lb) > 80) {
        expect(Math.max(r, g, b) - Math.min(r, g, b), `${status[i]} sem cor`).toBeGreaterThan(45);
        // O matiz é o da legenda: a luz colorida não transforma um status em outro.
        expect(diferencaDeMatiz(visto(p[status[i]].cor), p[status[i]].cor), `${status[i]} mudou de matiz`).toBeLessThan(22);
      }
      for (let j = i + 1; j < status.length; j++) {
        expect(distancia(visto(p[status[i]].cor), visto(p[status[j]].cor)), `${status[i]} × ${status[j]}`).toBeGreaterThan(55);
      }
      // E não se confunde com o piso sem unidade (o volume neutro).
      expect(distancia(visto(p[status[i]].cor), visto(COR_DO_PISO_SEM_UNIDADE)), `${status[i]} × piso`).toBeGreaterThan(45);
    }
  });
});

describe('janelaAcesa', () => {
  const ids = Array.from({ length: 400 }, (_, i) => `unidade-${i}`);

  it('é estável: a mesma unidade acende igual a cada desenho', () => {
    expect(ids.map((id) => janelaAcesa(id, 0.55))).toEqual(ids.map((id) => janelaAcesa(id, 0.55)));
  });

  it('acende perto da fração pedida, espalhado (não um bloco inteiro)', () => {
    const acesas = ids.filter((id) => janelaAcesa(id, 0.55)).length;
    expect(acesas / ids.length).toBeGreaterThan(0.45);
    expect(acesas / ids.length).toBeLessThan(0.65);
    // Não há 12 vizinhas seguidas iguais.
    const seguidas = ids.map((id) => janelaAcesa(id, 0.55)).reduce((a, v, i, l) => (i > 0 && v === l[i - 1] ? { n: a.n + 1, max: Math.max(a.max, a.n + 1) } : { n: 1, max: a.max }), { n: 1, max: 1 }).max;
    expect(seguidas).toBeLessThan(12);
  });

  it('fração 0 = nenhuma; 1 = todas; sem id = apagada', () => {
    expect(ids.some((id) => janelaAcesa(id, 0))).toBe(false);
    expect(ids.every((id) => janelaAcesa(id, 1))).toBe(true);
    expect(janelaAcesa(null, 0.55)).toBe(false);
  });
});
