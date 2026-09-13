/**
 * Fase 17: projeto executivo com ART — furos pela NBR 8036, empuxo com água,
 * verificações de norma, emissão só com tudo atendido, memorial e o aviso
 * das exportações trocado pela ART.
 */
import { describe, expect, it } from 'vitest';
import type { Point } from '../utils/blueprintKernel';
import { fonteDeElevacao } from '../utils/blueprintElevacaoProvedores';
import { PARAMETROS_PADRAO } from '../utils/blueprintTopografiaAnalises';
import { ESTRUTURA_PADRAO, HIDRAULICA_PADRAO, dimensionarMuro, type DimensionamentoHidraulico } from '../utils/blueprintTopografiaDimensionamento';
import {
  EXECUTIVO_PADRAO,
  RESPONSAVEL_VAZIO,
  SONDAGEM_VAZIA,
  avisoExecutivo,
  empuxoRankineComAgua,
  furosMinimosNbr8036,
  hashDaBaseExecutiva,
  memorialExecutivo,
  verificacoesExecutivas,
  type EntradaDoExecutivo,
} from '../utils/blueprintTopografiaExecutivo';
import { avisoDaVersao, csvDaGrade, svgDasCurvas, type ProvenienciaDaVersao } from '../utils/blueprintTopografiaExport';
import { AVISO_LEVANTAMENTO, estatisticasDoTerreno, planejarGrade } from '../utils/blueprintTopografia';

const LOTE: Point[] = [
  { x: 0, y: 0 },
  { x: 12000, y: 0 },
  { x: 12000, y: 30000 },
  { x: 0, y: 30000 },
];

const RESPONSAVEL = { nome: 'Ana Souza', titulo: 'Engenheira Civil', conselho: 'CREA' as const, registro: '5069123456', artNumero: '28027230240012345', artData: '2026-09-12' };
const SONDAGEM_OK = { furos: 3, nsptMedio: 12, tipoDeSolo: 'ARGILA' as const, nivelDagua: { informado: true, encontrado: false, profundidadeM: null }, laudo: 'Geo Ltda 123' };

function muro(alturaM: number) {
  return dimensionarMuro({ aresta: 0, a: { x: 0, y: 0 }, b: { x: 10000, y: 0 }, normal: { x: 0, y: 1 }, comprimentoM: 10, alturaMaxCorteM: alturaM, alturaMaxAterroM: 0 } as never, ESTRUTURA_PADRAO);
}

function entrada(extra: Partial<EntradaDoExecutivo> = {}): EntradaDoExecutivo {
  return {
    responsavel: RESPONSAVEL,
    sondagem: SONDAGEM_OK,
    areaDoLoteM2: 360,
    estrutura: ESTRUTURA_PADRAO,
    hidraulica: HIDRAULICA_PADRAO,
    terraplenagem: PARAMETROS_PADRAO,
    muros: [],
    drenagemExecutiva: [],
    alturaMaxDeTaludeM: null,
    ...extra,
  };
}

describe('regras de norma (fase 17)', () => {
  it('NBR 8036: furos mínimos por área', () => {
    expect(furosMinimosNbr8036(150)).toBe(2);
    expect(furosMinimosNbr8036(360)).toBe(3);
    expect(furosMinimosNbr8036(1000)).toBe(5);
    expect(furosMinimosNbr8036(2000)).toBe(6);
    expect(furosMinimosNbr8036(6000)).toBe(10);
  });

  it('empuxo de Rankine: sem água é o clássico; com água sobe (hidrostática + submerso) e o momento também', () => {
    const seco = empuxoRankineComAgua(3, 18, 30, 10, 0);
    const Ka = Math.tan(Math.PI / 4 - (30 * Math.PI) / 360) ** 2;
    expect(seco.EaKNm).toBeCloseTo(0.5 * Ka * 18 * 9 + Ka * 10 * 3, 6);
    expect(seco.MoKNmPorM).toBeCloseTo(0.5 * Ka * 18 * 9 * 1 + Ka * 10 * 3 * 1.5, 6);
    const cheio = empuxoRankineComAgua(3, 18, 30, 10, 3);
    // Água até o topo: Ka·γ'·H²/2 + γw·H²/2 + sobrecarga — bem maior que o seco.
    expect(cheio.EaKNm).toBeCloseTo(0.5 * Ka * 8 * 9 + 0.5 * 10 * 9 + Ka * 10 * 3, 6);
    expect(cheio.EaKNm).toBeGreaterThan(seco.EaKNm * 1.8);
    const meio = empuxoRankineComAgua(3, 18, 30, 10, 1.5);
    expect(meio.EaKNm).toBeGreaterThan(seco.EaKNm);
    expect(meio.EaKNm).toBeLessThan(cheio.EaKNm);
  });
});

describe('verificações executivas (fase 17)', () => {
  it('sem muro nem drenagem: responsável e sondagem bastam; faltando qualquer coisa, não emite e diz o quê', () => {
    const ok = verificacoesExecutivas(entrada());
    expect(ok.podeEmitir).toBe(true);
    expect(ok.verificacoes.map((v) => v.grupo)).toEqual(['RESPONSAVEL', 'SONDAGEM', 'SONDAGEM']);
    const semArt = verificacoesExecutivas(entrada({ responsavel: { ...RESPONSAVEL, artNumero: '123' } }));
    expect(semArt.podeEmitir).toBe(false);
    expect(semArt.pendencias[0]).toMatch(/número da ART/);
    const poucosFuros = verificacoesExecutivas(entrada({ sondagem: { ...SONDAGEM_OK, furos: 2 } }));
    expect(poucosFuros.podeEmitir).toBe(false);
    expect(poucosFuros.pendencias[0]).toMatch(/exigido ≥ 3/);
    const semAgua = verificacoesExecutivas(entrada({ sondagem: { ...SONDAGEM_OK, nivelDagua: SONDAGEM_VAZIA.nivelDagua } }));
    expect(semAgua.podeEmitir).toBe(false);
    expect(semAgua.verificacoes[2].obtido).toBe('não informado');
    expect(verificacoesExecutivas(entrada({ responsavel: RESPONSAVEL_VAZIO })).podeEmitir).toBe(false);
  });

  it('muro seco: os FS do pré-dimensionamento valem; com água na base, o FS cai e o executivo reprova', () => {
    const m = muro(2.5);
    expect(m.atende).toBe(true);
    const seco = verificacoesExecutivas(entrada({ muros: [m] }));
    const doMuro = seco.muros[0];
    expect(doMuro.alturaDaAguaM).toBe(0);
    expect(doMuro.fsDeslizamento).toBeCloseTo(m.fsDeslizamento, 9);
    expect(doMuro.fsTombamento).toBeCloseTo(m.fsTombamento, 9);
    expect(seco.verificacoes.some((v) => v.grupo === 'SONDAGEM' && /NSPT/.test(v.item) && v.atende)).toBe(true);
    // Água a 0,5 m do terreno: quase toda a altura submersa.
    const comAgua = verificacoesExecutivas(entrada({ muros: [m], sondagem: { ...SONDAGEM_OK, nivelDagua: { informado: true, encontrado: true, profundidadeM: 0.5 } } }));
    const mA = comAgua.muros[0];
    expect(mA.alturaDaAguaM).toBeCloseTo(m.alturaM - 0.5, 9);
    expect(mA.empuxoComAguaKNm).toBeGreaterThan(mA.empuxoSecoKNm);
    expect(mA.fsDeslizamento).toBeLessThan(doMuro.fsDeslizamento);
    expect(mA.fsTombamento).toBeLessThan(doMuro.fsTombamento);
    expect(mA.atende).toBe(false);
    expect(comAgua.podeEmitir).toBe(false);
    expect(comAgua.pendencias.some((p) => /deslizamento|tombamento|global/.test(p))).toBe(true);
    // σadm acima do que o NSPT sustenta: reprova a correlação.
    const nsptBaixo = verificacoesExecutivas(entrada({ muros: [m], sondagem: { ...SONDAGEM_OK, nsptMedio: 5 } }));
    const corr = nsptBaixo.verificacoes.find((v) => /NSPT/.test(v.item))!;
    expect(corr.exigido).toMatch(/≤ 100 kPa/);
    expect(corr.atende).toBe(false);
  });

  it('drenagem para T = 25 anos e taludes pela NBR 11682', () => {
    const linha: DimensionamentoHidraulico = { id: 'abcdef12-0000', areaContribuinteM2: 200, tempoDeConcentracaoMin: 6, intensidadeMmH: 190, vazaoM3s: 0.0095, declividadeP: 2, secao: { forma: 'RETANGULAR', larguraM: 0.2, alturaM: 0.2, rotulo: '20 × 20 cm' }, capacidadeM3s: 0.03, ocupacao: 0.32, velocidadeMs: 1.1, atende: true, avisos: [] };
    const r = verificacoesExecutivas(entrada({ drenagemExecutiva: [linha], alturaMaxDeTaludeM: 3, terraplenagem: { ...PARAMETROS_PADRAO, taludeAterroH: 1.0, alturaDoLanceM: 9 } }));
    expect(r.verificacoes.find((v) => v.grupo === 'DRENAGEM')!.item).toMatch(/T = 25 anos/);
    expect(r.verificacoes.find((v) => v.grupo === 'DRENAGEM')!.atende).toBe(true);
    const taludes = r.verificacoes.filter((v) => v.grupo === 'TALUDE');
    expect(taludes.map((v) => v.atende)).toEqual([false, false, true]);
    expect(r.podeEmitir).toBe(false);
    expect(EXECUTIVO_PADRAO.tempoDeRetornoAnos).toBe(25);
  });
});

describe('emissão, memorial e aviso (fase 17)', () => {
  const emissao = { artNumero: RESPONSAVEL.artNumero, responsavel: RESPONSAVEL.nome, conselho: 'CREA' as const, registro: RESPONSAVEL.registro, emitidoEm: '2026-09-12T15:00:00Z' };

  it('o hash da base muda com a topografia, as premissas e a sondagem', () => {
    const base = { topografiaHash: 'h1', terraplenagem: PARAMETROS_PADRAO, estrutura: ESTRUTURA_PADRAO, hidraulica: HIDRAULICA_PADRAO, cotaPlatoM: 100, basePlato: 'LOTE', sondagem: SONDAGEM_OK };
    const h = hashDaBaseExecutiva(base);
    expect(hashDaBaseExecutiva({ ...base })).toBe(h);
    expect(hashDaBaseExecutiva({ ...base, topografiaHash: 'h2' })).not.toBe(h);
    expect(hashDaBaseExecutiva({ ...base, cotaPlatoM: 101 })).not.toBe(h);
    expect(hashDaBaseExecutiva({ ...base, sondagem: { ...SONDAGEM_OK, furos: 4 } })).not.toBe(h);
  });

  it('o memorial cita responsável, ART, sondagem, hipóteses, verificações e a declaração', () => {
    const e = entrada({ muros: [muro(2)] });
    const r = verificacoesExecutivas(e);
    const L = memorialExecutivo(e, r, { nomeDoEstudo: 'Planta X', topografiaVersao: 3, topografiaHash: 'abcdef0123456789ff', fonte: 'Pontos cotados', emitidoEm: '2026-09-12T15:00:00Z', hashDaBase: 'fedcba9876543210aa' });
    const texto = L.join('\n');
    expect(L[0]).toMatch(/^# Memorial de cálculo/);
    expect(texto).toContain('Ana Souza, Engenheira Civil — CREA 5069123456');
    expect(texto).toContain('ART nº 28027230240012345, recolhida em 12/09/2026');
    expect(texto).toContain('Topografia: versão v3, fonte Pontos cotados, hash abcdef0123456789');
    expect(texto).toMatch(/Furos: 3 \(mínimo NBR 8036 para 360 m²: 3\)/);
    expect(texto).toMatch(/## 5\. Muros de arrimo/);
    expect(texto).toMatch(/\[✓\] Responsável técnico/);
    expect(texto).toMatch(/não substitui o profissional/);
  });

  it('avisoDaVersao: com a emissão, a ART substitui o "pré-dimensionamento"; sem ela, o aviso da classe', () => {
    expect(avisoExecutivo(emissao)).toBe('Projeto executivo — ART nº 28027230240012345 · responsável técnico Ana Souza (CREA 5069123456) · emitido em 12/09/2026.');
    expect(avisoDaVersao({ classe: 'LEVANTAMENTO_IMPORTADO', executivo: null })).toBe(AVISO_LEVANTAMENTO);
    expect(avisoDaVersao({ classe: 'LEVANTAMENTO_IMPORTADO', executivo: emissao })).toMatch(/^Projeto executivo — ART/);
    const grade = planejarGrade(LOTE, 1000);
    grade.cotasM = grade.cotasM.map(() => 100);
    const prov: ProvenienciaDaVersao = {
      nomeDoEstudo: 'E', versao: 1, fonte: fonteDeElevacao('PONTOS_COTADOS'), classe: 'LEVANTAMENTO_IMPORTADO', equidistanciaM: 0.5, geradoEm: '2026-09-12',
      hashResultado: 'h', estatisticas: estatisticasDoTerreno(grade, LOTE, []), georreferencia: null, executivo: emissao,
    };
    const svg = svgDasCurvas([], LOTE, prov);
    expect(svg).toContain('ART nº 28027230240012345');
    expect(svg).not.toContain(AVISO_LEVANTAMENTO.slice(0, 30));
    const csv = csvDaGrade(grade, prov);
    expect(csv).toContain('# Projeto executivo — ART nº 28027230240012345');
  });
});
