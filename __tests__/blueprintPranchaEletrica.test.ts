/**
 * F8 — A PRANCHA ELÉTRICA no papel e no DXF (13/09/2026).
 *
 * A exportação não desenhava NENHUM símbolo elétrico. Agora, com a prancha
 * "Elétrica": símbolos e rótulos por cima da planta; legenda e quadro de
 * cargas numa folha própria; camadas PLANTA-ELETRICA(-TEXTO) no DXF.
 *
 * ⚠️ E a planta arquitetônica continua a mesma: sem `eletrica`, nenhum texto
 * nem traço elétrico entra — é o que mantém os PDFs de sempre byte a byte.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import {
  DesenhistaDeProva,
  PAPEIS,
  desenharFolhaDoQuadroDeCargas,
  desenharPlanta,
  enquadrar,
  orientar,
  type OpcoesExportacao,
} from '../utils/blueprintExport';
import { desenharEletrica, familiasPresentes, linhasDaLegenda, linhasDoQuadroDeCargas } from '../utils/blueprintPranchaEletrica';
import { EXIBICAO_ELETRICA_PADRAO, type ExibicaoEletrica, type ItemEletrico } from '../utils/preferencias/resolver';
import { gerarDxf } from '../utils/blueprintDxf';
import { HIPOTESES_PADRAO } from '../utils/blueprintEletricaDimensionamento';

/** Sala 6 × 4 com QDC, C1 (tomadas) e um eletroduto no piso; uma luz com interruptor. */
function casa(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  let m = applyBatch(base, [p(0, 0, 6000, 0), p(6000, 0, 6000, 4000), p(6000, 4000, 0, 4000), p(0, 4000, 0, 0)]).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(75, 1000), cotaMm: 1600, ligacao: 'FN', tensaoV: 127, alimentadorM: 8 }).model;
  const quadroId = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C1', tensaoV: 127, secaoMm2: 2.5, disjuntorA: 16 }).model;
  const c1 = m.circuitos[0].id;
  const ponto = (x: number, y: number, tipoEletrico: 'TUG' | 'ILUMINACAO_TETO' | 'INTERRUPTOR', potenciaW: number | null, cotaMm: number, comando: string | null = null) => {
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(x, y), cotaMm, tipoEletrico, potenciaW: potenciaW ?? undefined, comando }).model;
    const id = m.terminais[m.terminais.length - 1].id;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: id, circuitoId: c1 }).model;
  };
  ponto(2000, 75, 'TUG', 600, 300);
  ponto(4000, 75, 'TUG', 600, 1300);
  ponto(3000, 2000, 'ILUMINACAO_TETO', 160, 2800, 'a');
  ponto(1000, 75, 'INTERRUPTOR', null, 1100, 'a');
  m = applyCommand(m, { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(75, 1000), b: point(2000, 75), cotaAMm: 0, cotaBMm: 0, bitolaMm: 25 }).model;
  m = applyCommand(m, { type: 'SetTrechoProps', trechoId: m.trechos[0].id, circuitoId: c1, condutores: 3 }).model;
  return m;
}

const papel = orientar(PAPEIS.find((p) => p.id === 'A3') ?? PAPEIS[0], true);
const opcoes = (extra: Partial<OpcoesExportacao> = {}): OpcoesExportacao => ({
  denominador: 50,
  papel,
  titulo: 'Casa',
  revisao: 1,
  hash: 'p'.repeat(64),
  data: new Date('2026-09-13T12:00:00Z'),
  ...extra,
});

describe('a planta elétrica no papel', () => {
  it('⚠️ SEM `eletrica`, nenhum símbolo nem rótulo elétrico entra — a planta de sempre', () => {
    const m = casa();
    const d = new DesenhistaDeProva();
    desenharPlanta(d, m, opcoes(), enquadrar(m, 50, papel, false));
    const textos = d.textos().join(' | ');
    expect(textos).not.toMatch(/TUG|QDC|Ø25|VA/);
  });

  it('com `eletrica`: QDC, "TUG · C1", "C1" na luz, a letra do comando, o Ø, o número do circuito e a seção no eletroduto, e a potência', () => {
    const m = casa();
    const d = new DesenhistaDeProva();
    const antes = new DesenhistaDeProva();
    desenharPlanta(antes, m, opcoes(), enquadrar(m, 50, papel, false));
    desenharPlanta(d, m, opcoes({ eletrica: true }), enquadrar(m, 50, papel, false));
    const textos = d.textos();
    expect(textos).toContain('QDC');
    expect(textos.filter((t) => t === 'TUG · C1')).toHaveLength(2);
    // Desde 22/10/2026 a luminária escreve só o circuito: o círculo com a potência já diz que é luz.
    expect(textos).toContain('C1');
    expect(textos).not.toContain('Luz teto · C1');
    expect(textos).toContain('a');
    // 15/09/2026 (NBR 5444): o Ø sozinho; o número do circuito em cima do
    // grupo de condutores e a seção embaixo, como na prancha de referência.
    // Desde 22/10/2026 o Ø PREDOMINANTE não se escreve na planta: a legenda diz "sem indicação = Ø25".
    expect(textos).not.toContain('Ø25');
    expect(linhasDaLegenda(m).some((l) => /^ELETRODUTO SEM INDICAÇÃO — Ø25/.test(l))).toBe(true);
    expect(textos).toContain('1');
    expect(textos).toContain('2,5');
    expect(textos.filter((t) => t === '600 VA')).toHaveLength(2);
    // Mais traços que a arquitetônica: os símbolos existem de fato, não só o texto.
    expect(d.chamadas.length).toBeGreaterThan(antes.chamadas.length + 20);
  });

  it('a tomada MÉDIA ganha meio preenchimento a mais que a BAIXA (um polígono preto a mais)', () => {
    const m = casa();
    const d = new DesenhistaDeProva();
    const enq = enquadrar(m, 50, papel, false);
    desenharPlanta(d, m, opcoes({ eletrica: true }), enq);
    const pretos = d.chamadas.filter((c) => c.tipo === 'poligono' && c.args[1] === '#000000');
    // DENTRO do desenho: uma tomada média (1.300) → um polígono cheio; a baixa (300) → nenhum.
    const dentro = (c: { args: unknown[] }) => (c.args[0] as { x: number }[]).every((p) => p.x >= enq.offsetXMm - 1 && p.x <= enq.offsetXMm + enq.desenhoLarguraMm + 1);
    expect(pretos.filter(dentro)).toHaveLength(1);
    // E5.2: a legenda, fora do desenho, mostra as três alturas — média e alta levam preenchimento.
    expect(pretos.filter((c) => !dentro(c))).toHaveLength(2);
  });

  it('a folha do quadro de cargas traz título, o quadro, o circuito com IB e as hipóteses; a legenda só lista o que existe', () => {
    const m = casa();
    const d = new DesenhistaDeProva();
    desenharFolhaDoQuadroDeCargas(d, m, opcoes({ eletrica: true, hipotesesEletricas: HIPOTESES_PADRAO }), enquadrar(m, 50, papel, false));
    const textos = d.textos().join('\n');
    expect(textos).toMatch(/QUADRO DE CARGAS E PRÉ-DIMENSIONAMENTO/);
    expect(textos).toMatch(/QDC — FN 127 V/);
    expect(textos).toMatch(/^C1$/m);
    expect(textos).toMatch(/2,5 \/ 2,5/); // seção declarada / mínima
    expect(textos).toMatch(/HIPÓTESES/);
    expect(textos).toMatch(/método B1/);
    const legenda = linhasDaLegenda(m).join('\n');
    expect(legenda).toMatch(/TUG \/ TUE/);
    expect(legenda).toMatch(/LUZ TETO/);
    expect(legenda).toMatch(/INTERRUPTOR/);
    expect(legenda).toMatch(/ELETRODUTO NO PISO/);
    expect(legenda).not.toMatch(/LIGAÇÃO DIRETA/); // não há no desenho
    expect(familiasPresentes(m).has('ELETRODUTO_PISO')).toBe(true);
  });
});

describe('a elétrica no DXF', () => {
  const o = { titulo: 'Casa', revisao: 1, hash: 'p'.repeat(64) };

  it('⚠️ sem `eletrica` as camadas existem mas ficam vazias; com, entram símbolos e textos', () => {
    const m = casa();
    const sem = gerarDxf(m, o);
    expect(sem).not.toMatch(/TEXT\s+8\s+PLANTA-ELETRICA-TEXTO/);
    const com = gerarDxf(m, { ...o, eletrica: true, hipotesesEletricas: HIPOTESES_PADRAO });
    expect(com).toMatch(/LAYER[\s\S]*PLANTA-ELETRICA/);
    expect(com).toMatch(/8\s+PLANTA-ELETRICA-TEXTO[\s\S]*?TUG · C1/);
    expect(com).toMatch(/QUADRO DE CARGAS E PRE-DIMENSIONAMENTO/);
    expect(com.length).toBeGreaterThan(sem.length + 2000);
  });

  it('as linhas do quadro de cargas em texto trazem o circuito e as hipóteses', () => {
    const L = linhasDoQuadroDeCargas(casa(), HIPOTESES_PADRAO);
    expect(L[0]).toMatch(/QUADRO DE CARGAS/);
    // 3 pontos de CARGA (o interruptor não conta), 600 + 600 + 160 = 1.360 VA, IB 10,7 A.
    expect(L.some((l) => /^C1 \| FN 127 \| 3 \| 1360 \| 10,7 \| 2,5 \/ 2,5 \| 16 \/ 16/.test(l)), L.join('\n')).toBe(true);
    expect(L.some((l) => /^Hipoteses: cobre\/PVC, metodo B1/.test(l))).toBe(true);
  });
});

/**
 * 22/10/2026 — pedido com os prints da planta Garden: *"Veja a total confusão de sobreposicões de
 * testos e componentes."* A prancha escrevia cada texto a uma distância fixa do símbolo; agora passa
 * pelo mesmo motor da tela. A cena: um canto de cozinha a 1:50 — luz, interruptor e três tomadas
 * coladas na mesma parede (no papel, 3 mm entre elas).
 */
describe('a planta elétrica no papel, sem texto sobre texto', () => {
  it('⚠️ PRONTO QUANDO: nenhum texto dos pontos cruza outro', async () => {
    const { desenharEletrica } = await import('../utils/blueprintPranchaEletrica');
    const { larguraEstimadaDoTexto } = await import('../utils/blueprintCotas');
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    m = applyCommand(m, { type: 'AddWall', levelId: l, a: point(0, 0), b: point(4000, 0), thicknessMm: 150, heightMm: 2800 }).model;
    m = applyCommand(m, { type: 'AddQuadro', levelId: l, nome: 'QDC', at: point(-2000, 1500), cotaMm: 1600 }).model;
    m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1', tensaoV: 127 }).model;
    m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C2', tensaoV: 127 }).model;
    const [c1, c2] = m.circuitos.map((c) => c.id);
    const pontos: [Command, string][] = [
      [{ type: 'AddTerminal', levelId: l, disciplina: 'ELETRICA', tipo: 'Luz', tipoEletrico: 'ILUMINACAO_TETO', at: point(1500, 400), cotaMm: 2800, potenciaW: 100, comando: 'a' } as Command, c1],
      [{ type: 'AddTerminal', levelId: l, disciplina: 'ELETRICA', tipo: 'Int', tipoEletrico: 'INTERRUPTOR', interruptor: 'UMA_SECAO', comando: 'a', at: point(1300, 75), cotaMm: 1100 } as Command, c1],
      [{ type: 'AddTerminal', levelId: l, disciplina: 'ELETRICA', tipo: 'TUG', tipoEletrico: 'TUG', at: point(1450, 75), cotaMm: 1100, potenciaW: 600 } as Command, c2],
      [{ type: 'AddTerminal', levelId: l, disciplina: 'ELETRICA', tipo: 'TUG', tipoEletrico: 'TUG', at: point(1600, 75), cotaMm: 300, potenciaW: 100 } as Command, c2],
      [{ type: 'AddTerminal', levelId: l, disciplina: 'ELETRICA', tipo: 'TUG', tipoEletrico: 'TUG', at: point(1750, 75), cotaMm: 1100, potenciaW: 600 } as Command, c2],
    ];
    for (const [cmd, cid] of pontos) {
      m = applyCommand(m, cmd).model;
      m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais![m.terminais!.length - 1].id, circuitoId: cid }).model;
    }
    const d = new DesenhistaDeProva();
    desenharEletrica(d, m, { px: (x: number) => x / 50, py: (y: number) => -y / 50 });
    const daLuz = String(m.terminais![0].potenciaW);
    // Os textos posicionados (a potência DENTRO da luz é símbolo e fica de fora).
    const caixas = d.chamadas
      .filter((c) => c.tipo === 'texto' && c.args[2] !== daLuz)
      .map((c) => {
        const [x, y, texto, h] = c.args as [number, number, string, number];
        return { texto, x0: x, y0: y - 0.85 * h, x1: x + larguraEstimadaDoTexto(texto, h), y1: y + 0.15 * h };
      });
    const cruza = (a: (typeof caixas)[number], b: (typeof caixas)[number]) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    for (let i = 0; i < caixas.length; i++)
      for (let j = i + 1; j < caixas.length; j++) expect(cruza(caixas[i], caixas[j]), `"${caixas[i].texto}" × "${caixas[j].texto}"`).toBe(false);
    expect(caixas.map((c) => c.texto)).toEqual(expect.arrayContaining(['C1', 'TUG · C2', '600 VA', '100 VA', 'QDC']));
  });
});

/**
 * 23/10/2026 — PREFERÊNCIAS DA PLANTA ELÉTRICA: a prancha escreve só os textos que o padrão da
 * empresa (ou do estudo) liga. Cada item corta só o SEU texto; a pendência ("?") nunca some; e com
 * tudo no padrão a saída é a de antes (mesmas chamadas ao `Desenhista`).
 */
describe('a planta elétrica no papel obedece às preferências', () => {
  /** A casa + a rede: 3 eletrodutos (2 circuitos de seções diferentes · cheio com 8 condutores · Ø32) + luz e tomada SEM circuito. */
  function casaComRede(): BlueprintModel {
    let m = casa();
    const t = m.levels[0].id;
    const quadroId = m.quadros[0].id;
    m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C7', tensaoV: 127, ligacao: 'FN', secaoMm2: 2.5 }).model;
    m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C9', tensaoV: 127, ligacao: 'FN', secaoMm2: 6 }).model;
    const c7 = m.circuitos[m.circuitos.length - 2].id;
    const c9 = m.circuitos[m.circuitos.length - 1].id;
    const trecho = (y: number, x1: number, bitolaMm: number, circuitoIds: string[], condutores?: number): Command =>
      ({ type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(500, y), b: point(x1, y), cotaAMm: 2800, cotaBMm: 2800, bitolaMm, circuitoIds, condutores }) as Command;
    m = applyBatch(m, [trecho(2500, 4500, 25, [c7, c9]), trecho(2900, 4500, 25, [c7], 8), trecho(3400, 1500, 32, [c7])]).model;
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Luz', tipoEletrico: 'ILUMINACAO_TETO', at: point(5000, 2000), cotaMm: 2800, potenciaW: 150 } as Command).model;
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', tipoEletrico: 'TUG', at: point(5000, 75), cotaMm: 1100, potenciaW: 200 } as Command).model;
    return m;
  }
  const proj = { px: (x: number) => x / 50, py: (y: number) => -y / 50 };
  const desenho = (m: BlueprintModel, exibicao?: ExibicaoEletrica) => {
    const d = new DesenhistaDeProva();
    desenharEletrica(d, m, proj, 1, exibicao ? { exibicao } : {});
    return d;
  };
  const contagem = (textos: string[]) => {
    const mapa = new Map<string, number>();
    for (const t of textos) mapa.set(t, (mapa.get(t) ?? 0) + 1);
    return mapa;
  };
  const sumiu = (antes: Map<string, number>, depois: Map<string, number>) => {
    const fora: string[] = [];
    for (const [t, n] of antes) for (let i = 0; i < n - (depois.get(t) ?? 0); i++) fora.push(t);
    return fora.sort();
  };
  const sem = (item: ItemEletrico): ExibicaoEletrica => ({ ...EXIBICAO_ELETRICA_PADRAO, [item]: false });

  // Os 7 itens que a prancha escreve ("instrucaoSugerida" e "condutoresDoTrecho" ela não escreve).
  const SOME_COM: Partial<Record<ItemEletrico, string[]>> = {
    // o número no círculo do trecho cheio ("1") + os dependentes: circuito nos fios e bitola
    fios: ['1', '1', '2,5', '2,5', '2,5', '6', '7', '7', '9'],
    circuitoNosFios: ['1', '7', '7', '9'],
    bitola: ['2,5', '2,5', '2,5', '6'],
    diametro: ['Ø32'],
    circuitoNoPonto: ['C1', 'C1', 'TUG · C1', 'TUG · C1'],
    potencia: ['150', '160', '200 VA', '600 VA', '600 VA'],
    comando: ['a', 'a'],
  };

  it('cena de partida: os textos da rede estão todos escritos (a tabela abaixo parte disto)', () => {
    const base = contagem(desenho(casaComRede()).textos());
    for (const x of ['1', '7', '9', '2,5', '6', 'Ø32', 'C1', 'TUG · C1', 'TUG · ?', '?', '200 VA', '150', 'a']) expect(base.has(x), x).toBe(true);
  });

  for (const item of Object.keys(SOME_COM) as ItemEletrico[]) {
    it(`⚠️ "${item}" desligado: somem só os textos dele, nada aparece, a pendência fica`, () => {
      const m = casaComRede();
      const antes = contagem(desenho(m).textos());
      const depois = contagem(desenho(m, sem(item)).textos());
      expect(sumiu(antes, depois)).toEqual([...(SOME_COM[item] ?? [])].sort());
      expect(sumiu(depois, antes)).toEqual([]);
      expect(depois.get('TUG · ?')).toBe(antes.get('TUG · ?'));
      expect(depois.get('?')).toBe(antes.get('?'));
    });
  }

  it('"instrucaoSugerida" e "condutoresDoTrecho" não mudam nada na prancha (ela não os escreve)', () => {
    const m = casaComRede();
    const base = JSON.stringify(desenho(m).chamadas);
    expect(JSON.stringify(desenho(m, sem('instrucaoSugerida')).chamadas)).toBe(base);
    expect(JSON.stringify(desenho(m, sem('condutoresDoTrecho')).chamadas)).toBe(base);
  });

  it('"fios" desligado: nenhum traço de condutor nem o círculo do trecho cheio', () => {
    const m = casaComRede();
    const ligado = desenho(m);
    const desligado = desenho(m, sem('fios'));
    expect(desligado.chamadas.filter((c) => c.tipo === 'linha').length).toBeLessThan(ligado.chamadas.filter((c) => c.tipo === 'linha').length);
    // O círculo branco do trecho cheio é um polígono preenchido (24 lados) a menos.
    expect(desligado.chamadas.filter((c) => c.tipo === 'poligono').length).toBe(ligado.chamadas.filter((c) => c.tipo === 'poligono').length - 1);
  });

  it('o objeto CRU também vale: "fios" desligado com "circuito nos fios" e "bitola" ligados não escreve nenhum dos dois', () => {
    const depois = contagem(desenho(casaComRede(), { ...EXIBICAO_ELETRICA_PADRAO, fios: false, circuitoNosFios: true, bitola: true }).textos());
    for (const x of ['7', '9', '2,5', '6']) expect(depois.has(x), x).toBe(false);
  });

  it('⚠️ pendência nunca some: com "circuito no ponto" desligado, a luz sem circuito segue com "?" e a tomada com "TUG · ?"', () => {
    const textos = contagem(desenho(casaComRede(), sem('circuitoNoPonto')).textos());
    expect(textos.get('?')).toBe(1);
    expect(textos.get('TUG · ?')).toBe(1);
    expect(textos.has('C1')).toBe(false);
  });

  it('⚠️ tudo no padrão: a saída é IDÊNTICA à de antes das preferências (mesmas chamadas ao desenhista)', () => {
    const m = casaComRede();
    const semOpcao = JSON.stringify(desenho(m).chamadas);
    expect(JSON.stringify(desenho(m, EXIBICAO_ELETRICA_PADRAO).chamadas)).toBe(semOpcao);
    // E igual ao que a prancha produzia ANTES desta tarefa (o registro foi tirado do código sem a opção).
    const chamadas = desenho(m).chamadas;
    expect({ n: chamadas.length, sha: createHash('sha1').update(semOpcao).digest('hex'), textos: desenho(m).textos() }).toMatchSnapshot();
  });

  it('a exportação repassa as preferências: `desenharPlanta` escreve sem "TUG · C1" quando "circuito no ponto" está desligado', () => {
    const m = casaComRede();
    const textos = (extra: Partial<OpcoesExportacao>) => {
      const d = new DesenhistaDeProva();
      desenharPlanta(d, m, opcoes({ eletrica: true, ...extra }), enquadrar(m, 50, papel, false));
      return d.textos();
    };
    expect(textos({}).filter((t) => t === 'TUG · C1')).toHaveLength(2);
    expect(textos({ exibicaoEletrica: EXIBICAO_ELETRICA_PADRAO }).filter((t) => t === 'TUG · C1')).toHaveLength(2);
    const sem1 = textos({ exibicaoEletrica: sem('circuitoNoPonto') });
    expect(sem1.filter((t) => t === 'TUG · C1')).toHaveLength(0);
    expect(sem1).toContain('TUG · ?');
  });

  it('o DXF repassa as preferências: o texto "TUG · C1" sai da camada de texto elétrico', () => {
    const m = casaComRede();
    const o = { titulo: 'Casa', revisao: 1, hash: 'p'.repeat(64), eletrica: true, hipotesesEletricas: HIPOTESES_PADRAO };
    const quantos = (dxf: string) => dxf.split('TUG · C1').length - 1;
    expect(quantos(gerarDxf(m, o))).toBe(2);
    expect(quantos(gerarDxf(m, { ...o, exibicaoEletrica: EXIBICAO_ELETRICA_PADRAO }))).toBe(2);
    expect(quantos(gerarDxf(m, { ...o, exibicaoEletrica: sem('circuitoNoPonto') }))).toBe(0);
  });
});

describe('o eletroduto elétrico em ARCO na prancha (24/10/2026) — "Curvas, como no seu print"', () => {
  /** Modelo mínimo: só um trecho elétrico (cotas em `cotaMm`), sem quadro nem pontos. */
  function soUmTrecho(a: { x: number; y: number }, b: { x: number; y: number }, cotaMm: number, disciplina: 'ELETRICA' | 'AGUA_FRIA' = 'ELETRICA', cotaBMm = cotaMm): BlueprintModel {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    return applyCommand(base, { type: 'AddTrecho', levelId: base.levels[0].id, disciplina, a: point(a.x, a.y), b: point(b.x, b.y), cotaAMm: cotaMm, cotaBMm, bitolaMm: 25 }).model;
  }
  // 1 mm do papel a cada 50 mm do modelo; y do papel desce (como em `desenharPlanta`).
  const proj = { px: (x: number) => x / 50, py: (y: number) => -y / 50 };
  const MEDIA = 0.35;
  const traco = (d: DesenhistaDeProva) =>
    d.chamadas.filter((c) => c.tipo === 'linha' && (c.args[4] as { espessuraMm: number }).espessuraMm === MEDIA).map((c) => c.args as number[]);
  const distancia = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);

  it('trecho no teto: uma POLILINHA de 12 segmentos de ponta a ponta, com a flecha de 12 % (teto 300 mm) e do lado de min→max', () => {
    const m = soUmTrecho({ x: 0, y: 0 }, { x: 2000, y: 0 }, 2800);
    const d = new DesenhistaDeProva();
    desenharEletrica(d, m, proj);
    const linhas = traco(d);
    expect(linhas).toHaveLength(12);
    // Encadeado: o fim de cada segmento é o começo do seguinte; as pontas são as do trecho.
    linhas.slice(1).forEach((l, i) => {
      expect(l[0]).toBeCloseTo(linhas[i][2], 9);
      expect(l[1]).toBeCloseTo(linhas[i][3], 9);
    });
    expect([linhas[0][0], linhas[0][1]]).toEqual([0, -0]);
    expect(linhas[11][2]).toBeCloseTo(2000 / 50, 9);
    expect(linhas[11][3]).toBeCloseTo(0, 9);
    // O meio: 12 % de 2000 mm = 240 mm → 4,8 mm de papel; à esquerda de min→max = +y do modelo = papel para CIMA (y < 0).
    const meio = { x: linhas[5][2], y: linhas[5][3] };
    expect(meio.y).toBeCloseTo(-4.8, 6);
    expect(distancia(meio, { x: 0, y: 0 }, { x: 40, y: 0 })).toBeCloseTo(4.8, 6);
    // Trecho comprido: a flecha para no teto de 300 mm (6 mm de papel).
    const longo = new DesenhistaDeProva();
    desenharEletrica(longo, soUmTrecho({ x: 0, y: 0 }, { x: 10000, y: 0 }, 2800), proj);
    expect(Math.abs(traco(longo)[5][3])).toBeCloseTo(6, 6);
  });

  it('o mesmo trecho com a e b trocados dá o mesmo arco (lado determinístico)', () => {
    const ida = new DesenhistaDeProva();
    const volta = new DesenhistaDeProva();
    desenharEletrica(ida, soUmTrecho({ x: 100, y: 200 }, { x: 2100, y: 1500 }, 2800), proj);
    desenharEletrica(volta, soUmTrecho({ x: 2100, y: 1500 }, { x: 100, y: 200 }, 2800), proj);
    const pontos = (ls: number[][]) => [ls[0].slice(0, 2), ...ls.map((l) => l.slice(2, 4))];
    const a = pontos(traco(ida));
    const b = pontos(traco(volta)).reverse();
    expect(b).toHaveLength(a.length);
    a.forEach((p, i) => {
      expect(b[i][0]).toBeCloseTo(p[0], 6);
      expect(b[i][1]).toBeCloseTo(p[1], 6);
    });
  });

  it('prumada fica sem arco (continua o círculo); trecho que não é elétrico não é desenhado por esta camada', () => {
    const prumada = new DesenhistaDeProva();
    desenharEletrica(prumada, soUmTrecho({ x: 500, y: 500 }, { x: 500, y: 500 }, 0, 'ELETRICA', 2800), proj);
    expect(traco(prumada).every((l) => Math.hypot(l[2] - l[0], l[3] - l[1]) < 1.5)).toBe(true); // só os 24 lados do círculo
    const agua = new DesenhistaDeProva();
    desenharEletrica(agua, soUmTrecho({ x: 0, y: 0 }, { x: 2000, y: 0 }, 2800, 'AGUA_FRIA'), proj);
    expect(traco(agua)).toHaveLength(0);
  });

  it('eletroduto no PISO: o tracejado acompanha o arco, não a corda', () => {
    const m = soUmTrecho({ x: 0, y: 0 }, { x: 2000, y: 0 }, 0);
    const d = new DesenhistaDeProva();
    desenharEletrica(d, m, proj);
    const tracos = traco(d);
    expect(tracos.length).toBeGreaterThan(4);
    const maisLonge = Math.max(...tracos.flatMap((l) => [Math.abs(l[1]), Math.abs(l[3])]));
    expect(maisLonge).toBeGreaterThan(4.2); // a flecha é 4,8 mm; um traço cai perto do meio do arco
    expect(maisLonge).toBeLessThanOrEqual(4.8 + 1e-9);
  });
});
