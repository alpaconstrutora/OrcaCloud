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
import { gerarIfc } from '../utils/blueprintIfc';
const LIGADO = process.env.IFC_PROVA === '1';
const DESTINO = process.env.IFC_PROVA_DIR ?? 'C:/tmp/prova-ifc';

import { H, T, casaDeProva } from './apoio/casaDeProva';


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
