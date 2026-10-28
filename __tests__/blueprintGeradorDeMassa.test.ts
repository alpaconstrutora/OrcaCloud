/**
 * ESTUDO DE MASSA, fase M5 (02/10/2026): o gerador de implantações e o
 * otimizador (§7, §8, §10, §18 do pedido). "Pronto quando": os três cenários do
 * exemplo do pedido (torre única, duas torres, bloco longitudinal) saem do
 * gerador para um lote de prova, reprodutíveis pela semente; Pareto testado.
 */
import { describe, expect, it, vi } from 'vitest';
import { applyBatch, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { distanciaEntrePoligonosMm } from '../utils/blueprintDistanciaEntreTorres';
import { ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { produtoDaColuna, produtoSemente, vagasQueCabem } from '../utils/blueprintProduto';
import { cenarioDeMassa, type CenarioDeMassa } from '../utils/blueprintComparadorDeMassa';
import {
  compararCandidatos,
  comandosDoCandidato,
  frenteDeParetoDaMassa,
  gerarMassa,
  gradeDePavimentos,
  modeloDoCandidato,
  RESTRICOES_PADRAO,
  valorDoObjetivo,
  type CandidatoDeMassa,
  type EntradaDoGeradorDeMassa,
} from '../utils/blueprintGeradorDeMassa';

// Teto de tempo por ARQUIVO (padrão de __tests__/components/BlueprintEditor.test.tsx).
// Em 08/10/2026 a CI do commit 9c53b2c0 rodou ~1,6x mais lenta (até o tsc) e casos
// pesados deste arquivo passaram dos 5 s padrão; na reexecução, passaram. É contenção
// da máquina, não regressão. Subir AQUI mantém o teto curto no resto da suíte.
vi.setConfig({ testTimeout: 30_000 });

type Papel = 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA';

/** Lote retangular L × P m, frente no lado y = 0; `girar` em graus roda o lote inteiro. */
function lote(larguraM: number, profundidadeM: number, girar = 0): BlueprintModel {
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const a = (girar * Math.PI) / 180;
  const g = (x: number, y: number) => point(Math.round(x * Math.cos(a) - y * Math.sin(a)), Math.round(x * Math.sin(a) + y * Math.cos(a)));
  const W = larguraM * 1000;
  const D = profundidadeM * 1000;
  const d = (ax: number, ay: number, bx: number, by: number, papel: Papel): Command => ({ type: 'AddBoundary', levelId: t, a: g(ax, ay), b: g(bx, by), kind: 'TERRENO', papel });
  return applyBatch(m, [d(0, 0, W, 0, 'FRENTE'), d(W, 0, W, D, 'LATERAL_DIREITA'), d(W, D, 0, D, 'FUNDOS'), d(0, D, 0, 0, 'LATERAL_ESQUERDA')]).model;
}

const REGUA: EntradaDoGeradorDeMassa['regua'] = {
  zona: { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: 60, coeficienteMax: 3, gabaritoPavimentos: 12 },
  recuosBase: { FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 },
  produto: produtoSemente('RESIDENCIAL_MEDIO'),
  cub: { valorM2: 2000, fonte: 'TABELA', referencia: 'teste' },
  vagasPorUnidadeDaZona: null,
};

const entrada = (model: BlueprintModel, extra: Partial<EntradaDoGeradorDeMassa> = {}): EntradaDoGeradorDeMassa => ({ model, regua: REGUA, objetivo: 'RESULTADO', restricoes: RESTRICOES_PADRAO, ...extra });

describe('gerador de massa', () => {
  const LOTE = lote(40, 60);
  const r = gerarMassa(entrada(LOTE), 1);

  it('os três cenários do exemplo do pedido saem do gerador, todos dentro da lei e com as vagas', () => {
    const tipos = r.melhores.map((c) => c.parametros.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['TORRE', 'DUAS_TORRES', 'LAMINA']));
    // Um por tipo de implantação.
    expect(new Set(tipos).size).toBe(tipos.length);
    for (const c of r.melhores) {
      expect(c.viavel).toBe(true);
      expect(c.cenario.pisosComProblema).toBe(0);
      expect(c.cenario.ca!).toBeLessThanOrEqual(3.005);
      expect(c.cenario.toPct!).toBeLessThanOrEqual(60.05);
      expect(c.cenario.pavimentosMax).toBeLessThanOrEqual(12);
      expect(c.cenario.vagasQueCabem).toBeGreaterThanOrEqual(c.cenario.vagasExigidas);
      expect(c.cenario.unidades).toBeGreaterThan(0);
    }
    expect(r.avaliados).toBeGreaterThan(300);
    expect(r.decisoes.join(' ')).toMatch(/divisa FRENTE/);
    expect(r.decisoes.join(' ')).toMatch(/limitados pelo gabarito em pavimentos/);
  });

  it('ordena pelo objetivo e é reprodutível pela semente', () => {
    for (let i = 1; i < r.melhores.length; i++) expect(compararCandidatos(r.melhores[i - 1], r.melhores[i])).toBeLessThanOrEqual(0);
    for (const c of r.melhores) expect(c.valor).toBe(c.cenario.resultado);
    expect(gerarMassa(entrada(LOTE), 1)).toEqual(r);
    const outra = gerarMassa(entrada(LOTE), 7);
    expect(gerarMassa(entrada(LOTE), 7)).toEqual(outra);
    // A grade não depende da semente: a melhor de cada tipo nunca piora com o refinamento.
    expect(outra.melhores.length).toBe(r.melhores.length);
  });

  it('os comandos do candidato reproduzem no kernel o cenário medido', () => {
    for (const c of r.melhores) {
      const m = modeloDoCandidato(c, LOTE, r.levelId!);
      expect(m.blocos).toHaveLength(c.blocos.length);
      expect(cenarioDeMassa(m, REGUA)).toEqual(c.cenario);
    }
    // Aplicar troca os blocos que havia: um DeleteBloco por bloco antigo.
    const comUm = applyBatch(LOTE, [{ type: 'AddBloco', levelId: r.levelId!, nome: 'Velho', pontos: [point(0, 0), point(9000, 0), point(9000, 9000), point(0, 9000)], pavimentos: 2 }]).model;
    const cmds = comandosDoCandidato(r.melhores[0], comUm, r.levelId!);
    expect(cmds.filter((x) => x.type === 'DeleteBloco')).toHaveLength(1);
    expect(modeloDoCandidato(r.melhores[0], comUm, r.levelId!).blocos!.map((b) => b.nome)).not.toContain('Velho');
  });

  it('o quadro gira com a frente: o mesmo lote girado 30° dá os mesmos números (a menos do arredondamento do mm)', () => {
    const girado = gerarMassa(entrada(lote(40, 60, 30)), 1);
    // Por tipo: a ordem entre quase-empatados (U e H têm a mesma área por construção) é ruído de arredondamento.
    const porTipo = (x: typeof r) => [...x.melhores].sort((a, b) => a.parametros.tipo.localeCompare(b.parametros.tipo));
    const a = porTipo(r);
    const b = porTipo(girado);
    expect(b.map((c) => [c.parametros.tipo, c.cenario.unidades, c.cenario.pavimentosMax, c.cenario.vagasQueCabem])).toEqual(a.map((c) => [c.parametros.tipo, c.cenario.unidades, c.cenario.pavimentosMax, c.cenario.vagasQueCabem]));
    for (let i = 0; i < a.length; i++) expect(Math.abs(b[i].cenario.resultado! - a[i].cenario.resultado!) / a[i].cenario.resultado!).toBeLessThan(5e-4);
  });

  it('objetivo "mais unidades" escolhe quem tem mais unidades', () => {
    const u = gerarMassa(entrada(LOTE, { objetivo: 'UNIDADES' }), 1);
    const max = Math.max(...u.melhores.map((c) => c.cenario.unidades));
    expect(u.melhores[0].cenario.unidades).toBe(max);
  });

  it('restrições: sem garagem e vagas exigidas → nada viável, com o motivo dito', () => {
    const s = gerarMassa(entrada(LOTE), 1, { estacionamento: 'SEM_GARAGEM', tipos: ['TORRE', 'LAMINA'] });
    expect(s.melhores).toHaveLength(0);
    expect(s.descartes[0].motivo).toBe('faltam vagas');
    expect(s.avisos.join(' ')).toMatch(/Nenhuma combinação atende às restrições.*faltam vagas/);
    // Sem exigir vagas, os mesmos cenários passam.
    const livre = gerarMassa(entrada(LOTE, { restricoes: { ...RESTRICOES_PADRAO, atenderVagas: false } }), 1, { estacionamento: 'SEM_GARAGEM', tipos: ['TORRE', 'LAMINA'] });
    expect(livre.melhores.map((c) => c.parametros.tipo).sort()).toEqual(['LAMINA', 'TORRE']);
    // Meta de unidades e teto de pavimentos do usuário.
    const meta = gerarMassa(entrada(LOTE, { objetivo: 'MENOR_CUSTO', restricoes: { ...RESTRICOES_PADRAO, unidadesMin: 60, pavimentosMax: 8 } }), 1);
    for (const c of meta.melhores) {
      expect(c.cenario.unidades).toBeGreaterThanOrEqual(60);
      expect(c.cenario.pavimentosMax).toBeLessThanOrEqual(8);
      expect(c.valor).toBe(-c.cenario.custoTotal!);
    }
    expect(meta.decisoes.join(' ')).toMatch(/com pelo menos 60 unidades/);
  });

  it('sem lote, sem produto, sem preço: diz o que falta em vez de inventar', () => {
    const semLote = gerarMassa(entrada(applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 3000 }]).model), 1);
    expect(semLote.melhores).toHaveLength(0);
    expect(semLote.avisos.join(' ')).toMatch(/Sem lote/);
    const semPreco = gerarMassa(
      entrada(LOTE, { objetivo: 'VGV', regua: { ...REGUA, produto: { ...REGUA.produto, tipologias: REGUA.produto.tipologias.map((t) => ({ ...t, precoM2: 0 })) } } }),
      1,
      { tipos: ['TORRE'] },
    );
    expect(semPreco.melhores).toHaveLength(0);
    expect(semPreco.avisos.join(' ')).toMatch(/sem preço/);
  });

  // 22/10/2026, o caso real: uma tipologia só, com mix 0 %. Ela não entra na distribuição, todo bloco sai
  // sem unidades, e o gerador varria 420 combinações para culpar o tamanho ("nenhuma unidade cabe").
  it('produto sem tipologia aproveitável (mix 0 % ou área 0): para antes da varredura e diz a causa', () => {
    const t0 = { ...REGUA.produto.tipologias[0], nome: 'Tipologia 1', proporcaoPct: 0, areaPrivativaM2: 60 };
    const so = (tipologias: (typeof t0)[]) => gerarMassa(entrada(LOTE, { regua: { ...REGUA, produto: { ...REGUA.produto, tipologias } } }), 1);
    const mix0 = so([t0]);
    expect(mix0.avaliados).toBe(0);
    expect(mix0.melhores).toHaveLength(0);
    const aviso = mix0.avisos.join(' ');
    expect(aviso).toMatch(/Nenhuma tipologia do produto entra no estudo: "Tipologia 1" \(mix 0 %\)/);
    expect(aviso).toMatch(/Terreno › Massa › Produto/);
    expect(aviso).not.toMatch(/nenhuma unidade cabe/);

    const area0 = so([{ ...t0, proporcaoPct: 100, areaPrivativaM2: 0 }]);
    expect(area0.avaliados).toBe(0);
    expect(area0.avisos.join(' ')).toMatch(/"Tipologia 1" \(área privativa 0 m²\)/);
  });

  it('valor do objetivo: minimizar custo sem meta é por m² vendável; ponderado fica entre 0 e 100', () => {
    const c = r.melhores[0].cenario;
    expect(valorDoObjetivo(c, 'MENOR_CUSTO', { metaDeUnidades: null })).toBeCloseTo(-c.custoTotal! / c.areaVendavelM2, 6);
    expect(valorDoObjetivo(c, 'MENOR_GARAGEM', { metaDeUnidades: null })).toBe(-c.garagemM2);
    const p = gerarMassa(entrada(LOTE, { objetivo: 'PONDERADO' }), 1);
    for (const x of p.melhores) {
      expect(x.valor!).toBeGreaterThanOrEqual(0);
      expect(x.valor!).toBeLessThanOrEqual(100);
    }
  });

  it('frente de Pareto: tira só os dominados em VGV, custo e complexidade', () => {
    const cen = (vgv: number, custo: number, complexidade: number) => ({ vgv, custoTotal: custo, complexidade, areaVendavelM2: 0, areaConstruidaM2: 0 }) as unknown as CenarioDeMassa;
    const cand = (chave: string, c: CenarioDeMassa) => ({ chave, cenario: c }) as CandidatoDeMassa;
    const lista = [cand('a', cen(100, 50, 2)), cand('b', cen(90, 60, 2)), cand('c', cen(120, 80, 3)), cand('d', cen(100, 50, 1))];
    // b é dominado por a (menos VGV, mais custo); a é dominado por d (mesma coisa, menos complexo).
    expect(frenteDeParetoDaMassa(lista).sort()).toEqual(['c', 'd']);
    expect(r.pareto.length).toBeGreaterThan(0);
    for (const k of r.pareto) expect(r.melhores.some((c) => c.chave === k)).toBe(true);
  });

  it('vagas numa garagem girada: o lançador conta o mesmo que na garagem alinhada ao desenho', () => {
    const ret = [point(0, 0), point(38000, 0), point(38000, 58000), point(0, 58000)];
    const a = (30 * Math.PI) / 180;
    const girado = ret.map((p) => point(Math.round(p.x * Math.cos(a) - p.y * Math.sin(a)), Math.round(p.x * Math.sin(a) + p.y * Math.cos(a))));
    expect(vagasQueCabem(girado, 'PERPENDICULAR')).toBe(vagasQueCabem(ret, 'PERPENDICULAR'));
  });

  it('M5b: com a régua do sol, "maximizar o sol" ranqueia pela insolação e testa as variantes do L e do U; nos outros objetivos o sol vira indicador dos melhores', () => {
    const sol = { latitudeGraus: -23.5, rotacaoNorteDeg: null, entorno: [], minimaH: 2 };
    const comSol = gerarMassa(entrada(LOTE, { objetivo: 'INSOLACAO', regua: { ...REGUA, insolacao: sol } }), 1);
    expect(comSol.melhores.length).toBeGreaterThan(3);
    for (const c of comSol.melhores) {
      expect(c.cenario.solNasFachadasH).not.toBeNull();
      expect(c.valor).toBe(c.cenario.solNasFachadasH);
    }
    expect(comSol.melhores[0].valor).toBe(Math.max(...comSol.melhores.map((c) => c.valor!)));
    expect(comSol.decisoes.join(' ')).toMatch(/medido em cada combinação/);
    // Sem meta de unidades, o sol não pode levar ao prédio baixo: 80 % das unidades da varredura.
    const piso = Number(/mantendo pelo menos (\d+) unidades \(80 %/.exec(comSol.decisoes.join(' '))![1]);
    expect(piso).toBeGreaterThan(50);
    for (const c of comSol.melhores) expect(c.cenario.unidades).toBeGreaterThanOrEqual(piso);
    expect(comSol.descartes.some((d) => d.motivo === 'abaixo de 80 % das unidades possíveis')).toBe(true);
    expect(comSol.avaliados).toBeGreaterThan(r.avaliados); // as variantes do L e do U entraram
    // Objetivo financeiro: o ranking não muda, os melhores ganham o sol como indicador.
    const fin = gerarMassa(entrada(LOTE, { regua: { ...REGUA, insolacao: sol } }), 1);
    expect(fin.melhores.map((c) => c.chave)).toEqual(r.melhores.map((c) => c.chave));
    for (const c of fin.melhores) expect(c.cenario.solNasFachadasH).not.toBeNull();
    expect(fin.decisoes.join(' ')).toMatch(/medido só nas melhores/);
    // Sem a régua do sol, o objetivo não se mede — e diz por quê.
    const semSol = gerarMassa(entrada(LOTE, { objetivo: 'INSOLACAO' }), 1, { tipos: ['TORRE'] });
    expect(semSol.melhores).toHaveLength(0);
    expect(semSol.avisos.join(' ')).toMatch(/sol não foi informado/);
  });

  it('grade de pavimentos: todos até 12; acima, sempre com o teto', () => {
    expect(gradeDePavimentos(5)).toEqual([1, 2, 3, 4, 5]);
    const g = gradeDePavimentos(30);
    expect(g[0]).toBe(1);
    expect(g[g.length - 1]).toBe(30);
    expect(g.length).toBeLessThan(20);
    expect(gradeDePavimentos(0)).toEqual([]);
  });
});

/**
 * FOLGA ATÉ O RECUO (04/10/2026) — a margem da borda do envelope deixou de ser 10 cm fixos e virou hipótese
 * (`margemDoEnvelopeMm`): *"sim transformar em hipotese"*.
 */
describe('gerador de massa · folga até o recuo', () => {
  const zona = { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: 70, coeficienteMax: 4, gabaritoAlturaMaxM: 18 };
  const reguaDaPlanta: EntradaDoGeradorDeMassa['regua'] = { ...REGUA, zona, recuosBase: { FRENTE: 1500, FUNDOS: 1500, LATERAL_DIREITA: 0, LATERAL_ESQUERDA: 0 } };
  const embasamento = (margemDoEnvelopeMm?: number) => {
    const r = gerarMassa(entrada(lote(12, 30), { regua: reguaDaPlanta }), 1, { tipos: ['EMBASAMENTO_E_TORRE'], ...(margemDoEnvelopeMm === undefined ? {} : { margemDoEnvelopeMm }) });
    const b = r.melhores[0]?.blocos.find((x) => x.nome === 'Embasamento');
    if (!b) throw new Error(`sem embasamento: ${r.avisos.join(' | ')}`);
    const xs = b.pontos.map((p) => p.x);
    const ys = b.pontos.map((p) => p.y);
    return { r, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys), x0: Math.min(...xs), y0: Math.min(...ys) };
  };

  it('padrão 10 cm: reproduz a "Planta 02/10/2026" — embasamento 10,48 × 23,80 m, centrado', () => {
    const e = embasamento();
    expect(e.w).toBeGreaterThan(10475);
    expect(e.w).toBeLessThan(10485);
    expect(e.d).toBeGreaterThan(23800);
    expect(e.d).toBeLessThan(23808);
    expect(e.r.decisoes.join(' ')).toMatch(/a 10 cm da borda \(folga até o recuo\)/);
  });

  it('folga 0 encosta no recuo: o envelope é 12 × 27 m e o embasamento (cortado pela TO) fica 10,53 × 23,69 m', () => {
    const e = embasamento(0);
    expect(e.r.quadro).toEqual({ larguraM: 12, profundidadeM: 27 });
    expect(e.w).toBeGreaterThan(10525);
    expect(e.w).toBeLessThan(10535);
    expect(e.d).toBeGreaterThan(23688);
    expect(e.d).toBeLessThan(23698);
    expect(e.r.decisoes.join(' ')).toMatch(/encostado na borda \(folga até o recuo 0\)/);
  });

  it('o quadro do térreo encolhe a folga de cada lado (lote 40 × 60, recuos 5/3/1,5/1,5)', () => {
    const q = (m: number) => gerarMassa(entrada(lote(40, 60)), 1, { tipos: ['TORRE'], margemDoEnvelopeMm: m }).quadro;
    expect(q(0)).toEqual({ larguraM: 37, profundidadeM: 52 });
    expect(q(500)).toEqual({ larguraM: 36, profundidadeM: 51 });
  });

  it('valor fora da faixa (negativo, acima de 2 m, não número) vira um valor válido', () => {
    expect(embasamento(-50).r.quadro).toEqual({ larguraM: 12, profundidadeM: 27 });
    expect(gerarMassa(entrada(lote(40, 60)), 1, { tipos: ['TORRE'], margemDoEnvelopeMm: 5000 }).quadro).toEqual({ larguraM: 33, profundidadeM: 48 });
    expect(gerarMassa(entrada(lote(40, 60)), 1, { tipos: ['TORRE'], margemDoEnvelopeMm: Number.NaN }).quadro).toEqual({ larguraM: 36.8, profundidadeM: 51.8 });
  });
});

/**
 * TODAS AS FOLGAS EM HIPÓTESES (04/10/2026) — *"e aliás todas as folgas que houver devem ser incluídas em hipóteses"*:
 * a folga na taxa de ocupação (era 0,995 por lado) e o piso de unidades ao priorizar o sol (era 80 %).
 */
describe('gerador de massa · folga na TO e piso do sol', () => {
  const zona = { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: 70, coeficienteMax: 4, gabaritoAlturaMaxM: 18 };
  const reguaDaPlanta: EntradaDoGeradorDeMassa['regua'] = { ...REGUA, zona, recuosBase: { FRENTE: 1500, FUNDOS: 1500, LATERAL_DIREITA: 0, LATERAL_ESQUERDA: 0 } };
  const areaDoEmbasamentoM2 = (folgaDaTaxaDeOcupacaoPct?: number) => {
    const r = gerarMassa(entrada(lote(12, 30), { regua: reguaDaPlanta }), 1, { tipos: ['EMBASAMENTO_E_TORRE'], ...(folgaDaTaxaDeOcupacaoPct === undefined ? {} : { folgaDaTaxaDeOcupacaoPct }) });
    const b = r.melhores[0]?.blocos.find((x) => x.nome === 'Embasamento');
    if (!b) throw new Error(`sem embasamento: ${r.avisos.join(' | ')}`);
    const xs = b.pontos.map((p) => p.x);
    const ys = b.pontos.map((p) => p.y);
    return ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / 1e6;
  };

  it('padrão 1 % da área: o embasamento fica com 99 % do teto da TO (252 m² → 249,5 m²)', () => {
    expect(areaDoEmbasamentoM2()).toBeCloseTo(252 * 0.99, 0);
  });

  it('folga de 5 %: 95 % do teto (239,4 m²)', () => {
    expect(areaDoEmbasamentoM2(5)).toBeCloseTo(252 * 0.95, 0);
  });

  it('piso do sol: a decisão diz o piso escolhido; 0 desliga', () => {
    const sol = { latitudeGraus: -23.5, rotacaoNorteDeg: null, entorno: [], minimaH: 2 };
    const comPiso = (pisoDeUnidadesNoSolPct: number) => gerarMassa(entrada(lote(40, 60), { objetivo: 'INSOLACAO', regua: { ...REGUA, insolacao: sol } }), 1, { tipos: ['TORRE'], pisoDeUnidadesNoSolPct });
    expect(comPiso(50).decisoes.join(' ')).toMatch(/\(50 % do máximo da varredura/);
    expect(comPiso(80).decisoes.join(' ')).toMatch(/\(80 % do máximo da varredura/);
    expect(comPiso(0).decisoes.join(' ')).not.toMatch(/mantendo pelo menos/);
  });
});

// 22/10/2026, o caso real ("Planta 15/10/2026"): lote 10 × 30 m, laterais sem recuo, produto de 1 vaga por unidade
// com vagas de ré. Nenhuma vaga cabe no subsolo (a fileira de ré com circulação pede 10 m), e o gerador dizia só
// "faltam vagas (393)"; o rótulo dizia "Embasamento + torre · 19 × 18 m" num lote de 10 m de largura.
// 26/10/2026: lote IRREGULAR — o trapézio da ficha (frente 18 m, fundos 21 m, 63,03 m) quebrava o gerador inteiro
// com "x deve ser milímetro inteiro … recebido 255.5": o passo da busca em grade dava ímpar.
describe('gerador de massa · lote trapézio', () => {
  it('gera sem erro de milímetro inteiro e com implantações', () => {
    let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
    const t = m.levels[0].id;
    const d = (ax: number, ay: number, bx: number, by: number, papel: Papel): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
    m = applyBatch(m, [d(-1500, 63030, 0, 0, 'LATERAL_ESQUERDA'), d(0, 0, 18000, 0, 'FRENTE'), d(18000, 0, 19500, 63030, 'LATERAL_DIREITA'), d(19500, 63030, -1500, 63030, 'FUNDOS')]).model;
    const r = gerarMassa(entrada(m), 1);
    expect(r.melhores.length).toBeGreaterThan(0);
  });
});

describe('gerador de massa · lote estreito', () => {
  const ESTREITO = lote(10, 30);
  const produto = produtoDaColuna({
    nome: 'Produto',
    padrao: 'R8-N',
    tipologias: [{ id: '2q', nome: '2 dorm.', uso: 'RESIDENCIAL', dormitorios: 2, areaPrivativaM2: 58, vagasPorUnidade: 1, proporcaoPct: 50, precoM2: 8500 }],
    hipoteses: { arranjoDasVagas: 'PERPENDICULAR', recuoDasVagasMm: 200, folgaDaFilaMm: 1000 },
  });
  const regua: EntradaDoGeradorDeMassa['regua'] = {
    zona: { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: 70, coeficienteMax: 4, gabaritoAlturaMaxM: 18, taxaPermeabilidadeMinPct: 5 },
    recuosBase: { FRENTE: 1500, FUNDOS: 1500, LATERAL_DIREITA: 0, LATERAL_ESQUERDA: 0 },
    produto,
    cub: { valorM2: 2500, fonte: 'TABELA', referencia: 'teste' },
    vagasPorUnidadeDaZona: null,
  };

  it('nenhuma vaga cabe na garagem: diz as medidas, o arranjo que cabe e o que fazer', () => {
    const r = gerarMassa({ model: ESTREITO, regua, objetivo: 'RESULTADO', restricoes: RESTRICOES_PADRAO }, 1);
    expect(r.viaveis).toBe(0);
    expect(r.descartes[0].motivo).toBe('faltam vagas');
    const ultimo = r.avisos[r.avisos.length - 1];
    expect(ultimo).toMatch(/^Nenhuma vaga cabe na garagem: a largura útil é \d+,\d m e a fileira de ré \(90°\) com a circulação pede 10,0 m/);
    expect(ultimo).toMatch(/pede 10,0 m \(em fila cabem 4 vagas por subsolo\)\./);
    expect(ultimo).toMatch(/Produto › Hipóteses/);
    expect(ultimo).toMatch(/Atender às vagas exigidas/);

    // Com um arranjo que cabe, o aviso não aparece.
    const emFila = gerarMassa({ model: ESTREITO, regua: { ...regua, produto: { ...produto, hipoteses: { ...produto.hipoteses, arranjoDasVagas: 'PARALELA' } } }, objetivo: 'RESULTADO', restricoes: RESTRICOES_PADRAO }, 1);
    expect(emFila.viaveis).toBeGreaterThan(0);
    expect(emFila.avisos.join(' ')).not.toMatch(/Nenhuma vaga cabe/);
  });

  it('o rótulo diz a medida do bloco, não a da varredura', () => {
    const r = gerarMassa({ model: ESTREITO, regua, objetivo: 'RESULTADO', restricoes: { ...RESTRICOES_PADRAO, atenderVagas: false } }, 1);
    expect(r.melhores.length).toBeGreaterThan(2);
    const lados = (pts: { x: number; y: number }[]) => pts.map((p, i) => Math.hypot(pts[(i + 1) % pts.length].x - p.x, pts[(i + 1) % pts.length].y - p.y) / 1000);
    const num = (s: string) => Number(s.replace(',', '.'));
    for (const c of r.melhores) {
      const unidades = c.blocos.filter((b) => b.uso !== 'GARAGEM' && b.nome !== 'Embasamento');
      const ls = unidades.flatMap((b) => lados(b.pontos));
      const medidas = c.rotulo.match(/(\d+(?:,\d)?) × (\d+(?:,\d)?) m/) ?? c.rotulo.match(/lâmina (\d+(?:,\d)?) m/);
      expect(medidas, c.rotulo).not.toBeNull();
      for (const m of medidas!.slice(1)) {
        const v = num(m);
        expect(v, c.rotulo).toBeLessThanOrEqual(30);
        expect(ls.some((l) => Math.abs(l - v) <= 0.1), `${c.rotulo} · lados ${ls.map((l) => l.toFixed(2)).join(' ')}`).toBe(true);
      }
    }
  });
});

// 26/10/2026 (etapa 1 de docs/planos/2026-10-26-planta-empreendimento-tres-etapas.md): o número de torres e os
// pavimentos cadastrados no Empreendimento restringem a varredura.
describe('gerador de massa · seguir o Empreendimento', () => {
  const UM_BLOCO = ['TORRE', 'LAMINA', 'EM_L', 'EM_U', 'EM_H', 'EMBASAMENTO_E_TORRE'];
  const deUnidades = (c: { blocos: { nome: string }[] }) => c.blocos.filter((b) => !/subsolo|pilotis|embasamento/i.test(b.nome)).length;
  const com = (model: BlueprintModel, doEmpreendimento: NonNullable<typeof RESTRICOES_PADRAO['doEmpreendimento']>) =>
    entrada(model, { restricoes: { ...RESTRICOES_PADRAO, atenderVagas: false, doEmpreendimento } });

  it('1 torre de 8 pavimentos: só implantações de um bloco, todas com 8', () => {
    const r = gerarMassa(com(lote(40, 60), { torres: 1, pavimentosMin: 8, pavimentosMax: 8 }), 1);
    expect(r.melhores.length).toBeGreaterThan(0);
    for (const c of r.melhores) {
      expect(UM_BLOCO).toContain(c.parametros.tipo);
      expect(c.cenario.pavimentosMax).toBe(8);
    }
    expect(r.decisoes.join(' ')).toMatch(/Empreendimento: 1 torre, 8 pavimentos/);
  });

  it('2 torres: duas torres ou blocos paralelos com 2 blocos', () => {
    const r = gerarMassa(com(lote(40, 60), { torres: 2, pavimentosMin: null, pavimentosMax: null }), 1);
    expect(r.melhores.length).toBeGreaterThan(0);
    for (const c of r.melhores) {
      expect(['DUAS_TORRES', 'BLOCOS_PARALELOS']).toContain(c.parametros.tipo);
      expect(deUnidades(c)).toBe(2);
    }
  });

  it('3 torres: só blocos paralelos, com exatamente 3 blocos', () => {
    const r = gerarMassa(com(lote(70, 60), { torres: 3, pavimentosMin: 3, pavimentosMax: 5 }), 1);
    expect(r.melhores.length).toBeGreaterThan(0);
    for (const c of r.melhores) {
      expect(c.parametros.tipo).toBe('BLOCOS_PARALELOS');
      expect(deUnidades(c)).toBe(3);
      expect(c.cenario.pavimentosMax).toBeGreaterThanOrEqual(3);
      expect(c.cenario.pavimentosMax).toBeLessThanOrEqual(5);
    }
  });

  it('nenhuma das implantações marcadas tem o número de torres: diz em vez de varrer', () => {
    const r = gerarMassa(com(lote(40, 60), { torres: 3, pavimentosMin: null, pavimentosMax: null }), 1, { tipos: ['TORRE', 'DUAS_TORRES'] });
    expect(r.melhores).toHaveLength(0);
    expect(r.avisos.join(' ')).toMatch(/3 torres/);
  });

  it('torres do Empreendimento mais altas que a lei deixa: diz o porquê em vez de "0 combinações" calado', () => {
    // O caso do relato (26/10/2026): Garden Cambuhy com uma torre de 6 pavimentos; a zona limita a 11,6 m → 3 pav de 3 m.
    const regua = { ...REGUA, zona: { ...REGUA.zona, gabaritoPavimentos: 6, gabaritoAlturaMaxM: 11.6 } };
    const r = gerarMassa({ model: lote(40, 60), regua, objetivo: 'UNIDADES', restricoes: { ...RESTRICOES_PADRAO, atenderVagas: false, doEmpreendimento: { torres: 2, pavimentosMin: 6, pavimentosMax: 6 } } }, 1);
    expect(r.melhores).toHaveLength(0);
    const texto = r.avisos.join(' ');
    expect(texto).toMatch(/6 pavimentos/);
    expect(texto).toMatch(/até 3/);
    expect(texto).toMatch(/gabarito em altura/);
    expect(texto).toMatch(/Seguir o Empreendimento/);
  });

  it('distância entre torres do Empreendimento (28/10/2026): vale no lugar da hipótese, e os blocos saem com ela', () => {
    const r = gerarMassa(com(lote(40, 80), { torres: 2, pavimentosMin: null, pavimentosMax: null, afastamentoEntreBlocosM: 12 }), 1);
    expect(r.decisoes.join(' ')).toContain('Afastamento entre blocos: 12 m, a distância entre torres do Empreendimento (no lugar da hipótese de 6 m).');
    expect(r.melhores.length).toBeGreaterThan(0);
    const acima = r.melhores[0].blocos.filter((b) => b.cotaBaseMm >= 0 && b.uso !== 'GARAGEM');
    expect(acima.length).toBeGreaterThanOrEqual(2);
    expect(distanciaEntrePoligonosMm(acima[0].pontos, acima[1].pontos)).toBeGreaterThanOrEqual(12000 - 1);
  });

  it('torres do Empreendimento que não cabem lado a lado no envelope: diz em vez de "0 combinações" calado', () => {
    const r = gerarMassa(com(lote(40, 60), { torres: 5, pavimentosMin: null, pavimentosMax: null }), 1);
    expect(r.melhores).toHaveLength(0);
    expect(r.avisos.join(' ')).toMatch(/Nenhuma implantação com 5 torres.*cabe no envelope.*Seguir o Empreendimento/);
  });

  it('sem a restrição, nada muda (o mesmo resultado de antes)', () => {
    const a = gerarMassa(entrada(lote(40, 60)), 1, { tipos: ['TORRE', 'LAMINA'] });
    const b = gerarMassa(entrada(lote(40, 60), { restricoes: { ...RESTRICOES_PADRAO, doEmpreendimento: null } }), 1, { tipos: ['TORRE', 'LAMINA'] });
    expect(b.melhores.map((c) => c.chave)).toEqual(a.melhores.map((c) => c.chave));
  });
});
