/**
 * ESTUDO DE MASSA, fase M5c (02/10/2026): a conversa no vocabulário do produto
 * (§23 do pedido). O pedido vira mudanças ESTRUTURADAS no produto e na
 * configuração do gerador — nunca geometria —, validadas aqui; o gerador
 * re-gera e o delta compara o melhor de antes com o de depois.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { produtoSemente } from '../utils/blueprintProduto';
import { CONFIGURACAO_DO_GERADOR_DE_MASSA_PADRAO, gerarMassa } from '../utils/blueprintGeradorDeMassa';
import { aplicarMudancasDaMassa, deltaDaMassa, interpretarPedidoDaMassaLocal, mudancasDaMassaDaResposta, tipologiaPorAlvo } from '../utils/blueprintIaDaMassa';

const PRODUTO = produtoSemente('RESIDENCIAL_MEDIO'); // 2 dorm. 58 m² (50 %) · 3 dorm. 75 m² (50 %)
const CFG = CONFIGURACAO_DO_GERADOR_DE_MASSA_PADRAO;
const pedir = (texto: string) => {
  const m = interpretarPedidoDaMassaLocal(texto, PRODUTO);
  expect(m, texto).not.toBeNull();
  return aplicarMudancasDaMassa(m!, PRODUTO, CFG);
};

describe('conversa da massa — intérprete local + aplicação', () => {
  it('"duas torres com apartamentos entre 65 e 75 m²": só duas torres; o 2 dorm. sobe para 65, o 3 dorm. já está na faixa', () => {
    const r = pedir('Quero duas torres com apartamentos entre 65 e 75 m²');
    expect(r.configuracao.hipoteses.tipos).toEqual(['DUAS_TORRES']);
    expect(r.produto.tipologias.map((t) => t.areaPrivativaM2)).toEqual([65, 75]);
    expect(r.aplicadas.join(' | ')).toMatch(/2 dorm\.: 58 → 65 m² \(faixa 65–75\).*3 dorm\. \(1 suíte\): 75 m² já está na faixa/);
    expect(r.recusadas).toEqual([]);
    // O produto de entrada não muda (a tela guarda o "antes" para desfazer).
    expect(PRODUTO.tipologias[0].areaPrivativaM2).toBe(58);
  });

  it('"reduzir área comum" vira o objetivo; pavimentos, unidades mínimas e "sem subsolo" viram restrições', () => {
    expect(pedir('Precisamos reduzir área comum').configuracao.objetivo).toBe('MENOR_COMUM');
    const r = pedir('no máximo 12 pavimentos, sem subsolo e pelo menos 60 apartamentos');
    expect(r.configuracao.restricoes.pavimentosMax).toBe(12);
    expect(r.configuracao.restricoes.unidadesMin).toBe(60);
    expect(r.configuracao.hipoteses.estacionamento).toBe('PILOTIS');
    expect(pedir('maximizar o lucro').configuracao.objetivo).toBe('RESULTADO');
    expect(pedir('mais sol nas fachadas').configuracao.objetivo).toBe('INSOLACAO');
    expect(pedir('2 subsolos').configuracao.hipoteses.estacionamento).toBe('SUBSOLO_2');
    expect(pedir('não exigir vagas').configuracao.restricoes.atenderVagas).toBe(false);
  });

  it('mix, área e preço por tipologia; os outros do mesmo uso dividem o resto do mix', () => {
    const mix = pedir('60% de 2 dorm');
    expect(mix.produto.tipologias.map((t) => t.proporcaoPct)).toEqual([60, 40]);
    expect(pedir('3 quartos com 80 m²').produto.tipologias[1].areaPrivativaM2).toBe(80);
    expect(pedir('2 dorm +4 m2').produto.tipologias[0].areaPrivativaM2).toBe(62);
    const mais5 = pedir('aumente o preço em 5%');
    expect(mais5.produto.tipologias.map((t) => t.precoM2)).toEqual([8925, 9240]);
    expect(pedir('preço de 9.500/m²').produto.tipologias.map((t) => t.precoM2)).toEqual([9500, 9500]);
  });

  it('adicionar e remover tipologia; padrão do CUB; o que não existe é recusado e dito', () => {
    const add = pedir('adicione um studio de 32 m²');
    const studio = add.produto.tipologias.find((t) => t.nome === 'Studio')!;
    expect(studio).toMatchObject({ uso: 'RESIDENCIAL', dormitorios: 0, areaPrivativaM2: 32, precoM2: Math.round((8500 + 8800) / 2) });
    expect(pedir('sem 3 quartos').produto.tipologias.map((t) => t.nome)).toEqual(['2 dorm.']);
    expect(pedir('padrão R16-A').produto.padrao).toBe('R16-A');
    const rec = pedir('padrão X9-Z e sem 5 quartos');
    expect(rec.recusadas.join(' | ')).toMatch(/padrão "X9-Z" não é um padrão do CUB/);
    expect(rec.recusadas.join(' | ')).toMatch(/não achei a tipologia "5 quartos"/);
    expect(tipologiaPorAlvo(PRODUTO, 'studio')).toBeNull();
    expect(tipologiaPorAlvo(PRODUTO, '3 dorm')!.id).toBe('3q');
  });

  it('o que não é pedido de massa não vira mudança; a resposta da IA é validada', () => {
    expect(interpretarPedidoDaMassaLocal('bom dia, tudo bem?', PRODUTO)).toBeNull();
    const ia = mudancasDaMassaDaResposta({ entendimento: 'x', gerador: { tipos: ['DUAS_TORRES', 'PIRAMIDE', 3], objetivo: 'VGV', pavimentosMax: 'dez' }, produto: { tipologias: [{ op: 'faixa_de_area', minM2: 65, maxM2: 75 }, 'lixo'] } });
    expect(ia!.gerador).toEqual({ tipos: ['DUAS_TORRES', 'PIRAMIDE'], objetivo: 'VGV' });
    const r = aplicarMudancasDaMassa(ia!, PRODUTO, CFG);
    expect(r.configuracao.hipoteses.tipos).toEqual(['DUAS_TORRES']);
    expect(r.recusadas).toEqual(['implantação desconhecida: PIRAMIDE']);
    expect(mudancasDaMassaDaResposta('texto solto')).toBeNull();
    // Faixa absurda e área fora do razoável: recusadas.
    expect(aplicarMudancasDaMassa({ entendimento: '', produto: { tipologias: [{ op: 'faixa_de_area', minM2: 2, maxM2: 3 }, { op: 'area', alvo: '2 dorm', areaM2: 5000 }] } }, PRODUTO, CFG).recusadas).toHaveLength(2);
  });

  it('de ponta a ponta: o pedido re-gera e o delta compara o melhor de antes com o de depois', () => {
    let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
    const t = m.levels[0].id;
    const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
    m = applyBatch(m, [d(0, 0, 40000, 0, 'FRENTE'), d(40000, 0, 40000, 60000, 'LATERAL_DIREITA'), d(40000, 60000, 0, 60000, 'FUNDOS'), d(0, 60000, 0, 0, 'LATERAL_ESQUERDA')]).model;
    const regua = { zona: { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: 60, coeficienteMax: 3, gabaritoPavimentos: 12 }, recuosBase: { FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 }, cub: { valorM2: 2000, fonte: 'TABELA' as const, referencia: 'teste' }, vagasPorUnidadeDaZona: null };
    const antes = gerarMassa({ model: m, regua: { ...regua, produto: PRODUTO }, objetivo: CFG.objetivo, restricoes: CFG.restricoes }, 1, CFG.hipoteses);
    const r = pedir('duas torres com apartamentos entre 65 e 75 m2');
    const depois = gerarMassa({ model: m, regua: { ...regua, produto: r.produto }, objetivo: r.configuracao.objetivo, restricoes: r.configuracao.restricoes }, 1, r.configuracao.hipoteses);
    expect(depois.melhores.map((c) => c.parametros.tipo)).toEqual(['DUAS_TORRES']);
    const texto = deltaDaMassa(antes.melhores[0], depois.melhores[0]);
    expect(texto).toMatch(/^melhor: .+ → Duas torres · /);
    expect(texto).toMatch(/unidades \d+ → \d+ \([+-]\d+\)/);
    expect(deltaDaMassa(antes.melhores[0], antes.melhores[0])).toMatch(/\(a mesma\) · indicadores iguais/);
    expect(deltaDaMassa(antes.melhores[0], null)).toMatch(/nenhuma implantação atende/);
    // O que formata igual não aparece como mudança.
    const quase = { ...antes.melhores[0], cenario: { ...antes.melhores[0].cenario, areaComumPorUnidadeM2: (antes.melhores[0].cenario.areaComumPorUnidadeM2 ?? 0) + 0.001 } };
    expect(deltaDaMassa(antes.melhores[0], quase)).not.toMatch(/área comum/);
  });
});
