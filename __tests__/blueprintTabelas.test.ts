/**
 * TABELAS PERSONALIZADAS (21/09/2026, backlog P2 — P2.16): definição
 * sanitizada, colunas disponíveis, montagem com filtro/grupo/ordem/totais,
 * planilha e sementes.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { celula, colunasDisponiveis, definicaoDaColuna, faltamSementesDeTabela, montarTabela, SEMENTES_DE_TABELAS, tabelaParaPlanilha, validarDefinicao } from '../utils/blueprintTabelas';

function casa() {
  let m = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 },
    { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 2800 },
  ]).model;
  const [t0, t1] = m.levels.map((l) => l.id);
  const w = (lvl: string, ax: number, ay: number, bx: number, by: number, e = 150): Command => ({ type: 'AddWall', levelId: lvl, a: point(ax, ay), b: point(bx, by), thicknessMm: e, heightMm: 3000 });
  m = applyBatch(m, [w(t0, 0, 0, 6000, 0, 200), w(t0, 6000, 0, 6000, 4000, 200), w(t0, 6000, 4000, 0, 4000, 200), w(t0, 0, 4000, 0, 0, 200), w(t0, 3000, 0, 3000, 4000), w(t1, 0, 0, 5000, 0)]).model;
  const w0 = m.walls[0].id;
  m = applyBatch(m, [
    { type: 'AddOpening', wallId: w0, kind: 'door', offsetMm: 500, widthMm: 900, heightMm: 2100, sillMm: 0 } as Command,
    { type: 'AddOpening', wallId: w0, kind: 'window', offsetMm: 2000, widthMm: 1500, heightMm: 1200, sillMm: 1000 } as Command,
    { type: 'AddOpening', wallId: w0, kind: 'door', offsetMm: 4000, widthMm: 800, heightMm: 2100, sillMm: 0 } as Command,
  ]).model;
  m = applyCommand(m, { type: 'SetParametros', familia: 'wall', id: m.walls[4].id, valores: { custo_interno: 120 } }).model;
  return { m, t0, t1 };
}

describe('tabelas personalizadas (P2.16)', () => {
  it('definição sanitizada e validada; colunas disponíveis = nativas + pavimento + parâmetros', () => {
    const { m } = casa();
    const d = definicaoDaColuna({ nome: ' Minha ', familia: 'opening', colunas: [{ chave: 'largura', total: 'SOMA' }, { chave: 'x y' }, 7, { chave: 'tipo', rotulo: '  Tipo  ', total: 'NADA' }], filtro: 'tipo == "porta"', agruparPor: 'tipo', ordenarPor: 'bad key', ordem: 'DESC' });
    expect(d).toEqual({ nome: 'Minha', familia: 'opening', colunas: [{ chave: 'largura', total: 'SOMA' }, { chave: 'tipo', rotulo: 'Tipo', total: null }], filtro: 'tipo == "porta"', agruparPor: 'tipo', ordenarPor: null, ordem: 'DESC' });
    expect(definicaoDaColuna(null, 'x').familia).toBe('wall');
    expect(validarDefinicao({ ...d, nome: '', colunas: [] })).toEqual(['Dê um nome à tabela.', 'Escolha ao menos uma coluna.']);
    expect(validarDefinicao({ ...d, filtro: 'largura >' })[0]).toMatch(/Filtro inválido/);
    expect(validarDefinicao({ ...d, colunas: [{ chave: 'a' }, { chave: 'a' }] })).toEqual(['Coluna repetida: a.']);
    const cols = colunasDisponiveis(m, 'wall', [{ chave: 'fabricante', familia: null, unidade: 'texto' }, { chave: 'peso', familia: 'opening', unidade: 'kg' }]);
    const chaves = cols.map((c) => c.chave);
    expect(chaves).toEqual(expect.arrayContaining(['comprimento', 'espessura', 'area', 'pavimento.nome', 'fabricante', 'custo_interno']));
    expect(chaves).not.toContain('peso'); // é de outra família
    expect(cols.find((c) => c.chave === 'custo_interno')!.origem).toBe('PARAMETRO');
  });

  it('montar: filtro, agrupamento por pavimento, ordenação, totais por grupo e geral, célula vazia para coluna ausente', () => {
    const { m } = casa();
    const t = montarTabela(m, {
      nome: 'Paredes',
      familia: 'wall',
      colunas: [{ chave: 'comprimento', rotulo: 'Comp. (m)', total: 'SOMA' }, { chave: 'espessura' }, { chave: 'custo_interno', total: 'SOMA' }, { chave: 'nao_existe' }],
      filtro: 'espessura >= 0.15',
      agruparPor: 'pavimento.nome',
      ordenarPor: 'comprimento',
      ordem: 'DESC',
    });
    expect(t.pecas).toBe(6);
    expect(t.linhas).toBe(6);
    expect(t.erroDoFiltro).toBeNull();
    expect(t.grupos.map((g) => g.rotulo)).toEqual(['1º', 'Térreo']);
    const terreo = t.grupos[1];
    expect(terreo.linhas).toHaveLength(5);
    expect(terreo.linhas.map((l) => l.valores[0])).toEqual([6, 6, 4, 4, 4]); // decrescente
    expect(terreo.totais[0]).toBe(24);
    expect(terreo.totais[2]).toBe(120); // só a parede com o parâmetro
    expect(terreo.linhas.every((l) => l.valores[3] === null)).toBe(true);
    expect(t.totais[0]).toBe(29);
    expect(t.colunas.map((c) => c.rotulo)).toEqual(['Comp. (m)', 'espessura', 'custo_interno', 'nao_existe']);
    expect(t.grupos[1].linhas[0].rotulo).toMatch(/^P-/);
    // Filtro que exclui: as de 15 cm.
    const grossas = montarTabela(m, { nome: 'g', familia: 'wall', colunas: [{ chave: 'comprimento', total: 'CONTAGEM' }], filtro: 'espessura == 0.2', agruparPor: null, ordenarPor: null, ordem: 'ASC' });
    expect(grossas.linhas).toBe(4);
    expect(grossas.totais[0]).toBe(4);
    // Filtro com erro de avaliação (variável inexistente): linhas fora, erro reportado uma vez.
    const ruim = montarTabela(m, { nome: 'r', familia: 'wall', colunas: [{ chave: 'comprimento' }], filtro: 'xyz > 1', agruparPor: null, ordenarPor: null, ordem: 'ASC' });
    expect(ruim.linhas).toBe(0);
    expect(ruim.erroDoFiltro).toBeTruthy();
    // Esquadrias agrupadas por tipo, com média.
    const esq = montarTabela(m, { nome: 'e', familia: 'opening', colunas: [{ chave: 'tipo' }, { chave: 'largura', total: 'MEDIA' }, { chave: 'area', total: 'SOMA' }], filtro: '', agruparPor: 'tipo', ordenarPor: 'largura', ordem: 'ASC' });
    expect(esq.grupos.map((g) => [g.rotulo, g.linhas.length])).toEqual([['janela', 1], ['porta', 2]]);
    expect(esq.grupos[1].totais[1]).toBe(0.85);
    expect(esq.grupos[1].linhas.map((l) => l.valores[1])).toEqual([0.8, 0.9]);
    // Planilha: título, cabeçalho, grupos com subtotal e total.
    const linhas = tabelaParaPlanilha(esq);
    expect(linhas[0]).toEqual(['e']);
    expect(linhas[1]).toEqual(['Peça', 'tipo', 'largura', 'area']);
    expect(linhas.some((l) => l[0] === 'tipo: porta')).toBe(true);
    expect(linhas.filter((l) => l[0] === 'Subtotal')).toHaveLength(2);
    expect(linhas[linhas.length - 1][0]).toBe('Total');
    expect(celula(0.85)).toBe('0,85');
    expect(celula(true)).toBe('sim');
    expect(celula(null)).toBe('');
    // Sementes: quatro, todas válidas e montáveis; a que já existe pelo nome sai.
    expect(SEMENTES_DE_TABELAS).toHaveLength(4);
    for (const s of SEMENTES_DE_TABELAS) {
      expect(validarDefinicao(s)).toEqual([]);
      expect(() => montarTabela(m, s)).not.toThrow();
    }
    expect(faltamSementesDeTabela([{ nome: 'quadro de esquadrias' }])).toHaveLength(3);
    expect(montarTabela(m, SEMENTES_DE_TABELAS[0]).grupos.map((g) => g.rotulo)).toEqual(['janela', 'porta']);
  });
});
