/**
 * D1 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — as exigências de MG pela IT 01 do
 * CBMMG. A transcrição feita pela imagem de cada página (`docs/normas/incendio-mg/
 * it01-anexo-a-tabelas.txt`) é a fonte: o teste relê esse texto e confere, célula a célula, os
 * dados do código. Depois, um caso por tipo de nota.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TABELAS_IT01_MG } from '../utils/blueprintIncendioTabelasMG';
import { exigenciaMG, regraDaNota } from '../utils/blueprintIncendioExigenciasMG';
import { exigenciasDaEdificacao, tipoPorAltura, type ClassificacaoDaEdificacao, type MedidaDeSeguranca } from '../utils/blueprintIncendioClassificacao';

const SIGLA: Record<string, MedidaDeSeguranca> = {
  AV: 'ACESSO_VIATURA', SE: 'SEGURANCA_ESTRUTURAL', CH: 'COMPARTIMENTACAO_HORIZONTAL', CV: 'COMPARTIMENTACAO_VERTICAL',
  SA: 'SAIDAS_EMERGENCIA', PI: 'PLANO_INTERVENCAO', BR: 'BRIGADA', IL: 'ILUMINACAO_EMERGENCIA', DE: 'DETECCAO', AL: 'ALARME',
  SI: 'SINALIZACAO', EX: 'EXTINTORES', HI: 'HIDRANTES', CA: 'CHUVEIROS_AUTOMATICOS', CM: 'CONTROLE_MATERIAIS_ACABAMENTO', CF: 'CONTROLE_FUMACA',
};

/** Os blocos da transcrição: cabeçalho "T<n><parte> p<pág> <grupo> [divisões]" e as linhas de sigla. */
function lerTranscricao() {
  const texto = readFileSync(join(__dirname, '..', 'docs', 'normas', 'incendio-mg', 'it01-anexo-a-tabelas.txt'), 'utf-8');
  const blocos: { tabela: number; pagina: number; grupo: string; linhas: Record<string, string[]>; notas: Record<number, string> }[] = [];
  for (const l of texto.split(/\r?\n/)) {
    const cab = /^T(\d+)[ab]?\s+p(\d+)\s+([A-M])\s+\[/.exec(l);
    if (cab) {
      blocos.push({ tabela: Number(cab[1]), pagina: Number(cab[2]), grupo: cab[3], linhas: {}, notas: {} });
      continue;
    }
    const b = blocos[blocos.length - 1];
    if (!b) continue;
    const lin = /^([A-Z]{2}) ((?:[X-]\S*\s*)+?)\s*(\(.*\))?$/.exec(l.trim());
    if (lin && SIGLA[lin[1]]) b.linhas[SIGLA[lin[1]]] = lin[2].trim().split(/\s+/);
    const nota = /^N(\d+) (.*)$/.exec(l);
    if (nota) b.notas[Number(nota[1])] = nota[2];
  }
  return blocos;
}

function classificacao(divisao: string, alturaM: number, areaM2: number): ClassificacaoDaEdificacao {
  return {
    preset: 'MG_CBMMG',
    divisao: { valor: divisao, origem: 'DECLARADA', motivo: '' },
    grupo: null,
    altura: { valorM: alturaM, origem: 'DECLARADA', descarga: null, ultimo: null },
    tipoPorAltura: tipoPorAltura(alturaM),
    areaTotalM2: areaM2,
    areaPorPavimento: [],
    pavimentos: 1,
    unidades: 0,
    carga: { valorMJm2: 300, origem: 'TABELA', nivel: 'BAIXA' },
    pendencias: [],
  };
}
const estado = (m: MedidaDeSeguranca, d: string, h: number, a: number) => exigenciaMG(m, d, classificacao(d, h, a));

describe('D1 · as tabelas da IT 01 batem com a transcrição, célula a célula', () => {
  const blocos = lerTranscricao();

  it('os 24 blocos das Tabelas 1 a 18 (pp. 28–45), na mesma ordem', () => {
    expect(blocos.map((b) => `${b.tabela}/${b.pagina}/${b.grupo}`)).toEqual(TABELAS_IT01_MG.map((t) => `${t.tabela}/${t.pagina}/${t.grupo}`));
    expect(new Set(blocos.map((b) => b.tabela)).size).toBe(18);
  });

  TABELAS_IT01_MG.forEach((t, i) => {
    it(`Tabela ${t.tabela} (${t.divisoes.join(', ')}): as linhas e as notas`, () => {
      expect(t.linhas).toEqual(blocos[i].linhas);
      // As notas: a parte "a" de uma tabela dividida as escreve na parte "b".
      const notas = Object.keys(blocos[i].notas).length ? blocos[i].notas : blocos.find((b) => b.tabela === t.tabela && Object.keys(b.notas).length)?.notas ?? {};
      expect(t.notas).toEqual(notas);
    });
  });

  it('toda nota citada tem regra — nenhuma cai em "não reconhecida"', () => {
    for (const t of TABELAS_IT01_MG) for (const n of Object.keys(t.notas)) expect(regraDaNota(t, Number(n)), `Tabela ${t.tabela}, nota ${n}`).not.toBeNull();
  });

  it('cada divisão está numa tabela só, e todas as dos grupos A a M estão lá', () => {
    const todas = TABELAS_IT01_MG.flatMap((t) => t.divisoes);
    expect(new Set(todas).size).toBe(todas.length);
    for (const d of ['A-2', 'A-3', 'B-1', 'C-3', 'D-4', 'E-6', 'F-7', 'F-11', 'G-3', 'G-5', 'H-6', 'I-3', 'J-4', 'L-3', 'M-1', 'M-3', 'M-8']) expect(todas).toContain(d);
  });
});

describe('D1 · as notas, uma de cada tipo', () => {
  it('Tabela 1 (A-2): o hidrante em H ≤ 12 só acima de 1.200 m²; o alarme a partir de 30 m; a brigada acima de 54 m', () => {
    expect(estado('HIDRANTES', 'A-2', 9, 1100).estado).toBe('DISPENSADA');
    expect(estado('HIDRANTES', 'A-2', 9, 1300)).toMatchObject({ estado: 'EXIGIDA', fonte: expect.stringContaining('Tabela 1, nota 3') });
    expect(estado('ALARME', 'A-2', 30, 5000).estado).toBe('DISPENSADA');
    expect(estado('ALARME', 'A-2', 31, 5000).estado).toBe('EXIGIDA');
    expect(estado('BRIGADA', 'A-2', 54, 5000).estado).toBe('DISPENSADA');
    expect(estado('BRIGADA', 'A-2', 55, 5000).estado).toBe('EXIGIDA');
    expect(estado('CHUVEIROS_AUTOMATICOS', 'A-2', 80, 9000)).toMatchObject({ estado: 'DISPENSADA', motivo: expect.stringMatching(/não consta na Tabela 1/) });
  });

  it('"área OU condomínio com arruamento": acima da área é exigida; abaixo fica CONDICIONAL, com a condição', () => {
    expect(estado('ACESSO_VIATURA', 'A-2', 9, 1300).estado).toBe('EXIGIDA');
    const abaixo = estado('ACESSO_VIATURA', 'A-2', 9, 800);
    expect(abaixo.estado).toBe('CONDICIONAL');
    expect(abaixo.motivo).toMatch(/arruamento interno/);
  });

  it('nota de população e de auditório: CONDICIONAL; na F-6 a nota própria (100 pessoas) vence a geral (200)', () => {
    expect(estado('CONTROLE_MATERIAIS_ACABAMENTO', 'A-2', 9, 500).motivo).toMatch(/salões de festas e auditórios .*200 pessoas/);
    expect(estado('BRIGADA', 'F-5', 9, 500).motivo).toMatch(/acima de 200 pessoas \(nota 2\)/);
    const f6 = estado('BRIGADA', 'F-6', 9, 500).motivo;
    expect(f6).toMatch(/acima de 100 pessoas \(nota 6\)/);
    expect(f6).not.toMatch(/200/);
  });

  it('nota de divisão: "somente para F-1" dispensa a F-2; "somente para I-2" dispensa a I-1', () => {
    expect(estado('DETECCAO', 'F-1', 9, 2000).estado).toBe('EXIGIDA');
    expect(estado('DETECCAO', 'F-2', 9, 2000)).toMatchObject({ estado: 'DISPENSADA', motivo: expect.stringMatching(/só para F-1/) });
    expect(estado('CHUVEIROS_AUTOMATICOS', 'I-2', 40, 2000).estado).toBe('EXIGIDA');
    expect(estado('CHUVEIROS_AUTOMATICOS', 'I-1', 40, 2000).estado).toBe('DISPENSADA');
  });

  it('E-5/E-6 independem da área na brigada (Tabela 5, nota 4); E-1 só acima de 930 m²', () => {
    expect(estado('BRIGADA', 'E-5', 6, 300).estado).toBe('EXIGIDA');
    expect(estado('BRIGADA', 'E-1', 6, 300).estado).toBe('DISPENSADA');
    expect(estado('BRIGADA', 'E-1', 6, 1000).estado).toBe('EXIGIDA');
  });

  it('Tabela 14, nota 6: a compartimentação horizontal da I-1 cai na térrea e abaixo de 930 m²', () => {
    expect(estado('COMPARTIMENTACAO_HORIZONTAL', 'I-1', 0, 5000).motivo).toMatch(/térrea/);
    expect(estado('COMPARTIMENTACAO_HORIZONTAL', 'I-1', 8, 900).estado).toBe('DISPENSADA');
    expect(estado('COMPARTIMENTACAO_HORIZONTAL', 'I-1', 8, 5000).estado).toBe('EXIGIDA');
  });

  it('coluna única (L, F-7), G-3 acima de 12 m e Tabela 17 sem grade: o texto manda, sem palpite', () => {
    expect(estado('ILUMINACAO_EMERGENCIA', 'L-1', 0, 150).estado).toBe('DISPENSADA'); // nota 1: ≥ 200 m²
    expect(estado('ILUMINACAO_EMERGENCIA', 'L-1', 3, 200).estado).toBe('EXIGIDA');
    // Térrea com 200 m²: a nota 1 exige, mas a A.4.5 isenta abaixo de 50 pessoas — vale a condição.
    expect(estado('ILUMINACAO_EMERGENCIA', 'L-1', 0, 200).estado).toBe('CONDICIONAL');
    expect(estado('PLANO_INTERVENCAO', 'F-7', 3, 100).estado).toBe('CONDICIONAL'); // risco do evento (IT 33)
    expect(estado('SAIDAS_EMERGENCIA', 'G-3', 9, 100).estado).toBe('EXIGIDA');
    expect(estado('SAIDAS_EMERGENCIA', 'G-3', 15, 100).estado).toBe('SEM_TABELA');
    expect(estado('EXTINTORES', 'M-1', 0, 100)).toMatchObject({ estado: 'SEM_TABELA', motivo: expect.stringMatching(/NBR 15661/) });
    expect(estado('EXTINTORES', 'X-9', 0, 100).estado).toBe('SEM_TABELA');
  });

  it('A-1 é isenta (A.4.1 a); iluminação na térrea até 200 m² depende da população (A.4.5)', () => {
    expect(estado('EXTINTORES', 'A-1', 3, 300)).toMatchObject({ estado: 'DISPENSADA', fonte: expect.stringContaining('A.4.1') });
    expect(estado('ILUMINACAO_EMERGENCIA', 'D-1', 0, 180)).toMatchObject({ estado: 'CONDICIONAL', motivo: expect.stringMatching(/50 pessoas/) });
    expect(estado('ILUMINACAO_EMERGENCIA', 'D-1', 0, 250).estado).toBe('EXIGIDA');
  });
});

describe('D1 · o preset MG deixa de ser rascunho', () => {
  it('nenhuma linha em rascunho e nenhum SEM_TABELA numa divisão das tabelas; a fonte cita a tabela', () => {
    const e = exigenciasDaEdificacao(classificacao('A-2', 40, 6000));
    expect(e.temRascunho).toBe(false);
    expect(e.medidas.filter((m) => m.estado === 'SEM_TABELA')).toEqual([]);
    expect(e.medidas.every((m) => /IT 01 do CBMMG/.test(m.fonte ?? ''))).toBe(true);
    expect(e.medidas.find((m) => m.medida === 'PLANO_INTERVENCAO')!.estado).toBe('DISPENSADA'); // não consta na Tabela 1
    expect(e.medidas.find((m) => m.medida === 'COMPARTIMENTACAO_VERTICAL')!.estado).toBe('EXIGIDA');
  });

  it('tipos por altura da IT 08 (Tabela 1): I ≤ 12, II ≤ 30, III ≤ 54, IV acima', () => {
    expect([0, 12, 12.01, 30, 54, 54.1].map((h) => tipoPorAltura(h).tipo)).toEqual(['I', 'I', 'II', 'II', 'III', 'IV']);
  });
});
