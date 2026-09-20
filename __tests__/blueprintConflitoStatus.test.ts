/**
 * Status do conflito (20/09/2026, backlog P2 — P2.1): aceite por par de uids
 * com justificativa; o aceito sai da contagem; se o encontro cresce além da
 * folga, volta a contar; aceite órfão é detectável; BCF fecha o tópico aceito.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, conflitosArquitetonicos, conflitosDoModelo, emptyModel, point, type Command } from '../utils/blueprintKernel';
import {
  aceitesOrfaos,
  chaveDoConflitoArq,
  chaveDoConflitoMep,
  classificarArq,
  classificarMep,
  contarStatus,
  cresceuAlemDoAceito,
  indexarAceites,
  validarJustificativa,
  type AceiteDeConflito,
} from '../utils/blueprintConflitoStatus';
import { topicosDeConflitos, topicosDeConflitosArquitetonicos } from '../utils/blueprintBcf';

function cena() {
  const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m0.levels[0].id;
  const m = applyBatch(m0, [
    // Condensadora com pilar dentro (arquitetônico, RESERVA_X_ESTRUTURA).
    { type: 'AddComponente', levelId: t, tipoId: 'CONDENSADORA', at: point(3000, 3000) },
    { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(3000, 3000)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800, baseMm: 0 } as Command,
    // Eletroduto atravessando uma viga (MEP, ESTRUTURA).
    { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [point(0, 6000), point(4000, 6000)], larguraMm: 150, alturaMm: 400, baseMm: 2400 } as Command,
    { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(2000, 5000), b: point(2000, 7000), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 25 } as Command,
  ]).model;
  return m;
}

const aceite = (chave: string, medidaMm: number, extra: Partial<AceiteDeConflito> = {}): AceiteDeConflito => ({
  id: `a-${chave}`, studyId: 'std', chave, classe: 'X', medidaMm, justificativa: 'fica assim até a etapa 2', acceptedEmail: 'eng@x.com', createdAt: '2026-09-20T10:00:00Z', ...extra,
});

describe('status do conflito (P2.1)', () => {
  it('sem aceite tudo é ABERTO; aceitar tira da contagem; a chave é o par de uids', () => {
    const m = cena();
    const arq = conflitosArquitetonicos(m);
    const mep = conflitosDoModelo(m);
    expect(arq).toHaveLength(1);
    expect(mep).toHaveLength(1);
    const vazio = indexarAceites([]);
    expect(contarStatus([...classificarArq(arq, vazio), ...classificarMep(mep, vazio)])).toEqual({ abertos: 2, aceitos: 0, cresceram: 0 });
    const chaveArq = chaveDoConflitoArq(arq[0]);
    expect(chaveArq).toBe(`${arq[0].pecaUid}:${arq[0].outroUid}`);
    const com = indexarAceites([aceite(chaveArq, arq[0].medidaMm)]);
    const lista = [...classificarArq(arq, com), ...classificarMep(mep, com)];
    expect(contarStatus(lista)).toEqual({ abertos: 1, aceitos: 1, cresceram: 0 });
    const aceito = lista.find((c) => c.status === 'ACEITO')!;
    expect(aceito.chave).toBe(chaveArq);
    expect(aceito.aceite?.justificativa).toBe('fica assim até a etapa 2');
    expect(lista.find((c) => c.chave === chaveDoConflitoMep(mep[0]))!.status).toBe('ABERTO');
  });

  it('o aceite caduca quando o encontro cresce além da folga (25 % + 20 mm); órfãos são os aceites sem par vivo', () => {
    expect(cresceuAlemDoAceito(200, 200)).toBe(false);
    expect(cresceuAlemDoAceito(260, 200)).toBe(false); // 200 × 1,25 + 20 = 270
    expect(cresceuAlemDoAceito(271, 200)).toBe(true);
    expect(cresceuAlemDoAceito(21, 0)).toBe(true);
    expect(cresceuAlemDoAceito(0, 0)).toBe(false);
    const m = cena();
    const arq = conflitosArquitetonicos(m);
    const chave = chaveDoConflitoArq(arq[0]);
    // Aceito com 50 mm; hoje são 200 → volta a ABERTO e acusa que cresceu.
    const lista = classificarArq(arq, indexarAceites([aceite(chave, 50)]));
    expect(lista[0]).toMatchObject({ status: 'ABERTO', cresceu: true });
    expect(contarStatus(lista)).toEqual({ abertos: 1, aceitos: 0, cresceram: 1 });
    // Órfão: um aceite de par que não existe mais.
    const orfaos = aceitesOrfaos([aceite(chave, 200), aceite('uid-x:uid-y', 10)], new Set([chave]));
    expect(orfaos.map((a) => a.chave)).toEqual(['uid-x:uid-y']);
    expect(validarJustificativa('  ')).toMatch(/mínimo 3/);
    expect(validarJustificativa('x'.repeat(501))).toMatch(/500/);
    expect(validarJustificativa('provisório')).toBeNull();
  });

  it('BCF: o tópico do par aceito sai Closed com a justificativa; o outro continua Open', () => {
    const m = cena();
    const arq = conflitosArquitetonicos(m);
    const mep = conflitosDoModelo(m);
    const agora = new Date('2026-09-20T12:00:00Z');
    const aceites = new Map([[chaveDoConflitoArq(arq[0]), { justificativa: 'shaft provisório', acceptedEmail: 'eng@x.com' }]]);
    const tArq = topicosDeConflitosArquitetonicos(m, arq, 'eu', agora, aceites);
    const tMep = topicosDeConflitos(m, mep, 'eu', agora, aceites);
    expect(tArq[0].status).toBe('Closed');
    expect(tArq[0].descricao).toMatch(/ACEITO por eng@x.com: shaft provisório/);
    expect(tMep[0].status).toBe('Open');
    // Sem aceites, o mesmo de sempre.
    expect(topicosDeConflitosArquitetonicos(m, arq, 'eu', agora)[0].status).toBe('Open');
  });
});
