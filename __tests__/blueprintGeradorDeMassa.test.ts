/**
 * ESTUDO DE MASSA, fase M5 (02/10/2026): o gerador de implantações e o
 * otimizador (§7, §8, §10, §18 do pedido). "Pronto quando": os três cenários do
 * exemplo do pedido (torre única, duas torres, bloco longitudinal) saem do
 * gerador para um lote de prova, reprodutíveis pela semente; Pareto testado.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { produtoSemente, vagasQueCabem } from '../utils/blueprintProduto';
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
