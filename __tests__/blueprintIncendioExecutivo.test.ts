/**
 * INCÊNDIO E8.4 (01/10/2026): os memoriais de incêndio (cálculo e descritivo)
 * e a emissão com ART — os MESMOS números das gavetas, as seções só do que
 * existe, a conferência e o hash da base.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_INCENDIO_PADRAO, type HipotesesIncendio } from '../utils/blueprintIncendioClassificacao';
import { calculoDoEstudo, planilhaDePressoes } from '../utils/blueprintPlanilhaDePressoes';
import { conferenciaDeIncendio } from '../utils/blueprintConferenciaIncendio';
import { pressurizacaoDaRede } from '../utils/blueprintBombeamentoIncendio';
import { blocosDasLinhas, linhasDoMemorial, type BlocoDoMemorial } from '../utils/blueprintMemorialHidro';
import { RESPONSAVEL_VAZIO, type ResponsavelTecnico } from '../utils/blueprintTopografiaExecutivo';
import { paraWinAnsi } from '../services/blueprintMemorialHidroService';
import {
  analisesDeIncendio,
  hashDaBaseIncendio,
  memorialDeCalculoIncendio,
  memorialDescritivoIncendio,
  memorialExecutivoIncendio,
  verificacoesIncendio,
} from '../utils/blueprintIncendioExecutivo';

const H: HipotesesIncendio = { ...HIPOTESES_INCENDIO_PADRAO, classificacao: { ...HIPOTESES_INCENDIO_PADRAO.classificacao, divisao: 'A-2' } };
const ctx = { nomeDoEstudo: 'Prédio', geradoEm: '2026-10-01T12:00:00Z' };
const RT: ResponsavelTecnico = { nome: 'Fulana de Tal', titulo: 'Engenheira Civil', conselho: 'CREA', registro: 'MG-123', artNumero: '1420261', artData: '2026-10-01' };
const secoes = (b: BlocoDoMemorial[]) => b.filter((x) => x.tipo === 'secao').map((x) => (x as { texto: string }).texto);
const texto = (b: BlocoDoMemorial[]) => JSON.stringify(b);

/** Um corredor de 20 × 2 m com 3 salas de 6 × 6 (porta para o corredor) — e, se pedido, bomba → 2 hidrantes e 1 extintor. */
function andar(comRede = true): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command;
  const cmds: Command[] = [w(0, 0, 18000, 0), w(18000, 0, 18000, 8000), w(18000, 8000, 0, 8000), w(0, 8000, 0, 0)];
  for (let k = 0; k < 3; k++) cmds.push(w(k * 6000, 2000, (k + 1) * 6000, 2000));
  for (let k = 1; k < 3; k++) cmds.push(w(k * 6000, 2000, k * 6000, 8000));
  m = applyBatch(m, cmds).model;
  m = applyBatch(m, m.walls.filter((x) => x.a.y === 2000 && x.b.y === 2000).map((x) => ({ type: 'AddOpening', wallId: x.id, kind: 'door', offsetMm: 2500, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command)).model;
  if (!comRede) return m;
  const t = (ax: number, ca: number, bx: number, cb: number): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, 1000), b: point(bx, 1000), cotaAMm: ca, cotaBMm: cb, bitolaMm: 65 }) as Command;
  const p = (tipo: string, x: number, cota: number, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: point(x, 1000), cotaMm: cota, ...extra }) as Command;
  return applyBatch(m, [
    p('BOMBA_INCENDIO', 1000, 300, { curvaBomba: [{ vazaoLmin: 0, alturaMm: 70000 }, { vazaoLmin: 600, alturaMm: 55000 }, { vazaoLmin: 1200, alturaMm: 30000 }] }),
    t(1000, 300, 1000, 2600), t(1000, 2600, 9000, 2600), t(9000, 2600, 17000, 2600), t(9000, 2600, 9000, 1300), t(17000, 2600, 17000, 1300),
    p('HIDRANTE_SIMPLES', 9000, 1300), p('HIDRANTE_SIMPLES', 17000, 1300),
    p('EXTINTOR', 5000, 1600, { agenteExtintor: 'PQS_ABC', capacidadeExtintora: '2-A:20-B:C' }),
  ]).model;
}

describe('E8.4 · o memorial de cálculo', () => {
  it('⚠️ PRONTO QUANDO: os números da planilha de pressões são os da tela (calculoDoEstudo), com bomba e reserva técnica', () => {
    const m = andar();
    const b = memorialDeCalculoIncendio(m, H, ctx);
    expect(secoes(b)).toEqual(expect.arrayContaining(['Classificação da edificação', 'Medidas de segurança contra incêndio', 'Sistema hidráulico — premissas', 'Sistema hidráulico — planilha de pressões', 'Bombeamento', 'Reserva técnica de incêndio', 'Extintores']));
    const p = planilhaDePressoes(m, calculoDoEstudo(m, H).calculo);
    expect(p.motivo).toBeNull();
    // O resumo e a tabela dos trechos entram IGUAIS.
    for (const r of p.resumo) expect(b).toContainEqual({ tipo: 'paragrafo', texto: r });
    expect(b).toContainEqual({ tipo: 'tabela', cabecalho: p.cabecalhoTrechos, linhas: p.trechos });
    expect(texto(b)).toMatch(/A-2/);
  });

  it('sem rede de incêndio, nenhuma seção hidráulica — memorial de sistema que não há é papel mentindo', () => {
    const b = memorialDeCalculoIncendio(andar(false), H, ctx);
    expect(secoes(b).some((s) => /hidráulico|Bombeamento|Reserva/.test(s))).toBe(false);
    expect(secoes(b)).toContain('Classificação da edificação');
  });
});

describe('E8.4 · o memorial descritivo', () => {
  it('os sistemas com as peças do desenho, e a tubulação por material × DN com o comprimento', () => {
    const b = memorialDescritivoIncendio(andar(), H, ctx);
    expect(secoes(b)).toEqual(expect.arrayContaining(['Objeto', 'Normas', 'Sistemas', 'Materiais', 'Execução e ensaios']));
    const t = texto(b);
    expect(t).toMatch(/2 hidrante\(s\) e 0 mangotinho\(s\)/);
    expect(t).toMatch(/1 bomba\(s\) principal/);
    expect(t).toMatch(/Extintores: 1 unidade\(s\) — 1 × Pó ABC 2-A:20-B:C/);
    const materiais = b.find((x) => x.tipo === 'tabela' && x.cabecalho[0] === 'Tubulação') as Extract<BlocoDoMemorial, { tipo: 'tabela' }>;
    // 2,3 + 8 + 8 + 1,3 + 1,3 = 20,9 m de DN 65.
    expect(materiais.linhas.map((l) => [l[1], l[2]])).toEqual([['65', '20,9']]);
  });

  it('medida exigida que o desenho não modela vira "a cargo do responsável"', () => {
    const m = andar();
    const a = analisesDeIncendio(m, H);
    a.exigencias.medidas = a.exigencias.medidas.map((x) => (x.medida === 'BRIGADA' ? { ...x, estado: 'EXIGIDA' } : x));
    const b = memorialDescritivoIncendio(m, H, ctx, a);
    expect(secoes(b)).toContain('Medidas exigidas a cargo do responsável');
    expect(texto(b)).toMatch(/brigada de incêndio/);
  });
});

describe('E8.4 · a conferência e a emissão', () => {
  it('sem responsável, não emite; a parte hidráulica é a MESMA conferência da gaveta de cálculo', () => {
    const m = andar();
    const r = verificacoesIncendio(m, H, RESPONSAVEL_VAZIO);
    expect(r.podeEmitir).toBe(false);
    expect(r.pendencias.some((x) => /Responsável técnico identificado/.test(x))).toBe(true);
    const { calculo, bomba } = calculoDoEstudo(m, H);
    const daGaveta = conferenciaDeIncendio(m, calculo, calculo.hip, bomba, pressurizacaoDaRede(m, H.bombeamento, calculo)).filter((x) => x.estado !== 'NAO_AVALIADO');
    const hidraulicas = r.verificacoes.filter((v) => ['REDE', 'NBR13714', 'NBR10897', 'CBMMG'].includes(v.grupo));
    expect(hidraulicas.map((v) => [v.item, v.atende])).toEqual(daGaveta.map((x) => [x.item, x.estado === 'ATENDE']));
    // Com o responsável completo, as do responsável atendem.
    const ok = verificacoesIncendio(m, H, RT);
    expect(ok.verificacoes.filter((v) => v.grupo === 'RESPONSAVEL').every((v) => v.atende)).toBe(true);
  });

  it('ocupação não definida é pendência', () => {
    const semDivisao = { ...H, classificacao: { ...H.classificacao, divisao: null } };
    const r = verificacoesIncendio(andar(false), semDivisao, RT);
    expect(r.verificacoes.find((v) => v.item === 'Ocupação definida')?.atende).toBe(false);
  });

  it('o hash da base muda com o desenho E com as premissas', () => {
    const m = andar();
    const a = hashDaBaseIncendio(m, H);
    expect(hashDaBaseIncendio(m, { ...H, hidraulica: { ...H.hidraulica, autonomiaMin: 90 } }).base).not.toBe(a.base);
    expect(hashDaBaseIncendio(andar(false), H).desenho).not.toBe(a.desenho);
    expect(hashDaBaseIncendio(m, H)).toEqual(a);
  });

  it('a capa executiva: responsável, base, verificações, declaração com o CONFERIR NA NORMA — e os dois memoriais; ida e volta em texto sem perda', () => {
    const m = andar();
    const r = verificacoesIncendio(m, H, RT);
    const h = hashDaBaseIncendio(m, H);
    const b = memorialExecutivoIncendio(m, H, RT, r, { nomeDoEstudo: 'Prédio', hashDoDesenho: h.desenho, hashDaBase: h.base, emitidoEm: '2026-10-01T12:00:00Z' });
    expect(b[0]).toEqual({ tipo: 'titulo', texto: 'Projeto de segurança contra incêndio e pânico' });
    expect(secoes(b).slice(0, 4)).toEqual(['Responsável técnico', 'Base do projeto', 'Verificações', 'Declaração']);
    expect(texto(b)).toMatch(/CONFERIR NA NORMA\/IT/);
    expect(b.filter((x) => x.tipo === 'titulo').map((x) => (x as { texto: string }).texto)).toEqual(['Projeto de segurança contra incêndio e pânico', 'Memorial de cálculo', 'Memorial descritivo']);
    expect(blocosDasLinhas(linhasDoMemorial(b))).toEqual(b);
    // No PDF (WinAnsi) nenhum caractere vira "?" — o CO₂ do extintor virava.
    const comCo2 = applyCommand(m, { type: 'AddTerminal', levelId: m.levels[0].id, disciplina: 'INCENDIO', tipo: 'EXTINTOR', tipoHidraulico: 'EXTINTOR', at: point(15000, 5000), cotaMm: 1600, agenteExtintor: 'CO2' } as Command).model;
    const txt = linhasDoMemorial(memorialDescritivoIncendio(comCo2, H, ctx)).join(' ');
    expect(txt).toMatch(/CO₂/);
    expect([...txt].filter((ch) => ch !== '?' && paraWinAnsi(ch).includes('?'))).toEqual([]);
  });
});
