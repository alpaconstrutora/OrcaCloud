/**
 * Motor de regras (19/09/2026, E3.2): alvos e variáveis por escopo, os três
 * estados + não avaliada, `quando`, semente, resumo, validação da regra
 * digitada.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { alvosDoEscopo, avaliarRegras, problemasDaRegra, REGRAS_SEMENTE, resumirRegras, type Regra } from '../utils/blueprintRegras';

/** Casa térrea: banheiro 1,10 × 2,25 livres (eixo 1,25 × 2,40) sem janela; sala 4 × 4 livres com janela 1,5 × 1,2; porta de 0,70 no banheiro. */
function casa(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2600 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2600 });
  m = applyBatch(m, [
    w(0, 0, 4150, 0),
    w(4150, 0, 4150, 4150),
    w(4150, 4150, 0, 4150),
    w(0, 4150, 0, 0),
    // banheiro colado à direita: 1,25 × 2,40 de eixo → livre 1,10 × 2,25
    w(4150, 0, 5400, 0),
    w(5400, 0, 5400, 2400),
    w(5400, 2400, 4150, 2400),
  ]).model;
  const sala = m.spaces.find((s) => s.areaMm2 > 10_000_000)!;
  const banho = m.spaces.find((s) => s.areaMm2 < 10_000_000)!;
  const frente = m.walls.find((x) => x.a.y === 0 && x.b.y === 0 && x.b.x === 4150)!;
  const divisa = m.walls.find((x) => x.a.x === 4150 && x.b.x === 4150)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'NameSpace', spaceId: banho.id, name: 'Banho', tipoDeAmbiente: 'BANHEIRO' },
    { type: 'AddOpening', wallId: frente.id, kind: 'window', offsetMm: 1000, widthMm: 1500, heightMm: 1200, sillMm: 1000 },
    { type: 'AddOpening', wallId: divisa.id, kind: 'door', offsetMm: 500, widthMm: 700, heightMm: 2100, sillMm: 0 },
  ]).model;
  return m;
}

describe('alvos e variáveis', () => {
  it('ambiente: área útil, largura mínima, pé-direito, janelas e portas; porta: vão; pavimento; lote/edificação do contexto', () => {
    const m = casa();
    const ambientes = alvosDoEscopo(m, 'AMBIENTE', {});
    const banho = ambientes.find((a) => a.rotulo === 'Banho')!;
    expect(banho.vars).toMatchObject({ tipo: 'BANHEIRO', area: 2.48, largura_min: 1.1, pe_direito: 2.6, area_janelas: 0, area_portas: 1.47, unidade_pcd: false, pavimento: 'Térreo' });
    const sala = ambientes.find((a) => a.rotulo === 'Sala')!;
    expect(sala.vars).toMatchObject({ tipo: 'SALA_DORMITORIO', area: 16, largura_min: 4, area_janelas: 1.8, area_portas: 1.47 });
    expect(sala.selecionarId).toBe(m.labels.find((l) => l.name === 'Sala')!.id);
    const portas = alvosDoEscopo(m, 'PORTA', {});
    expect(portas).toHaveLength(1);
    expect(portas[0].vars).toMatchObject({ largura: 0.7, altura: 2.1, tipo: 'door' });
    expect(alvosDoEscopo(m, 'PAVIMENTO', {})[0].vars).toMatchObject({ nome: 'Térreo', pe_direito: 2.6, ambientes: 2 });
    expect(alvosDoEscopo(m, 'LOTE', {})).toEqual([]);
    const lote = alvosDoEscopo(m, 'LOTE', { lote: { areaM2: 360, perimetroM: 76, testadaM: null }, taxaOcupacaoPct: 55, zona: { taxaOcupacaoMax: 60, testadaMinimaMm: 12000 } })[0];
    expect(lote.vars).toEqual({ area: 360, perimetro: 76, taxa_ocupacao: 55, to_max: 60, testada_min: 12 });
    expect('testada' in lote.vars).toBe(false);
  });
});

describe('avaliação', () => {
  it('semente na casa: banheiro viola área/largura/iluminação, porta de 0,70 viola o vão, sala conforme; lote sem zona → não avaliada com motivo; quando falso não aparece', () => {
    const m = casa();
    const r = avaliarRegras(m, REGRAS_SEMENTE, { lote: { areaM2: 360, perimetroM: 76, testadaM: null }, taxaOcupacaoPct: 55, coeficiente: 0.55, alturaM: 2.6 });
    const de = (id: string, alvo?: string) => r.filter((x) => x.regraId === id && (!alvo || x.alvoRotulo === alvo));
    expect(de('sem-banheiro-area', 'Banho')[0]).toMatchObject({ estado: 'VIOLADA', valores: 'area = 2,48 · tipo = BANHEIRO' }); // 2,48 < 2,5
    expect(de('sem-banheiro-largura', 'Banho')[0]).toMatchObject({ estado: 'VIOLADA', valores: 'largura_min = 1,1 · tipo = BANHEIRO' });
    expect(de('sem-iluminacao-servico', 'Banho')[0].estado).toBe('VIOLADA');
    expect(de('sem-sala-area', 'Sala')[0].estado).toBe('CONFORME');
    expect(de('sem-iluminacao-habitavel', 'Sala')[0].estado).toBe('VIOLADA'); // 1,8 < 16/6 = 2,67
    expect(de('sem-porta-largura')[0]).toMatchObject({ estado: 'VIOLADA', selecionarId: m.openings.find((o) => o.kind === 'door')!.id });
    // Regras de banheiro não aparecem para a sala (quando falso).
    expect(de('sem-banheiro-area', 'Sala')).toHaveLength(0);
    // Lote sem zona: TO máx ausente → não avaliada, com o nome da variável.
    expect(de('sem-lote-to')[0]).toMatchObject({ estado: 'NAO_AVALIADA' });
    expect(de('sem-lote-to')[0].motivo).toMatch(/to_max/);
    // Sem testada (nenhuma frente): não avaliada.
    expect(de('sem-lote-testada')[0].estado).toBe('NAO_AVALIADA');
    // Gabarito sem zona: não avaliada; pé-direito 2,60 ≥ 2,50 conforme.
    expect(de('sem-gabarito-m')[0].estado).toBe('NAO_AVALIADA');
    expect(de('sem-pav-pe-direito')[0].estado).toBe('CONFORME');
    const resumo = resumirRegras(r);
    expect(resumo.violadas).toBeGreaterThanOrEqual(3);
    expect(resumo.naoAvaliadas).toBeGreaterThanOrEqual(4);
    expect(resumo.violadas + resumo.conformes + resumo.naoAvaliadas).toBe(r.length);
  });

  it('regra da organização com condição composta; expressão que não devolve booleano; expressão inválida; validação da regra digitada', () => {
    const m = casa();
    const regras: Regra[] = [
      { id: 'org-1', nome: 'Banheiro PCD 1,50', escopo: 'AMBIENTE', quando: "tipo == 'BANHEIRO' e unidade_pcd", expressao: 'largura_min >= 1.5', severidade: 'ERRO', fonte: 'Org' },
      { id: 'org-2', nome: 'Número', escopo: 'AMBIENTE', expressao: 'area * 2', severidade: 'INFO', fonte: 'Org' },
      { id: 'org-3', nome: 'Quebrada', escopo: 'PORTA', expressao: 'largura >= ', severidade: 'ERRO', fonte: 'Org' },
    ];
    let r = avaliarRegras(m, regras);
    expect(r.filter((x) => x.regraId === 'org-1')).toHaveLength(0); // nenhum banheiro em unidade PCD
    expect(r.filter((x) => x.regraId === 'org-2').every((x) => x.estado === 'NAO_AVALIADA' && /não sim\/não/.test(x.motivo ?? ''))).toBe(true);
    expect(r.filter((x) => x.regraId === 'org-3')[0]).toMatchObject({ estado: 'NAO_AVALIADA' });
    expect(r.filter((x) => x.regraId === 'org-3')[0].motivo).toMatch(/expressão inválida/);
    // O banheiro numa unidade PCD: a regra passa a valer e acusa 1,35 < 1,50.
    const banho = m.labels.find((l) => l.name === 'Banho')!;
    const comPcd = applyCommand(m, { type: 'AddUnidade', numero: '101', pcd: true, labelIds: [banho.id] }).model;
    r = avaliarRegras(comPcd, regras);
    expect(r.filter((x) => x.regraId === 'org-1')[0]).toMatchObject({ estado: 'VIOLADA', alvoRotulo: 'Banho' }); // 1,10 < 1,50
    // Validação.
    expect(problemasDaRegra({ nome: '', escopo: 'AMBIENTE', expressao: 'area >= 2', quando: null })).toEqual(['Dê um nome à regra.']);
    expect(problemasDaRegra({ nome: 'x', escopo: 'AMBIENTE', expressao: 'largura >= 2', quando: null })).toEqual(['expressão: variável "largura" não existe no escopo Ambiente.']);
    expect(problemasDaRegra({ nome: 'x', escopo: 'PORTA', expressao: 'largura >= 0.8', quando: "tipo == 'door'" })).toEqual([]);
    expect(problemasDaRegra({ nome: 'x', escopo: 'PORTA', expressao: '', quando: null })).toEqual(['A expressão está vazia.']);
  });
});
