/**
 * F5 do plano `docs/planos/2026-10-24-relancar-quando-escolha-muda.md` (24/10/2026): os CIRCUITOS AUTOMÁTICOS
 * relançam quando uma escolha muda.
 *
 * Pedido: *"quando o usuário faz uma allteracao em preferencias … o motor … deve ficar disponivel para relançar e
 * incluir essa nova preferencia. Isto deve valer para qualquer alteracao de preferencia"* — e, decisão do usuário,
 * rede já aceita + escolha mudou → refaz tudo, PEDINDO CONFIRMAÇÃO.
 *
 * O que se prova: as diferenças (e o que fica fora delas); quais circuitos são do motor (pela assinatura no registro,
 * que sobrevive ao payload) e que o editado à mão FICA; os lotes levam o registro e o Ctrl+Z volta tudo; o lote
 * parcial não regrava; o Refazer tira só os do motor (e os eletrodutos que só os levavam — o plano dos eletrodutos
 * passa a mostrar os pontos a ligar) e recria com as escolhas novas; a confirmação; a regra A.
 */
import { describe, expect, it } from 'vitest';
import {
  ModelHistory,
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  modelFromCanonicalPayload,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { HIPOTESES_CIRCUITOS_PADRAO, planejarCircuitos, renumerarCircuitos, type HipotesesDeCircuitos } from '../utils/blueprintCircuitosAutomaticos';
import { HIPOTESES_PADRAO } from '../utils/blueprintEletricaDimensionamento';
import { HIPOTESES_ELETRODUTO_PADRAO, planejarEletrodutos } from '../utils/blueprintEletrodutos';
import { TEXTO_NADA_MUDOU, registroDe, textoDasDiferencas } from '../utils/blueprintRegistroDeLancamento';
import { comandosDasSugestoesDeDR, sugerirDRs } from '../utils/blueprintNbr5410';
import {
  CHAVE_DOS_CIRCUITOS_DO_MOTOR,
  ESCOLHAS_DOS_CIRCUITOS,
  botaoDosCircuitos,
  circuitosARefazer,
  circuitosDoPavimento,
  comandoDeRegistroDosCircuitosCriados,
  comandosDeCriarCircuitos,
  comandosDeRefazerCircuitos,
  diferencasDosCircuitos,
  escolhasDosCircuitos,
  pavimentosComDiferenca,
  quadroDosCircuitosDoMotor,
  textoDaConfirmacaoDosCircuitos,
} from '../utils/blueprintEscolhasDosCircuitos';

type Tipo = 'TUG' | 'TUE' | 'ILUMINACAO_TETO' | 'INTERRUPTOR';
const ponto = (t: string, x: number, y: number, tipoEletrico: Tipo, potenciaW: number | null, rotulo?: string): Command => ({
  type: 'AddTerminal',
  levelId: t,
  disciplina: 'ELETRICA',
  tipo: tipoEletrico,
  at: point(x, y),
  cotaMm: tipoEletrico === 'ILUMINACAO_TETO' ? 2800 : 300,
  tipoEletrico,
  potenciaW,
  ...(rotulo ? { rotulo } : {}),
});

/**
 * Sala 6 × 4 e Cozinha 4 × 4, QDC 127 V FN na sala, um circuito À MÃO ("C1 — Existente") com uma TUG da sala; os
 * outros pontos soltos: luz + interruptor + 2 TUG na sala, luz + 2 TUG na cozinha, o micro-ondas.
 */
function planta() {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  let m = applyBatch(base, [w(0, 0, 10000, 0), w(10000, 0, 10000, 4000), w(10000, 4000, 0, 4000), w(0, 4000, 0, 0), w(6000, 0, 6000, 4000)]).model;
  const sala = m.spaces.find((s) => s.ring.some((p) => p.x === 0))!;
  const cozinha = m.spaces.find((s) => s.id !== sala.id)!;
  m = applyCommand(m, { type: 'NameSpace', spaceId: sala.id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' }).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: cozinha.id, name: 'Cozinha', tipoDeAmbiente: 'COZINHA_SERVICO' }).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(500, 500), cotaMm: 1500, tensaoV: 127, ligacao: 'FN' }).model;
  const quadroId = m.quadros![0].id;
  const r = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C1 — Existente', tipo: 'TUG' });
  m = r.model;
  const manual = r.diff.created[0];
  m = applyBatch(m, [
    ponto(t, 3000, 2000, 'ILUMINACAO_TETO', 160),
    ponto(t, 200, 1000, 'INTERRUPTOR', null),
    ponto(t, 1000, 200, 'TUG', 100),
    ponto(t, 2000, 200, 'TUG', 100),
    ponto(t, 8000, 2000, 'ILUMINACAO_TETO', 100),
    ponto(t, 7000, 200, 'TUG', 600),
    ponto(t, 8000, 200, 'TUG', 600),
    ponto(t, 9500, 1000, 'TUE', 1200, 'Micro-ondas'),
    ponto(t, 5500, 200, 'TUG', 100),
  ]).model;
  const doManual = m.terminais![m.terminais!.length - 1].id;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: doManual, circuitoId: manual }).model;
  return { m, t, quadroId, manual, doManual };
}

const HIP: HipotesesDeCircuitos = { ...HIPOTESES_CIRCUITOS_PADRAO };
const POR_FUNCAO: HipotesesDeCircuitos = { ...HIP, criterio: 'funcao' };
const criar = (m: BlueprintModel, t: string, q: string, hip: HipotesesDeCircuitos = HIP) => applyBatch(m, comandosDeCriarCircuitos(m, t, q, hip, HIPOTESES_PADRAO).comandos).model;
const publicar = (m: BlueprintModel) => modelFromCanonicalPayload(JSON.parse(canonicalPayload(m)));

describe('escolhas dos circuitos e diferenças (regra B)', () => {
  it('iguais → nada; critério trocado → a diferença, dita com o rótulo do painel', () => {
    const { m, t, quadroId } = planta();
    const c = criar(m, t, quadroId);
    expect(diferencasDosCircuitos(c, t, escolhasDosCircuitos(HIP, HIPOTESES_PADRAO))).toEqual([]);
    const d = diferencasDosCircuitos(c, t, escolhasDosCircuitos({ ...HIP, criterio: 'carga' }, HIPOTESES_PADRAO));
    expect(textoDasDiferencas(d)).toBe('Dividir luz e TUG — lançado com: por ambiente · agora: por carga máxima');
  });

  it('carga declarada × padrão; seção de TUE do estudo; com "um por função" a carga não conta', () => {
    const { m, t, quadroId } = planta();
    const c = criar(m, t, quadroId);
    const carga = diferencasDosCircuitos(c, t, escolhasDosCircuitos({ ...HIP, cargaMaximaVA: 1500 }, HIPOTESES_PADRAO));
    expect(textoDasDiferencas(carga)).toBe('Carga máxima por circuito — lançado com: padrão (10 A × tensão do quadro) · agora: 1.500 VA');
    const tue = diferencasDosCircuitos(c, t, escolhasDosCircuitos(HIP, { secaoMinimaTueMm2: 6 }));
    expect(tue.map((x) => [x.item, x.antes, x.agora])).toEqual([['secaoMinimaTueMm2', '4 mm²', '6 mm²']]);
    const f = criar(m, t, quadroId, POR_FUNCAO);
    expect(diferencasDosCircuitos(f, t, escolhasDosCircuitos({ ...POR_FUNCAO, cargaMaximaVA: 1500 }, HIPOTESES_PADRAO))).toEqual([]);
  });

  it('toda escolha com rótulo tem padrão; a chave das assinaturas não tem rótulo (fora do aviso)', () => {
    for (const k of Object.keys(ESCOLHAS_DOS_CIRCUITOS.rotulos)) expect(ESCOLHAS_DOS_CIRCUITOS.padroes).toHaveProperty(k);
    expect(ESCOLHAS_DOS_CIRCUITOS.rotulos).not.toHaveProperty(CHAVE_DOS_CIRCUITOS_DO_MOTOR);
  });

  it('correção 1 (M2): os OUTROS pavimentos com circuitos do motor criados com outras escolhas', () => {
    const { m, t, quadroId } = planta();
    let c = criar(m, t, quadroId);
    c = applyCommand(c, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const s = c.levels[1].id;
    c = applyBatch(c, [ponto(s, 1000, 1000, 'TUG', 100), ponto(s, 2000, 1000, 'ILUMINACAO_TETO', 100)]).model;
    c = criar(c, s, quadroId);
    const carga = escolhasDosCircuitos({ ...HIP, criterio: 'carga' }, HIPOTESES_PADRAO);
    expect(pavimentosComDiferenca(c, carga, t)).toEqual(['Superior']);
    expect(pavimentosComDiferenca(c, carga, s)).toEqual(['Térreo']);
    expect(pavimentosComDiferenca(c, escolhasDosCircuitos(HIP, HIPOTESES_PADRAO), t)).toEqual([]);
  });

  it('circuitos antigos, sem registro: nenhuma diferença', () => {
    const { m, t, quadroId } = planta();
    const plano = planejarCircuitos(m, t, quadroId, HIP, HIPOTESES_PADRAO);
    const antigo = applyBatch(m, plano.comandos).model;
    expect(registroDe(antigo, 'CIRCUITOS', t)).toBeNull();
    expect(diferencasDosCircuitos(antigo, t, escolhasDosCircuitos({ ...HIP, criterio: 'carga' }, HIPOTESES_PADRAO))).toEqual([]);
  });
});

describe('quais circuitos são do motor', () => {
  it('os criados pelo motor; o criado à mão fica de fora — e a identificação sobrevive ao payload', () => {
    const { m, t, quadroId, manual } = planta();
    const c = criar(m, t, quadroId);
    const cls = circuitosDoPavimento(c, t);
    const criados = (c.circuitos ?? []).filter((x) => x.id !== manual);
    expect(cls.doMotor.map((x) => x.id).sort()).toEqual(criados.map((x) => x.id).sort());
    expect(cls.outros.map((x) => x.id)).toEqual([manual]);
    expect(quadroDosCircuitosDoMotor(c, t)).toBe(quadroId);
    const volta = publicar(c);
    const clsVolta = circuitosDoPavimento(volta, t);
    expect(clsVolta.doMotor.map((x) => x.nome).sort()).toEqual(criados.map((x) => x.nome).sort());
    expect(clsVolta.outros.map((x) => x.nome)).toEqual(['C1 — Existente']);
  });

  it('do motor com disjuntor/seção declarados depois → alterado (fica); renomeado → do usuário; a fase não conta', () => {
    const { m, t, quadroId } = planta();
    const c = criar(m, t, quadroId);
    const [a, b, f] = circuitosDoPavimento(c, t).doMotor;
    const editado = applyBatch(c, [
      { type: 'SetCircuitoProps', circuitoId: a.id, disjuntorA: 20 },
      { type: 'SetCircuitoProps', circuitoId: b.id, nome: 'Minha luz' },
      { type: 'SetCircuitoProps', circuitoId: f.id, fase: 'R' },
    ]).model;
    const cls = circuitosDoPavimento(editado, t);
    expect(cls.alterados.map((x) => x.id)).toEqual([a.id]);
    expect(cls.outros.map((x) => x.nome)).toContain('Minha luz');
    expect(cls.doMotor.map((x) => x.id)).toContain(f.id);
    expect(cls.doMotor.map((x) => x.id)).not.toContain(a.id);
    expect(cls.doMotor.map((x) => x.id)).not.toContain(b.id);
  });
  it('I3: "Renumerar circuitos" não tira o circuito do motor (o número fica fora da assinatura)', () => {
    const { m, t, quadroId, manual } = planta();
    // Sem o C1 à mão, os do motor (C2…) ficam fora de sequência — o "Renumerar" troca os números.
    const c = applyCommand(criar(m, t, quadroId), { type: 'DeleteCircuito', circuitoId: manual }).model;
    const antes = circuitosDoPavimento(c, t).doMotor.map((x) => x.id).sort();
    const renumerado = applyBatch(c, renumerarCircuitos(c, quadroId)).model;
    expect(renumerado.circuitos!.map((x) => x.nome)).not.toEqual(c.circuitos!.map((x) => x.nome));
    expect(circuitosDoPavimento(renumerado, t).doMotor.map((x) => x.id).sort()).toEqual(antes);
    // Refazer → renumerar → continuam do motor.
    const refeito = applyBatch(renumerado, comandosDeRefazerCircuitos(renumerado, t, quadroId, POR_FUNCAO, HIPOTESES_PADRAO).comandos).model;
    const motor = circuitosDoPavimento(refeito, t).doMotor.map((x) => x.id).sort();
    expect(motor.length).toBeGreaterThan(0);
    // Outro número em cada um (o que o "Renumerar" faz quando há lacuna).
    const deNovo = applyBatch(
      refeito,
      circuitosDoPavimento(refeito, t).doMotor.map((x): Command => ({ type: 'SetCircuitoProps', circuitoId: x.id, nome: x.nome.replace(/^C(\d+)/, (_, n) => `C${Number(n) + 10}`) })),
    ).model;
    expect(deNovo.circuitos!.map((x) => x.nome)).not.toEqual(refeito.circuitos!.map((x) => x.nome));
    expect(circuitosDoPavimento(deNovo, t).doMotor.map((x) => x.id).sort()).toEqual(motor);
  });

  it('M1: circuito SEM ponto só é do motor no quadro dos circuitos do motor deste pavimento', () => {
    const { m, t, quadroId } = planta();
    const c = criar(m, t, quadroId);
    const [a] = circuitosDoPavimento(c, t).doMotor;
    // Um segundo quadro, e nele um circuito vazio com a MESMA assinatura de um do motor: não é do motor deste pavimento.
    let m2 = applyCommand(c, { type: 'AddQuadro', levelId: t, nome: 'QD2', at: point(9000, 3000), cotaMm: 1500, tensaoV: 127, ligacao: 'FN' }).model;
    const q2 = m2.quadros![1].id;
    m2 = applyCommand(m2, { type: 'AddCircuito', quadroId: q2, nome: a.nome, tipo: a.tipo, tensaoV: a.tensaoV, ligacao: a.ligacao, secaoMm2: a.secaoMm2 }).model;
    const vazioNoOutro = m2.circuitos![m2.circuitos!.length - 1];
    expect(circuitosDoPavimento(m2, t).doMotor.map((x) => x.id)).not.toContain(vazioNoOutro.id);
    // O próprio circuito do motor que perdeu os pontos (mesmo quadro dos outros do motor): continua do motor.
    const semPontos = applyBatch(c, (c.terminais ?? []).filter((x) => x.circuitoId === a.id).map((x): Command => ({ type: 'SetTerminalProps', terminalId: x.id, circuitoId: null }))).model;
    expect(circuitosDoPavimento(semPontos, t).doMotor.map((x) => x.id)).toContain(a.id);
  });
});

describe('lote de criar', () => {
  it('leva o registro (escolhas + assinaturas); o Ctrl+Z volta circuitos, pontos e registro', () => {
    const { m, t, quadroId } = planta();
    const { comandos, plano } = comandosDeCriarCircuitos(m, t, quadroId, HIP, HIPOTESES_PADRAO);
    expect(comandos.filter((c) => c.type === 'RegistrarLancamento')).toHaveLength(1);
    const h = new ModelHistory(m);
    h.applyMany(comandos);
    const r = registroDe(h.current, 'CIRCUITOS', t)!;
    expect(r.escolhas).toMatchObject({ criterio: 'ambiente', cargaMaximaVA: 'PADRAO', secaoMinimaTueMm2: 4 });
    expect(String(r.escolhas[CHAVE_DOS_CIRCUITOS_DO_MOTOR]).split(' ')).toHaveLength(plano.circuitos.length);
    h.undo();
    expect(h.current).toEqual(m);
  });

  it('lote PARCIAL: sobram circuitos do motor com outra escolha → as escolhas antigas ficam (o aviso segue); o novo entra nas assinaturas', () => {
    const { m, t, quadroId } = planta();
    const c = criar(m, t, quadroId);
    const novoPonto = applyCommand(c, ponto(t, 4000, 3000, 'TUG', 100)).model;
    const depois = criar(novoPonto, t, quadroId, { ...HIP, criterio: 'carga' });
    expect(registroDe(depois, 'CIRCUITOS', t)!.escolhas.criterio).toBe('ambiente');
    expect(diferencasDosCircuitos(depois, t, escolhasDosCircuitos({ ...HIP, criterio: 'carga' }, HIPOTESES_PADRAO))).toHaveLength(1);
    expect(circuitosDoPavimento(depois, t).doMotor).toHaveLength(circuitosDoPavimento(c, t).doMotor.length + 1);
    // Controle: com as mesmas escolhas, o registro é regravado (e o novo entra).
    const igual = criar(novoPonto, t, quadroId);
    expect(circuitosDoPavimento(igual, t).doMotor).toHaveLength(circuitosDoPavimento(c, t).doMotor.length + 1);
    // Sem nenhum do motor sobrando (todos apagados), grava as escolhas novas.
    const semMotor = applyBatch(novoPonto, circuitosDoPavimento(c, t).doMotor.map((x): Command => ({ type: 'DeleteCircuito', circuitoId: x.id }))).model;
    expect(registroDe(criar(semMotor, t, quadroId, { ...HIP, criterio: 'carga' }), 'CIRCUITOS', t)!.escolhas.criterio).toBe('carga');
  });
});

describe('refazer', () => {
  it('tira só os do motor; o ponto do circuito à mão e o circuito alterado ficam; recria com a escolha nova; o aviso apaga; Ctrl+Z volta', () => {
    const { m, t, quadroId, manual, doManual } = planta();
    const c = criar(m, t, quadroId);
    const motorAntes = circuitosDoPavimento(c, t).doMotor;
    const alterado = motorAntes.find((x) => x.tipo === 'TUE')!;
    const comEdicao = applyCommand(c, { type: 'SetCircuitoProps', circuitoId: alterado.id, disjuntorA: 25 }).model;
    const pontosDoAlterado = (comEdicao.terminais ?? []).filter((x) => x.circuitoId === alterado.id).map((x) => x.id);
    const h = new ModelHistory(comEdicao);
    h.applyMany(comandosDeRefazerCircuitos(comEdicao, t, quadroId, POR_FUNCAO, HIPOTESES_PADRAO).comandos);
    const depois = h.current;
    // O à mão e o alterado continuam, com os mesmos pontos.
    expect(depois.circuitos!.some((x) => x.id === manual)).toBe(true);
    expect(depois.terminais!.find((x) => x.id === doManual)!.circuitoId).toBe(manual);
    expect(depois.circuitos!.find((x) => x.id === alterado.id)?.disjuntorA).toBe(25);
    expect((depois.terminais ?? []).filter((x) => x.circuitoId === alterado.id).map((x) => x.id)).toEqual(pontosDoAlterado);
    // Os do motor saíram e voltaram "um por função" (1 de luz, 1 de TUG, 1 de TUG da cozinha), numerados depois do maior que ficou (C6, o TUE alterado).
    const motor = circuitosDoPavimento(depois, t).doMotor;
    for (const x of motorAntes.filter((y) => y.id !== alterado.id)) expect(depois.circuitos!.some((y) => y.id === x.id)).toBe(false);
    expect(motor.map((x) => x.nome)).toEqual(['C7 — Iluminação', 'C8 — TUG', 'C9 — TUG Cozinha']);
    // Nenhum ponto elegível ficou solto.
    expect(planejarCircuitos(depois, t, quadroId, POR_FUNCAO, HIPOTESES_PADRAO).circuitos).toEqual([]);
    expect(registroDe(depois, 'CIRCUITOS', t)!.escolhas.criterio).toBe('funcao');
    expect(diferencasDosCircuitos(depois, t, escolhasDosCircuitos(POR_FUNCAO, HIPOTESES_PADRAO))).toEqual([]);
    // O alterado continua reconhecido como "do motor, alterado".
    expect(circuitosDoPavimento(depois, t).alterados.map((x) => x.id)).toEqual([alterado.id]);
    h.undo();
    expect(h.current).toEqual(comEdicao);
  });

  it('os eletrodutos que só levavam os circuitos refeitos saem (nada órfão); o que leva também o circuito à mão fica; o plano dos eletrodutos mostra os pontos a ligar', () => {
    const { m, t, quadroId, manual } = planta();
    const c = criar(m, t, quadroId);
    const quadro = c.quadros![0];
    const comRede = applyBatch(c, planejarEletrodutos(c, quadro, HIPOTESES_ELETRODUTO_PADRAO, HIPOTESES_PADRAO).comandos).model;
    expect(planejarEletrodutos(comRede, quadro, HIPOTESES_ELETRODUTO_PADRAO, HIPOTESES_PADRAO).comandos).toEqual([]);
    const alvo = circuitosARefazer(comRede, t);
    expect(alvo.trechos.length).toBeGreaterThan(0);
    expect(alvo.trechosQueFicam).toBeGreaterThan(0);
    const depois = applyBatch(comRede, comandosDeRefazerCircuitos(comRede, t, quadroId, POR_FUNCAO, HIPOTESES_PADRAO).comandos).model;
    // Nenhum eletroduto órfão (sem circuito nenhum).
    expect((depois.trechos ?? []).filter((x) => x.disciplina === 'ELETRICA' && !(x.circuitoIds ?? []).length)).toEqual([]);
    // O que levava o circuito à mão ficou, só com ele.
    const doManual = (depois.trechos ?? []).filter((x) => (x.circuitoIds ?? []).includes(manual));
    expect(doManual.length).toBeGreaterThan(0);
    // O plano dos eletrodutos passa a mostrar o que ligar.
    const plano = planejarEletrodutos(depois, depois.quadros![0], HIPOTESES_ELETRODUTO_PADRAO, HIPOTESES_PADRAO);
    expect(plano.aLigar).toBeGreaterThan(0);
    expect(plano.comandos.length).toBeGreaterThan(0);
  });

  it('a confirmação diz o que sai, o que volta, o que fica, e que os eletrodutos e a fiação precisarão ser relançados', () => {
    const { m, t, quadroId } = planta();
    const c = criar(m, t, quadroId);
    const quadro = c.quadros![0];
    const comRede = applyBatch(c, planejarEletrodutos(c, quadro, HIPOTESES_ELETRODUTO_PADRAO, HIPOTESES_PADRAO).comandos).model;
    const alterado = circuitosDoPavimento(comRede, t).doMotor[0];
    const ed = applyCommand(comRede, { type: 'SetCircuitoProps', circuitoId: alterado.id, secaoMm2: 4 }).model;
    const alvo = circuitosARefazer(ed, t);
    const atuais = escolhasDosCircuitos(POR_FUNCAO, HIPOTESES_PADRAO);
    const texto = textoDaConfirmacaoDosCircuitos(alvo, { novos: 2, quadro: 'QDC', diferencas: diferencasDosCircuitos(ed, t, atuais) })!;
    expect(texto).toContain(`Térreo: saem ${alvo.circuitos.length} circuito(s) do motor`);
    expect(texto).toContain(`os ${alvo.pontos} ponto(s) deles`);
    expect(texto).toContain('2 circuito(s) novo(s) no quadro QDC');
    expect(texto).toContain('O que mudou: Dividir luz e TUG — lançado com: por ambiente · agora: um por função');
    expect(texto).toContain('Os eletrodutos e a fiação desses circuitos precisarão ser relançados');
    expect(texto).toContain(`${alvo.trechos.length} eletroduto(s) que só os levavam são apagados`);
    expect(texto).toContain('que levam também outros circuitos ficam');
    expect(texto).toContain(`1 do motor alterado(s) depois de criado(s) — disjuntor, seção, curva, DR… (${alterado.nome})`);
    expect(texto).toContain('1 criado(s) à mão, renomeado(s) ou com ponto em outro pavimento (C1 — Existente)');
    expect(texto).toContain('a escolha nova não se aplica a eles');
    const semNenhumDoMotor = applyBatch(c, circuitosDoPavimento(c, t).doMotor.map((x): Command => ({ type: 'DeleteCircuito', circuitoId: x.id }))).model;
    expect(textoDaConfirmacaoDosCircuitos(circuitosARefazer(semNenhumDoMotor, t), { novos: 0, quadro: 'QDC', diferencas: [] })).toBeNull();
  });

  it('M5: com registro e nenhuma escolha mudada, a confirmação diz que o resultado será o mesmo', () => {
    const { m, t, quadroId } = planta();
    const c = criar(m, t, quadroId);
    const texto = textoDaConfirmacaoDosCircuitos(circuitosARefazer(c, t), { novos: 3, quadro: 'QDC', diferencas: [] })!;
    expect(texto).toContain(TEXTO_NADA_MUDOU);
  });

  it('fase de um circuito do motor: a confirmação diz que se perde (edições à mão)', () => {
    const { m, t, quadroId } = planta();
    const c = criar(m, t, quadroId);
    const [a] = circuitosDoPavimento(c, t).doMotor;
    const comFase = applyCommand(c, { type: 'SetCircuitoProps', circuitoId: a.id, fase: 'S' }).model;
    const texto = textoDaConfirmacaoDosCircuitos(circuitosARefazer(comFase, t), { novos: 3, quadro: 'QDC', diferencas: [] })!;
    expect(texto).toContain(`Perdem-se as edições à mão: ${a.nome} (fase S).`);
  });

  it('I2: os DRs são refeitos — nenhum DR vazio depois, e o circuito novo que pede DR ganha o seu', () => {
    const { m, t, quadroId } = planta();
    const c = criar(m, t, quadroId);
    const comDr = applyBatch(c, comandosDasSugestoesDeDR(sugerirDRs(c, quadroId, HIPOTESES_PADRAO))).model;
    const antes = comDr.quadros![0].drs ?? [];
    expect(antes.length).toBeGreaterThan(0);
    const alvo = circuitosARefazer(comDr, t);
    expect(alvo.drs).toBe(antes.length);
    expect(textoDaConfirmacaoDosCircuitos(alvo, { novos: 3, quadro: 'QDC', diferencas: [] })).toContain('Os DRs são refeitos');
    const depois = applyBatch(comDr, comandosDeRefazerCircuitos(comDr, t, quadroId, POR_FUNCAO, HIPOTESES_PADRAO).comandos).model;
    const drs = depois.quadros![0].drs ?? [];
    expect(drs.filter((d) => d.circuitoIds.length === 0)).toEqual([]);
    // O TUG da cozinha (refeito) pede DR e tem o seu.
    const cozinha = depois.circuitos!.find((x) => x.nome.includes('TUG Cozinha'))!;
    expect(drs.some((d) => d.circuitoIds.includes(cozinha.id))).toBe(true);
    const doMotor = new Set(circuitosDoPavimento(depois, t).doMotor.map((x) => x.id));
    expect(sugerirDRs(depois, quadroId, HIPOTESES_PADRAO).filter((s) => doMotor.has(s.circuitoId))).toEqual([]);
  });
});

describe('I1: circuitos de ANTES do registro (a planta Garden)', () => {
  const plano = (m: BlueprintModel, t: string, q: string | null) => planejarCircuitos(m, t, q, HIP, HIPOTESES_PADRAO);

  it('o botão oferece "Refazer todos os circuitos deste pavimento"; a confirmação é FORTE (cada nome, as edições que se perdem, os eletrodutos)', () => {
    const { m, t, quadroId } = planta();
    let antigo = applyBatch(m, plano(m, t, quadroId).comandos).model;
    antigo = applyBatch(antigo, planejarEletrodutos(antigo, antigo.quadros![0], HIPOTESES_ELETRODUTO_PADRAO, HIPOTESES_PADRAO).comandos).model;
    const [a, b] = (antigo.circuitos ?? []).filter((x) => x.nome !== 'C1 — Existente');
    antigo = applyBatch(antigo, [
      { type: 'SetCircuitoProps', circuitoId: a.id, disjuntorA: 20 },
      { type: 'SetCircuitoProps', circuitoId: b.id, fase: 'R' },
    ]).model;
    const botao = botaoDosCircuitos(antigo, t, plano(antigo, t, quadroId));
    expect(botao).toEqual({ modo: 'RELANCAR', rotulo: 'Refazer todos os circuitos deste pavimento', motivo: null, refazer: null });
    const alvo = circuitosARefazer(antigo, t);
    expect(alvo.modo).toBe('TODOS');
    expect(alvo.circuitos).toHaveLength((antigo.circuitos ?? []).length);
    const texto = textoDaConfirmacaoDosCircuitos(alvo, { novos: 5, quadro: 'QDC', diferencas: [] })!;
    expect(texto).toContain(`Térreo: saem TODOS os ${alvo.circuitos.length} circuito(s) deste pavimento — foram criados antes do registro`);
    for (const x of antigo.circuitos ?? []) expect(texto).toContain(x.nome);
    expect(texto).toContain(`${a.nome} (disjuntor 20 A)`);
    expect(texto).toContain(`${b.nome} (fase R)`);
    expect(texto).toContain(`${alvo.trechos.length} eletroduto(s) que só os levavam são apagados`);
    expect(texto).not.toContain(TEXTO_NADA_MUDOU);
    // Refeito: todos saem, os pontos voltam a ter circuito, o registro passa a existir — e nada de eletroduto órfão.
    const depois = applyBatch(antigo, comandosDeRefazerCircuitos(antigo, t, quadroId, POR_FUNCAO, HIPOTESES_PADRAO).comandos).model;
    for (const x of antigo.circuitos ?? []) expect(depois.circuitos!.some((y) => y.id === x.id)).toBe(false);
    expect(plano(depois, t, quadroId).circuitos).toEqual([]);
    expect(registroDe(depois, 'CIRCUITOS', t)!.escolhas.criterio).toBe('funcao');
    expect((depois.trechos ?? []).filter((x) => x.disciplina === 'ELETRICA' && !(x.circuitoIds ?? []).length)).toEqual([]);
  });

  it('nenhum motivo manda apagar circuito', () => {
    const { m, t, quadroId } = planta();
    const c = criar(m, t, quadroId);
    const todosAlterados = applyBatch(c, circuitosDoPavimento(c, t).doMotor.map((x): Command => ({ type: 'SetCircuitoProps', circuitoId: x.id, disjuntorA: 16 }))).model;
    for (const mm of [todosAlterados, m]) {
      const b = botaoDosCircuitos(mm, t, plano(mm, t, quadroId));
      expect(`${b.motivo ?? ''} ${b.refazer ?? ''}`).not.toMatch(/apague/i);
    }
  });
});

describe('regra A (o botão do rodapé)', () => {
  const plano = (m: BlueprintModel, t: string, q: string | null) => planejarCircuitos(m, t, q, HIP, HIPOTESES_PADRAO);

  it('há o que criar → "Criar N" (com "Refazer tudo" ao lado); nada a criar e circuitos do motor → "Relançar com as escolhas atuais"', () => {
    const { m, t, quadroId } = planta();
    expect(botaoDosCircuitos(m, t, plano(m, t, quadroId))).toMatchObject({ modo: 'CRIAR', motivo: null });
    const c = criar(m, t, quadroId);
    expect(botaoDosCircuitos(c, t, plano(c, t, quadroId))).toEqual({ modo: 'RELANCAR', rotulo: 'Relançar com as escolhas atuais', motivo: null, refazer: null });
    const novo = applyCommand(c, ponto(t, 4000, 3000, 'TUG', 100)).model;
    expect(botaoDosCircuitos(novo, t, plano(novo, t, quadroId))).toMatchObject({ modo: 'CRIAR', rotulo: 'Criar 1 circuito(s)', refazer: null });
  });

  it('desligado SEMPRE com motivo: alterados todos; sem quadro; nenhum ponto — e o "Refazer tudo" desligado diz por quê', () => {
    const { m, t, quadroId } = planta();
    const c = criar(m, t, quadroId);
    const todosAlterados = applyBatch(c, circuitosDoPavimento(c, t).doMotor.map((x): Command => ({ type: 'SetCircuitoProps', circuitoId: x.id, disjuntorA: 16 }))).model;
    const b = botaoDosCircuitos(todosAlterados, t, plano(todosAlterados, t, quadroId));
    expect(b.motivo).toMatch(/^Nada a criar: os circuitos do motor neste pavimento foram alterados/);
    expect(b.refazer).toMatch(/^Nada a refazer/);
    expect(botaoDosCircuitos(m, t, plano(m, t, null)).motivo).toMatch(/^Nenhum quadro no desenho/);
    const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = vazio.levels[0].id;
    const comQuadro = applyCommand(vazio, { type: 'AddQuadro', levelId: l, nome: 'QDC', at: point(0, 0), cotaMm: 1500 }).model;
    expect(botaoDosCircuitos(comQuadro, l, plano(comQuadro, l, comQuadro.quadros![0].id)).motivo).toBe('Nada a criar: nenhum ponto elétrico sem circuito neste pavimento.');
  });
});

describe('Casa Automática: o registro dos circuitos que ela criou', () => {
  it('só os criados, com pontos só neste pavimento; nenhum → null', () => {
    const { m, t, quadroId, manual } = planta();
    const plano = planejarCircuitos(m, t, quadroId, HIP, HIPOTESES_PADRAO);
    const depois = applyBatch(m, plano.comandos).model;
    const criados = new Set((depois.circuitos ?? []).map((c) => c.id).filter((id) => id !== manual));
    const cmd = comandoDeRegistroDosCircuitosCriados(depois, t, criados, HIP, HIPOTESES_PADRAO)!;
    const comRegistro = applyBatch(depois, [cmd]).model;
    expect(circuitosDoPavimento(comRegistro, t).doMotor).toHaveLength(plano.circuitos.length);
    expect(circuitosDoPavimento(comRegistro, t).outros.map((c) => c.id)).toEqual([manual]);
    expect(comandoDeRegistroDosCircuitosCriados(depois, t, new Set(), HIP, HIPOTESES_PADRAO)).toBeNull();
  });
});
