/**
 * OS BLOCOS DA MASSA SEGUEM AS TORRES DO EMPREENDIMENTO (27/10/2026): nome da torre, pavimentos acima do solo e um
 * subsolo sob cada torre com as garagens dela (decisão do usuário). Ligação pelo NOME; sem par por nome, pela ordem.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, type Command } from '../utils/blueprintKernel';
import { comandosDoAjuste, vestirBlocosPropostos } from '../utils/blueprintAjusteAoEmpreendimento';
import type { EstruturaDaTorre } from '../utils/blueprintEstruturaDaTorre';
import type { BlocoProposto } from '../utils/blueprintGeradorDeMassa';

const pisos = (de: number, ate: number, nome: (n: number) => string, pd: (n: number) => number | null = () => null) =>
  Array.from({ length: ate - de + 1 }, (_, i) => ({ numero: de + i, nome: nome(de + i), tipo: null, peDireitoMm: pd(de + i) }));
/** O Garden Cambuhy de 27/10/2026, como `estruturaDaTorre` o lê. */
const TORRE_A: EstruturaDaTorre = { torreId: 'tA', nome: 'Torre A', acima: pisos(0, 3, (n) => (n === 0 ? 'Térreo' : `Pavimento ${n}`)), garagens: pisos(-2, -1, (n) => `Garagem ${-n}`), fonte: 'UNIDADES', avisos: [] };
const TORRE_B: EstruturaDaTorre = { torreId: 'tB', nome: 'Torre B', acima: pisos(0, 5, (n) => (n === 0 ? 'Térreo' : `Pavimento ${n}`)), garagens: [], fonte: 'UNIDADES', avisos: [] };

const ret = (x: number, y: number) => [{ x, y }, { x: x + 11000, y }, { x: x + 11000, y: y + 16000 }, { x, y: y + 16000 }];

/** A "Planta 26/10/2026": duas torres de 6 pavimentos sobre um subsolo do lote inteiro. */
function plantaDoDia() {
  let model = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const levelId = model.levels[0].id;
  const add: Command[] = [
    { type: 'AddBloco', levelId, nome: 'Subsolo', pontos: [{ x: 0, y: 0 }, { x: 18000, y: 0 }, { x: 18000, y: 63000 }, { x: 0, y: 63000 }], cotaBaseMm: -3000, pavimentos: 1, peDireitoMm: 3000, uso: 'GARAGEM' },
    { type: 'AddBloco', levelId, nome: 'Torre A', pontos: ret(3000, 13000), cotaBaseMm: 0, pavimentos: 6, peDireitoMm: 3000, uso: 'RESIDENCIAL' },
    { type: 'AddBloco', levelId, nome: 'Torre B', pontos: ret(3000, 35000), cotaBaseMm: 0, pavimentos: 6, peDireitoMm: 3000, uso: 'RESIDENCIAL' },
  ];
  model = applyBatch(model, add).model;
  return model;
}

describe('comandosDoAjuste — blocos já desenhados', () => {
  it('Garden: Torre A cai para 4 pavimentos e ganha a garagem de 2; Torre B fica', () => {
    const model = plantaDoDia();
    const r = comandosDoAjuste(model, [TORRE_A, TORRE_B]);
    expect(r.linhas.map((l) => [l.torre, l.estado])).toEqual([['Torre A', 'AJUSTAR'], ['Torre B', 'OK']]);
    const depois = applyBatch(model, r.comandos).model;
    const porNome = new Map((depois.blocos ?? []).map((b) => [b.nome, b]));
    expect(porNome.get('Torre A')?.pavimentos).toBe(4);
    expect(porNome.get('Torre B')?.pavimentos).toBe(6);
    const g = porNome.get('Torre A · Garagem')!;
    expect([g.pavimentos, g.cotaBaseMm, g.uso]).toEqual([2, -6000, 'GARAGEM']);
    expect(g.pontos).toEqual(porNome.get('Torre A')!.pontos);
    // O subsolo do lote inteiro fica, com aviso.
    expect(porNome.has('Subsolo')).toBe(true);
    expect(r.avisos.join(' ')).toMatch(/"Subsolo" não é de nenhuma torre/);
  });

  it('ajustado, um segundo ajuste não tem nada a fazer', () => {
    const model = plantaDoDia();
    const depois = applyBatch(model, comandosDoAjuste(model, [TORRE_A, TORRE_B]).comandos).model;
    const r2 = comandosDoAjuste(depois, [TORRE_A, TORRE_B]);
    expect(r2.comandos).toEqual([]);
    expect(r2.linhas.every((l) => l.estado === 'OK')).toBe(true);
  });

  it('sem par pelo nome, casa pela ordem e renomeia', () => {
    let model = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
    const levelId = model.levels[0].id;
    model = applyBatch(model, [
      { type: 'AddBloco', levelId, nome: 'Bloco B', pontos: ret(0, 30000), pavimentos: 3, peDireitoMm: 3000, uso: 'RESIDENCIAL' },
      { type: 'AddBloco', levelId, nome: 'Bloco A', pontos: ret(0, 0), pavimentos: 3, peDireitoMm: 3000, uso: 'RESIDENCIAL' },
    ]).model;
    const depois = applyBatch(model, comandosDoAjuste(model, [TORRE_A, TORRE_B]).comandos).model;
    const a = (depois.blocos ?? []).find((b) => b.nome === 'Torre A')!;
    expect(a.pontos).toEqual(ret(0, 0));
  });

  it('torre sem bloco e bloco sem torre: avisos, nada inventado', () => {
    let model = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
    const levelId = model.levels[0].id;
    model = applyBatch(model, [{ type: 'AddBloco', levelId, nome: 'Torre A', pontos: ret(0, 0), pavimentos: 4, peDireitoMm: 3000, uso: 'RESIDENCIAL' }]).model;
    const r = comandosDoAjuste(model, [{ ...TORRE_A, garagens: [] }, TORRE_B]);
    expect(r.linhas.find((l) => l.torre === 'Torre B')?.estado).toBe('SEM_BLOCO');
    expect(r.comandos).toEqual([]);
  });

  it('os nomes dos pavimentos de cada bloco, para o painel', () => {
    const model = plantaDoDia();
    const depois = applyBatch(model, comandosDoAjuste(model, [TORRE_A, TORRE_B]).comandos).model;
    const r = comandosDoAjuste(depois, [TORRE_A, TORRE_B]);
    const idDe = (nome: string) => (depois.blocos ?? []).find((b) => b.nome === nome)!.id;
    expect(r.papeis.get(idDe('Torre A'))?.nomesDosPisos).toEqual(['Térreo', 'Pavimento 1', 'Pavimento 2', 'Pavimento 3']);
    expect(r.papeis.get(idDe('Torre A · Garagem'))?.nomesDosPisos).toEqual(['Garagem 2', 'Garagem 1']);
  });
});

describe('vestirBlocosPropostos — o Aplicar do Gerar massa', () => {
  const proposto = (nome: string, x: number, extra: Partial<BlocoProposto> = {}): BlocoProposto => ({ nome, pontos: ret(x, 0), cotaBaseMm: 0, pavimentos: 6, peDireitoMm: 3000, uso: 'RESIDENCIAL', ...extra });

  it('torres do gerador viram as do Empreendimento; o subsolo do lote sai quando há garagem por torre', () => {
    const r = vestirBlocosPropostos(
      [proposto('Subsolo', 0, { cotaBaseMm: -3000, pavimentos: 1, uso: 'GARAGEM' }), proposto('Torre A', 0), proposto('Torre B', 20000)],
      [TORRE_A, TORRE_B],
    );
    expect(r.blocos.map((b) => [b.nome, b.pavimentos, b.cotaBaseMm])).toEqual([
      ['Torre A', 4, 0],
      ['Torre B', 6, 0],
      ['Torre A · Garagem', 2, -6000],
    ]);
  });

  it('torre sobre pilotis: o pilotis é o térreo, a torre leva os outros', () => {
    const r = vestirBlocosPropostos(
      [proposto('Torre · pilotis', 0, { pavimentos: 1, uso: 'GARAGEM' }), proposto('Torre', 0, { cotaBaseMm: 3000, pavimentos: 8 })],
      [{ ...TORRE_B, nome: 'Torre B' }],
    );
    expect(r.blocos.find((b) => b.nome === 'Torre B')?.pavimentos).toBe(5);
  });

  it('embasamento com a torre em cima: o embasamento não é confundido com torre', () => {
    const r = vestirBlocosPropostos(
      [proposto('Embasamento', 0, { pavimentos: 2, uso: 'COMERCIAL' }), proposto('Torre', 0, { cotaBaseMm: 6000, pavimentos: 10 })],
      [{ ...TORRE_B, nome: 'Torre B' }],
    );
    expect(r.blocos.map((b) => [b.nome, b.pavimentos])).toEqual([['Embasamento', 2], ['Torre B', 4]]);
  });
});

describe('pé-direito por pavimento (27/10/2026): a torre vira blocos empilhados por trecho de mesma altura', () => {
  // Térreo 4,50 m, tipos 3,00 m; garagens 2,80 m.
  const COM_PD: EstruturaDaTorre = {
    ...TORRE_A,
    acima: pisos(0, 3, (n) => (n === 0 ? 'Térreo' : `Pavimento ${n}`), (n) => (n === 0 ? 4500 : 3000)),
    garagens: pisos(-2, -1, (n) => `Garagem ${-n}`, () => 2800),
  };

  it('Torre A: "Torre A · Térreo" 4,50 m embaixo, a torre com os 3 tipos a 3,00 m em cima, garagem a 2,80 m', () => {
    const model = plantaDoDia();
    const r = comandosDoAjuste(model, [COM_PD, TORRE_B]);
    const depois = applyBatch(model, r.comandos).model;
    const porNome = new Map((depois.blocos ?? []).map((b) => [b.nome, b]));
    const terreo = porNome.get('Torre A · Térreo')!;
    expect([terreo.cotaBaseMm, terreo.pavimentos, terreo.peDireitoMm, terreo.uso]).toEqual([0, 1, 4500, 'RESIDENCIAL']);
    const torre = porNome.get('Torre A')!;
    expect([torre.cotaBaseMm, torre.pavimentos, torre.peDireitoMm]).toEqual([4500, 3, 3000]);
    const g = porNome.get('Torre A · Garagem')!;
    expect([g.cotaBaseMm, g.pavimentos, g.peDireitoMm]).toEqual([-5600, 2, 2800]);
    expect(r.linhas[0].alturaAcimaM).toBe(13.5);
  });

  it('empilhado, um segundo ajuste não tem nada a fazer; e os nomes dos pisos vão para cada bloco', () => {
    const model = plantaDoDia();
    const depois = applyBatch(model, comandosDoAjuste(model, [COM_PD, TORRE_B]).comandos).model;
    const r2 = comandosDoAjuste(depois, [COM_PD, TORRE_B]);
    expect(r2.comandos).toEqual([]);
    const idDe = (nome: string) => (depois.blocos ?? []).find((b) => b.nome === nome)!.id;
    expect(r2.papeis.get(idDe('Torre A · Térreo'))?.nomesDosPisos).toEqual(['Térreo']);
    expect(r2.papeis.get(idDe('Torre A'))?.nomesDosPisos).toEqual(['Pavimento 1', 'Pavimento 2', 'Pavimento 3']);
    expect(r2.linhas[0].pavimentosNaPlanta).toBe(4);
  });

  it('pé-direito só da torre (todos iguais): um bloco só, com a altura da torre', () => {
    const model = plantaDoDia();
    const uniforme = { ...TORRE_B, acima: pisos(0, 5, (n) => `P${n}`, () => 3200) };
    const depois = applyBatch(model, comandosDoAjuste(model, [uniforme]).comandos).model;
    const b = (depois.blocos ?? []).find((x) => x.nome === 'Torre B')!;
    expect([b.pavimentos, b.peDireitoMm, b.cotaBaseMm]).toEqual([6, 3200, 0]);
  });

  it('alturas voltam a ser iguais: o bloco do térreo sobra, com aviso, e não é apagado', () => {
    const model = plantaDoDia();
    const empilhado = applyBatch(model, comandosDoAjuste(model, [COM_PD, TORRE_B]).comandos).model;
    const igual = { ...COM_PD, acima: pisos(0, 3, (n) => (n === 0 ? 'Térreo' : `Pavimento ${n}`), () => 3000) };
    const r = comandosDoAjuste(empilhado, [igual, TORRE_B]);
    const depois = applyBatch(empilhado, r.comandos).model;
    const torre = (depois.blocos ?? []).find((b) => b.nome === 'Torre A')!;
    expect([torre.cotaBaseMm, torre.pavimentos]).toEqual([0, 4]);
    expect((depois.blocos ?? []).some((b) => b.nome === 'Torre A · Térreo')).toBe(true);
    expect(r.avisos.join(' ')).toMatch(/"Torre A · Térreo" não é mais usado/);
  });

  it('Gerar massa: os blocos propostos saem empilhados', () => {
    const r = vestirBlocosPropostos(
      [{ nome: 'Torre A', pontos: ret(0, 0), cotaBaseMm: 0, pavimentos: 6, peDireitoMm: 3000, uso: 'RESIDENCIAL' }],
      [{ ...COM_PD, garagens: [] }],
    );
    expect(r.blocos.map((b) => [b.nome, b.cotaBaseMm, b.pavimentos, b.peDireitoMm])).toEqual([
      ['Torre A', 4500, 3, 3000],
      ['Torre A · Térreo', 0, 1, 4500],
    ]);
  });
});

