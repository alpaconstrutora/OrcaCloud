/**
 * O COMANDO COMO RELAÇÃO (E2.1 do roadmap elétrico, 29/09/2026, kernel 0.71.0).
 *
 * O modelo guarda uma letra por ponto; o índice `comandosDoModelo` deriva o
 * objeto — por pavimento, ou no desenho inteiro quando `comandoGlobal` (a
 * escada). A conferência 9.5.2.1 aceita o par do paralelo em outro andar
 * quando os dois são globais; sem a marca, continua a falta. O canônico omite a
 * chave quando falsa; a invariante recusa global sem letra.
 */
import { describe, expect, it } from 'vitest';
import { KERNEL_VERSION, applyBatch, applyCommand, canonicalPayload, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { comandosDoModelo, pendenciasDoComando } from '../utils/blueprintComandos';
import { conferirNbr5410 } from '../utils/blueprintNbr5410';

/** Dois pavimentos, cada um com uma sala 6 × 4 (parede a parede). */
function sobrado(): { m: BlueprintModel; t: string; p1: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: '1º andar', elevationMm: 2900, defaultHeightMm: 2800 }).model;
  const [t, p1] = m.levels.map((l) => l.id);
  const sala = (levelId: string): Command[] => [
    { type: 'AddWall', levelId, a: point(0, 0), b: point(6000, 0), thicknessMm: 150, heightMm: 2800 },
    { type: 'AddWall', levelId, a: point(6000, 0), b: point(6000, 4000), thicknessMm: 150, heightMm: 2800 },
    { type: 'AddWall', levelId, a: point(6000, 4000), b: point(0, 4000), thicknessMm: 150, heightMm: 2800 },
    { type: 'AddWall', levelId, a: point(0, 4000), b: point(0, 0), thicknessMm: 150, heightMm: 2800 },
  ];
  m = applyBatch(m, [...sala(t), ...sala(p1)]).model;
  return { m, t, p1 };
}

const luz = (m: BlueprintModel, levelId: string, x: number, y: number, comando: string, comandoGlobal = false) =>
  applyCommand(m, { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Luz', at: point(x, y), cotaMm: 2800, tipoEletrico: 'ILUMINACAO_TETO', potenciaW: 160, comando, comandoGlobal }).model;
const interruptor = (m: BlueprintModel, levelId: string, x: number, y: number, comando: string, variante: 'UMA_SECAO' | 'PARALELO' = 'UMA_SECAO', comandoGlobal = false) =>
  applyCommand(m, { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Int', at: point(x, y), cotaMm: 1100, tipoEletrico: 'INTERRUPTOR', interruptor: variante, comando, comandoGlobal }).model;

const regra9521 = (m: BlueprintModel, levelId: string | null = null) => conferirNbr5410(m, levelId).regras.find((r) => r.codigo === '9.5.2.1')!;

describe('comandos · o índice derivado', () => {
  it('kernel 0.71.0; a mesma letra em pavimentos diferentes são DOIS comandos; global junta os pavimentos', () => {
    expect(KERNEL_VERSION).toBe('blueprint-kernel-ts-0.79.0');
    const { m: m0, t, p1 } = sobrado();
    let m = luz(m0, t, 3000, 2000, 'a');
    m = interruptor(m, t, 200, 1000, 'a');
    m = luz(m, p1, 3000, 2000, 'a');
    m = interruptor(m, p1, 200, 1000, 'a');
    const dois = comandosDoModelo(m);
    expect(dois).toHaveLength(2);
    expect(dois.map((c) => c.levelIds)).toEqual([[t], [p1]]);
    expect(dois.every((c) => !c.global && c.interruptorIds.length === 1 && c.luzIds.length === 1)).toBe(true);
    expect(dois.map(pendenciasDoComando)).toEqual([[], []]);
    // A escada: paralelo em cada andar e a luz no andar de cima, todos globais na letra "e".
    m = interruptor(m, t, 5800, 3800, 'e', 'PARALELO', true);
    m = interruptor(m, p1, 5800, 3800, 'e', 'PARALELO', true);
    m = luz(m, p1, 5000, 3500, 'e', true);
    const tres = comandosDoModelo(m);
    expect(tres).toHaveLength(3);
    const escada = tres[0]; // global vem primeiro
    expect(escada.global).toBe(true);
    expect(escada.letra).toBe('e');
    expect(escada.levelIds.sort()).toEqual([t, p1].sort());
    expect(escada.interruptorIds).toHaveLength(2);
    expect(escada.luzIds).toHaveLength(1);
    expect(escada.variantes).toEqual(['PARALELO']);
    expect(pendenciasDoComando(escada)).toEqual([]);
  });

  it('pendências: interruptor sem luz, paralelo sozinho, intermediário sem paralelos', () => {
    const { m: m0, t } = sobrado();
    const so = interruptor(m0, t, 200, 1000, 'a', 'PARALELO');
    expect(pendenciasDoComando(comandosDoModelo(so)[0])).toEqual(['sem luz', 'paralelo sem o par']);
  });
});

describe('comandos · o par em outro pavimento (9.5.2.1)', () => {
  it('⚠️ paralelo de baixo e de cima com a MESMA letra: sem a marca, cada um é "sem o par"; com `comandoGlobal`, atende', () => {
    const { m: m0, t, p1 } = sobrado();
    let m = luz(m0, p1, 5000, 3500, 'e');
    m = interruptor(m, t, 5800, 3800, 'e', 'PARALELO');
    m = interruptor(m, p1, 5800, 3800, 'e', 'PARALELO');
    const semMarca = regra9521(m);
    expect(semMarca.achados.some((a) => /paralelo "e" sem o par/.test(a.mensagem))).toBe(true);
    // O interruptor do térreo não comanda luz nenhuma do térreo: aviso.
    expect(semMarca.achados.some((a) => a.nivel === 'AVISO' && /interruptor "e" não comanda/.test(a.mensagem))).toBe(true);
    const ids = m.terminais.map((x) => x.id);
    const global = applyBatch(m, ids.map((terminalId) => ({ type: 'SetTerminalProps' as const, terminalId, comandoGlobal: true }))).model;
    const comMarca = regra9521(global);
    expect(comMarca.achados.filter((a) => /"e"/.test(a.mensagem))).toEqual([]);
  });

  it('a luz global sem interruptor global continua falta — a marca não inventa um interruptor', () => {
    const { m: m0, p1 } = sobrado();
    const m = luz(m0, p1, 5000, 3500, 'e', true);
    // Sem interruptor NENHUM no cômodo a regra diz "sem interruptor" antes de olhar as letras.
    expect(regra9521(m).achados.some((a) => a.nivel === 'FALTA' && /sem interruptor/.test(a.mensagem))).toBe(true);
  });
});

describe('comandos · kernel', () => {
  it('canônico: `comandoGlobal` só aparece quando verdadeiro; ida e volta preserva', () => {
    const { m: m0, t } = sobrado();
    // `canonicalPayload` já devolve a string canônica — comparar nela, não numa reserialização.
    const texto = (m: BlueprintModel) => { const p = canonicalPayload(m) as unknown; return typeof p === 'string' ? p : JSON.stringify(p); };
    const semMarca = luz(m0, t, 3000, 2000, 'a');
    expect(texto(semMarca)).not.toContain('comandoGlobal');
    const comMarca = luz(m0, t, 3000, 2000, 'a', true);
    expect(texto(comMarca)).toContain('"comandoGlobal":true');
  });

  it('a invariante recusa global sem letra; tirar a letra tira a marca; SetTerminalProps liga e desliga', () => {
    const { m: m0, t } = sobrado();
    expect(() => applyCommand(m0, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Luz', at: point(3000, 2000), cotaMm: 2800, tipoEletrico: 'ILUMINACAO_TETO', comandoGlobal: true })).toThrow(/Comando global sem letra/);
    let m = luz(m0, t, 3000, 2000, 'a', true);
    const id = m.terminais[0].id;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: id, comandoGlobal: false }).model;
    expect(m.terminais[0].comandoGlobal ?? null).toBeNull();
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: id, comandoGlobal: true }).model;
    expect(m.terminais[0].comandoGlobal).toBe(true);
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: id, comando: null }).model;
    expect(m.terminais[0].comandoGlobal ?? null).toBeNull();
  });
});
