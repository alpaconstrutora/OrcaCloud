/**
 * O documento da versão (14/10/2026, Fase 8 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`): as tabelas que o PDF e
 * o XLSX levam saem da saída congelada, com as colunas da norma e os totais que
 * a tela mostra.
 */
import * as XLSX from 'xlsx';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { nbr12721ExportService } from '../services/nbr12721ExportService';
import {
  cabecalhoDoDocumentoNbr12721,
  celulaFormatada,
  nomeDoArquivoNbr12721,
  situacaoDasAprovacoes,
  tabelasDoDocumentoNbr12721,
  versaoDoMemorial,
  type DocumentoNbr12721,
} from '../utils/nbr12721/documento';
import { areasNoMemorial } from '../services/incorporationMemorialService';
import { calcularNbr12721 } from '../utils/nbr12721/quadros';
import type { EntradaNbr12721, EspacoNbr } from '../utils/nbr12721/tipos';

const espaco = (p: Partial<EspacoNbr> & Pick<EspacoNbr, 'codigo' | 'areaRealM2'>): EspacoNbr => ({
  nome: p.codigo,
  bloco: 'T',
  pavimento: 'P1',
  unidade: null,
  uso: 'PRIVATIVO',
  natureza: 'PRINCIPAL',
  cobertura: 'PADRAO',
  divisao: null,
  contabilizacao: 'UNIDADE',
  coeficiente: null,
  ...p,
});

// 101 = 60 m² + varanda descoberta de 10 m² (coef. 0,5); 102 = 40 m²; hall comum proporcional de 20 m².
const entrada: EntradaNbr12721 = {
  blocos: [{ codigo: 'T', nome: 'Torre', ordem: 1 }],
  pavimentos: [{ codigo: 'P1', bloco: 'T', nome: 'Térreo', ordem: 1 }],
  unidades: [
    { codigo: '101', bloco: 'T', autonoma: true, ativa: true },
    { codigo: '102', bloco: 'T', autonoma: true, ativa: true },
  ],
  espacos: [
    espaco({ codigo: 'A101', unidade: '101', areaRealM2: 60 }),
    espaco({ codigo: 'V101', unidade: '101', areaRealM2: 10, cobertura: 'DESCOBERTA', coeficiente: 0.5 }),
    espaco({ codigo: 'A102', unidade: '102', areaRealM2: 40 }),
    espaco({ codigo: 'HALL', uso: 'COMUM', natureza: null, divisao: 'PROPORCIONAL', contabilizacao: 'COMUM', areaRealM2: 20 }),
  ],
  vinculos: [],
  alocacoes: [],
  escopos: [{ espaco: 'HALL', escopo: 'GLOBAL', bloco: null }],
};

const saida = calcularNbr12721(entrada);
const doc: DocumentoNbr12721 = {
  estudo: 'Edifício Ação & Cia',
  empresa: 'Alpa Construtora',
  responsavel: 'Fulana Arquiteta',
  registro: 'CAU A123',
  revisao: 3,
  hash: 'a'.repeat(64),
  versaoMotor: 'nbr12721-ts-1.0.0',
  congeladoEm: '2026-10-14T12:00:00Z',
  aprovacoes: [{ tipo: 'TECNICA', aprovadoEm: '2026-10-14T13:00:00Z', por: 'Fulana Arquiteta', hash: 'a'.repeat(64), observacao: 'ok' }],
  saida,
};

describe('documento NBR 12721 da versão', () => {
  it('o cálculo de apoio sai sem pendência', () => {
    expect(saida.status).toBe('success');
  });

  it('Quadro I leva as colunas 2 a 18 e o total bate com a soma da tela', () => {
    const [q1] = tabelasDoDocumentoNbr12721(doc);
    expect(q1.aba).toBe('Quadro I');
    expect(q1.colunas).toHaveLength(18);
    expect(q1.colunas[1].titulo).toMatch(/\(2\)$/);
    expect(q1.colunas[17].titulo).toMatch(/\(18\)$/);
    const realTotal = saida.quadroI.reduce((s, l) => s + l.qi_17_floor_real_total_raw, 0);
    expect(q1.total?.[16]).toBeCloseTo(realTotal, 9);
    expect(realTotal).toBeCloseTo(130, 9); // 60 + 10 + 40 + 20
  });

  it('Quadro II leva as colunas 20 a 38, com o coeficiente somando 1', () => {
    const q2 = tabelasDoDocumentoNbr12721(doc)[1];
    expect(q2.colunas).toHaveLength(20);
    expect(q2.colunas[1].titulo).toMatch(/\(20\)$/);
    expect(q2.colunas[12].titulo).toMatch(/\(31\)$/);
    expect(q2.colunas[19].titulo).toMatch(/\(38\)$/);
    expect(q2.linhas.map((l) => l[0])).toEqual(saida.quadroII.map((l) => l.unit_label));
    expect(q2.total?.[12]).toBeCloseTo(1, 9);
  });

  it('Quadro IV-B e frações: milésimos fechados em 1000', () => {
    const t = tabelasDoDocumentoNbr12721(doc);
    const q4 = t.find((x) => x.aba === 'Quadro IV-B')!;
    expect(q4.linhas).toHaveLength(2);
    expect(q4.total?.[5]).toBeCloseTo(saida.quadroIVB.reduce((s, l) => s + l.qivb_f_real_total_area_raw, 0), 9);
    const fr = t.find((x) => x.aba === 'Frações')!;
    expect(fr.linhas.map((l) => l[4])).toEqual(saida.fracoes.map((f) => f.milesimos));
    expect(fr.total?.[4]).toBeCloseTo(1000, 9);
  });

  it('pendências e aprovações viram tabelas sem total', () => {
    const t = tabelasDoDocumentoNbr12721(doc);
    const ap = t.find((x) => x.aba === 'Aprovações')!;
    expect(ap.total).toBeNull();
    expect(ap.linhas[0][0]).toBe('Técnica');
    expect(ap.linhas[0][2]).toBe('Fulana Arquiteta');
    expect(t.find((x) => x.aba === 'Pendências')!.total).toBeNull();
  });

  it('cabeçalho: empresa, responsável com registro, versão com hash e situação', () => {
    const c = Object.fromEntries(cabecalhoDoDocumentoNbr12721(doc));
    expect(c['Empresa']).toBe('Alpa Construtora');
    expect(c['Responsável técnico']).toBe('Fulana Arquiteta — CAU A123');
    expect(c['Versão']).toBe(`3 · hash ${'a'.repeat(64)}`);
    expect(c['Aprovações']).toBe('Só a técnica aprovada');
    const semResp = Object.fromEntries(cabecalhoDoDocumentoNbr12721({ ...doc, responsavel: null }));
    expect('Responsável técnico' in semResp).toBe(false);
  });

  it('situação das aprovações', () => {
    expect(situacaoDasAprovacoes([])).toBe('Sem aprovação');
    expect(situacaoDasAprovacoes([{ tipo: 'TECNICA' }, { tipo: 'JURIDICA' }])).toBe('Técnica e jurídica aprovadas');
  });

  it('formata células como a tela (pt-BR) e o nome do arquivo sem acento', () => {
    expect(celulaFormatada(1234.5, 'm2')).toBe('1.234,50');
    expect(celulaFormatada(0.6, 'coef')).toBe('0,600000');
    expect(celulaFormatada(600, 'mil')).toBe('600,0000');
    expect(celulaFormatada('101', 'texto')).toBe('101');
    expect(nomeDoArquivoNbr12721(doc)).toBe('areas_nbr12721_Edificio_Acao_Cia_v3');
  });

  it('PDF: os grupos da norma cobrem as colunas dos Quadros I e II; o PDF monta sem erro', async () => {
    const [q1, q2] = tabelasDoDocumentoNbr12721(doc);
    for (const q of [q1, q2]) expect(q.grupos!.reduce((s, g) => s + g.colunas, 0)).toBe(q.colunas.length - 1);
    expect(q1.grupos!.map((g) => g.titulo)).toEqual(['Área privativa', 'Área comum não proporcional', 'Área comum proporcional', 'Total do pavimento']);
    expect(q2.colunas.slice(1).every((c) => !!c.curto)).toBe(true);
    const pdf = await nbr12721ExportService.pdfDoDocumento(doc);
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(pdf.internal.pageSize.getWidth()).toBeGreaterThan(pdf.internal.pageSize.getHeight()); // paisagem
  });

  it('XLSX: abas na ordem, números como número e a linha de total', () => {
    const wb = nbr12721ExportService.pastaXlsx(doc);
    expect(wb.SheetNames).toEqual(['Resumo', 'Quadro I', 'Quadro II', 'Quadro IV-B', 'Frações', 'Pendências', 'Aprovações']);
    const fr = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets['Frações'], { header: 1 });
    expect(fr).toHaveLength(1 + saida.fracoes.length + 1);
    expect(typeof fr[1][4]).toBe('number');
    expect(fr[fr.length - 1][0]).toBe('Total');
    expect(fr[fr.length - 1][4]).toBeCloseTo(1000, 9);
    const resumo = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Resumo'], { header: 1 });
    expect(resumo.some((l) => l[0] === 'Versão' && String(l[1]).startsWith('3 · hash'))).toBe(true);
  });
});

describe('memorial de incorporação lê a versão publicada da Planta (Fase 8.2)', () => {
  const v = (snapshotId: string, revisao: number, ...tipos: ('TECNICA' | 'JURIDICA')[]) => ({ snapshotId, revisao, aprovacoes: tipos.map((tipo) => ({ tipo })) });

  it('escolhe a revisão mais alta com as duas aprovações; senão com a técnica; senão a mais recente', () => {
    expect(versaoDoMemorial([v('a', 1, 'TECNICA', 'JURIDICA'), v('b', 3), v('c', 2, 'TECNICA')])?.snapshotId).toBe('a');
    expect(versaoDoMemorial([v('a', 1, 'TECNICA'), v('b', 3), v('c', 2, 'TECNICA')])?.snapshotId).toBe('c');
    expect(versaoDoMemorial([v('a', 1), v('b', 3), v('c', 2)])?.snapshotId).toBe('b');
    expect(versaoDoMemorial([v('a', 1, 'TECNICA', 'JURIDICA'), v('d', 4, 'TECNICA', 'JURIDICA')])?.snapshotId).toBe('d');
    expect(versaoDoMemorial([])).toBeNull();
  });

  it('seções "e" e "i": versão, hash inteiro, quadros e milésimos; avisa enquanto falta a jurídica', () => {
    const m = areasNoMemorial(doc);
    const campos = Object.fromEntries(m.campos);
    expect(campos['Versão publicada']).toBe('3');
    expect(campos['Hash dos quadros']).toBe('a'.repeat(64));
    expect(campos['Aprovações']).toBe('Só a técnica aprovada');
    expect('Empresa' in campos).toBe(false);
    expect(m.avisos).toHaveLength(1);
    expect(m.avisos[0]).toMatch(/ainda não tem as aprovações técnica e jurídica/);
    expect(m.quadroI).toEqual(saida.quadroI.map((l) => expect.stringContaining(l.floor_label)));
    expect(m.quadroII).toHaveLength(2);
    expect(m.fracoes).toHaveLength(2);
    expect(m.fracoes[0]).toMatch(/^Unidade 101: fração 0,\d{10} \([\d,]+ %\) — [\d.,]+ milésimos$/);
  });

  it('com as duas aprovações não há aviso; sem versão, o aviso diz o que fazer', () => {
    const aprovada = { ...doc, aprovacoes: [...doc.aprovacoes, { ...doc.aprovacoes[0], tipo: 'JURIDICA' as const }] };
    expect(areasNoMemorial(aprovada).avisos).toEqual([]);
    const sem = areasNoMemorial(null);
    expect(sem.fracoes).toEqual([]);
    expect(sem.avisos[0]).toMatch(/publique a versão e aprove/);
    expect(areasNoMemorial(null, 'motivo dado').avisos).toEqual(['motivo dado']);
  });
});
