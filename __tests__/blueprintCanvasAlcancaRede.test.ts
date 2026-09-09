/**
 * ⚠️ A rede continua ALCANÇÁVEL pelos três caminhos de seleção.
 *
 * O defeito de 09/09/2026 não foi um erro de conta: foi uma família desenhada e
 * nunca ligada à seleção. Isso não se pega com teste de geometria — as funções
 * de acerto estavam certas, elas é que não eram chamadas. Pega-se conferindo que
 * o componente as CHAMA, nos três caminhos que existem: o clique, o laço e o
 * Ctrl+A.
 *
 * O `BlueprintCanvas` não é renderizável em teste (precisa de contexto 2D, que o
 * jsdom não tem), então a conferência é sobre a fonte. É um portão grosseiro de
 * propósito: ele não diz que a seleção está certa, diz que ela EXISTE — e a
 * ausência era o defeito inteiro.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CANVAS = join(process.cwd(), 'components', 'blueprint', 'BlueprintCanvas.tsx');
const fonte = () => readFileSync(CANVAS, 'utf8');

/**
 * `trecho` aparece na cadeia E antes da parede.
 *
 * ⚠️ A PRESENÇA vem primeiro, e não é zelo: `indexOf` devolve **-1** para o que
 * não existe, e `-1 < posição da parede` é VERDADEIRO. Medido em 09/09/2026 —
 * removi quadro e terminal da cadeia para conferir o portão, e ele APROVOU. Um
 * portão que aprova a ausência é pior que portão nenhum, porque dá sossego.
 */
function antesDaParede(cadeia: string, trecho: string) {
  expect(cadeia, `${trecho} sumiu da cadeia de acerto`).toContain(trecho);
  expect(cadeia.indexOf(trecho), `${trecho} precisa vir antes da parede`).toBeLessThan(
    cadeia.indexOf('w?.id'),
  );
}

describe('BlueprintCanvas · a rede é alcançável', () => {
  it('⚠️ o arquivo foi lido — senão o portão aprova o vácuo', () => {
    // Renomear o componente ou rodar de outro diretório faria todas as buscas
    // abaixo passarem sobre uma string vazia.
    expect(fonte().length).toBeGreaterThan(50_000);
    expect(fonte()).toContain('const idsNoLaco');
  });

  it('o CLIQUE testa quadro, terminal e trecho', () => {
    const s = fonte();
    for (const fn of ['quadroSob(mundo)', 'terminalSob(mundo)', 'trechoSob(mundo)']) {
      expect(s, `a cadeia de acerto do clique precisa de ${fn}`).toContain(fn);
    }
  });

  it('⚠️ o TRECHO vem antes da PAREDE na cadeia', () => {
    // O caso normal de um eletroduto é correr DENTRO de uma parede. Depois
    // dela, o cano embutido nunca seria pego — e "não consigo selecionar" é
    // exatamente o defeito que estamos fechando.
    const s = fonte();
    const cadeia = s.slice(s.indexOf('const clicado ='), s.indexOf('const acumular ='));
    expect(cadeia).toContain('w?.id');
    antesDaParede(cadeia, 'trechoClicado?.id');
  });

  it('⚠️ QUADRO e TERMINAL vêm antes da PAREDE — a tomada FICA na parede', () => {
    const s = fonte();
    const cadeia = s.slice(s.indexOf('const clicado ='), s.indexOf('const acumular ='));
    expect(cadeia).toContain('w?.id');
    antesDaParede(cadeia, 'quadroClicado?.id');
    antesDaParede(cadeia, 'terminalClicado?.id');
  });

  it('o LAÇO pega as três famílias', () => {
    const s = fonte();
    const laco = s.slice(s.indexOf('const idsNoLaco'), s.indexOf('// ── Tamanho'));
    for (const fonte2 of ['trechosReais', 'terminaisReais', 'quadrosReais']) {
      expect(laco, `o laço precisa varrer ${fonte2}`).toContain(fonte2);
    }
  });

  it('o Ctrl+A leva a rede junto', () => {
    // Sem isto, "selecionar tudo e mover" moveria a casa e deixaria os canos
    // para trás — calado, que é o pior jeito de errar.
    const s = fonte();
    const trecho = s.slice(s.indexOf("(e.key === 'a' || e.key === 'A')"));
    const chamada = trecho.slice(0, trecho.indexOf(']);'));
    for (const familia of ['trechosDoNivel', 'terminaisDoNivel', 'quadrosDoNivel']) {
      expect(chamada, `o Ctrl+A precisa incluir ${familia}`).toContain(familia);
    }
  });

  it('⚠️ a PRÉVIA do arraste desloca a rede', () => {
    // Sem ela, arrastar não mexeria nada na tela e o cano pularia para o lugar
    // novo ao soltar: o gesto pareceria travado até o instante em que já acabou.
    const s = fonte();
    for (const memo of ['const trechosDoNivel = useMemo', 'const quadrosDoNivel = useMemo']) {
      const i = s.indexOf(memo);
      expect(i, memo).toBeGreaterThan(0);
      expect(s.slice(i, i + 700)).toContain('movendoSelecao?.delta');
    }
  });
});
