/**
 * CLIMATIZAÇÃO E8.1/E8.2 (07/10/2026): a planta de climatização por pavimento,
 * a folha de legenda e quadro-resumo, o isométrico da rede inteira, os
 * detalhes típicos (só do que existe), a prancha avulsa e as camadas no DXF.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { DesenhistaDeProva, PAPEIS, desenharFolhaDeClimatizacao, desenharFolhaDeDetalhesDeClimatizacao, desenharPlanta, enquadrar, orientar, type OpcoesExportacao } from '../utils/blueprintExport';
import { itensDaLegendaDeClimatizacao, resumoDaClimatizacao, rotuloDoTrechoDeClimatizacao, temClimatizacaoNoPavimento } from '../utils/blueprintPranchaClimatizacao';
import { detalhesDeClimatizacao, isometricoDeClimatizacao } from '../utils/blueprintDetalhesClimatizacao';
import { planejarConjunto, TEMPLATE_DE_PRANCHA_PADRAO } from '../utils/blueprintPranchas';
import { desenharConjunto, ehPlantaDaPrancha } from '../services/blueprintExportService';
import { gerarDxf } from '../utils/blueprintDxf';

/** Térreo 10 × 8 com split (evaporadora 12 000 BTU/h + condensadora), linha e dreno; o superior com um duto e dois difusores; o 3º sem nada. */
function predio(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Cobertura', elevationMm: 5800, defaultHeightMm: 2800 }).model;
  const [t, s, c] = m.levels.map((l) => l.id);
  const paredes = (levelId: string): Command[] =>
    [[0, 0, 10000, 0], [10000, 0, 10000, 8000], [10000, 8000, 0, 8000], [0, 8000, 0, 0]].map(([ax, ay, bx, by]) => ({ type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command);
  const peca = (levelId: string, disciplina: string, tipo: string, x: number, y: number, cota: number, extra: Record<string, unknown> = {}): Command =>
    ({ type: 'AddTerminal', levelId, disciplina, tipo, tipoHidraulico: tipo, at: point(x, y), cotaMm: cota, ...extra }) as Command;
  const tr = (levelId: string, disciplina: string, ax: number, ay: number, bx: number, by: number, ca: number, cb: number, bitola: number, extra: Record<string, unknown> = {}): Command =>
    ({ type: 'AddTrecho', levelId, disciplina, a: point(ax, ay), b: point(bx, by), cotaAMm: ca, cotaBMm: cb, bitolaMm: bitola, ...extra }) as Command;
  return applyBatch(m, [
    ...paredes(t),
    ...paredes(s),
    ...paredes(c),
    peca(t, 'FRIGORIGENA', 'EVAPORADORA_HI_WALL', 2000, 200, 2200, { capacidadeBtuH: 12000 }),
    peca(t, 'FRIGORIGENA', 'CONDENSADORA_SPLIT', 9500, 200, 300),
    tr(t, 'FRIGORIGENA', 2000, 200, 9500, 200, 2200, 2200, 6, { bitolaSuccaoMm: 13 }),
    tr(t, 'DRENO_AC', 2000, 300, 2000, 3000, 2200, 2150, 25),
    peca(s, 'MECANICA', 'DIFUSOR', 3000, 4000, 2600, { vazaoM3h: 300 }),
    peca(s, 'MECANICA', 'DIFUSOR', 7000, 4000, 2600, { vazaoM3h: 300 }),
    tr(s, 'MECANICA', 3000, 4000, 7000, 4000, 2600, 2600, 400, { alturaDutoMm: 250 }),
  ]).model;
}

const papel = orientar(PAPEIS.find((p) => p.id === 'A3') ?? PAPEIS[0], true);
const opcoes = (extra: Partial<OpcoesExportacao> = {}): OpcoesExportacao => ({ denominador: 50, papel, titulo: 'Prédio', revisao: 1, hash: 'h'.repeat(64), data: new Date('2026-10-07T12:00:00Z'), ...extra });
const so = (inc: Record<string, boolean>) => ({ ...TEMPLATE_DE_PRANCHA_PADRAO, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, indice: false, plantas: false, cortes: false, elevacoes: false, ampliacoes: false, tabelas: false, ...inc } });

describe('climatização E8.1 · o conjunto e a planta', () => {
  it('⚠️ PRONTO QUANDO: uma planta por pavimento que TEM climatização, depois a legenda e o isométrico/detalhes; sem a opção, nenhuma', () => {
    const m = predio();
    const [t, s, c] = m.levels.map((l) => l.id);
    expect([t, s, c].map((id) => temClimatizacaoNoPavimento(m, id))).toEqual([true, true, false]);
    const plano = planejarConjunto(m, so({ climatizacao: true }));
    expect(plano.map((p) => [p.tipo, p.titulo])).toEqual([
      ['CLIMATIZACAO', 'Climatização — Térreo'],
      ['CLIMATIZACAO', 'Climatização — Superior'],
      ['LEGENDA_CLIMATIZACAO', 'Climatização — quadro-resumo e legenda'],
      ['DETALHES_CLIMATIZACAO', 'Climatização — isométrico e detalhes típicos'],
      // E9.3: a lista de materiais fecha o bloco.
      ['MATERIAIS_CLIMATIZACAO', 'Lista de materiais — climatização'],
    ]);
    expect(planejarConjunto(m, so({})).some((p) => p.tipo.includes('CLIMATIZACAO'))).toBe(false);
    // Desenho sem climatização: a opção marcada não cria folha vazia.
    const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    expect(planejarConjunto(vazio, so({ climatizacao: true }))).toEqual([]);
  });

  it('o rótulo de cada rede: linha Ø líquido/sucção, dreno DN, duto L×A (ou Ø quando redondo)', () => {
    const m = predio();
    const rot = (disc: string) => rotuloDoTrechoDeClimatizacao(m.trechos!.find((x) => x.disciplina === disc)!);
    // O kernel guarda o cobre em mm inteiros (6 = 1/4", 13 = 1/2") — a convenção da E5.
    expect(rot('FRIGORIGENA')).toBe('Ø6/13');
    expect(rot('DRENO_AC')).toMatch(/DN 25/);
    expect(rot('MECANICA')).toMatch(/400\s*[x×]\s*250/);
    expect(rotuloDoTrechoDeClimatizacao({ disciplina: 'MECANICA', bitolaMm: 200 })).toMatch(/Ø\s*200/);
  });

  it('cada folha leva só o seu pavimento, com os números do desenho inteiro e a tag da capacidade/vazão', () => {
    const m = predio();
    const folhas: DesenhistaDeProva[] = [];
    desenharConjunto(m, opcoes(), so({ climatizacao: true }), () => {
      const d = new DesenhistaDeProva();
      folhas.push(d);
      return d;
    });
    const texto = (i: number) => folhas[i].textos().join(' | ');
    expect(texto(0)).toMatch(/EV-1/);
    expect(texto(0)).toMatch(/12\.000 BTU\/h|12000 BTU\/h/);
    expect(texto(0)).toMatch(/CD-1/);
    expect(texto(0)).toMatch(/DN 25/);
    expect(texto(0)).not.toMatch(/DF-/);
    expect(texto(1)).toMatch(/DF-1.*DF-2|DF-2.*DF-1/);
    expect(texto(1)).toMatch(/300 m³\/h/);
    expect(texto(1)).toMatch(/400\s*[x×]\s*250/);
    expect(texto(1)).not.toMatch(/EV-1|CD-1/);
    // A legenda: o quadro-resumo e as linhas das redes.
    expect(texto(2)).toMatch(/QUADRO-RESUMO DA CLIMATIZAÇÃO/);
    expect(texto(2)).toMatch(/12\.000 BTU\/h|12000 BTU\/h/);
    // O isométrico e os detalhes.
    expect(texto(3)).toMatch(/ISOMÉTRICO E DETALHES/);
    expect(texto(3)).toMatch(/Dreno de condensado com sifão/);
  });

  it('a prancha avulsa "climatizacao" é planta; sem a opção, a planta não leva nada da climatização', () => {
    const m = predio();
    expect(ehPlantaDaPrancha('climatizacao')).toBe(true);
    const enq = enquadrar(m, 50, papel, false);
    const a = new DesenhistaDeProva();
    desenharPlanta(a, m, opcoes(), enq);
    expect(a.textos().join(' | ')).not.toMatch(/EV-1|CD-1|DN 25/);
    const b = new DesenhistaDeProva();
    desenharPlanta(b, m, opcoes({ climatizacao: true }), enq);
    expect(b.textos().join(' | ')).toMatch(/EV-1.*CD-1|CD-1.*EV-1/);
  });
});

describe('climatização E8.1 · etiquetas que não se cobrem (achado do harness)', () => {
  it('evaporadora e condensadora coladas na parede: as duas tags saem sem se sobrepor', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    m = applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(200, 3000), cotaMm: 2200, capacidadeBtuH: 18000 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'CD', tipoHidraulico: 'CONDENSADORA_SPLIT', at: point(-450, 3000), cotaMm: 350, capacidadeBtuH: 18000 } as Command,
    ]).model;
    const d = new DesenhistaDeProva();
    desenharPlanta(d, m, opcoes({ climatizacao: true }), enquadrar(m, 50, papel, false));
    const caixas = d.chamadas
      .filter((c) => c.tipo === 'texto' && /^(EV|CD)-\d/.test(String(c.args[2])))
      .map((c) => {
        const [x, y, texto, h] = c.args as [number, number, string, number];
        return { x0: x, x1: x + texto.length * h * 0.55, y0: y - h, y1: y + h * 0.25 };
      });
    expect(caixas).toHaveLength(2);
    const [a, b] = caixas;
    expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1).toBe(false);
  });
});

describe('climatização E8.1 · a legenda e o quadro-resumo', () => {
  it('o resumo por pavimento: unidades e capacidade DECLARADA; sem capacidade, diz que não foi declarada', () => {
    const m = predio();
    const r = resumoDaClimatizacao(m);
    expect(r.map((x) => [x.pavimento, x.evaporadoras, x.condensadoras, x.capacidadeBtuH])).toEqual([['Térreo', 1, 1, 12000]]);
    const sem = applyBatch(m, [{ type: 'AddTerminal', levelId: m.levels[1].id, disciplina: 'FRIGORIGENA', tipo: 'EVAPORADORA_CASSETE', tipoHidraulico: 'EVAPORADORA_CASSETE', at: point(5000, 5000), cotaMm: 2600 } as Command]).model;
    const d = new DesenhistaDeProva();
    desenharFolhaDeClimatizacao(d, sem, opcoes(), enquadrar(sem, 50, papel, false));
    expect(d.textos().join(' | ')).toMatch(/capacidade não declarada/);
  });

  it('a legenda: só o que existe, com a quantidade', () => {
    const itens = itensDaLegendaDeClimatizacao(predio());
    expect(itens.map((i) => [i.tipo, i.quantidade])).toEqual(expect.arrayContaining([['EVAPORADORA_HI_WALL', 1], ['CONDENSADORA_SPLIT', 1], ['DIFUSOR', 2]]));
    expect(itens).toHaveLength(3);
  });

  it('desenho sem climatização: a folha diz que não há nada, sem quebrar', () => {
    const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const d = new DesenhistaDeProva();
    desenharFolhaDeClimatizacao(d, vazio, opcoes(), enquadrar(vazio, 50, papel, false));
    expect(d.textos().join(' | ')).toMatch(/Nenhuma peça nem rede de climatização no desenho/);
  });
});

describe('climatização E8.2 · isométrico e detalhes típicos', () => {
  it('o isométrico tem a rede INTEIRA (todos os pavimentos), com o rótulo da disciplina e o número da peça', () => {
    const m = predio();
    const iso = isometricoDeClimatizacao(m)!;
    expect(iso.rede).toBe('CLIMATIZACAO');
    expect(iso.segmentos).toHaveLength(3);
    // O duto do Superior sobe a elevação do pavimento.
    const duto = iso.segmentos.find((x) => x.disciplina === 'MECANICA')!;
    expect(duto.a.z).toBe(2900 + 2600);
    expect(duto.rotulo).toMatch(/400\s*[x×]\s*250/);
    expect(iso.pontos.map((p) => p.sigla).sort()).toEqual(['CD-1', 'DF-1', 'DF-2', 'EV-1']);
    expect(isometricoDeClimatizacao(applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model)).toBeNull();
  });

  it('os detalhes saem SÓ do que existe: sem difusor, sem o detalhe do difusor', () => {
    const m = predio();
    expect(detalhesDeClimatizacao(m)).toEqual(['EVAPORADORA', 'CONDENSADORA', 'DRENO_COM_SIFAO', 'DIFUSOR']);
    const semAr = applyBatch(m, (m.terminais ?? []).filter((t) => t.disciplina === 'MECANICA').map((t) => ({ type: 'DeleteTerminal', terminalId: t.id }) as Command)).model;
    expect(detalhesDeClimatizacao(semAr)).toEqual(['EVAPORADORA', 'CONDENSADORA', 'DRENO_COM_SIFAO']);
  });

  it('a folha: o isométrico em cima, os detalhes embaixo, com o aviso de detalhe típico; sem rede, a folha diz', () => {
    const m = predio();
    const d = new DesenhistaDeProva();
    desenharFolhaDeDetalhesDeClimatizacao(d, m, opcoes(), enquadrar(m, 50, papel, false));
    const t = d.textos().join(' | ');
    expect(t).toMatch(/EV-1/);
    expect(t).toMatch(/Suporte da condensadora/);
    expect(t).toMatch(/Maior unidade do desenho/);
    expect(t).toMatch(/Detalhe típico, sem escala/);
    const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const v = new DesenhistaDeProva();
    desenharFolhaDeDetalhesDeClimatizacao(v, vazio, opcoes(), enquadrar(vazio, 50, papel, false));
    expect(v.textos().join(' | ')).toMatch(/Sem linha frigorígena, dreno ou duto no desenho/);
  });
});

describe('climatização E8.1 · DXF', () => {
  it('as camadas PLANTA-CLIMA-* só quando pedidas: linha, dreno e duto separados, textos à parte', () => {
    const m = predio();
    const sem = gerarDxf(m, { titulo: 'x', revisao: 1, hash: 'h', cotas: false });
    expect(sem).not.toMatch(/\bEV-1\b|DN 25/);
    const dxf = gerarDxf(m, { titulo: 'x', revisao: 1, hash: 'h', cotas: false, climatizacao: true });
    for (const camada of ['PLANTA-CLIMA-LINHA', 'PLANTA-CLIMA-DRENO', 'PLANTA-CLIMA-DUTO', 'PLANTA-CLIMA-TEXTO']) expect(dxf).toMatch(new RegExp(`8\\r?\\n${camada}\\r?\\n`));
    expect(dxf).toMatch(/\bEV-1\b/);
    expect(dxf).toMatch(/DN 25/);
  });
});
