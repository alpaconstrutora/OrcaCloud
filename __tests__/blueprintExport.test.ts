/**
 * RF-125 (exportação) e RF-124 (diff semântico).
 *
 * O caso central da exportação não é "gera arquivo" — é a ESCALA estar certa.
 * Uma folha que diz 1:100 e mede outra coisa é pior que folha nenhuma: sai da
 * tela, vira papel, e alguém mede com escalímetro. Por isso os casos daqui
 * medem MILÍMETRO DE PAPEL contra conta feita à mão no comentário.
 *
 * A comparação é sobre as chamadas de desenho, não sobre pixel. Teste de
 * imagem quebra com mudança de fonte e ninguém mantém.
 */

import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import {
  AVISO_PADRAO,
  CARIMBO_MM,
  DesenhistaDeProva,
  ESCALAS,
  MARGEM_MM,
  PAPEIS,
  boundingBox,
  desenharPlanta,
  enquadrar,
  manifesto,
  nomeArquivo,
  orientar,
  type OpcoesExportacao,
} from '../utils/blueprintExport';
import { diffSnapshots } from '../utils/blueprintDiff';

const H = 2800;
const T = 150;
const A4 = PAPEIS.find((p) => p.id === 'A4')!;
const A3 = PAPEIS.find((p) => p.id === 'A3')!;

function comNivel() {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  return { model: r.model, levelId: r.model.levels[0].id };
}

function parede(levelId: string, ax: number, ay: number, bx: number, by: number, t = T): Command {
  return {
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: t,
    heightMm: H,
  };
}

function sala(levelId: string, x0: number, y0: number, x1: number, y1: number, t = T): Command[] {
  return [
    parede(levelId, x0, y0, x1, y0, t),
    parede(levelId, x1, y0, x1, y1, t),
    parede(levelId, x1, y1, x0, y1, t),
    parede(levelId, x0, y1, x0, y0, t),
  ];
}

/** Sala de `l` × `a` metros. */
function planta(l: number, a: number, t = T): BlueprintModel {
  const { model, levelId } = comNivel();
  return applyBatch(model, sala(levelId, 0, 0, l * 1000, a * 1000, t)).model;
}

function opcoes(over: Partial<OpcoesExportacao> = {}): OpcoesExportacao {
  return {
    denominador: 100,
    papel: A4,
    titulo: 'Casa térrea',
    revisao: 3,
    hash: 'abcdef0123456789abcdef',
    data: new Date('2026-08-09T12:00:00Z'),
    ...over,
  };
}

describe('exportação · a escala é entrada, não resultado', () => {
  it('1:100 põe 1 metro real em 10 mm de papel', () => {
    // É a definição de escala. Se esta conta escorregar, todo o resto mente.
    const m = planta(4, 3);
    const enq = enquadrar(m, 100, A4);

    // 4,00 m + 2 × meia espessura (0,075) = 4,15 m reais → 41,5 mm em 1:100
    expect(enq.desenhoLarguraMm).toBeCloseTo(41.5, 3);
    // 3,00 m + 0,15 = 3,15 m → 31,5 mm
    expect(enq.desenhoAlturaMm).toBeCloseTo(31.5, 3);
  });

  it('a folga é meia espessura de cada lado, porque a caixa mede o EIXO', () => {
    // Sem a folga, o traço externo da parede sairia cortado na borda.
    const fina = enquadrar(planta(4, 3, 100), 100, A4);
    const grossa = enquadrar(planta(4, 3, 300), 100, A4);

    // 4,00 + 0,10 = 4,10 m → 41,0 mm   contra   4,00 + 0,30 = 4,30 → 43,0 mm
    expect(fina.desenhoLarguraMm).toBeCloseTo(41, 3);
    expect(grossa.desenhoLarguraMm).toBeCloseTo(43, 3);
  });

  it('a área útil desconta margens e o carimbo', () => {
    const enq = enquadrar(planta(4, 3), 100, A4);
    // A4 retrato: 210 − 2×12 = 186 de largura; 297 − 2×12 − 26 = 247 de altura.
    expect(enq.utilLarguraMm).toBe(A4.larguraMm - 2 * MARGEM_MM);
    expect(enq.utilAlturaMm).toBe(A4.alturaMm - 2 * MARGEM_MM - CARIMBO_MM);
  });

  it('RECUSA quando não cabe, e diz a escala que caberia', () => {
    // Casa de 30 × 20 m em 1:50 daria 600 mm de largura — três vezes o A4.
    // Encolher para caber produziria uma folha que DIZ 1:50 e mede outra coisa.
    const grande = planta(30, 20);
    const enq = enquadrar(grande, 50, A4);

    expect(enq.cabe).toBe(false);
    expect(enq.escalaSugerida).not.toBeNull();
    // 30,15 m / 186 mm → precisa de denominador ≥ 162; o primeiro da lista é 200.
    expect(enq.escalaSugerida).toBe(200);

    const noSugerido = enquadrar(grande, enq.escalaSugerida!, A4);
    expect(noSugerido.cabe, 'a escala sugerida tem que caber de verdade').toBe(true);
  });

  it('papel maior faz caber a mesma escala', () => {
    const m = planta(20, 14);
    expect(enquadrar(m, 100, A4).cabe).toBe(false);
    expect(enquadrar(m, 100, A3).cabe).toBe(true);
  });

  it('nenhuma escala da lista cabe: avisa em vez de inventar uma', () => {
    // Terreno de 500 × 300 m não entra em A4 nem na maior escala da lista:
    // 500,15 m / 500 = 1000 mm de papel, contra 186 mm de área útil.
    const enorme = planta(500, 300);
    expect(enquadrar(enorme, 500, A4).escalaSugerida).toBeNull();
  });

  it('paisagem troca os lados, e só isso', () => {
    const p = orientar(A4, true);
    expect(p.larguraMm).toBe(297);
    expect(p.alturaMm).toBe(210);
    expect(p.id).toBe('A4');
  });

  it('a lista de escalas está em ordem crescente', () => {
    // `escalaSugerida` usa `find`, que devolve a PRIMEIRA que cabe. Fora de
    // ordem, ela sugeriria uma escala maior do que a necessária.
    expect([...ESCALAS].sort((a, b) => a - b)).toEqual(ESCALAS);
  });

  it('modelo vazio não quebra o enquadramento', () => {
    expect(boundingBox(emptyModel())).toBeNull();
    expect(enquadrar(emptyModel(), 100, A4).cabe).toBe(true);
  });
});

describe('exportação · o que vai para o papel', () => {
  function desenhar(o: Partial<OpcoesExportacao> = {}, m = planta(4, 3)) {
    const op = opcoes(o);
    const d = new DesenhistaDeProva();
    desenharPlanta(d, m, op, enquadrar(m, op.denominador, op.papel));
    return d;
  }

  it('o carimbo traz escala, papel, versão e data', () => {
    const textos = desenhar().textos().join(' | ');
    expect(textos).toContain('Escala 1:100');
    expect(textos).toContain('A4');
    expect(textos).toContain('Versão 3');
    expect(textos).toContain('09/08/2026');
  });

  it('O AVISO DE FINALIDADE VAI NA FOLHA', () => {
    // RF-125. Uma planta de estudo que sai sem dizer que é estudo é o caminho
    // mais curto para virar documento de obra.
    expect(desenhar().textos().join(' ')).toContain('ESTUDO PRELIMINAR');
  });

  it('o hash liga o papel à versão publicada', () => {
    // Sem ele, duas impressões parecidas são indistinguíveis — e é sempre a
    // errada que vai para a obra.
    expect(desenhar().textos().join(' ')).toContain('abcdef0123456789');
  });

  it('a parede sai VAZADA: silhueta preta e miolo branco mais fino', () => {
    const linhas = desenhar().chamadas.filter((c) => c.tipo === 'linha');
    const pretas = linhas.filter((c) => (c.args[4] as { cor: string }).cor === '#000000');
    const brancas = linhas.filter((c) => (c.args[4] as { cor: string }).cor === '#ffffff');

    expect(pretas).toHaveLength(4);
    expect(brancas).toHaveLength(4);

    // Em 1:100 a parede de 150 mm mede 1,5 mm no papel; o miolo, 1,5 − 2×0,13.
    expect((pretas[0].args[4] as { espessuraMm: number }).espessuraMm).toBeCloseTo(1.5, 3);
    expect((brancas[0].args[4] as { espessuraMm: number }).espessuraMm).toBeCloseTo(1.24, 3);
  });

  it('parede fina demais na escala fica sólida em vez de sumir', () => {
    // Parede de 100 mm em 1:500 mede 0,2 mm no papel; tirando 2 × 0,13 o miolo
    // ficaria NEGATIVO. Mesmo positivo e minúsculo não serviria: abaixo de
    // 0,1 mm nenhuma impressora resolve o traço.
    const d = desenhar({ denominador: 500, papel: A3 }, planta(60, 40, 100));
    const brancas = d.chamadas.filter(
      (c) => c.tipo === 'linha' && (c.args[4] as { cor: string }).cor === '#ffffff',
    );
    expect(brancas).toHaveLength(0);
  });

  it('a área do ambiente aparece junto do nome', () => {
    const { model, levelId } = comNivel();
    const construida = applyBatch(model, sala(levelId, 0, 0, 4000, 3000)).model;
    const nomeada = applyCommand(construida, {
      type: 'NameSpace',
      spaceId: construida.spaces[0].id,
      name: 'Cozinha',
    }).model;

    const textos = desenhar({}, nomeada).textos();
    expect(textos).toContain('Cozinha');
    // Área de EIXO, que é a que o `Space` carrega: 4,00 × 3,00 = 12,00 m².
    expect(textos).toContain('12,00 m²');
  });

  it('o desenho cabe dentro das margens do papel', () => {
    // Traço fora da margem some na impressora.
    const d = desenhar();
    const linhas = d.chamadas.filter((c) => c.tipo === 'linha');

    for (const c of linhas) {
      const [x1, y1, x2, y2] = c.args as [number, number, number, number];
      for (const [x, y] of [
        [x1, y1],
        [x2, y2],
      ]) {
        expect(x).toBeGreaterThanOrEqual(MARGEM_MM - 0.01);
        expect(x).toBeLessThanOrEqual(A4.larguraMm - MARGEM_MM + 0.01);
        expect(y).toBeGreaterThanOrEqual(MARGEM_MM - 0.01);
        expect(y).toBeLessThanOrEqual(A4.alturaMm - MARGEM_MM + 0.01);
      }
    }
  });

  it('o Y do papel cresce para baixo — a planta não sai espelhada', () => {
    // Erro clássico: o modelo tem Y para cima e o papel para baixo. Sem a
    // inversão, a planta imprime de cabeça para baixo e ninguém percebe numa
    // sala simétrica.
    const { model, levelId } = comNivel();
    // "L" assimétrico: o topo é estreito, a base é larga.
    const assimetrica = applyBatch(model, [
      parede(levelId, 0, 0, 6000, 0),
      parede(levelId, 6000, 0, 6000, 2000),
      parede(levelId, 6000, 2000, 2000, 2000),
      parede(levelId, 2000, 2000, 2000, 6000),
      parede(levelId, 2000, 6000, 0, 6000),
      parede(levelId, 0, 6000, 0, 0),
    ]).model;

    const d = desenhar({}, assimetrica);
    const linhas = d.chamadas.filter((c) => c.tipo === 'linha');
    const ys = linhas.flatMap((c) => [c.args[1] as number, c.args[3] as number]);

    // A base do modelo (y = 0) tem que virar o MAIOR y de papel.
    const baseNoModelo = 0;
    const topoNoModelo = 6000;
    const enq = enquadrar(assimetrica, 100, A4);
    const yPapel = (yModelo: number) =>
      enq.offsetYMm + (enq.desenhoAlturaMm - (yModelo + 75) / 100);

    expect(Math.max(...ys)).toBeCloseTo(yPapel(baseNoModelo), 3);
    expect(Math.min(...ys)).toBeCloseTo(yPapel(topoNoModelo), 3);
  });
});

describe('exportação · manifesto e nome de arquivo', () => {
  it('o manifesto responde de qual versão saiu a folha', () => {
    const m = planta(4, 3);
    const dados = manifesto(m, opcoes(), 'blueprint-kernel-ts-9.9.9');

    expect(dados.revisao).toBe(3);
    expect(dados.hash).toBe('abcdef0123456789abcdef');
    expect(dados.escala).toBe('1:100');
    expect(dados.kernel).toBe('blueprint-kernel-ts-9.9.9');
    expect(dados.paredes).toBe(4);
    expect(dados.aviso).toBe(AVISO_PADRAO);
  });

  it('o nome do arquivo ordena por planta e versão, sem acento nem espaço', () => {
    expect(nomeArquivo(opcoes({ titulo: 'Casa Térrea — Ampliação' }), 'pdf')).toBe(
      'casa-terrea-ampliacao-v3-1_100.pdf',
    );
  });

  it('título vazio não produz arquivo sem nome', () => {
    expect(nomeArquivo(opcoes({ titulo: '   ' }), 'png')).toBe('planta-v3-1_100.png');
  });
});

describe('diff semântico (RF-124)', () => {
  it('ID NÃO SERVE PARA COMPARAR: a identidade é geométrica', () => {
    // Os dois modelos têm as MESMAS paredes com os MESMOS ids, porque o
    // contador é determinístico — mas em ordens diferentes. Um diff por id não
    // acusaria nada aqui; um por id em modelos com remoção acusaria tudo.
    const { model, levelId } = comNivel();
    const a = applyBatch(model, sala(levelId, 0, 0, 4000, 3000)).model;
    const b = applyBatch(model, [
      parede(levelId, 0, 3000, 0, 0),
      parede(levelId, 4000, 3000, 0, 3000),
      parede(levelId, 4000, 0, 4000, 3000),
      parede(levelId, 0, 0, 4000, 0),
    ]).model;

    const d = diffSnapshots(a, b);
    expect(d.identicos, `alterações inesperadas: ${d.alteracoes.map((x) => x.descricao)}`).toBe(
      true,
    );
  });

  it('parede desenhada no sentido inverso é a MESMA parede', () => {
    const { model, levelId } = comNivel();
    const a = applyCommand(model, parede(levelId, 0, 0, 4000, 0)).model;
    const b = applyCommand(model, parede(levelId, 4000, 0, 0, 0)).model;

    expect(diffSnapshots(a, b).identicos).toBe(true);
  });

  it('acusa parede adicionada com o comprimento dela', () => {
    const { model, levelId } = comNivel();
    const a = applyBatch(model, sala(levelId, 0, 0, 6000, 3000)).model;
    const b = applyCommand(a, parede(levelId, 3000, 0, 3000, 3000)).model;

    const d = diffSnapshots(a, b);
    const paredes = d.alteracoes.filter((x) => x.tipo === 'PAREDE_ADICIONADA');

    expect(paredes).toHaveLength(1);
    expect(paredes[0].descricao).toContain('3,00 m');
    // E o ambiente virou dois.
    expect(d.resumo.ambientesAntes).toBe(1);
    expect(d.resumo.ambientesDepois).toBe(2);
  });

  it('acusa mudança de espessura sem chamar de remoção mais inserção', () => {
    const { model, levelId } = comNivel();
    const a = applyBatch(model, sala(levelId, 0, 0, 4000, 3000, 150)).model;
    const b = applyCommand(a, {
      type: 'SetThickness',
      wallId: a.walls[0].id,
      thicknessMm: 250,
    }).model;

    const d = diffSnapshots(a, b);
    expect(d.alteracoes.filter((x) => x.tipo === 'PAREDE_ESPESSURA')).toHaveLength(1);
    expect(d.alteracoes.filter((x) => x.tipo === 'PAREDE_REMOVIDA')).toHaveLength(0);
    expect(d.alteracoes[0].descricao).toContain('150 → 250 mm');
  });

  it('ambiente que muda de tamanho vira UMA frase, não duas', () => {
    // Sem o pareamento por nome, o mesmo cômodo apareceria como "deixou de
    // existir" e "apareceu" — leitura que não ajuda ninguém a aprovar a revisão.
    const { model, levelId } = comNivel();
    const antes = applyBatch(model, sala(levelId, 0, 0, 4000, 3000)).model;
    const nomeado = applyCommand(antes, {
      type: 'NameSpace',
      spaceId: antes.spaces[0].id,
      name: 'Quarto',
    }).model;

    const direita = nomeado.walls.find((w) => w.a.x === 4000 && w.b.x === 4000)!;
    const topo = nomeado.walls.find((w) => w.a.y === 3000 && w.b.y === 3000)!;
    let depois = applyCommand(nomeado, {
      type: 'MoveVertex',
      wallId: direita.id,
      end: 'b',
      to: point(6000, 3000),
    }).model;
    depois = applyCommand(depois, {
      type: 'MoveVertex',
      wallId: topo.id,
      end: 'a',
      to: point(6000, 3000),
    }).model;

    const d = diffSnapshots(nomeado, depois);
    const area = d.alteracoes.filter((x) => x.tipo === 'AMBIENTE_AREA');

    expect(area).toHaveLength(1);
    expect(area[0].descricao).toContain('Quarto');
    expect(area[0].descricao).toContain('12,00');
    expect(d.alteracoes.filter((x) => x.tipo === 'AMBIENTE_REMOVIDO')).toHaveLength(0);
  });

  it('acusa renomeação de ambiente', () => {
    const { model, levelId } = comNivel();
    const base = applyBatch(model, sala(levelId, 0, 0, 4000, 3000)).model;
    const a = applyCommand(base, {
      type: 'NameSpace',
      spaceId: base.spaces[0].id,
      name: 'Sala',
    }).model;
    const b = applyCommand(a, {
      type: 'NameSpace',
      spaceId: a.spaces[0].id,
      name: 'Escritório',
    }).model;

    const d = diffSnapshots(a, b);
    expect(d.alteracoes).toHaveLength(1);
    expect(d.alteracoes[0].tipo).toBe('AMBIENTE_RENOMEADO');
    expect(d.alteracoes[0].descricao).toContain('Escritório');
  });

  it('acusa porta adicionada e removida', () => {
    const { model, levelId } = comNivel();
    const a = applyBatch(model, sala(levelId, 0, 0, 4000, 3000)).model;
    const b = applyCommand(a, {
      type: 'AddOpening',
      wallId: a.walls[0].id,
      kind: 'door',
      offsetMm: 1000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;

    expect(diffSnapshots(a, b).alteracoes[0].tipo).toBe('ABERTURA_ADICIONADA');
    expect(diffSnapshots(b, a).alteracoes[0].tipo).toBe('ABERTURA_REMOVIDA');
  });

  it('ordena pelo que move mais o quantitativo', () => {
    // Quem revisa quer ver primeiro o que muda o orçamento, não a ordem em que
    // o kernel percorreu as listas.
    const { model, levelId } = comNivel();
    const a = applyBatch(model, sala(levelId, 0, 0, 6000, 4000)).model;
    let b = applyCommand(a, parede(levelId, 0, 2000, 6000, 2000)).model;
    b = applyCommand(b, {
      type: 'AddOpening',
      wallId: b.walls[0].id,
      kind: 'window',
      offsetMm: 1000,
      widthMm: 600,
      heightMm: 600,
      sillMm: 900,
    }).model;

    const d = diffSnapshots(a, b);
    const pesos = d.alteracoes.map((x) => x.pesoM2);
    expect([...pesos].sort((x, y) => y - x)).toEqual(pesos);
  });

  it('o resumo dá o antes e o depois de área e contagem', () => {
    const { model, levelId } = comNivel();
    const a = applyBatch(model, sala(levelId, 0, 0, 4000, 3000)).model;
    const b = applyBatch(model, sala(levelId, 0, 0, 6000, 3000)).model;

    const d = diffSnapshots(a, b);
    expect(d.resumo.areaPisoAntesM2).toBeCloseTo(12, 2);
    expect(d.resumo.areaPisoDepoisM2).toBeCloseTo(18, 2);
    expect(d.resumo.deltaAreaM2).toBeCloseTo(6, 2);
  });
});
