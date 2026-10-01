/**
 * D1.3 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — as atividades da IT 09 do CBMMG
 * (Tabela A.1). A transcrição (`docs/normas/incendio-mg/it09-tabela-a1.tsv`) é a fonte: o teste
 * confere os dados do código linha a linha contra ela, e a classificação pela atividade.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyCommand, emptyModel } from '../utils/blueprintKernel';
import { ATIVIDADES_IT09 } from '../utils/blueprintIncendioAtividadesMG';
import { TABELAS_IT01_MG } from '../utils/blueprintIncendioTabelasMG';
import { HIPOTESES_INCENDIO_PADRAO, atividadeDoRotulo, classificarEdificacao, hipotesesIncendioDaColuna, rotuloDaAtividade } from '../utils/blueprintIncendioClassificacao';

const linhas = readFileSync(join(__dirname, '..', 'docs', 'normas', 'incendio-mg', 'it09-tabela-a1.tsv'), 'utf-8')
  .split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split('\t'));

describe('D1.3 · a Tabela A.1 da IT 09 bate com a transcrição', () => {
  it('as 605 atividades, na ordem: descrição, divisão e carga (ou a nota)', () => {
    expect(linhas).toHaveLength(605);
    expect(ATIVIDADES_IT09).toHaveLength(605);
    linhas.forEach(([, div, carga, desc], i) => {
      const a = ATIVIDADES_IT09[i];
      expect([a[0], a[1]], `linha ${i + 1}`).toEqual([desc, div]);
      if (/^\d+$/.test(carga)) expect(a[2], desc).toBe(Number(carga));
      else expect([a[2], a[3]], desc).toEqual([null, carga]);
    });
  });

  it('amostras conferidas pela imagem (pp. 6, 13, 17, 21)', () => {
    const de = (r: string) => atividadeDoRotulo(r);
    expect(de('Edifícios de apartamentos (A-2)')?.[2]).toBe(300);
    expect(de('Hospitais em geral (H-3)')?.[2]).toBe(300);
    expect(de('Quartéis (H-4)')?.[2]).toBe(700);
    expect(de('Extração de petróleo e gás natural (I-3)')?.[2]).toBe(4000);
    expect(de('Gelo (I-1)')?.[2]).toBe(80);
    expect(de('Silos (M-5)')).toEqual(['Silos', 'M-5', null, 'Anexo C']);
  });

  it('toda divisão está nas tabelas da IT 01; o rótulo é único (a mesma descrição no comércio e na indústria)', () => {
    const divisoes = new Set([...TABELAS_IT01_MG.flatMap((t) => t.divisoes), 'A-1']); // A-1: isenta (IT 01, A.4.1 a), fora das tabelas
    for (const a of ATIVIDADES_IT09) expect(divisoes.has(a[1]), `${a[0]} (${a[1]})`).toBe(true);
    const rotulos = ATIVIDADES_IT09.map(rotuloDaAtividade);
    expect(new Set(rotulos).size).toBe(rotulos.length);
    expect(atividadeDoRotulo('Massas alimentícias (C-2)')?.[1]).toBe('C-2');
    expect(atividadeDoRotulo('Massas alimentícias (I-2)')?.[1]).toBe('I-2');
  });
});

describe('D1.3 · a classificação pela atividade', () => {
  const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const hip = (extra: object) => ({ ...HIPOTESES_INCENDIO_PADRAO.classificacao, ...extra });

  it('a atividade dá a divisão e a carga (tabela da IT 09)', () => {
    const c = classificarEdificacao(vazio, hip({ atividade: 'Quartéis (H-4)' }));
    expect(c.divisao).toMatchObject({ valor: 'H-4', origem: 'TABELA' });
    expect(c.carga).toMatchObject({ valorMJm2: 700, origem: 'TABELA', nivel: 'MEDIA' });
  });

  it('declarado vence: a divisão declarada diferente da atividade vira pendência; a carga declarada substitui a da tabela', () => {
    const c = classificarEdificacao(vazio, hip({ atividade: 'Quartéis (H-4)', divisao: 'D-1', cargaDeclaradaMJm2: 900 }));
    expect(c.divisao.valor).toBe('D-1');
    expect(c.carga).toMatchObject({ valorMJm2: 900, origem: 'DECLARADA' });
    expect(c.pendencias.join(' ')).toMatch(/é da divisão H-4 na IT 09, mas a divisão declarada é D-1/);
  });

  it('a carga que remete ao Anexo C pede a declaração; a atividade desconhecida é descartada ao ler a coluna', () => {
    const c = classificarEdificacao(vazio, hip({ atividade: 'Silos (M-5)' }));
    expect(c.carga.valorMJm2).toBeNull();
    expect(c.pendencias.join(' ')).toMatch(/segue "Anexo C" da IT 09 — declare-a/);
    expect(hipotesesIncendioDaColuna({ classificacao: { atividade: 'não existe' } }).classificacao.atividade).toBeNull();
    expect(hipotesesIncendioDaColuna({ classificacao: { atividade: 'Gelo (I-1)' } }).classificacao.atividade).toBe('Gelo (I-1)');
  });
});
