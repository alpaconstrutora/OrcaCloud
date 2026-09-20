/**
 * Multiusuário (20/09/2026, E10.1) — a parte pura: presença agregada por
 * pessoa, trava por elemento (seleção da outra pessoa), ids que um comando
 * toca, aplicação de comando remoto com idempotência e conferência de hash
 * (dois históricos convergem; comando recusado e divergência são acusados),
 * papel por estudo e menções em comentários.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, ModelHistory, point, type Command } from '../utils/blueprintKernel';
import { agregarPresenca, aplicarRemoto, corDoParticipante, idsTocadosPeloComando, iniciais, mencoesDoTexto, novaMensagem, papelNoEstudo, sugerirMencoes, travaDoComando, travasDe, type Participante } from '../utils/blueprintColaboracao';

function sala() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 4000, 0), w(4000, 0, 4000, 3000), w(4000, 3000, 0, 3000), w(0, 3000, 0, 0)]).model;
  return { m, t };
}

describe('colaboração (E10.1)', () => {
  it('cores estáveis por pessoa, iniciais de nome ou e-mail; presença agregada por userId (duas abas = 1 pessoa, 2 conexões), sem a própria, em ordem de nome', () => {
    expect(corDoParticipante('u1')).toBe(corDoParticipante('u1'));
    expect(iniciais('Maria da Silva')).toBe('MS');
    expect(iniciais('joao.pedro@x.com')).toBe('JP');
    expect(iniciais('ana')).toBe('AN');
    const ps = agregarPresenca(
      [
        { userId: 'u2', email: 'zeca@x.com', nome: 'Zeca', levelId: 'lvl_1', selecionados: ['wal_0001'] },
        { userId: 'u2', email: 'zeca@x.com', nome: 'Zeca', levelId: 'lvl_2', selecionados: ['wal_0002'] },
        { userId: 'u3', email: 'ana@x.com', nome: 'Ana', levelId: null, selecionados: [] },
        { userId: 'eu', email: 'eu@x.com', nome: 'Eu', levelId: 'lvl_1', selecionados: ['wal_0009'] },
      ],
      'eu',
    );
    expect(ps.map((p) => [p.nome, p.conexoes, p.selecionados])).toEqual([['Ana', 1, []], ['Zeca', 2, ['wal_0001', 'wal_0002']]]);
    const travas = travasDe(ps);
    expect(travas.get('wal_0001')?.nome).toBe('Zeca');
    expect(travas.has('wal_0009')).toBe(false);
  });

  it('ids tocados: campos …Id/…Ids menos levelId; criar não toca em nada; a trava acusa o comando (ou lote) que esbarra em seleção alheia, com quem', () => {
    const { t } = sala();
    expect(idsTocadosPeloComando({ type: 'AddWall', levelId: t, a: point(0, 0), b: point(1, 0), thicknessMm: 150, heightMm: 2800 })).toEqual([]);
    expect(idsTocadosPeloComando({ type: 'SetThickness', wallId: 'wal_0001', thicknessMm: 200 } as Command)).toEqual(['wal_0001']);
    expect(idsTocadosPeloComando({ type: 'DeleteWalls', wallIds: ['wal_0001', 'wal_0002'] } as unknown as Command)).toEqual(['wal_0001', 'wal_0002']);
    const zeca: Participante = { userId: 'u2', email: 'z@x', nome: 'Zeca', cor: '#000', levelId: null, selecionados: ['wal_0001'], conexoes: 1 };
    const travas = travasDe([zeca]);
    expect(travaDoComando([{ type: 'SetThickness', wallId: 'wal_0002', thicknessMm: 200 } as Command], travas)).toBeNull();
    expect(travaDoComando([{ type: 'AddWall', levelId: t, a: point(0, 0), b: point(1, 0), thicknessMm: 150, heightMm: 2800 }, { type: 'SetThickness', wallId: 'wal_0001', thicknessMm: 200 } as Command], travas)).toMatchObject({ id: 'wal_0001', por: { nome: 'Zeca' } });
  });

  it('dois históricos convergem pelo comando difundido: mesmo hash; a mesma mensagem duas vezes não aplica duas vezes; comando que o kernel recusa e divergência são acusados', () => {
    const { m, t } = sala();
    const A = new ModelHistory(m);
    const B = new ModelHistory(m);
    // A edita e difunde.
    const cmd: Command = { type: 'SetThickness', wallId: A.current.walls[0].id, thicknessMm: 200 } as Command;
    const rA = A.apply(cmd);
    const msg = novaMensagem('uA', 'Ana', [cmd], rA.hash);
    const rB = aplicarRemoto(B, msg);
    expect(rB).toMatchObject({ ok: true, divergiu: false, hashLocal: rA.hash });
    expect(B.current.walls[0].thicknessMm).toBe(200);
    // Replay da mesma mensagem: idempotente.
    const antes = B.hash;
    expect(aplicarRemoto(B, msg)).toMatchObject({ ok: true, divergiu: false });
    expect(B.hash).toBe(antes);
    // B também edita e difunde para A: convergem.
    const cmd2: Command = { type: 'AddWall', levelId: t, a: point(2000, 0), b: point(2000, 3000), thicknessMm: 150, heightMm: 2800 };
    const rB2 = B.apply(cmd2);
    expect(aplicarRemoto(A, novaMensagem('uB', 'Bia', [cmd2], rB2.hash))).toMatchObject({ ok: true, divergiu: false });
    expect(A.hash).toBe(B.hash);
    // Comando que o kernel recusa aqui (parede inexistente): ok false, com a mensagem do kernel.
    const ruim = aplicarRemoto(A, novaMensagem('uB', 'Bia', [{ type: 'SetThickness', wallId: 'wal_9999', thicknessMm: 200 } as Command], 'x'));
    expect(ruim.ok).toBe(false);
    expect(ruim.erro).toBeTruthy();
    // Aplicou, mas o autor tinha outro hash: divergiu.
    const cmd3: Command = { type: 'SetThickness', wallId: A.current.walls[1].id, thicknessMm: 250 } as Command;
    expect(aplicarRemoto(A, novaMensagem('uB', 'Bia', [cmd3], 'hash-de-outro-mundo'))).toMatchObject({ ok: true, divergiu: true });
  });

  it('papel por estudo: sem linha = editor; leitor só quando há a linha daquele estudo e e-mail (sem maiúscula); menções por e-mail ou primeiro nome único, sem acento', () => {
    const perms = [{ studyId: 's1', email: 'ana@x.com', papel: 'LEITOR' as const }];
    expect(papelNoEstudo(perms, 's1', 'Ana@X.com')).toBe('LEITOR');
    expect(papelNoEstudo(perms, 's2', 'ana@x.com')).toBe('EDITOR');
    expect(papelNoEstudo(perms, 's1', 'bia@x.com')).toBe('EDITOR');
    expect(papelNoEstudo(perms, 's1', null)).toBe('EDITOR');
    const membros = [
      { email: 'joao.silva@alpa.com', nome: 'João Silva' },
      { email: 'maria@alpa.com', nome: 'Maria Souza' },
      { email: 'joao.pedro@alpa.com', nome: 'João Pedro' },
    ];
    expect(mencoesDoTexto('Vê isso @maria e @joao.silva@alpa.com, por favor', membros)).toEqual(['maria@alpa.com', 'joao.silva@alpa.com']);
    expect(mencoesDoTexto('@Joao', membros)).toEqual([]); // ambíguo: dois Joões
    expect(mencoesDoTexto('@joão.pedro e de novo @joao.pedro', membros)).toEqual(['joao.pedro@alpa.com']);
    expect(mencoesDoTexto('email sem arroba: maria', membros)).toEqual([]);
    expect(sugerirMencoes('jo', membros).map((m) => m.email)).toEqual(['joao.silva@alpa.com', 'joao.pedro@alpa.com']);
    expect(sugerirMencoes('', membros)).toHaveLength(3);
  });
});
