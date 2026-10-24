/**
 * ELETRODUTOS RELANÇAM QUANDO UMA ESCOLHA MUDA (F2 do plano `docs/planos/2026-10-24-relancar-quando-escolha-muda.md`).
 *
 * Pedido (sessão 9e26b316, 24/10/2026): *"quando o usuário faz uma allteracao em preferencias, porem exemplo alterar o
 * tipo de lançamento de eletroduto para Sem caixas de passagem, o motor de lançar Eletrodutos por circuito deve ficar
 * disponivel para relançar e incluir essa nova preferencia"*. Decisão: rede aceita + escolha mudou → refaz tudo,
 * pedindo confirmação.
 *
 * Regra A: com rede e nada a lançar, o botão do rodapé vira "Relançar com as escolhas atuais" (nunca desligado sem
 * motivo). Regra B: o registro do lançamento × as escolhas de agora → o aviso por quadro.
 */
import { describe, expect, it } from 'vitest';
import { ModelHistory, applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_ELETRODUTO_PADRAO, planejarEletrodutosDoModelo, type HipotesesDeEletroduto } from '../utils/blueprintEletrodutos';
import { REGRA_DE_CAIXAS_PADRAO } from '../utils/blueprintCaixasDePassagem';
import { HIPOTESES_PADRAO } from '../utils/blueprintEletricaDimensionamento';
import { registroDe, textoDasDiferencas } from '../utils/blueprintRegistroDeLancamento';
import {
  ESCOLHAS_DO_ELETRODUTO,
  MOTIVO_REDE_NO_FORRO_SEM_REGISTRO,
  botaoDeLancarEletrodutos,
  comandosDeLancarEletrodutos,
  comandosDeRefazerEletrodutos,
  diferencasDoEletroduto,
  escolhasDoEletroduto,
  hipotesesDoQuadro,
  motivoParaNaoRelancar,
  planejarEletrodutosPorQuadro,
  redeNoForroSemRegistro,
  redesARefazer,
  textoDaConfirmacaoDeRefazer,
} from '../utils/blueprintEscolhasDoEletroduto';

const COM_CAIXAS: HipotesesDeEletroduto = { ...HIPOTESES_ELETRODUTO_PADRAO, caixas: REGRA_DE_CAIXAS_PADRAO };
const SEM_CAIXAS: HipotesesDeEletroduto = { ...HIPOTESES_ELETRODUTO_PADRAO, caixas: null };

/** Sala de 24 m × 4 m; QDC em (75, 1000) a 1,60 m; C1 com uma TUG na outra ponta — com caixas, o plano põe duas CP. */
function sala(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(base, [w(0, 0, 24000, 0), w(24000, 0, 24000, 4000), w(24000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(75, 1000), cotaMm: 1600 }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1', ligacao: 'FN' }).model;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(23925, 1000), cotaMm: 300, tipoEletrico: 'TUG' }).model;
  return applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId: m.circuitos[0].id }).model;
}
const cps = (m: BlueprintModel) => (m.terminais ?? []).filter((x) => x.tipoEletrico === 'CAIXA_PASSAGEM');
const aceitarTudo = (m: BlueprintModel) =>
  applyBatch(m, [
    ...(m.trechos ?? []).map((x) => ({ type: 'SetTrechoProps' as const, trechoId: x.id, sugerido: false })),
    ...cps(m).map((x) => ({ type: 'SetTerminalProps' as const, terminalId: x.id, sugerida: false })),
  ]).model;
/** A rede lançada COM caixas pelo caminho do editor (o lote leva o registro). */
const lancadaComCaixas = () => {
  const m = sala();
  return applyBatch(m, comandosDeLancarEletrodutos(m, planejarEletrodutosDoModelo(m, COM_CAIXAS), COM_CAIXAS, HIPOTESES_PADRAO)).model;
};

describe('escolhasDoEletroduto — o que entra no registro', () => {
  it('as cinco escolhas do painel e as hipóteses do estudo que mudam a seção (e daí a bitola), achatadas', () => {
    const e = escolhasDoEletroduto(COM_CAIXAS, HIPOTESES_PADRAO);
    expect(e).toMatchObject({
      encaminhamento: 'PELA_LUZ_DO_AMBIENTE',
      caixasDePassagem: 'CAIXAS',
      rotaMaximaVezes: 1.5,
      rotaPelaParede: false,
      bitolaMm: 25,
      metodoDeInstalacao: 'B1',
      temperaturaAmbienteC: 30,
      circuitosAgrupados: 1,
      secaoMinimaTueMm2: 4,
    });
    expect(typeof e.tabelasEletricas).toBe('string');
    expect(escolhasDoEletroduto(SEM_CAIXAS, HIPOTESES_PADRAO).caixasDePassagem).toBe('PELA_LUZ');
    // "Sem limite" é escolha, não ausência: `null` valeria o padrão (1,5×) na comparação.
    expect(escolhasDoEletroduto({ ...SEM_CAIXAS, rotaMaximaVezes: null }, HIPOTESES_PADRAO).rotaMaximaVezes).toBe('SEM_LIMITE');
    // Toda escolha registrada tem rótulo (senão não entra na comparação).
    for (const k of Object.keys(e)) expect(ESCOLHAS_DO_ELETRODUTO.rotulos[k], k).toBeTruthy();
  });

  it('hipótese elétrica que NÃO muda o eletroduto (queda de tensão, DPS) não entra; a que muda, sim', () => {
    const base = escolhasDoEletroduto(SEM_CAIXAS, HIPOTESES_PADRAO);
    expect(escolhasDoEletroduto(SEM_CAIXAS, { ...HIPOTESES_PADRAO, limiteQuedaTerminalPct: 2, exposicaoARaios: 'EXPOSTA' })).toEqual(base);
    const outra = escolhasDoEletroduto(SEM_CAIXAS, { ...HIPOTESES_PADRAO, catalogoDeDisjuntoresA: [10, 20, 32] });
    expect(outra.tabelasEletricas).not.toBe(base.tabelasEletricas);
  });
});

describe('diferencasDoEletroduto — a regra B (o aviso por quadro)', () => {
  it('⚠️ lançado COM caixas, agora sem → a diferença, com o texto do aviso', () => {
    const m = lancadaComCaixas();
    const q = m.quadros[0].id;
    expect(registroDe(m, 'ELETRODUTOS', q)?.escolhas.caixasDePassagem).toBe('CAIXAS');
    expect(diferencasDoEletroduto(m, q, COM_CAIXAS, HIPOTESES_PADRAO)).toEqual([]);
    const d = diferencasDoEletroduto(m, q, SEM_CAIXAS, HIPOTESES_PADRAO);
    expect(textoDasDiferencas(d)).toBe('Caixas de passagem — lançado com: com caixas de passagem · agora: sem caixas (pela luz do teto)');
  });

  it('a temperatura do estudo mudou → diz qual e quanto', () => {
    const m = lancadaComCaixas();
    const d = diferencasDoEletroduto(m, m.quadros[0].id, COM_CAIXAS, { ...HIPOTESES_PADRAO, temperaturaAmbienteC: 40 });
    expect(textoDasDiferencas(d)).toBe('Temperatura ambiente (hipóteses elétricas do estudo) — lançado com: 30 °C · agora: 40 °C');
  });

  it('rede antiga, sem registro → nenhum aviso (não se sabe com que foi lançada)', () => {
    const m = sala();
    const semRegistro = applyBatch(m, planejarEletrodutosDoModelo(m, COM_CAIXAS)[0].comandos).model;
    expect(diferencasDoEletroduto(semRegistro, m.quadros[0].id, SEM_CAIXAS, HIPOTESES_PADRAO)).toEqual([]);
  });
});

describe('botaoDeLancarEletrodutos — a regra A (o botão nunca fica sem ação quando há rede)', () => {
  it('nada desenhado → desligado, com o motivo', () => {
    const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    expect(botaoDeLancarEletrodutos(vazio, planejarEletrodutosDoModelo(vazio, SEM_CAIXAS))).toEqual({ modo: 'LANCAR', rotulo: 'Lançar em todos (0)', motivo: expect.stringMatching(/nenhum quadro/i), quadros: [] });
  });

  it('quadro sem ponto com circuito → desligado: "nenhum ponto com circuito"', () => {
    const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const m = applyCommand(vazio, { type: 'AddQuadro', levelId: vazio.levels[0].id, nome: 'QDC', at: point(0, 0), cotaMm: 1600 }).model;
    expect(botaoDeLancarEletrodutos(m, planejarEletrodutosDoModelo(m, SEM_CAIXAS)).motivo).toMatch(/nenhum ponto com circuito/i);
  });

  it('pontos a ligar → "Lançar em todos (N)", ligado', () => {
    const m = sala();
    expect(botaoDeLancarEletrodutos(m, planejarEletrodutosDoModelo(m, SEM_CAIXAS))).toEqual({ modo: 'LANCAR', rotulo: 'Lançar em todos (1)', motivo: null, quadros: [m.quadros[0].id] });
  });

  it('⚠️ rede toda ligada e SEM registro (rede antiga) → "Relançar com as escolhas atuais", ligado — e sem aviso', () => {
    const m = sala();
    const antiga = aceitarTudo(applyBatch(m, planejarEletrodutosDoModelo(m, COM_CAIXAS)[0].comandos).model);
    const planos = planejarEletrodutosDoModelo(antiga, SEM_CAIXAS);
    expect(planos[0].comandos).toEqual([]);
    expect(botaoDeLancarEletrodutos(antiga, planos)).toEqual({ modo: 'RELANCAR', rotulo: 'Relançar com as escolhas atuais', motivo: null, quadros: [antiga.quadros[0].id] });
    expect(diferencasDoEletroduto(antiga, antiga.quadros[0].id, SEM_CAIXAS, HIPOTESES_PADRAO)).toEqual([]);
  });
});

describe('redesARefazer + textoDaConfirmacaoDeRefazer — confirmação só com o que foi confirmado', () => {
  it('só sugeridos → refaz direto (sem confirmação)', () => {
    const m = lancadaComCaixas();
    const redes = redesARefazer(m);
    expect(redes).toEqual([{ quadroId: m.quadros[0].id, nome: 'QDC', trechos: m.trechos!.length, trechosConfirmados: 0, caixas: 2, caixasAceitas: 0, mudou: null }]);
    expect(textoDaConfirmacaoDeRefazer(redes)).toBeNull();
  });

  it('⚠️ com confirmados → pede confirmação, por quadro: quantos trechos e quantas caixas', () => {
    const m = aceitarTudo(lancadaComCaixas());
    const redes = redesARefazer(m);
    expect(redes[0]).toMatchObject({ trechosConfirmados: m.trechos!.length, caixas: 2, caixasAceitas: 2 });
    expect(textoDaConfirmacaoDeRefazer(redes)).toBe(
      `QDC: ${m.trechos!.length} eletroduto(s) (${m.trechos!.length} confirmado(s)) e 2 caixa(s) de passagem (2 aceita(s)).`,
    );
  });
});

describe('os lotes levam o registro — e um Ctrl+Z volta tudo', () => {
  it('lançar: o lote tem o RegistrarLancamento do quadro com as escolhas atuais', () => {
    const m = sala();
    const lote = comandosDeLancarEletrodutos(m, planejarEletrodutosDoModelo(m, SEM_CAIXAS), SEM_CAIXAS, HIPOTESES_PADRAO);
    const reg = lote.filter((c) => c.type === 'RegistrarLancamento');
    expect(reg).toEqual([{ type: 'RegistrarLancamento', motor: 'ELETRODUTOS', alvoId: m.quadros[0].id, escolhas: expect.objectContaining({ caixasDePassagem: 'PELA_LUZ' }) }]);
    // Aceita a rede: nada a lançar nem a relançar → lote vazio (sem registro solto).
    const depois = aceitarTudo(applyBatch(m, lote).model);
    expect(comandosDeLancarEletrodutos(depois, planejarEletrodutosDoModelo(depois, SEM_CAIXAS), SEM_CAIXAS, HIPOTESES_PADRAO)).toEqual([]);
  });

  it('⚠️ refazer com "sem caixas": apaga as CP aceitas, registra as escolhas novas, o aviso some — e UM Ctrl+Z volta rede, caixas e registro', () => {
    const m = aceitarTudo(lancadaComCaixas());
    const q = m.quadros[0].id;
    const h = new ModelHistory(m);
    h.applyMany(comandosDeRefazerEletrodutos(m, [q], SEM_CAIXAS, HIPOTESES_PADRAO));
    const depois = h.current;
    expect(cps(depois)).toEqual([]);
    expect(registroDe(depois, 'ELETRODUTOS', q)?.escolhas.caixasDePassagem).toBe('PELA_LUZ');
    expect(diferencasDoEletroduto(depois, q, SEM_CAIXAS, HIPOTESES_PADRAO)).toEqual([]);
    expect((depois.trechos ?? []).length).toBeGreaterThan(0);
    h.undo();
    expect(h.current).toEqual(m);
    expect(registroDe(h.current, 'ELETRODUTOS', q)?.escolhas.caixasDePassagem).toBe('CAIXAS');
  });

  it('quadro cuja rede ficou sem ponto: refazer só apaga — e apaga o registro (não há lançamento a descrever)', () => {
    const m = lancadaComCaixas();
    const q = m.quadros[0].id;
    const tug = m.terminais!.find((x) => x.tipoEletrico === 'TUG')!;
    const semPonto = applyCommand(m, { type: 'DeleteTerminal', terminalId: tug.id }).model;
    const lote = comandosDeRefazerEletrodutos(semPonto, [q], SEM_CAIXAS, HIPOTESES_PADRAO);
    expect(lote.some((c) => c.type === 'AddTrecho')).toBe(false);
    expect(lote).toContainEqual({ type: 'ApagarRegistroDeLancamento', motor: 'ELETRODUTOS', alvoId: q });
    const depois = applyBatch(semPonto, lote).model;
    expect(depois.trechos ?? []).toEqual([]);
    expect(registroDe(depois, 'ELETRODUTOS', q)).toBeNull();
  });
});

// ─── Correção 1 (revisão da F2, 24/10/2026) ───────────────────────────────────────────────────────────────────────
describe('correção 1 — lançamento parcial não apaga o aviso (I1)', () => {
  it('⚠️ rede ACEITA com caixas → preferência "sem caixas" → um ponto novo → Lançar: o registro antigo fica e o aviso continua', () => {
    const m0 = aceitarTudo(lancadaComCaixas());
    const q = m0.quadros[0].id;
    const t = m0.levels[0].id;
    let m = applyCommand(m0, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(12000, 3925), cotaMm: 300, tipoEletrico: 'TUG' }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId: m.circuitos[0].id }).model;
    const planos = planejarEletrodutosDoModelo(m, SEM_CAIXAS);
    expect(planos[0].aLigar).toBe(1);
    const lote = comandosDeLancarEletrodutos(m, planos, SEM_CAIXAS, HIPOTESES_PADRAO);
    expect(lote.some((c) => c.type === 'AddTrecho')).toBe(true);
    expect(lote.some((c) => c.type === 'RegistrarLancamento')).toBe(false);
    const depois = applyBatch(m, lote).model;
    expect(registroDe(depois, 'ELETRODUTOS', q)?.escolhas.caixasDePassagem).toBe('CAIXAS');
    expect(textoDasDiferencas(diferencasDoEletroduto(depois, q, SEM_CAIXAS, HIPOTESES_PADRAO))).toMatch(/^Caixas de passagem — lançado com: com caixas/);
  });

  it('com as MESMAS escolhas do registro, o ponto novo regrava o registro (nada mudou)', () => {
    const m0 = aceitarTudo(lancadaComCaixas());
    const t = m0.levels[0].id;
    let m = applyCommand(m0, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(12000, 3925), cotaMm: 300, tipoEletrico: 'TUG' }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId: m.circuitos[0].id }).model;
    const lote = comandosDeLancarEletrodutos(m, planejarEletrodutosDoModelo(m, COM_CAIXAS), COM_CAIXAS, HIPOTESES_PADRAO);
    expect(lote.filter((c) => c.type === 'RegistrarLancamento')).toHaveLength(1);
  });
});

describe('correção 1 — a rede no FORRO continua no forro (C1)', () => {
  const FORRO = { faixa: { abaixoDoTetoMm: 45, afastamentoDaFaceMm: 50, degrauNaParedeMm: 0 }, folgaSobAVigaMm: 20 };
  const NO_FORRO: HipotesesDeEletroduto = { ...SEM_CAIXAS, noForro: FORRO };
  /** O ambiente com FORRO de gesso (rebaixo 30 cm, face a 2,486 m) — o sinal de forro de verdade (correção 2). */
  const comForro = (m: BlueprintModel) =>
    applyCommand(m, {
      type: 'NameSpace',
      spaceId: m.spaces[0].id,
      name: 'Sala',
      acabamentos: { forro: { camadas: [{ espessuraMm: 13, itemCode: '', descricao: 'Placa de gesso acartonado', funcao: 'ACABAMENTO' }, { espessuraMm: 1, itemCode: '', descricao: 'Pintura', funcao: 'ACABAMENTO' }], rebaixoMm: 300 } },
    }).model;
  const horizontaisEletricas = (m: BlueprintModel) => (m.trechos ?? []).filter((t) => t.disciplina === 'ELETRICA' && t.cotaAMm === t.cotaBMm && !(t.a.x === t.b.x && t.a.y === t.b.y));

  it('o registro guarda a faixa (sem rótulo) e não guarda a rota máxima; `hipotesesDoQuadro` a devolve', () => {
    const e = escolhasDoEletroduto(NO_FORRO, HIPOTESES_PADRAO);
    expect(e).toMatchObject({ forroAbaixoDoTetoMm: 45, forroAfastamentoDaFaceMm: 50, forroDegrauNaParedeMm: 0, forroFolgaSobAVigaMm: 20 });
    expect('rotaMaximaVezes' in e).toBe(false);
    for (const k of Object.keys(e).filter((x) => x.startsWith('forro'))) expect(ESCOLHAS_DO_ELETRODUTO.rotulos[k]).toBeUndefined();
    const m = sala();
    const q = m.quadros[0].id;
    const comRegistro = applyBatch(m, comandosDeLancarEletrodutos(m, planejarEletrodutosDoModelo(m, NO_FORRO), NO_FORRO, HIPOTESES_PADRAO)).model;
    expect(hipotesesDoQuadro(comRegistro, q, SEM_CAIXAS).noForro).toEqual(FORRO);
    // A rota máxima do painel não acende o aviso numa rede no forro.
    expect(diferencasDoEletroduto(comRegistro, q, { ...SEM_CAIXAS, rotaMaximaVezes: 2 }, HIPOTESES_PADRAO)).toEqual([]);
  });

  it('⚠️ rede no forro, preferência trocada: refazer pelo painel (sem `noForro` no painel) mantém todo horizontal na faixa', () => {
    const m = sala();
    const q = m.quadros[0].id;
    const lancada = aceitarTudo(applyBatch(m, comandosDeLancarEletrodutos(m, planejarEletrodutosDoModelo(m, NO_FORRO), NO_FORRO, HIPOTESES_PADRAO)).model);
    expect(horizontaisEletricas(lancada).length).toBeGreaterThan(0);
    expect(horizontaisEletricas(lancada).every((t) => t.cotaAMm === 2800 - 45)).toBe(true);
    const depois = applyBatch(lancada, comandosDeRefazerEletrodutos(lancada, [q], COM_CAIXAS, HIPOTESES_PADRAO)).model;
    expect(horizontaisEletricas(depois).length).toBeGreaterThan(0);
    expect(horizontaisEletricas(depois).map((t) => t.cotaAMm).filter((c) => c !== 2800 - 45)).toEqual([]);
    expect(registroDe(depois, 'ELETRODUTOS', q)?.escolhas).toMatchObject({ caixasDePassagem: 'CAIXAS', forroAbaixoDoTetoMm: 45 });
  });

  it('⚠️ rede no forro SEM registro (antiga): não relança por aqui — botões desligados com o motivo, lotes vazios', () => {
    const m = comForro(sala());
    const q = m.quadros[0].id;
    const antiga = aceitarTudo(applyBatch(m, planejarEletrodutosDoModelo(m, NO_FORRO)[0].comandos).model);
    expect(redeNoForroSemRegistro(antiga, q)).toBe(true);
    // Sem o forro no ambiente, a mesma cota não basta: não há sinal de forro (correção 2).
    expect(redeNoForroSemRegistro(aceitarTudo(applyBatch(sala(), planejarEletrodutosDoModelo(sala(), NO_FORRO)[0].comandos).model), q)).toBe(false);
    expect(motivoParaNaoRelancar(antiga, q)).toBe(MOTIVO_REDE_NO_FORRO_SEM_REGISTRO);
    const planos = planejarEletrodutosPorQuadro(antiga, SEM_CAIXAS, HIPOTESES_PADRAO);
    expect(botaoDeLancarEletrodutos(antiga, planos)).toMatchObject({ motivo: MOTIVO_REDE_NO_FORRO_SEM_REGISTRO, quadros: [] });
    expect(comandosDeRefazerEletrodutos(antiga, [q], SEM_CAIXAS, HIPOTESES_PADRAO)).toEqual([]);
    expect(comandosDeLancarEletrodutos(antiga, planos, SEM_CAIXAS, HIPOTESES_PADRAO)).toEqual([]);
    expect(redesARefazer(antiga)).toEqual([]);
    // Controle: a rede na cota do painel, sem registro, relança.
    const doPainel = aceitarTudo(applyBatch(m, planejarEletrodutosDoModelo(m, SEM_CAIXAS)[0].comandos).model);
    expect(motivoParaNaoRelancar(doPainel, q)).toBeNull();
  });
});

describe('correção 1 — menores', () => {
  it('M6: tabelas iguais às do sistema gravam "PADRAO" ("padrão do sistema"); personalizadas, "personalizadas no estudo"', () => {
    expect(escolhasDoEletroduto(SEM_CAIXAS, HIPOTESES_PADRAO).tabelasEletricas).toBe('PADRAO');
    const m = lancadaComCaixas();
    const d = diferencasDoEletroduto(m, m.quadros[0].id, COM_CAIXAS, { ...HIPOTESES_PADRAO, catalogoDeDisjuntoresA: [10, 20, 32] });
    expect(d).toEqual([expect.objectContaining({ item: 'tabelasEletricas', antes: 'padrão do sistema', agora: expect.stringMatching(/^personalizadas no estudo/) })]);
  });

  it('M2: com as hipóteses atuais, a confirmação diz também o que mudou', () => {
    const m = aceitarTudo(lancadaComCaixas());
    const texto = textoDaConfirmacaoDeRefazer(redesARefazer(m, undefined, { hip: SEM_CAIXAS, hipEletricas: HIPOTESES_PADRAO }));
    expect(texto).toMatch(/aceita\(s\)\)\. O que mudou: Caixas de passagem — lançado com: com caixas de passagem · agora: sem caixas \(pela luz do teto\)\.$/);
  });
});

// ─── Correção 2 (revisão final, 24/10/2026): só forro de verdade ────────────────────────────────────────────────
describe('correção 2 — "rota pela parede" com ponto alto não é forro', () => {
  /** Sala 6 × 4, QDC, uma TUE na face da parede de cima na cota dada; rota pela parede; planta antiga (sem registro). */
  const comTue = (cota: number) => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = base.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
    let m = applyBatch(base, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
    m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(75, 1000), cotaMm: 1600 }).model;
    m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1', ligacao: 'FN' }).model;
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUE', at: point(3000, 3925), cotaMm: cota, tipoEletrico: 'TUE' }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId: m.circuitos[0].id }).model;
    const hip = { ...SEM_CAIXAS, rotaPelaParede: true };
    return { m: applyBatch(m, planejarEletrodutosDoModelo(m, hip)[0].comandos).model, hip };
  };

  it.each([2200, 2300])('⚠️ TUE a %i mm, rota pela parede, sem forro: o horizontal na cota do ponto não bloqueia — o quadro relança', (cota) => {
    const { m, hip } = comTue(cota);
    const q = m.quadros[0].id;
    expect((m.trechos ?? []).some((t) => t.cotaAMm === cota && t.cotaBMm === cota && !(t.a.x === t.b.x && t.a.y === t.b.y))).toBe(true);
    expect(motivoParaNaoRelancar(m, q)).toBeNull();
    expect(botaoDeLancarEletrodutos(m, planejarEletrodutosPorQuadro(m, hip, HIPOTESES_PADRAO))).toMatchObject({ modo: 'RELANCAR', motivo: null, quadros: [q] });
  });
});
