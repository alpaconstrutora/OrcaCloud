/**
 * Catálogo do LANÇAMENTO da Planta — caixas de passagem × encaminhamento pela luz do teto.
 * Plano docs/planos/2026-10-24-preferencia-caixas-de-passagem.md.
 *
 * Pedido (24/10/2026): *"em instalacao residencial não se usa caixas de passagens como sugerido no projeto. Mas nao
 * vamos deixar de oferecer como solucao ao usuário. Incluir em preferencias se ele quer utilizar caixas de passagens
 * ou utilizar prefertencialmente encaminhamentos via luz no teto. o usuário escolhe"*.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATALOGO_DE_LANCAMENTO,
  ITENS_DE_LANCAMENTO,
  OPCOES_CAIXAS_DE_PASSAGEM,
  chaveDeLancamento,
  valorDeLancamento,
} from '../utils/preferencias/catalogoLancamento';
import { CATALOGO_DE_EXIBICAO } from '../utils/preferencias/catalogoExibir';
import type { LinhaDePreferencia } from '../utils/preferencias/resolver';

const linha = (chave: string, valor: unknown, escopo = 'USUARIO'): LinhaDePreferencia =>
  ({ escopo, chave, valor }) as LinhaDePreferencia;

describe('catálogo do lançamento — caixas de passagem', () => {
  it('a chave é planta.lancamento.caixasDePassagem, escopo do USUARIO, e o padrão é PELA_LUZ (decisão do usuário)', () => {
    expect(chaveDeLancamento('caixasDePassagem')).toBe('planta.lancamento.caixasDePassagem');
    const def = ITENS_DE_LANCAMENTO.find((d) => d.item === 'caixasDePassagem');
    expect(def).toBeDefined();
    expect(def!.padrao).toBe('PELA_LUZ');
    expect(def!.tipo).toBe('opcao');
    // Sem sessão a escolha fica no navegador nesta chave — NÃO a antiga `blueprint:eletrodutosCaixas` (sem migração).
    expect(def!.chaveAntiga).toBe('blueprint:lancamento:caixasDePassagem');
  });

  it('as duas opções, com os rótulos do plano', () => {
    expect(OPCOES_CAIXAS_DE_PASSAGEM).toEqual([
      { valor: 'PELA_LUZ', rotulo: 'Preferir o encaminhamento pela luz do teto (sem caixas de passagem)' },
      { valor: 'CAIXAS', rotulo: 'Usar caixas de passagem (NBR 5410: a cada 15 m ou 270° de curvas)' },
    ]);
  });

  it('lê a linha USUARIO válida; valor fora das opções, outro escopo ou outra chave = sem escolha', () => {
    expect(valorDeLancamento([], 'caixasDePassagem')).toBeUndefined();
    expect(valorDeLancamento([linha('planta.lancamento.caixasDePassagem', 'CAIXAS')], 'caixasDePassagem')).toBe('CAIXAS');
    expect(valorDeLancamento([linha('planta.lancamento.caixasDePassagem', 'TALVEZ')], 'caixasDePassagem')).toBeUndefined();
    expect(valorDeLancamento([linha('planta.lancamento.caixasDePassagem', true)], 'caixasDePassagem')).toBeUndefined();
    expect(valorDeLancamento([linha('planta.lancamento.caixasDePassagem', 'CAIXAS', 'ORGANIZACAO')], 'caixasDePassagem')).toBeUndefined();
    expect(valorDeLancamento([linha('planta.exibir.caixasDePassagem', 'CAIXAS')], 'caixasDePassagem')).toBeUndefined();
    expect(valorDeLancamento([linha('planta.lancamento.caixasDePassagem', 'CAIXAS')], 'naoExiste')).toBeUndefined();
  });

  it('o catálogo do hook resolve a definição e a chave; o de exibição não conhece o item (e vice-versa)', () => {
    expect(CATALOGO_DE_LANCAMENTO.definicaoDe('caixasDePassagem')?.padrao).toBe('PELA_LUZ');
    expect(CATALOGO_DE_LANCAMENTO.chaveDe('caixasDePassagem')).toBe('planta.lancamento.caixasDePassagem');
    expect(CATALOGO_DE_LANCAMENTO.definicaoDe('mostrarGrade')).toBeUndefined();
    expect(CATALOGO_DE_EXIBICAO.definicaoDe('caixasDePassagem')).toBeUndefined();
    expect(CATALOGO_DE_EXIBICAO.chaveDe('mostrarGrade')).toBe('planta.exibir.mostrarGrade');
  });
});

describe('trava — o editor não guarda mais as caixas só no navegador', () => {
  const editor = readFileSync(resolve(__dirname, '../components/blueprint/BlueprintEditor.tsx'), 'utf8');

  it("nenhum usePersistedState('blueprint:eletrodutosCaixas' no BlueprintEditor.tsx", () => {
    expect(editor).not.toMatch(/usePersistedState(<[^>]*>)?\(\s*['"]blueprint:eletrodutosCaixas/);
  });

  it('o editor lê a preferência do usuário (catálogo do lançamento) para as hipóteses do eletroduto', () => {
    expect(editor).toMatch(/usePreferenciaDaPlanta<CaixasDePassagem>\(\s*'caixasDePassagem',\s*CATALOGO_DE_LANCAMENTO\s*\)/);
  });
});
