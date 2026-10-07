/**
 * INCÊNDIO E9.1 (01/10/2026, quant-1.24.0): a peça se compra pela
 * ESPECIFICAÇÃO (extintor por agente × carga × capacidade, placa pelo código,
 * sprinkler por K × posição), o incêndio entra no orçamento por peça e a lista
 * de materiais de incêndio sai na folha e no XLSX.
 */
import { describe, expect, it } from 'vitest';
import { KERNEL_VERSION, POLITICA_PADRAO, applyBatch, applyCommand, computeQuantities, emptyModel, especificacaoDoTerminal, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { gerarLancamentosDeInstalacoes } from '../utils/blueprintBudget';
import { abaDaListaDeMateriaisIncendio, materiaisDeIncendio, temMateriaisDeIncendio } from '../utils/blueprintListaDeMateriaisIncendio';
import { DesenhistaDeProva, PAPEIS, desenharFolhaDaListaDeMateriaisIncendio, enquadrar, orientar, type OpcoesExportacao } from '../utils/blueprintExport';
import { planejarConjunto, TEMPLATE_DE_PRANCHA_PADRAO } from '../utils/blueprintPranchas';
import type { SinapiItem } from '../types';

const item = (code: string, unit: string): SinapiItem => ({ code, description: code, unit, price: 10, source: 'SINAPI' }) as unknown as SinapiItem;
const CTX = { studyId: 'std', studyName: 'Prédio', snapshotId: 'snp', snapshotHash: 'h'.repeat(20), revision: 1 };
const papel = orientar(PAPEIS.find((x) => x.id === 'A3') ?? PAPEIS[0], true);
const opcoes = (): OpcoesExportacao => ({ denominador: 0, papel, titulo: 'Prédio', revisao: 1, hash: 'h'.repeat(64), data: new Date('2026-10-01T12:00:00Z') });

/** Dois pavimentos: bomba → coluna → 2 hidrantes (com código); 3 extintores (2 de pó ABC 4 kg e 1 de CO₂ 6 kg, mesmo código); 3 placas; 2 sprinklers K80. */
function predio(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 2800 }).model;
  const [t, s] = m.levels.map((l) => l.id);
  const tr = (l: string, ax: number, ca: number, bx: number, cb: number, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, 0), b: point(bx, 0), cotaAMm: ca, cotaBMm: cb, bitolaMm: 65, ...extra }) as Command;
  const p = (l: string, tipo: string, x: number, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: point(x, 1000), cotaMm: 1300, ...extra }) as Command;
  return applyBatch(m, [
    tr(t, 0, 300, 0, 2800, { itemCode: 'TUBO65' }),
    tr(t, 0, 2600, 10000, 2600, { itemCode: 'TUBO65' }),
    tr(s, 0, 0, 0, 1300, { itemCode: 'TUBO65' }),
    tr(s, 0, 1300, 5000, 1300, { itemCode: 'TUBO65' }),
    p(t, 'HIDRANTE_SIMPLES', 10000, { itemCode: 'HID' }),
    p(s, 'HIDRANTE_SIMPLES', 5000, { itemCode: 'HID' }),
    p(t, 'EXTINTOR', 2000, { agenteExtintor: 'PQS_ABC', cargaExtintorKg: 4, itemCode: 'EXT' }),
    p(s, 'EXTINTOR', 2000, { agenteExtintor: 'PQS_ABC', cargaExtintorKg: 4, itemCode: 'EXT' }),
    p(t, 'EXTINTOR', 4000, { agenteExtintor: 'CO2', cargaExtintorKg: 6, itemCode: 'EXT' }),
    p(t, 'PLACA', 6000, { codigoPlaca: 'S12' }),
    p(s, 'PLACA', 6000, { codigoPlaca: 'S12' }),
    p(t, 'PLACA', 7000, { codigoPlaca: 'E5' }),
    p(s, 'SPRINKLER', 8000, { fatorK: 80, posicaoSprinkler: 'PENDENTE' }),
    p(s, 'SPRINKLER', 9000, { fatorK: 80, posicaoSprinkler: 'PENDENTE' }),
  ]).model;
}

describe('E9.1 · o quantitativo pela especificação (quant-1.24.0)', () => {
  it('⚠️ PRONTO QUANDO: a política subiu, e extintor de pó ABC 4 kg e de CO₂ 6 kg são DUAS linhas de compra', () => {
    expect(POLITICA_PADRAO.version).toBe('quant-1.25.0');
    const q = computeQuantities(predio(), POLITICA_PADRAO, KERNEL_VERSION);
    const ext = q.totais.porTerminal.filter((x) => x.classificacao === 'EXTINTOR').map((x) => [x.especificacao, x.quantidade]);
    expect(ext).toEqual([['CO2 · 6 kg', 1], ['PQS_ABC · 4 kg', 2]]);
    const placas = q.totais.porTerminal.filter((x) => x.classificacao === 'PLACA').map((x) => [x.especificacao, x.quantidade]);
    expect(placas).toEqual([['E5', 1], ['S12', 2]]);
    expect(q.totais.porTerminal.find((x) => x.classificacao === 'SPRINKLER')).toMatchObject({ especificacao: 'K80 · PENDENTE', quantidade: 2 });
    // Peça sem nada declarado: especificação nula, como antes.
    expect(q.totais.porTerminal.find((x) => x.classificacao === 'HIDRANTE_SIMPLES')).toMatchObject({ especificacao: null, quantidade: 2 });
  });

  it('a especificação só junta o que a peça DECLARA', () => {
    const base = predio().terminais![0];
    expect(especificacaoDoTerminal({ ...base, agenteExtintor: 'CO2', cargaExtintorKg: 4.5, capacidadeExtintora: '5-B:C' })).toBe('CO2 · 4,5 kg · 5-B:C');
    expect(especificacaoDoTerminal({ ...base, autonomiaMin: 120 })).toBe('120 min');
    expect(especificacaoDoTerminal(base)).toBeNull();
  });
});

describe('E9.1 · o orçamento por peça e tubo de incêndio', () => {
  it('peça e tubo de incêndio com código viram linhas "de incêndio"; o mesmo código em duas especificações não colide', () => {
    const q = computeQuantities(predio(), POLITICA_PADRAO, KERNEL_VERSION);
    const r = gerarLancamentosDeInstalacoes(q, new Map([['HID', item('HID', 'UN')], ['EXT', item('EXT', 'UN')], ['TUBO65', item('TUBO65', 'M')]]), CTX);
    expect(r.divergencias).toEqual([]);
    const ext = r.entries.filter((e) => e.sinapiItem.code === 'EXT');
    expect(ext.map((e) => e.quantity).sort()).toEqual([1, 2]);
    expect(new Set(ext.map((e) => e.id)).size).toBe(2);
    // A peça SEM especificação mantém o id de antes da 1.24.0 (o lançamento já gravado não duplica).
    expect(r.entries.find((e) => e.sinapiItem.code === 'HID')!.id).toBe('bp:std:instalacao:peca:INCENDIO:HIDRANTE_SIMPLES:HID');
    expect(ext.every((e) => e.group === 'Instalações de incêndio — peças · Incêndio')).toBe(true);
    const tubo = r.entries.find((e) => e.sinapiItem.code === 'TUBO65')!;
    expect(tubo.group).toBe('Instalações de incêndio — tubos · Incêndio');
    // 2,5 + 10 + 1,3 + 5 = 18,8 m.
    expect(tubo.quantity).toBeCloseTo(18.8, 6);
  });
});

describe('E9.1 · a lista de materiais de incêndio', () => {
  it('tubos, conexões e peças por grupo, com o agente pelo nome; por pavimento o tubo REAL e as peças', () => {
    const m = materiaisDeIncendio(predio());
    expect([...new Set(m.totais.map((l) => l.grupo))]).toEqual(['Tubulação', 'Conexões', 'Combate', 'Preventivos']);
    expect(m.totais.find((l) => l.grupo === 'Tubulação')).toMatchObject({ unidade: 'm', itemCode: 'TUBO65' });
    expect(m.totais.find((l) => l.grupo === 'Tubulação')!.item).toMatch(/DN 65$/);
    const itens = m.totais.map((l) => l.item);
    expect(itens).toContain('Extintor — CO₂ · 6 kg');
    expect(itens).toContain('Extintor — Pó ABC · 4 kg');
    expect(itens).toContain('Chuveiro automático (sprinkler) — K80 · pendente');
    expect(m.porPavimento).toEqual([
      { nome: 'Térreo', tuboM: expect.closeTo(12.5, 6), pecas: 5 },
      { nome: '1º', tuboM: expect.closeTo(6.3, 6), pecas: 5 },
    ]);
    const aba = abaDaListaDeMateriaisIncendio(m);
    expect(aba.nome).toBe('Incêndio — materiais');
    expect(aba.linhas).toContainEqual(['Preventivos', 'Extintor — CO₂ · 6 kg', 1, 'un', 'EXT']);
  });

  it('a folha desenha a lista; o conjunto ganha a folha por último; sem incêndio, nada', () => {
    const m = predio();
    const d = new DesenhistaDeProva();
    desenharFolhaDaListaDeMateriaisIncendio(d, m, opcoes(), enquadrar(m, 100, papel, false));
    const t = d.textos().join(' | ');
    expect(t).toMatch(/LISTA DE MATERIAIS — INCÊNDIO/);
    expect(t).toMatch(/TOTAL DO DESENHO/);
    expect(t).toMatch(/POR PAVIMENTO/);
    const tpl = { ...TEMPLATE_DE_PRANCHA_PADRAO, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, indice: false, plantas: false, cortes: false, elevacoes: false, ampliacoes: false, tabelas: false, incendio: true } };
    expect(planejarConjunto(m, tpl).map((p) => p.tipo).at(-1)).toBe('MATERIAIS_INCENDIO');
    const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    expect(temMateriaisDeIncendio(vazio)).toBe(false);
    expect(planejarConjunto(vazio, tpl).some((p) => p.tipo === 'MATERIAIS_INCENDIO')).toBe(false);
  });
});
