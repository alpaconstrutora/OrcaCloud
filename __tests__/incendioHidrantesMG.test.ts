/**
 * D1.2 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — hidrantes pela IT 17 do CBMMG. A
 * transcrição feita pela imagem das pp. 16–17 (`docs/normas/incendio-mg/it17-tabelas.txt`) é a
 * fonte: o teste a relê e confere as Tabelas 2 e 4 do código. Depois, a escolha do sistema, as
 * premissas e a reserva de tabela no cálculo.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CELULAS_TABELA_4_IT17,
  COLUNAS_TABELA_4_IT17,
  TABELA_2_IT17,
  divergenciasDaIT17,
  premissasDaIT17,
  pressaoDoJatoCompactoKpa,
  sistemaDeHidrantesMG,
  temSistema,
  type SistemaDeHidrantesMG,
} from '../utils/blueprintIncendioHidrantesMG';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HH } from '../utils/blueprintCalculoIncendio';
import { calculoDoEstudo } from '../utils/blueprintPlanilhaDePressoes';
import { HIPOTESES_INCENDIO_PADRAO } from '../utils/blueprintIncendioClassificacao';
import { applyCommand, emptyModel } from '../utils/blueprintKernel';

const texto = readFileSync(join(__dirname, '..', 'docs', 'normas', 'incendio-mg', 'it17-tabelas.txt'), 'utf-8').split(/\r?\n/);
const num = (s: string) => Number(s.replace(/\./g, ''));

function classificacao(divisao: string, areaM2: number, carga: number | null = 300) {
  return { divisao: { valor: divisao, origem: 'DECLARADA' as const, motivo: '' }, carga: { valorMJm2: carga, origem: 'DECLARADA' as const, nivel: null }, areaTotalM2: areaM2 };
}
const sistema = (d: string, a: number, q: number | null = 300, mangotinho = false) => {
  const s = sistemaDeHidrantesMG(classificacao(d, a, q), mangotinho);
  if (!temSistema(s)) throw new Error(s.motivo);
  return s;
};

describe('D1.2 · as tabelas da IT 17 batem com a transcrição', () => {
  it('Tabela 2: tipo, sistema, mangueira, comprimento, expedições e vazão', () => {
    const linhas = texto.filter((l) => /^T2 \d/.test(l)).map((l) => l.slice(3).split('|').map((x) => x.trim()));
    expect(linhas).toHaveLength(5);
    linhas.forEach((c, i) => {
      const t = TABELA_2_IT17[i];
      expect(t.tipo).toBe(Number(c[0]));
      expect(t.sistema).toBe(c[1]);
      expect(t.esguicho).toBe(c[2]);
      expect(t.mangueiraMm).toEqual(c[3].split(' ou ').map(Number));
      expect(t.comprimentoMaximoM).toBe(parseInt(c[4], 10));
      expect(t.expedicoes).toBe(c[5]);
      expect(t.vazaoMinimaLmin).toBe(parseInt(c[6], 10));
    });
  });

  it('Tabela 4: as divisões de cada coluna, com a faixa de carga, e as células tipo/reserva', () => {
    for (const k of COLUNAS_TABELA_4_IT17) {
      const linha = texto.find((l) => l.startsWith(`C${k.coluna} `))!.slice(3);
      const partes = linha.split('----').map((p) => p.trim());
      expect(partes).toHaveLength(k.regras.length);
      partes.forEach((p, i) => {
        const lista = p.replace(/^[^:]*:\s*/, (m) => (/Carga/i.test(m) ? '' : m));
        const divs = lista.split(/,\s*|\s+e\s+/).map((x) => x.trim()).filter(Boolean);
        expect(divs, `coluna ${k.coluna}, regra ${i + 1}`).toEqual([...k.regras[i].divisoes]);
        const r = k.regras[i];
        if (/até 300/.test(p) && !/acima/.test(p)) expect(r).toMatchObject({ cargaAte: 300 });
        if (/acima de 300 até 800/.test(p)) expect(r).toMatchObject({ cargaAcimaDe: 300, cargaAte: 800 });
        if (/>\s*800/.test(p)) expect(r).toMatchObject({ cargaAcimaDe: 800 });
        if (/>\s*300/.test(p)) expect(r).toMatchObject({ cargaAcimaDe: 300 });
      });
    }
    const linhas = texto.filter((l) => l.startsWith('T4 ') && !l.startsWith('T4N')).map((l) => l.split('|').slice(1).map((x) => x.trim().split(/\s+/).map(num)));
    expect(linhas).toHaveLength(6);
    const chaves = ['1.1', '1.2', '2', '3', '4'] as const;
    linhas.forEach((cols, faixa) => chaves.forEach((k, j) => expect(CELULAS_TABELA_4_IT17[k][faixa], `faixa ${faixa + 1}, ${k}`).toEqual(cols[j])));
  });
});

describe('D1.2 · o sistema pela Tabela 4', () => {
  it('A-2 de 2.500 m²: coluna 1 — tipo 2 com 8 m³, ou tipo 1 com 6 m³ se o desenho só tem mangotinho', () => {
    const h = sistema('A-2', 2500);
    expect([h.tipo.tipo, h.reservaM3, h.coluna]).toEqual([2, 8, 1]);
    expect([h.alternativa?.tipo.tipo, h.alternativa?.reservaM3]).toEqual([1, 6]);
    const m = sistema('A-2', 2500, 300, true);
    expect([m.tipo.tipo, m.reservaM3]).toEqual([1, 6]);
  });

  it('a área escolhe a linha (limite inclusivo): 3.000 m² ainda é a 1ª; 3.001, a 2ª', () => {
    expect(sistema('A-2', 3000).reservaM3).toBe(8);
    expect(sistema('A-2', 3001).reservaM3).toBe(12);
    expect(sistema('A-2', 40000).reservaM3).toBe(47);
  });

  it('a carga decide a coluna onde a tabela a usa: D-1 até 300 → coluna 1; acima → coluna 2', () => {
    expect(sistema('D-1', 2000, 300).coluna).toBe(1);
    expect(sistema('D-1', 2000, 301).coluna).toBe(2);
    expect(sistema('C-2', 2000, 500)).toMatchObject({ coluna: 2, reservaM3: 12 });
    expect(sistema('C-2', 12000, 900)).toMatchObject({ coluna: 3, reservaM3: 45 });
    expect(sistema('C-2', 12000, 900).tipo.tipo).toBe(5);
  });

  it('a tabela não decide: C-2 com carga até 300, carga não declarada, M-2, M-5 — dito o porquê', () => {
    expect(sistemaDeHidrantesMG(classificacao('C-2', 2000, 200))).toMatchObject({ motivo: expect.stringMatching(/não consta na Tabela 4/) });
    expect(sistemaDeHidrantesMG(classificacao('D-1', 2000, null))).toMatchObject({ motivo: expect.stringMatching(/declare-a/) });
    expect(sistemaDeHidrantesMG(classificacao('M-2', 2000))).toMatchObject({ motivo: expect.stringMatching(/5\.18\.1/) });
    expect(sistemaDeHidrantesMG(classificacao('M-5', 2000))).toMatchObject({ motivo: expect.stringMatching(/IT específica/) });
  });
});

describe('D1.2 · as premissas da IT 17', () => {
  it('o requinte dá a pressão do jato compacto pela vazão da tabela (orifício, Cd 0,98)', () => {
    expect(pressaoDoJatoCompactoKpa(13, 125)).toBe(128);
    expect(pressaoDoJatoCompactoKpa(25, 650)).toBe(253);
  });

  it('"usar os valores da IT 17": vazões da Tabela 2 (mangotinho do grupo A = 80), mangueiras, dois jatos, jato fora da cobertura', () => {
    const s = sistema('A-2', 2500);
    const p = premissasDaIT17(s, 'A', { ...HH, alcanceDoJatoM: 10, hidrantesSimultaneos: 1 });
    expect(p).toMatchObject({ hidrantesSimultaneos: 2, vazaoMinimaHidranteLmin: 125, pressaoMinimaHidranteKpa: 128, comprimentoMangueiraHidranteM: 30, diametroMangueiraHidranteMm: 40, vazaoMinimaMangotinhoLmin: 80, comprimentoMangueiraMangotinhoM: 45, alcanceDoJatoM: 0, velocidadeMaxMs: 5, pressaoMaximaKpa: 1000 });
    expect(divergenciasDaIT17(s, 'A', 'A-2', p)).toEqual([]);
  });

  it('o que diverge vira frase com o item da IT; A-2/A-3 admitem 45 m de mangueira (5.8.3)', () => {
    const s: SistemaDeHidrantesMG = sistema('A-2', 2500);
    const fora = divergenciasDaIT17(s, 'A', 'A-2', { ...HH, alcanceDoJatoM: 10, vazaoMinimaHidranteLmin: 100, comprimentoMangueiraHidranteM: 45 });
    expect(fora.join(' | ')).toMatch(/desconsidera o alcance do jato \(5\.8\.2\)/);
    expect(fora.join(' | ')).toMatch(/pede 125 L\/min/);
    expect(fora.join(' | ')).not.toMatch(/Mangueira do hidrante/);
    expect(divergenciasDaIT17(sistema('C-1', 2500), 'C', 'C-1', { ...HH, comprimentoMangueiraHidranteM: 45 }).join()).toMatch(/máximo 30 m/);
  });

  it('o padrão do cálculo já não soma jato à cobertura', () => {
    expect(HH.alcanceDoJatoM).toBe(0);
  });
});

describe('D1.2 · a reserva da Tabela 4 no cálculo', () => {
  const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  it('MG: a reserva exigida é o volume da tabela (A-2 até 3.000 m² → tipo 2, 8 m³), mesmo antes da rede', () => {
    const hip = { ...HIPOTESES_INCENDIO_PADRAO, classificacao: { ...HIPOTESES_INCENDIO_PADRAO.classificacao, divisao: 'A-2' } };
    const { calculo } = calculoDoEstudo(vazio, hip);
    expect(calculo.rti.exigidaL).toBe(8000);
    expect(calculo.rti.porTabela).toMatchObject({ litros: 8000, fonte: expect.stringContaining('IT 17') });
  });
  it('preset sem tabela: sem reserva de tabela (vazão × autonomia, quando houver cálculo)', () => {
    const hip = { ...HIPOTESES_INCENDIO_PADRAO, classificacao: { ...HIPOTESES_INCENDIO_PADRAO.classificacao, preset: 'SP_CBPMESP' as const, divisao: 'A-2' } };
    const { calculo } = calculoDoEstudo(vazio, hip);
    expect(calculo.rti.porTabela).toBeNull();
    expect(calculo.rti.exigidaL).toBeNull();
  });
});
