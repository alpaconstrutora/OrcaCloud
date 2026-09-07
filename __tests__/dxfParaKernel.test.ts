/**
 * DXF → paredes do kernel, contra arquivos REAIS.
 *
 * ─── O QUE SÓ ARQUIVO DE VERDADE PROVA ──────────────────────────────────────
 *
 * A geometria do pareamento já é testada em `blueprintVetor`. O que só um
 * arquivo real responde é se o desenho que a empresa de fato usa cabe no
 * caminho — e a resposta desmentiu o cabeçalho do próprio arquivo.
 *
 * Roda contra o projeto arquitetônico aprovado na prefeitura (8,3 MB) e contra
 * o nosso próprio export. Sem eles, PULA declarando o motivo.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  paredesDeEixos,
  paredesDoDxf,
  prepararDxf,
  type ParedeDoDxf,
} from '../utils/dxfParaKernel';

const REAL =
  process.env.DXF_REAL ??
  'C:/D/ALPA/0 - PROJETOS/1 - PROJETOS/1 - PROJETO ARQUITETÔNICO/APROVADO/EMITIDO/projeto_de_Altair_Prefeitura_e_retificado_para_plotar - 20-02-17 - Cópia.dxf';
const NOSSO = process.env.DXF_NOSSO ?? 'C:/Users/altai/Downloads/planta-08082026-v4.dxf';
const TEM = existsSync(REAL) && existsSync(NOSSO);

let real: ReturnType<typeof prepararDxf>;
let nosso: ReturnType<typeof prepararDxf>;

describe.skipIf(!TEM)('DXF real · a escala', () => {
  beforeAll(() => {
    real = prepararDxf(readFileSync(REAL, 'utf8'));
    nosso = prepararDxf(readFileSync(NOSSO, 'utf8'));
  }, 120_000);

  it('⚠️ O ARQUIVO REAL MENTE NO $INSUNITS, e a medição o desmente', () => {
    // Ele declara 4 (milímetro) e está em METRO. Acreditar no campo daria uma
    // casa de 13 centímetros, com a forma perfeita — o defeito preferido deste
    // módulo. É o caso mais importante deste arquivo.
    expect(real.mmPorUnidadeDeclarado).toBe(1);
    expect(real.escalas[0].rotulo).toBe('metro');
    expect(real.escalas[0].mmPorUnidade).toBe(1000);
  });

  it('e a medição não é por pouco: metro ganha por duas ordens de grandeza', () => {
    // Empate apertado significaria heurística frágil. 1484 contra 3 é um
    // resultado que não vira pelo ruído de outro arquivo.
    const [melhor, segunda] = real.escalas;
    expect(melhor.paredesPlausiveis).toBeGreaterThan(1000);
    expect(melhor.paredesPlausiveis).toBeGreaterThan(segunda.paredesPlausiveis * 3);
    const milimetro = real.escalas.find((e) => e.rotulo === 'milímetro')!;
    expect(milimetro.paredesPlausiveis).toBeLessThan(10);
  });

  it('no NOSSO export a medição dá milímetro — que é o que ele escreve', () => {
    expect(nosso.escalas[0].rotulo).toBe('milímetro');
  });
});

describe.skipIf(!TEM)('DXF real · as paredes', () => {
  let paredes: ParedeDoDxf[];

  beforeAll(() => {
    real = real ?? prepararDxf(readFileSync(REAL, 'utf8'));
    paredes = paredesDoDxf(
      real.segmentos.filter((s) => s.camada === 'PAREDE'),
      1000,
    );
  }, 120_000);

  it('a camada PAREDE existe e é grande — o desenhista separa parede', () => {
    const camada = real.porCamada.find((c) => c.camada === 'PAREDE')!;
    expect(camada.segmentos).toBeGreaterThan(2000);
  });

  it('AS ESPESSURAS SÃO DE PAREDE DE VERDADE', () => {
    // ⚠️ É a prova de que o pareamento e a escala estão certos ao mesmo tempo,
    // e ela não é um cálculo meu: 10, 15, 20, 30 e 40 cm são as espessuras que
    // se constrói no Brasil. Escala errada ou pareamento errado não produzem
    // essa distribuição por acaso.
    const conta = new Map<number, number>();
    for (const p of paredes) conta.set(p.espessuraMm, (conta.get(p.espessuraMm) ?? 0) + 1);
    const mais = [...conta.entries()].sort((a, b) => b[1] - a[1])[0];
    expect(mais[0]).toBe(150);
    expect(mais[1]).toBeGreaterThan(200);
    // E nenhuma fora da faixa plausível — o filtro é o que impede cota e
    // hachura de virarem parede.
    for (const p of paredes) {
      expect(p.espessuraMm).toBeGreaterThanOrEqual(50);
      expect(p.espessuraMm).toBeLessThanOrEqual(500);
    }
  });

  it('quantidade e comprimento têm ordem de grandeza de planta', () => {
    expect(paredes.length).toBeGreaterThan(400);
    const comp = paredes.map((p) => p.comprimentoMm).sort((a, b) => a - b);
    expect(comp[comp.length - 1]).toBeGreaterThan(10_000);
    expect(comp[comp.length - 1]).toBeLessThan(100_000);
  });

  it('nenhuma parede sai degenerada depois da mitragem', () => {
    // Uma só derrubaria a importação inteira com `DEGENERATE_WALL` — "ou tudo,
    // ou nada" viraria "nada" por causa de um traço.
    for (const p of paredes) expect(p.a.x !== p.b.x || p.a.y !== p.b.y).toBe(true);
  });
});

describe.skipIf(!TEM)('DXF · a camada de EIXO é o caminho exato', () => {
  it('o nosso export tem PLANTA-EIXOS, e cada traço é uma parede', () => {
    // Onde existe camada de eixo não há o que derivar: o traço JÁ é o eixo.
    // Pareá-lo seria trocar dado exato por estimativa.
    nosso = nosso ?? prepararDxf(readFileSync(NOSSO, 'utf8'));
    const eixos = nosso.segmentos.filter((s) => s.camada === 'PLANTA-EIXOS');
    expect(eixos.length).toBeGreaterThan(0);

    const paredes = paredesDeEixos(eixos, 1, 150);
    expect(paredes).toHaveLength(eixos.length);
    expect(paredes.every((p) => p.espessuraMm === 150)).toBe(true);
    // E o comprimento é o do traço, sem derivação nenhuma.
    const e = eixos[0];
    expect(paredes[0].comprimentoMm).toBe(
      Math.round(Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y)),
    );
  });

  it('o pareamento acha MENOS paredes que a camada de eixo — e é esperado', () => {
    // O par de faces só existe onde as duas foram desenhadas e se acompanham;
    // num desenho pequeno, trechos ficam sem contraparte. Onde há eixo, usa-se
    // o eixo — é para isso que a tela oferece os dois caminhos.
    nosso = nosso ?? prepararDxf(readFileSync(NOSSO, 'utf8'));
    const porFace = paredesDoDxf(
      nosso.segmentos.filter((s) => s.camada === 'PLANTA-PAREDES'),
      1,
    );
    const porEixo = paredesDeEixos(
      nosso.segmentos.filter((s) => s.camada === 'PLANTA-EIXOS'),
      1,
      150,
    );
    expect(porFace.length).toBeLessThanOrEqual(porEixo.length);
    expect(porFace.every((p) => p.espessuraMm === 150)).toBe(true);
  });
});
