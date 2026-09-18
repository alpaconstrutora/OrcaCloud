/**
 * As MEDIDAS DE INSTALAÇÃO do orçamento (18/09/2026). Até aqui o quantitativo
 * somava tubo por bitola e ponto por tipo, e o de-para não tinha como escolher
 * nenhuma delas: nenhuma medida de rede chegava ao orçamento.
 */
import { describe, expect, it } from 'vitest';
import { POLITICA_PADRAO, applyBatch, applyCommand, computeQuantities, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { MEDIDAS, gerarLancamentos, type MapeamentoOrcamento, type MapeamentoResolvido } from '../utils/blueprintBudget';
import { SinapiType, type SinapiItem } from '../types/budget';

const CTX = { studyId: 'estudo-1', studyName: 'Casa', snapshotId: 'snap-1', snapshotHash: 'abcdef0123456789', revision: 1 };

function item(code: string, unit: string): SinapiItem {
  return { code, description: `Item ${code}`, unit, price: 10, type: SinapiType.COMPOSITION, category: 'Material' };
}
function mapa(over: Partial<MapeamentoOrcamento>): MapeamentoOrcamento {
  return {
    id: 'm1', organization_id: 'org', medida: 'AREA_PISO', item_code: '1', phase: 'Instalações', budget_group: 'Hidráulica',
    agrupamento: 'TOTAL', filtro_ambiente: [], active: true, ...over,
  };
}
const resolvido = (m: MapeamentoOrcamento, it: SinapiItem): MapeamentoResolvido[] => [{ mapeamento: m, item: it }];

/** Água fria em dois DNs, um trecho de esgoto e três pontos (dois chuveiros, um vaso). */
function casa() {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const cmds: Command[] = [
    { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(0, 0), b: point(4000, 0), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25 },
    { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(4000, 0), b: point(4000, 2000), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 20 },
    { type: 'AddTrecho', levelId: t, disciplina: 'ESGOTO', a: point(0, 3000), b: point(3000, 3000), cotaAMm: -150, cotaBMm: -210, bitolaMm: 100 },
    { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Chuveiro', at: point(1000, 500), cotaMm: 2100, tipoHidraulico: 'CHUVEIRO' },
    { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Chuveiro 2', at: point(2000, 500), cotaMm: 2100, tipoHidraulico: 'CHUVEIRO' },
    { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'Vaso', at: point(1000, 3000), cotaMm: 0, tipoHidraulico: 'VASO_SANITARIO' },
  ];
  return computeQuantities(applyBatch(base, cmds).model, POLITICA_PADRAO);
}

describe('orçamento · medidas de instalação', () => {
  it('as medidas existem no catálogo com o escopo INSTALACAO e a dimensão certa', () => {
    const ids = MEDIDAS.filter((m) => m.escopo === 'INSTALACAO').map((m) => m.id);
    expect(ids).toEqual(
      expect.arrayContaining(['COMPRIMENTO_TUBO_AGUA_FRIA', 'COMPRIMENTO_TUBO_AGUA_QUENTE', 'COMPRIMENTO_TUBO_ESGOTO', 'COMPRIMENTO_ELETRODUTO', 'CONTAGEM_PONTOS_HIDRAULICOS']),
    );
    expect(MEDIDAS.find((m) => m.id === 'COMPRIMENTO_TUBO_ESGOTO')?.dimensao).toBe('M');
    expect(MEDIDAS.find((m) => m.id === 'CONTAGEM_PONTOS_HIDRAULICOS')?.dimensao).toBe('UN');
  });

  it('tubo de água fria: UMA linha por DN, com o comprimento real; o filtro pega só o DN pedido', () => {
    const q = casa();
    const r = gerarLancamentos(q, resolvido(mapa({ medida: 'COMPRIMENTO_TUBO_AGUA_FRIA', agrupamento: 'POR_ELEMENTO' }), item('1', 'M')), CTX);
    expect(r.divergencias).toHaveLength(0);
    const nomes = r.entries.map((e) => e.location?.room ?? e.description);
    expect(r.entries).toHaveLength(2);
    expect(nomes.join(' ')).toMatch(/DN 25/);
    expect(nomes.join(' ')).toMatch(/DN 20/);
    const dn25 = r.entries.find((e) => /DN 25/.test(e.location?.room ?? ''));
    expect(dn25?.quantity).toBeCloseTo(4, 2);

    const so20 = gerarLancamentos(q, resolvido(mapa({ medida: 'COMPRIMENTO_TUBO_AGUA_FRIA', agrupamento: 'POR_ELEMENTO', filtro_ambiente: ['DN 20'] }), item('1', 'M')), CTX);
    expect(so20.entries).toHaveLength(1);
    expect(so20.entries[0].quantity).toBeCloseTo(2, 2);
  });

  it('esgoto mede a diagonal do caimento; água quente sem trecho não gera linha', () => {
    const q = casa();
    const esg = gerarLancamentos(q, resolvido(mapa({ medida: 'COMPRIMENTO_TUBO_ESGOTO' }), item('1', 'M')), CTX);
    expect(esg.entries).toHaveLength(1);
    expect(esg.entries[0].quantity).toBeCloseTo(Math.hypot(3, 0.06), 3);
    const aq = gerarLancamentos(q, resolvido(mapa({ medida: 'COMPRIMENTO_TUBO_AGUA_QUENTE' }), item('1', 'M')), CTX);
    expect(aq.entries).toHaveLength(0);
  });

  it('pontos hidráulicos: uma linha por classificação e disciplina, contando peças', () => {
    const q = casa();
    const r = gerarLancamentos(q, resolvido(mapa({ medida: 'CONTAGEM_PONTOS_HIDRAULICOS', agrupamento: 'POR_ELEMENTO' }), item('1', 'UN')), CTX);
    expect(r.entries).toHaveLength(2);
    const chuveiros = r.entries.find((e) => /Chuveiro/.test(e.location?.room ?? ''));
    expect(chuveiros?.quantity).toBe(2);
    const vaso = r.entries.find((e) => /Vaso/.test(e.location?.room ?? ''));
    expect(vaso?.quantity).toBe(1);
    expect(vaso?.location?.room).toMatch(/Esgoto/);
  });

  it('a trava de unidade continua valendo: metro de tubo apontado para item em UN é recusado', () => {
    const r = gerarLancamentos(casa(), resolvido(mapa({ medida: 'COMPRIMENTO_TUBO_ESGOTO' }), item('1', 'UN')), CTX);
    expect(r.entries).toHaveLength(0);
    expect(r.divergencias).toHaveLength(1);
  });
});
