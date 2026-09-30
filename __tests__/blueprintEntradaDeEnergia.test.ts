/**
 * ENTRADA DE ENERGIA (E4.3 do roadmap elétrico, 29/09/2026, kernel 0.77.0).
 *
 * Pontos ENTRADA_SERVICO e MEDIDOR ligados ao quadro de entrada; o padrão da
 * concessionária como preset — só o GENÉRICO, hipótese com "CONFERIR" —,
 * categoria pela demanda × ligação, ramal pela maior entre a categoria e a
 * Tab. 36 (método D), disjuntor geral, eletroduto, aterramento pela Tab. 58.
 */
import { describe, expect, it } from 'vitest';
import { KERNEL_VERSION, TIPOS_DE_INFRAESTRUTURA_ELETRICA, TIPOS_DE_PONTO_ELETRICO, applyCommand, canonicalPayload, emptyModel, modelFromCanonicalPayload, parseCanonicalPayload, point, quadroDeCargas, type BlueprintModel } from '../utils/blueprintKernel';
import { COTA_USUAL_DO_PONTO_ELETRICO, GRUPO_DO_PONTO_ELETRICO, ROTULO_DO_PONTO_ELETRICO, SIGLA_DO_PONTO_ELETRICO } from '../utils/blueprintRede';
import { HIPOTESES_PADRAO, TIPOS_SEM_CARGA } from '../utils/blueprintEletricaDimensionamento';
import { PADRAO_GENERICO, PADROES_DE_ENTRADA, entradaDoQuadro, entradasDoModelo, rotuloDaEntrada } from '../utils/blueprintEntradaDeEnergia';
import { conferirNbr5410 } from '../utils/blueprintNbr5410';
import { linhasDaLegenda, linhasDoQuadroDeCargas } from '../utils/blueprintPranchaEletrica';
import { verificacoesEletricas } from '../utils/blueprintEletricaExecutivo';

/** QGBT (F-F 220 V) com uma carga de `kva` kVA; opcionalmente ES e medidor ligados. */
function casa(kva: number, opts: { ligacao?: 'FN' | 'FF' | 'FFF'; comPontos?: boolean; pai?: boolean } = {}): { m: BlueprintModel; q: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const ligacao = opts.ligacao ?? 'FF';
  const tensaoV = ligacao === 'FN' ? 127 : 220;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QGBT', at: point(0, 0), cotaMm: 1600, ligacao, tensaoV, tipo: 'QGBT' }).model;
  const q = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: q, nome: 'C1', tensaoV, ligacao, secaoMm2: 10, disjuntorA: 63 }).model;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Carga', at: point(3000, 0), cotaMm: 300, tipoEletrico: 'LIGACAO_DIRETA', potenciaW: kva * 1000 }).model;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[0].id, circuitoId: m.circuitos[0].id }).model;
  if (opts.comPontos) {
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'ES', at: point(-3000, 0), cotaMm: 1500, tipoEletrico: 'ENTRADA_SERVICO', quadroId: q }).model;
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'kWh', at: point(-1500, 0), cotaMm: 1500, tipoEletrico: 'MEDIDOR' }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[2].id, quadroId: q }).model;
  }
  if (opts.pai) {
    m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'MED', at: point(-6000, 0), cotaMm: 1600, ligacao, tensaoV, tipo: 'MEDICAO' }).model;
    m = applyCommand(m, { type: 'SetQuadroProps', quadroId: q, quadroPaiId: m.quadros[1].id }).model;
  }
  return { m, q };
}

describe('entrada · kernel 0.77.0', () => {
  it('os dois tipos existem com rótulo/sigla/grupo/cota; são infraestrutura (sem carga, sem fio, não são "ponto fora de circuito")', () => {
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.80.0');
    for (const t of ['ENTRADA_SERVICO', 'MEDIDOR'] as const) {
      expect(TIPOS_DE_PONTO_ELETRICO).toContain(t);
      expect(ROTULO_DO_PONTO_ELETRICO[t]).toBeTruthy();
      expect(SIGLA_DO_PONTO_ELETRICO[t]).toBeTruthy();
      expect(GRUPO_DO_PONTO_ELETRICO[t]).toBe('Elétrica — entrada de energia');
      expect(COTA_USUAL_DO_PONTO_ELETRICO[t]).toBe(1500);
      expect(TIPOS_SEM_CARGA.has(t)).toBe(true);
      expect(TIPOS_DE_INFRAESTRUTURA_ELETRICA.has(t)).toBe(true);
    }
    const { m } = casa(5, { comPontos: true });
    // ES e medidor não têm circuito e NÃO viram pendência no quadro de cargas.
    expect(quadroDeCargas(m).pontosSemCircuito).toBe(0);
    expect(quadroDeCargas(m).soltos).toEqual([]);
  });

  it('Terminal.quadroId: grava, canônico `quadro` por índice com ida e volta e omitido sem vínculo; só entrada/medidor; apagar o quadro solta', () => {
    const { m, q } = casa(5, { comPontos: true });
    expect(m.terminais[1].quadroId).toBe(q);
    expect(m.terminais[2].quadroId).toBe(q);
    const texto = canonicalPayload(m) as unknown as string;
    expect(texto).toContain('"quadro":0');
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(texto));
    expect(volta.terminais.filter((t) => t.quadroId === volta.quadros[0].id)).toHaveLength(2);
    expect(canonicalPayload(volta)).toBe(texto);
    // Sem vínculo, NENHUM terminal leva a chave (o circuito tem a sua `quadro` — é outra coisa).
    const semVinculo = JSON.parse(canonicalPayload(casa(5).m) as unknown as string) as { terminais: Record<string, unknown>[] };
    expect(semVinculo.terminais.every((t) => !('quadro' in t))).toBe(true);
    // Tomada não se liga a quadro.
    expect(() => applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[0].id, quadroId: q })).toThrow(/não se liga a quadro/);
    expect(() => applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[1].id, quadroId: 'qdr_9999' })).toThrow(/quadro inexistente/);
    const sem = applyCommand(m, { type: 'DeleteQuadro', quadroId: q }).model;
    expect(sem.terminais.every((t) => !t.quadroId)).toBe(true);
  });
});

describe('o padrão de entrada (hipótese)', () => {
  it('⚠️ 12 kVA F-F 220 V → categoria B1, ramal 16 mm² (Tab. 36 método D concorda), geral 63 A, Ø32, terra 16 mm²; o rótulo diz "genérico — hipótese"', () => {
    expect(PADROES_DE_ENTRADA.map((p) => p.id)).toEqual(['GENERICO']);
    expect(PADRAO_GENERICO.fonte).toBeNull();
    const { m, q } = casa(12, { comPontos: true });
    const e = entradaDoQuadro(m, q)!;
    expect(e.demandaKva).toBeCloseTo(12, 9);
    expect(e.ibA).toBeCloseTo(12000 / 220, 3);
    expect(e.categoria?.id).toBe('B1');
    expect(e.ramalMm2).toBe(16);
    expect(e.ramalCalculadoMm2).toBeLessThanOrEqual(16);
    expect(e.disjuntorGeralA).toBe(63);
    expect(e.eletrodutoMm).toBe(32);
    expect(e.aterramentoMm2).toBe(16);
    expect(e.entradasDeServico).toHaveLength(1);
    expect(e.medidores).toHaveLength(1);
    expect(e.achados).toEqual([]);
    expect(rotuloDaEntrada(e)).toBe('categoria B1 (FF até 12 kVA) · demanda 12 kVA · ramal 16 mm² · geral 63 A · eletroduto Ø32 · terra 16 mm² — padrão genérico — hipótese de projeto');
    // 13 kVA F-F sobe para B2 (25 mm², 80 A).
    expect(entradaDoQuadro(casa(13).m, casa(13).q)!.categoria?.id).toBe('B2');
  });

  it('acima da maior categoria = FALTA; sem ES/medidor no desenho = AVISO; quadro alimentado por outro não é entrada; a Tab. 36 vence quando pede mais que a categoria', () => {
    const { m: grande, q: qg } = casa(20);
    const e = entradaDoQuadro(grande, qg)!;
    expect(e.categoria).toBeNull();
    expect(e.achados.some((a) => a.nivel === 'FALTA' && /20,0 kVA acima da maior categoria FF do padrão \(15 kVA\)/.test(a.mensagem))).toBe(true);
    expect(e.achados.filter((a) => a.nivel === 'AVISO').map((a) => a.mensagem)).toEqual([expect.stringMatching(/sem ponto de ENTRADA DE SERVIÇO/), expect.stringMatching(/sem MEDIDOR/)]);
    // Ramal calculado ainda sai (Tab. 36) mesmo sem categoria.
    expect(e.ramalMm2).toBe(e.ramalCalculadoMm2);
    const { m: comPai, q: qf } = casa(5, { pai: true });
    expect(entradaDoQuadro(comPai, qf)).toBeNull();
    expect(entradasDoModelo(comPai).map((x) => x.nome)).toEqual(['MED']);
    // Método D com temperatura alta: a Tab. 36 pode pedir mais que a categoria — a maior vence e o rótulo diz.
    const quente = { ...HIPOTESES_PADRAO, temperaturaAmbienteC: 50 };
    const eq = entradaDoQuadro(casa(12).m, casa(12).q, quente)!;
    expect(eq.ramalMm2).toBeGreaterThanOrEqual(eq.ramalCalculadoMm2 ?? 0);
    if ((eq.ramalCalculadoMm2 ?? 0) > 16) expect(rotuloDaEntrada(eq)).toMatch(/Tab\. 36 pede/);
  });

  it('regra ENTRADA na conferência (só quadros sem pai), rótulo do executivo, linha na folha e legenda dos símbolos', () => {
    const { m } = casa(20);
    const r = conferirNbr5410(m, null, HIPOTESES_PADRAO).regras.find((x) => x.codigo === 'ENTRADA')!;
    expect(r.avaliados).toBe(1);
    expect(r.titulo).toMatch(/padrão genérico — hipótese de projeto/);
    expect(r.achados.some((a) => a.nivel === 'FALTA' && /^QGBT: demanda 20,0 kVA/.test(a.mensagem))).toBe(true);
    const v = verificacoesEletricas(m, HIPOTESES_PADRAO, { nome: 'Eng.', titulo: 'Eng.', conselho: 'CREA', registro: '1', artNumero: '1', artData: '2026-09-29' }, conferirNbr5410(m, null, HIPOTESES_PADRAO));
    expect(v.verificacoes.find((x) => x.norma === 'Padrão de entrada (concessionária — hipótese)')!.atende).toBe(false);
    const ok = casa(12, { comPontos: true }).m;
    expect(linhasDoQuadroDeCargas(ok).some((l) => l.startsWith('  Entrada: categoria B1'))).toBe(true);
    expect(linhasDaLegenda(ok).some((l) => l.startsWith('ES — entrada de serviço'))).toBe(true);
    expect(linhasDaLegenda(ok).some((l) => l.startsWith('kWh — medidor'))).toBe(true);
    expect(linhasDaLegenda(casa(12).m).some((l) => l.startsWith('kWh'))).toBe(false);
  });
});
