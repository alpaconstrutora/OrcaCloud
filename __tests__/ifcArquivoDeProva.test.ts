/**
 * GERA O ARQUIVO DE PROVA para a conferência num visualizador de terceiros.
 *
 * ─── POR QUE ISTO É UM TESTE, E NÃO UM SCRIPT SOLTO ─────────────────────────
 *
 * Ele não só escreve o arquivo: ele AFIRMA o que o arquivo contém. A tabela que
 * vai junto do arquivo é derivada destas asserções, e não da minha memória —
 * se o gerador mudar, o teste quebra antes de alguém abrir o arquivo e
 * conferir uma expectativa desatualizada.
 *
 * Roda só com `IFC_PROVA=1`: escrever arquivo não é trabalho de suíte.
 *
 * Uso: `IFC_PROVA=1 npx vitest run __tests__/ifcArquivoDeProva.test.ts`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../utils/blueprintKernel';
import { gerarIfc } from '../utils/blueprintIfc';

const LIGADO = process.env.IFC_PROVA === '1';
const DESTINO = process.env.IFC_PROVA_DIR ?? 'C:/tmp/prova-ifc';

const H = 2800;
const T = 200;

/**
 * A casa de prova.
 *
 * Cada peça existe por causa de UMA pergunta da conferência — nada aqui é
 * decoração.
 */
function casaDeProva(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  }).model;
  const t = base.levels[0].id;

  const comSuperior = applyCommand(base, {
    type: 'AddLevel',
    name: 'Superior',
    elevationMm: H,
    defaultHeightMm: H,
  }).model;
  const s = comSuperior.levels[1].id;

  const parede = (levelId: string, ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  });

  // Uma sala de 10 × 6 m. A fachada de baixo (y = 0) leva as portas, para todas
  // ficarem lado a lado na mesma parede — assim a comparação é entre vizinhas,
  // e não entre lados diferentes da casa.
  const m1 = applyBatch(comSuperior, [
    parede(t, 0, 0, 10000, 0),
    parede(t, 10000, 0, 10000, 6000),
    parede(t, 10000, 6000, 0, 6000),
    parede(t, 0, 6000, 0, 0),
  ]).model;

  const fachada = m1.walls.find((w) => w.a.y === 0 && w.b.y === 0)!;

  const porta = (offsetMm: number, hingeAtStart: boolean, nome: string): Command => ({
    type: 'AddOpening',
    wallId: fachada.id,
    kind: 'door',
    offsetMm,
    widthMm: 900,
    heightMm: 2100,
    sillMm: 0,
    hingeAtStart,
    swingReversed: false,
    esquadria: { nome, itemCode: '', descricao: '' },
  });

  const m2 = applyBatch(m1, [
    // 1. MÃOS OPOSTAS. Mesma medida, mesma parede, dobradiça em pontas
    //    diferentes: se o OperationType sair igual nas duas, a mão está perdida.
    porta(1000, true, 'PORTA-ESQUERDA'),
    porta(2500, false, 'PORTA-DIREITA'),
    // 2. IDÊNTICAS. Mesmo nome e mesma medida: têm de cair sob UM tipo só.
    porta(4500, true, 'P1-IGUAL'),
    porta(6000, true, 'P1-IGUAL'),
    // 3. Uma janela com PEITORIL, para conferir que ela não nasce no chão.
    {
      type: 'AddOpening',
      wallId: fachada.id,
      kind: 'window',
      offsetMm: 7500,
      widthMm: 1500,
      heightMm: 1200,
      sillMm: 1000,
    },
  ]).model;

  // 4. ESCADA subindo do térreo ao superior, no sentido +x.
  const m3 = applyCommand(m2, {
    type: 'AddEscada',
    levelId: t,
    tipo: 'ESCADA',
    pontos: [point(2000, 4000), point(6000, 4000)],
    larguraMm: 1200,
    desnivelMm: H,
  }).model;

  // 5. TELHADO de uma água só, caindo para o lado de y = 0 (a fachada das
  //    portas), com beiral avançando 600 mm para fora.
  return applyCommand(m3, {
    type: 'AddAgua',
    levelId: s,
    pontos: [point(-600, -600), point(10600, -600), point(10600, 6600), point(-600, 6600)],
    inclinacaoPct: 30,
    // A água cai NA DIREÇÃO deste vetor: para o −y, que é a fachada das portas.
    caimento: point(0, -1),
    beiralMm: 600,
  }).model;
}

describe.skipIf(!LIGADO)('arquivo de prova para visualizador de terceiros', () => {
  it('escreve o IFC e AFIRMA o que ele contém', () => {
    const model = casaDeProva();
    const ifc = gerarIfc(model, {
      titulo: 'PROVA - conferencia em visualizador',
      revisao: 1,
      hash: 'p'.repeat(64),
      data: new Date('2026-09-07T12:00:00Z'),
      studyId: '11111111-2222-4333-8444-555555555555',
    });

    // ── O que a tabela de conferência vai afirmar ──────────────────────────
    const linhas = (e: string) => ifc.split('\n').filter((l) => new RegExp(`= ?${e}\\(`).test(l));

    const tipos = linhas('IFCDOORTYPE');

    // 1. MÃO DA PORTA: as duas de mãos opostas têm de sair com valores
    //    DIFERENTES. Se saírem iguais, a mão se perdeu na exportação.
    // ⚠️ O `OperationType` fica na PORTA (`IfcDoor`), e nao no `IfcDoorType`.
    // Procurei no tipo primeiro e nao achei nada — quem for conferir num
    // visualizador tem de selecionar a PORTA, nao a familia.
    const portas = linhas('IFCDOOR');
    const esquerda = portas.filter((l) => l.includes('SINGLE_SWING_LEFT')).length;
    const direita = portas.filter((l) => l.includes('SINGLE_SWING_RIGHT')).length;
    expect(esquerda).toBeGreaterThan(0);
    expect(direita).toBeGreaterThan(0);

    // 2. AGRUPAMENTO: 4 portas, mas as duas 'P1-IGUAL' compartilham tipo.
    expect(linhas('IFCDOOR')).toHaveLength(4);
    expect(tipos.length).toBeLessThan(4);

    // 3. Cada porta fura a parede, e a janela sai.
    expect(linhas('IFCRELVOIDSELEMENT').length).toBeGreaterThanOrEqual(5);
    expect(linhas('IFCWINDOW')).toHaveLength(1);

    // 4. Escada e telhado saem.
    expect(linhas('IFCSTAIR').length).toBeGreaterThan(0);
    expect(linhas('IFCROOF').length).toBeGreaterThan(0);

    mkdirSync(DESTINO, { recursive: true });
    const caminho = `${DESTINO}/prova-planta-inteligente.ifc`;
    writeFileSync(caminho, ifc, 'utf8');

    const nomes = tipos.map((l) => (l.match(/'([^']*)'/g) ?? [])[1] ?? '(sem nome)');
    console.log(`ARQUIVO: ${caminho}`);
    console.log(`portas: ${linhas('IFCDOOR').length} · tipos de porta: ${tipos.length}`);
    console.log(`LEFT: ${esquerda} tipo(s) · RIGHT: ${direita} tipo(s)`);
    console.log(`nomes dos tipos: ${nomes.join(' | ')}`);
    console.log(`escadas: ${linhas('IFCSTAIR').length} · telhados: ${linhas('IFCROOF').length}`);
  });
});
