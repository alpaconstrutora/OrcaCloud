/**
 * F7 — PROJETO EXECUTIVO ELÉTRICO com ART (13/09/2026).
 *
 * O molde da topografia: emitir exige responsável + ART, dados completos,
 * conferência NBR 5410 sem falta e pré-dimensionamento sem falta. A emissão
 * fica amarrada ao hash do DESENHO e das HIPÓTESES — mudou um, a emissão
 * deixa de valer.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_PADRAO } from '../utils/blueprintEletricaDimensionamento';
import { conferirNbr5410 } from '../utils/blueprintNbr5410';
import { hashDaBaseEletrica, memorialEletrico, verificacoesEletricas } from '../utils/blueprintEletricaExecutivo';
import { RESPONSAVEL_VAZIO, type ResponsavelTecnico } from '../utils/blueprintTopografiaExecutivo';

const RT: ResponsavelTecnico = { nome: 'Ana Souza', titulo: 'Engenheira Eletricista', conselho: 'CREA', registro: 'SP 123456', artNumero: '28027230', artData: '2026-09-13' };

/** Uma sala classificada, QDC com C1 (luz + interruptor) e C2 (tomadas), tudo declarado e correto. */
function casaCompleta(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  let m = applyBatch(base, [p(0, 0, 4000, 0), p(4000, 0, 4000, 4000), p(4000, 4000, 0, 4000), p(0, 4000, 0, 0)]).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' }).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(75, 1000), cotaMm: 1600, ligacao: 'FN', tensaoV: 127, alimentadorM: 8 }).model;
  const quadroId = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C1', tensaoV: 127, secaoMm2: 1.5, disjuntorA: 10, ligacao: 'FN' }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C2', tensaoV: 127, secaoMm2: 2.5, disjuntorA: 20, ligacao: 'FN' }).model;
  const [c1, c2] = m.circuitos.map((c) => c.id);
  const ponto = (x: number, y: number, tipoEletrico: 'TUG' | 'ILUMINACAO_TETO' | 'INTERRUPTOR', potenciaW: number | null, circuitoId: string, cotaMm = 300, comando: string | null = null) => {
    m = applyCommand(m, {
      type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(x, y), cotaMm, tipoEletrico,
      potenciaW: potenciaW ?? undefined, comando,
    }).model;
    const id = m.terminais[m.terminais.length - 1].id;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: id, circuitoId }).model;
  };
  // 14,8 m² úteis → mínimo 220 VA (9.5.2.1.2); 300 atende.
  ponto(2000, 2000, 'ILUMINACAO_TETO', 300, c1, 2800, 'a');
  ponto(1000, 75, 'INTERRUPTOR', null, c1, 1100, 'a');
  // 15,4 m internos ÷ 5 → 4 tomadas.
  for (const [x, y] of [[1000, 3925], [3000, 3925], [3925, 1000], [3925, 3000]] as const) ponto(x, y, 'TUG', 100, c2);
  return m;
}

const resultado = (m: BlueprintModel, rt: ResponsavelTecnico = RT) =>
  verificacoesEletricas(m, HIPOTESES_PADRAO, rt, conferirNbr5410(m, null, HIPOTESES_PADRAO));

describe('verificações do executivo elétrico', () => {
  it('⚠️ a casa completa e correta PODE emitir — e é a única forma de saber que as regras não acusam o certo', () => {
    const r = resultado(casaCompleta());
    expect(r.pendencias, r.pendencias.join(' | ')).toEqual([]);
    expect(r.podeEmitir).toBe(true);
    expect(r.quadros).toHaveLength(1);
  });

  it('sem responsável ou sem ART: não emite, e a pendência diz qual', () => {
    const r = resultado(casaCompleta(), { ...RESPONSAVEL_VAZIO });
    expect(r.podeEmitir).toBe(false);
    expect(r.pendencias.join(' ')).toMatch(/Responsável técnico identificado/);
    expect(r.pendencias.join(' ')).toMatch(/ART recolhida/);
  });

  it('⚠️ um ponto sem potência derruba a emissão — o cálculo seria parcial', () => {
    let m = casaCompleta();
    const t = m.terminais.find((x) => x.tipoEletrico === 'TUG')!;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: t.id, potenciaW: null }).model;
    const r = resultado(m);
    expect(r.podeEmitir).toBe(false);
    expect(r.pendencias.join(' ')).toMatch(/1 sem potência/);
  });

  it('⚠️ uma falta da norma (seção declarada 1,5 num circuito de tomadas) derruba a emissão pelo item certo', () => {
    let m = casaCompleta();
    const c2 = m.circuitos.find((c) => c.nome === 'C2')!;
    m = applyCommand(m, { type: 'SetCircuitoProps', circuitoId: c2.id, secaoMm2: 1.5 }).model;
    const r = resultado(m);
    expect(r.podeEmitir).toBe(false);
    const item = r.verificacoes.find((v) => v.grupo === 'CIRCUITOS' && /C2/.test(v.item))!;
    expect(item.atende).toBe(false);
    expect(item.obtido).toMatch(/Tab\. 47/);
  });

  it('sem comprimento do alimentador o quadro não atende — a queda da origem fica sem número', () => {
    let m = casaCompleta();
    m = applyCommand(m, { type: 'SetQuadroProps', quadroId: m.quadros[0].id, alimentadorM: null }).model;
    const r = resultado(m);
    const q = r.verificacoes.find((v) => v.grupo === 'QUADROS')!;
    expect(q.atende).toBe(false);
    expect(q.obtido).toMatch(/alimentador sem comprimento/);
  });
});

describe('hash da base e memorial', () => {
  it('⚠️ mudar o DESENHO ou as HIPÓTESES muda o hash da base; nada mudou, nada muda', () => {
    const m = casaCompleta();
    const a = hashDaBaseEletrica(m, HIPOTESES_PADRAO);
    expect(hashDaBaseEletrica(m, HIPOTESES_PADRAO).base).toBe(a.base);
    const movido = applyCommand(m, {
      type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], terminalIds: [m.terminais[0].id], delta: point(100, 0), manterJuncoes: false,
    }).model;
    expect(hashDaBaseEletrica(movido, HIPOTESES_PADRAO).base).not.toBe(a.base);
    expect(hashDaBaseEletrica(m, { ...HIPOTESES_PADRAO, temperaturaAmbienteC: 40 }).base).not.toBe(a.base);
    // O hash do desenho é o canônico do kernel — o mesmo da versão publicada.
    expect(a.desenho).toMatch(/^[0-9a-f]{64}$/);
  });

  it('o memorial traz responsável, hipóteses, cada circuito com IB/seção/disjuntor e a declaração', () => {
    const m = casaCompleta();
    const r = resultado(m);
    const L = memorialEletrico(RT, HIPOTESES_PADRAO, r, { nomeDoEstudo: 'Casa', hashDoDesenho: 'd'.repeat(64), hashDaBase: 'b'.repeat(64), emitidoEm: '2026-09-13T12:00:00Z' });
    const texto = L.join('\n');
    expect(texto).toMatch(/Ana Souza, Engenheira Eletricista — CREA SP 123456/);
    expect(texto).toMatch(/ART nº 28027230/);
    expect(texto).toMatch(/método de instalação B1/);
    const linhaC2 = L.find((l) => l.startsWith('C2 (')) ?? '(linha do C2 não encontrada)';
    expect(linhaC2, linhaC2).toMatch(/^C2 \(FN 127 V\): 4 ponto\(s\), 400 VA, IB 3,1 A; seção declarada 2,5 mm² \(mínima 2,5 mm²\); disjuntor 20 A \(sugerido 10 A\)/);
    expect(linhaC2).toMatch(/ATENDE\.$/);
    expect(texto).toMatch(/\[✓\] Todo ponto com potência declarada/);
    expect(texto).toMatch(/não substitui o profissional/);
  });
});
