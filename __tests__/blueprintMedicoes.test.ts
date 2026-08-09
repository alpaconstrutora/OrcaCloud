/**
 * Formas medidas — o levantamento à mão sobre a planta de fundo.
 *
 * Como nos quantitativos derivados, os valores esperados são calculados à mão no
 * comentário de cada caso. O caso que mais importa não é "mede certo": é
 * **recalibrar transformar as formas junto**. Sem isso, corrigir a escala deixa
 * cada contorno flutuando no vazio e o número que ele mede vira ficção — sem
 * nada na tela denunciando.
 */

import { describe, expect, it } from 'vitest';
import {
  DIMENSAO_POR_TIPO,
  formaValida,
  medir,
  perimetroM,
  pontosMinimos,
  semItem,
  totaisPorItem,
  transformarPorRecalibracao,
  type FormaMedida,
} from '../utils/blueprintMedicoes';
import { calibrar, pixelParaModelo, modeloParaPixel } from '../utils/blueprintUnderlay';
import { point } from '../utils/blueprintKernel';

function forma(over: Partial<FormaMedida> = {}): FormaMedida {
  return {
    id: 'med_1',
    tipo: 'POLIGONO',
    pontos: [point(0, 0), point(4000, 0), point(4000, 3000), point(0, 3000)],
    nome: 'Sala',
    itemCode: '87251',
    cor: '#2563eb',
    ...over,
  };
}

describe('medições · o número', () => {
  it('polígono mede ÁREA em m²', () => {
    // 4,00 × 3,00 = 12,00 m². Aqui é a área do que foi TRAÇADO — não há recuo de
    // meia espessura, porque não há parede: quem traçou apontou o piso.
    expect(medir(forma()).valor).toBeCloseTo(12, 6);
    expect(medir(forma()).unidade).toBe('M2');
  });

  it('linha mede COMPRIMENTO, e não fecha o contorno', () => {
    // Três pontos em L: 4,00 + 3,00 = 7,00 m. Se fechasse como polígono, somaria
    // o trecho de volta (5,00 m) que ninguém desenhou.
    const l = forma({
      tipo: 'LINHA',
      pontos: [point(0, 0), point(4000, 0), point(4000, 3000)],
    });
    expect(medir(l).valor).toBeCloseTo(7, 6);
    expect(medir(l).unidade).toBe('M');
  });

  it('ponto mede CONTAGEM', () => {
    const p = forma({ tipo: 'PONTO', pontos: [point(0, 0), point(100, 100), point(200, 0)] });
    expect(medir(p).valor).toBe(3);
    expect(medir(p).unidade).toBe('UN');
  });

  it('A UNIDADE VEM DO TIPO — não há como errar o mapeamento', () => {
    // É o ponto em que esta camada é mais forte que o de-para do RF-122: lá se
    // mapeia medida livre para item livre e por isso existe uma trava; aqui o
    // tipo da forma decide, e o erro é impossível por construção.
    expect(DIMENSAO_POR_TIPO.POLIGONO).toBe('M2');
    expect(DIMENSAO_POR_TIPO.LINHA).toBe('M');
    expect(DIMENSAO_POR_TIPO.PONTO).toBe('UN');
  });

  it('o polígono também entrega perímetro, sem traçar de novo', () => {
    // 2 × (4,00 + 3,00) = 14,00 m — serve de rodapé.
    expect(perimetroM(forma())).toBeCloseTo(14, 6);
    expect(perimetroM(forma({ tipo: 'LINHA' }))).toBeNull();
  });

  it('não arredonda: somar valores já arredondados acumula erro', () => {
    // Triângulo de área 0,005 m². Arredondado a 2 casas viraria 0,01 — dobro.
    const t = forma({ pontos: [point(0, 0), point(100, 0), point(0, 100)] });
    expect(medir(t).valor).toBeCloseTo(0.005, 9);
  });
});

describe('medições · forma degenerada não entra', () => {
  it('exige o mínimo de pontos por tipo', () => {
    expect(pontosMinimos('POLIGONO')).toBe(3);
    expect(pontosMinimos('LINHA')).toBe(2);
    expect(pontosMinimos('PONTO')).toBe(1);
  });

  it('polígono com 2 pontos e linha com 1 são recusados', () => {
    // As duas medem zero e ocupam a lista. Gravar uma medição de zero é pior que
    // recusar: alguém vai tentar entender de onde ela veio.
    expect(formaValida(forma({ pontos: [point(0, 0), point(100, 0)] }))).toBe(false);
    expect(formaValida(forma({ tipo: 'LINHA', pontos: [point(0, 0)] }))).toBe(false);
    expect(formaValida(forma())).toBe(true);
  });
});

describe('medições · recalibrar transforma as formas', () => {
  it('O CONTORNO CONTINUA SOBRE O QUE FOI TRAÇADO', () => {
    // O caso que este módulo existe para acertar. A pessoa traça sobre a imagem,
    // depois descobre que a cota lida estava errada. Sem transformar, a imagem
    // se move embaixo do contorno e o número medido vira ficção — e nada na tela
    // denuncia.
    const p1 = { px: 100, py: 400 };
    const p2 = { px: 500, py: 400 };

    const antes = calibrar({ p1, p2, distanciaMm: 4000 });

    // Um retângulo traçado sobre a imagem, entre os pixels (100,100)-(300,300).
    const cantosEmPixel = [
      { px: 100, py: 100 },
      { px: 300, py: 100 },
      { px: 300, py: 300 },
      { px: 100, py: 300 },
    ];
    const traçado = forma({
      pontos: cantosEmPixel.map((c) => {
        const m = pixelParaModelo(antes, c);
        return point(Math.round(m.x), Math.round(m.y));
      }),
    });

    // A mesma cota, relida: eram 4,40 m e não 4,00.
    const depois = calibrar({ p1, p2, distanciaMm: 4400, anterior: antes });
    const [movida] = transformarPorRecalibracao([traçado], antes, depois);

    // Cada canto tem de continuar no MESMO pixel da imagem.
    movida.pontos.forEach((p, i) => {
      const voltou = modeloParaPixel(depois, p.x, p.y);
      expect(voltou.px).toBeCloseTo(cantosEmPixel[i].px, 2);
      expect(voltou.py).toBeCloseTo(cantosEmPixel[i].py, 2);
    });
  });

  it('e a MEDIDA se corrige junto, sem retraçar nada', () => {
    // É a consequência desejada: corrigir a escala corrige todas as medições.
    // 10% a mais de escala em cada eixo dá 21% a mais de área.
    const p1 = { px: 0, py: 0 };
    const p2 = { px: 400, py: 0 };

    const antes = calibrar({ p1, p2, distanciaMm: 4000 });
    const depois = calibrar({ p1, p2, distanciaMm: 4400, anterior: antes });

    const cantos = [
      { px: 0, py: 0 },
      { px: 200, py: 0 },
      { px: 200, py: 200 },
      { px: 0, py: 200 },
    ];
    const traçado = forma({
      pontos: cantos.map((c) => {
        const m = pixelParaModelo(antes, c);
        return point(Math.round(m.x), Math.round(m.y));
      }),
    });

    const areaAntes = medir(traçado).valor;
    const areaDepois = medir(transformarPorRecalibracao([traçado], antes, depois)[0]).valor;

    expect(areaDepois / areaAntes).toBeCloseTo(1.21, 2);
  });

  it('recalibrar para a MESMA escala não mexe em nada', () => {
    const p1 = { px: 10, py: 20 };
    const p2 = { px: 410, py: 20 };
    const u = calibrar({ p1, p2, distanciaMm: 4000 });

    const f = forma();
    const [igual] = transformarPorRecalibracao([f], u, u);
    expect(igual.pontos).toEqual(f.pontos);
  });
});

describe('medições · totais por item', () => {
  it('soma as formas do mesmo item', () => {
    const a = forma({ id: 'a' }); // 12,00 m²
    const b = forma({ id: 'b', pontos: [point(0, 0), point(2000, 0), point(2000, 1000), point(0, 1000)] }); // 2,00
    expect(totaisPorItem([a, b])[0].total).toBeCloseTo(14, 6);
    expect(totaisPorItem([a, b])[0].formas).toBe(2);
  });

  it('SEPARA POR UNIDADE, mesmo no mesmo item', () => {
    // Duas formas de tipos diferentes ligadas ao mesmo código seriam m² somado
    // com metro — soma que não significa nada. Separar transforma o engano em
    // duas linhas visíveis, em vez de um número errado.
    const area = forma({ id: 'a' });
    const linha = forma({
      id: 'b',
      tipo: 'LINHA',
      pontos: [point(0, 0), point(5000, 0)],
    });

    const totais = totaisPorItem([area, linha]);
    expect(totais).toHaveLength(2);
    expect(totais.map((t) => t.unidade).sort()).toEqual(['M', 'M2']);
  });

  it('forma sem item não entra no total, e é listável', () => {
    // Ela mede, mas não chega ao orçamento. Some do total em silêncio seria pior
    // que aparecer numa lista de pendências.
    const ligada = forma({ id: 'a' });
    const solta = forma({ id: 'b', itemCode: null });

    expect(totaisPorItem([ligada, solta])).toHaveLength(1);
    expect(semItem([ligada, solta]).map((f) => f.id)).toEqual(['b']);
  });
});
