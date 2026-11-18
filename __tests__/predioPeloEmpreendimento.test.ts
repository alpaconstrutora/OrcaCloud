/**
 * PRÉDIO PELO EMPREENDIMENTO (plano docs/planos/2026-11-18-predio-pelo-empreendimento.md). O caso real é o critério: o
 * Garden Cambuhy (fixture só leitura do banco, 18/11/2026) — Torre A com o térreo de 2 apartamentos e 3 andares de 4;
 * Torre B com 6 andares de 4 apartamentos, dois deles abaixo da rua; as duas coladas no lote da planta "Teste 01".
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EmpreendimentoFloor } from '../types/empreendimento';
import { applyBatch, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { comandosDoAjuste } from '../utils/blueprintAjusteAoEmpreendimento';
import { estruturasDoEmpreendimento, type TorreParaEstrutura } from '../utils/blueprintEstruturaDaTorre';
import { blocosDasTorresNoLote, dividirPeloEmpreendimento, papelDosAndares, pegadaDaTorre, produtoDoAndarTipo } from '../utils/predioAutomatico/andaresDoEmpreendimento';
import { produtoVazio } from '../utils/blueprintProduto';
import { assinaturaDoPedidoDoPredio, motivoParaNaoGerarPredio, planejarPredioDoPedido } from '../utils/blueprintPredioAutomatico';
import { HIPOTESES_DO_PRODUTO_PADRAO } from '../utils/blueprintProduto';
import type { Boundary } from '../utils/blueprintKernel';

const GARDEN = JSON.parse(readFileSync(new URL('./fixtures/empreendimentoGarden.json', import.meta.url), 'utf8')) as {
  torres: TorreParaEstrutura[];
  pavimentos: Record<string, EmpreendimentoFloor[]>;
  empreendimento: { distanciasEntreTorres: { distancia_m: number; torre_a: string; torre_b: string }[] };
  teste01: { divisas: Boundary[] };
};
const estruturas = () => estruturasDoEmpreendimento(GARDEN.torres, new Map(Object.entries(GARDEN.pavimentos)));
const daTorre = (nome: string) => estruturas().find((e) => e.nome === nome)!;

describe('PE1 — os andares da torre pelo Empreendimento (Garden)', () => {
  it('a Torre A: os andares 0 a 3 são da torre; as garagens −1 e −2 ficam embaixo', () => {
    const a = daTorre('Torre A');
    expect(a.acima.map((p) => p.numero)).toEqual([0, 1, 2, 3]);
    expect(a.garagens.map((p) => p.numero)).toEqual([-2, -1]);
    expect(a.abaixoDaRua).toBe(0);
  });

  it('a Torre B começa no −2 (decisão de 18/11): os 6 andares de apartamento são da torre; a garagem é só −4 e −3', () => {
    const b = daTorre('Torre B');
    expect(b.acima.map((p) => p.numero)).toEqual([-2, -1, 0, 1, 2, 3]);
    expect(b.acima.every((p) => p.unidades.length === 4)).toBe(true);
    expect(b.garagens.map((p) => p.numero)).toEqual([-4, -3]);
    expect(b.abaixoDaRua).toBe(2);
  });
});

describe('PE1 — os blocos das torres na massa (Garden)', () => {
  /** A massa do estudo "Planta 26/10/2026": as duas torres e as garagens, como o ajuste de antes as deixava. */
  function massaDe2610() {
    let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
    const t = m.levels[0].id;
    const ret = (y0: number) => [point(2281, y0), point(15781, y0), point(15781, y0 + 26000), point(2281, y0 + 26000)];
    const bloco = (nome: string, y0: number, pavimentos: number, cotaBaseMm: number, uso?: 'GARAGEM'): Command => ({ type: 'AddBloco', levelId: t, nome, pontos: ret(y0), pavimentos, cotaBaseMm, peDireitoMm: 3000, ...(uso ? { uso } : {}) }) as Command;
    m = applyBatch(m, [bloco('Torre A', 6342, 4, 0), bloco('Torre B', 32342, 4, 0), bloco('Torre A · Garagem', 6342, 2, -6000, 'GARAGEM'), bloco('Torre B · Garagem', 32342, 4, -12000, 'GARAGEM')]).model;
    return m;
  }
  const blocoDe = (m: BlueprintModel, nome: string) => (m.blocos ?? []).find((b) => b.nome === nome)!;

  it('a Torre B sobe do −2: o bloco dela desce 2 andares (6 pavimentos a −6,00 m do térreo) e a garagem fica com 2', () => {
    const m0 = massaDe2610();
    const m = applyBatch(m0, comandosDoAjuste(m0, estruturas()).comandos).model;
    expect(blocoDe(m, 'Torre B')).toMatchObject({ cotaBaseMm: -6000, pavimentos: 6 });
    expect(blocoDe(m, 'Torre B · Garagem')).toMatchObject({ cotaBaseMm: -12000, pavimentos: 2 });
    expect(blocoDe(m, 'Torre A')).toMatchObject({ cotaBaseMm: 0, pavimentos: 4 });
    expect(blocoDe(m, 'Torre A · Garagem')).toMatchObject({ cotaBaseMm: -6000, pavimentos: 2 });
    expect(m.blocos).toHaveLength(4);
  });

  it('o painel do bloco avisa quando o andar tipo não cabe no bloco desenhado — com os dois números', () => {
    const m0 = massaDe2610();
    const { avisos } = comandosDoAjuste(m0, estruturas());
    expect(avisos.some((x) => /Torre A/.test(x) && /507/.test(x) && /351/.test(x))).toBe(true);
  });

  it('ajustar de novo não muda nada (a Torre B abaixo do 0 continua sendo a torre, não um bloco avulso)', () => {
    const m0 = massaDe2610();
    const m = applyBatch(m0, comandosDoAjuste(m0, estruturas()).comandos).model;
    const deNovo = comandosDoAjuste(m, estruturas());
    expect(deNovo.comandos).toEqual([]);
    expect(deNovo.linhas.map((l) => [l.torre, l.estado, l.pavimentosNaPlanta, l.garagensNaPlanta])).toEqual([
      ['Torre A', 'OK', 4, 2],
      ['Torre B', 'OK', 6, 2],
    ]);
  });
});

describe('PE1 — o papel de cada andar (Garden)', () => {
  const papeis = (nome: string) => papelDosAndares(daTorre(nome)).andares.map((a) => [a.numero, a.papel, a.unidades.length, a.comuns.length]);

  it('Torre A: garagens −2 e −1; o térreo é PRÓPRIO (2 apartamentos e a área comum); o 1 é o TIPO; 2 e 3 são cópias', () => {
    expect(papeis('Torre A')).toEqual([
      [-2, 'GARAGEM', 0, 0],
      [-1, 'GARAGEM', 0, 0],
      [0, 'PROPRIO', 2, 1],
      [1, 'TIPO', 4, 0],
      [2, 'COPIA', 4, 0],
      [3, 'COPIA', 4, 0],
    ]);
    const tipo = papelDosAndares(daTorre('Torre A')).andares.find((a) => a.papel === 'TIPO')!;
    expect(tipo.unidades.map((u) => u.areaPrivativaM2).sort()).toEqual([127, 127, 81, 81]);
    expect(tipo.elevacaoMm).toBe(daTorre('Torre A').acima.find((p) => p.numero === 1)!.elevacaoMm);
  });

  it('Torre B: garagens −4 e −3; o −2 é o TIPO e os outros 5 andares de apartamento (o térreo também) são cópias', () => {
    expect(papeis('Torre B')).toEqual([
      [-4, 'GARAGEM', 0, 0],
      [-3, 'GARAGEM', 0, 0],
      [-2, 'TIPO', 4, 0],
      [-1, 'COPIA', 4, 0],
      [0, 'COPIA', 4, 0],
      [1, 'COPIA', 4, 0],
      [2, 'COPIA', 4, 0],
      [3, 'COPIA', 4, 0],
    ]);
  });

  it('torre só com unidades (sem cadastro de pavimentos): os papéis saem mesmo assim, e o aviso diz a fonte', () => {
    const semCadastro = estruturasDoEmpreendimento(GARDEN.torres.filter((t) => t.name === 'Torre A'), new Map()).find((e) => e.nome === 'Torre A')!;
    expect(semCadastro.fonte).toBe('UNIDADES');
    const r = papelDosAndares(semCadastro);
    expect(r.andares.map((a) => [a.numero, a.papel])).toEqual([[-2, 'GARAGEM'], [-1, 'GARAGEM'], [0, 'PROPRIO'], [1, 'TIPO'], [2, 'COPIA'], [3, 'COPIA']]);
  });

  it('apartamento sem área toma a média do andar, com aviso; unidade criada pela massa ou lote de loteamento fica fora', () => {
    const torre: TorreParaEstrutura = {
      id: 't',
      name: 'Torre X',
      units: [
        { floor: 1, floor_tipo: 'TIPO', name: '101', private_area: 80, bedrooms: 2 },
        { floor: 1, floor_tipo: 'TIPO', name: '102', private_area: 100, bedrooms: 3 },
        { floor: 1, floor_tipo: 'TIPO', name: '103', private_area: null, bedrooms: 2 },
        { floor: 1, floor_tipo: 'TIPO', name: 'M1', private_area: 70, blueprint_massa_chave: 'blc:1:0' },
        { floor: 2, floor_tipo: 'TIPO', name: '201', private_area: 80, bedrooms: 2 },
      ],
    };
    const r = papelDosAndares(estruturasDoEmpreendimento([torre], new Map())[0]);
    const um = r.andares.find((a) => a.numero === 1)!;
    expect(um.unidades.map((u) => [u.nome, u.areaPrivativaM2])).toEqual([['101', 80], ['102', 100], ['103', 90]]);
    expect(r.avisos.some((x) => /103/.test(x) && /média/.test(x))).toBe(true);
    expect(r.avisos.some((x) => /M1/.test(x) && /massa/.test(x))).toBe(true);
  });
});

describe('PE1 — a pegada da torre e as torres no lote da "Teste 01"', () => {
  const tipoDe = (nome: string) => papelDosAndares(daTorre(nome)).andares.find((a) => a.papel === 'TIPO')!;
  const distancias = GARDEN.empreendimento.distanciasEntreTorres.map((d) => ({ torreA: d.torre_a, torreB: d.torre_b, mm: Math.round(d.distancia_m * 1000) }));
  const area = (pts: { x: number; y: number }[]) => Math.abs(pts.reduce((s, p, i) => s + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0)) / 2e6;

  it('o andar tipo da Torre A pede ~507 m² (416 privativos + paredes, circulação e núcleo do Produto) — o contorno estimado de 13,5 × 26 m não cabe', () => {
    const contorno = [point(2281, 6342), point(15781, 6342), point(15781, 32342), point(2281, 32342)];
    const r = pegadaDaTorre(tipoDe('Torre A'), 4, HIPOTESES_DO_PRODUTO_PADRAO, contorno);
    expect(r.privativosM2).toBe(416);
    expect(r.necessariaM2).toBeCloseTo(506.6, 0);
    expect(r.disponivelM2).toBe(351);
    expect(r.cabe).toBe(false);
  });

  it('sem bloco desenhado, as duas torres nascem no lote da Teste 01: na largura da frente, coladas, a Torre A na frente, cada uma com a área que o andar tipo pede', () => {
    const e = estruturas();
    const r = blocosDasTorresNoLote(GARDEN.teste01.divisas, e, distancias, null, HIPOTESES_DO_PRODUTO_PADRAO);
    expect(r.blocos.map((b) => b.nome)).toEqual(['Torre A', 'Torre B']);
    const [a, b] = r.blocos;
    const ys = (x: typeof a) => x.pontos.map((p) => p.y);
    const xs = (x: typeof a) => x.pontos.map((p) => p.x);
    expect([Math.min(...xs(a)), Math.max(...xs(a))]).toEqual([0, 18000]);
    expect(Math.min(...ys(a))).toBe(0);
    expect(Math.min(...ys(b))).toBe(Math.max(...ys(a)));
    expect(area(a.pontos)).toBeGreaterThanOrEqual(pegadaDaTorre(tipoDe('Torre A'), 4, HIPOTESES_DO_PRODUTO_PADRAO, null).necessariaM2);
    expect(area(b.pontos)).toBeGreaterThanOrEqual(pegadaDaTorre(tipoDe('Torre B'), 6, HIPOTESES_DO_PRODUTO_PADRAO, null).necessariaM2);
    expect(Math.max(...ys(b))).toBeLessThanOrEqual(63030);
    expect(r.avisos.some((x) => /recuo/i.test(x))).toBe(true);
    expect(r.avisos.some((x) => /passa(m)? do fundo/.test(x))).toBe(false);
  });

  it('lote raso: a torre não encolhe — o aviso diz quanto passa do fundo', () => {
    const raso = GARDEN.teste01.divisas.map((d) => ({ ...d, a: { x: d.a.x, y: Math.min(d.a.y, 40000) }, b: { x: d.b.x, y: Math.min(d.b.y, 40000) } }));
    const r = blocosDasTorresNoLote(raso, estruturas(), distancias, null, HIPOTESES_DO_PRODUTO_PADRAO);
    expect(r.blocos).toHaveLength(2);
    expect(r.avisos.some((x) => /passa(m)? do fundo/.test(x))).toBe(true);
  });
});

describe('PE2a — o pavimento tipo dividido nas unidades do Empreendimento (Garden, lote da Teste 01)', () => {
  const tipoDe = (nome: string) => papelDosAndares(daTorre(nome)).andares.find((a) => a.papel === 'TIPO')!;
  const distancias = GARDEN.empreendimento.distanciasEntreTorres.map((d) => ({ torreA: d.torre_a, torreB: d.torre_b, mm: Math.round(d.distancia_m * 1000) }));
  /** O lote da Teste 01 com o bloco de cada torre como o PE1 o põe. */
  function noLote() {
    let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
    const t = m.levels[0].id;
    const { blocos } = blocosDasTorresNoLote(GARDEN.teste01.divisas, estruturas(), distancias, null, HIPOTESES_DO_PRODUTO_PADRAO);
    m = applyBatch(m, [
      ...GARDEN.teste01.divisas.map((d): Command => ({ type: 'AddBoundary', levelId: t, a: d.a, b: d.b, kind: 'TERRENO', papel: d.papel }) as Command),
      ...blocos.map((b): Command => ({ type: 'AddBloco', levelId: t, nome: b.nome, pontos: b.pontos, pavimentos: b.pavimentos }) as Command),
    ]).model;
    return m;
  }

  it('o produto do andar tipo: uma tipologia por apartamento da ficha, com a área e os dormitórios dele', () => {
    const { produto, porTipologia } = produtoDoAndarTipo(tipoDe('Torre A'), produtoVazio());
    expect(produto.tipologias.map((t) => [t.areaPrivativaM2, t.dormitorios])).toEqual(tipoDe('Torre A').unidades.map((u) => [u.areaPrivativaM2, u.dormitorios]));
    expect(Object.values(porTipologia)).toEqual([1, 1, 1, 1]);
  });

  it('Torre A: 4 apartamentos na proporção das áreas da ficha (±5 %), os dois de 127 m² na frente, com os números da ficha', () => {
    const m = noLote();
    const b = (m.blocos ?? []).find((x) => x.nome === 'Torre A')!;
    const r = dividirPeloEmpreendimento(m, b, tipoDe('Torre A'), produtoVazio(), null);
    if (!r.ok) throw new Error(r.motivo);
    const us = r.divisao.unidades;
    expect(us).toHaveLength(4);
    const total = us.reduce((s, u) => s + u.areaM2, 0);
    const alvo = us.reduce((s, u) => s + u.alvoM2, 0);
    for (const u of us) expect(Math.abs(u.areaM2 / total - u.alvoM2 / alvo)).toBeLessThan(0.05);
    const ficha = (u: (typeof us)[number]) => r.unidadeDaFicha.get(u.posicao)!;
    // A rua fica em y = 0 (a FRENTE da Teste 01): os de 127 m² encostam na fachada da frente; os de 81 m², não.
    const daRua = (u: (typeof us)[number]) => Math.min(...u.anel.map((p) => p.y));
    expect(us.filter((u) => ficha(u).areaPrivativaM2 === 127).every((u) => daRua(u) < 500)).toBe(true);
    expect(us.filter((u) => ficha(u).areaPrivativaM2 === 81).every((u) => daRua(u) > 500)).toBe(true);
    expect(r.avisos).toEqual([]);
    expect(us.map((u) => u.numero).sort()).toEqual(['101', '102', '103', '104']);
    for (const u of us) expect(u.numero).toBe(ficha(u).nome);
  });

  it('Torre B: 4 apartamentos na proporção 104 : 108 : 113 : 111', () => {
    const m = noLote();
    const b = (m.blocos ?? []).find((x) => x.nome === 'Torre B')!;
    const r = dividirPeloEmpreendimento(m, b, tipoDe('Torre B'), produtoVazio(), null);
    if (!r.ok) throw new Error(r.motivo);
    const us = r.divisao.unidades;
    expect(us.map((u) => r.unidadeDaFicha.get(u.posicao)!.areaPrivativaM2).sort()).toEqual([104, 108, 111, 113]);
    const total = us.reduce((s, u) => s + u.areaM2, 0);
    for (const u of us) expect(Math.abs(u.areaM2 / total - r.unidadeDaFicha.get(u.posicao)!.areaPrivativaM2! / 436)).toBeLessThan(0.05);
  });
});

describe('PE2a — o Prédio automático com as unidades do Empreendimento (Torre A no lote da Teste 01)', { timeout: 120_000 }, () => {
  const distancias = GARDEN.empreendimento.distanciasEntreTorres.map((d) => ({ torreA: d.torre_a, torreB: d.torre_b, mm: Math.round(d.distancia_m * 1000) }));
  function pedido() {
    let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
    const t = m.levels[0].id;
    const { blocos } = blocosDasTorresNoLote(GARDEN.teste01.divisas, estruturas(), distancias, null, HIPOTESES_DO_PRODUTO_PADRAO);
    const a = blocos.find((b) => b.nome === 'Torre A')!;
    m = applyBatch(m, [
      ...GARDEN.teste01.divisas.map((d): Command => ({ type: 'AddBoundary', levelId: t, a: d.a, b: d.b, kind: 'TERRENO', papel: d.papel }) as Command),
      { type: 'AddBloco', levelId: t, nome: a.nome, pontos: a.pontos, pavimentos: a.pavimentos } as Command,
    ]).model;
    const torre = daTorre('Torre A');
    const SO_A_ARQUITETURA = { estrutura: false, eletrica: false, climatizacao: false, agua: false, esgoto: false, pluvial: false, incendio: false, garagem: false, cobertura: false };
    return { original: m, entrada: { blocoId: m.blocos![0].id, produto: produtoVazio(), doBloco: null, rotacaoNorteDeg: null, doEmpreendimento: { torreId: torre.torreId, andares: papelDosAndares(torre).andares } }, hip: SO_A_ARQUITETURA };
  }

  it('gera sem produto: o tipo com os 4 apartamentos da ficha (101–104), cada um com a planta da tipologia dele', () => {
    const p = pedido();
    expect(motivoParaNaoGerarPredio(p.original, p.entrada)).toBeNull();
    const plano = planejarPredioDoPedido(p);
    expect(plano.resumo.unidadesPorAndar).toBe(4);
    const nomes = (plano.resultado.unidades ?? []).map((u) => u.numero).sort();
    expect(nomes).toEqual(['101', '102', '103', '104']);
    expect(plano.resumo.plantas?.unidades).toBe(4);
  });

  it('a assinatura do pedido muda com as unidades do Empreendimento (a prévia velha é detectada)', () => {
    const p = pedido();
    const outra = { ...p, entrada: { ...p.entrada, doEmpreendimento: { ...p.entrada.doEmpreendimento, andares: p.entrada.doEmpreendimento.andares.map((a) => (a.papel === 'TIPO' ? { ...a, unidades: a.unidades.slice(1) } : a)) } } };
    expect(assinaturaDoPedidoDoPredio(outra)).not.toBe(assinaturaDoPedidoDoPredio(p));
  });
});
