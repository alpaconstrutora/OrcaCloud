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
import { familiasPresentes, linhasDaLegenda, linhasDoQuadroDeCargas } from '../utils/blueprintPranchaEletrica';
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
