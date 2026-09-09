/**
 * ⚠️ Nenhum canvas de desenho volta a usar o `onWheel` do React.
 *
 * A correção de 09/09/2026 tem uma propriedade ruim: ela é INVISÍVEL no ponto de
 * uso. Quem escrever o próximo canvas — corte, vista 3D ortogonal, o que vier —
 * vai escrever `onWheel={aoRolar}`, porque é o que a documentação do React
 * mostra e é o que o editor completa. E vai funcionar em jsdom, e vai rolar a
 * página no navegador, exatamente como rolou até hoje.
 *
 * Este arquivo é o portão que diz isso na hora, com o motivo junto. Não substitui
 * `rodaNaoPassiva.test.tsx`, que prova que o hook funciona: prova que ele é o
 * único caminho.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PASTA = join(process.cwd(), 'components', 'blueprint');

/** Os arquivos varridos. Vazio aqui seria um portão que aprova o vácuo. */
function arquivos(): string[] {
  return readdirSync(PASTA).filter((f) => f.endsWith('.tsx'));
}

describe('canvas de desenho · a roda passa pelo hook, não pelo onWheel', () => {
  it('⚠️ a varredura acha os arquivos — senão ela aprova o vácuo', () => {
    // Renomear a pasta, mudar a extensão ou rodar de outro diretório faria a
    // lista esvaziar e TODO o portão abaixo passar sem ler uma linha.
    const lista = arquivos();
    expect(lista.length).toBeGreaterThan(20);
    expect(lista).toContain('BlueprintCanvas.tsx');
    expect(lista).toContain('ElevationCanvas.tsx');
  });

  it('nenhum componente do blueprint usa onWheel', () => {
    // O ATRIBUTO, e não a palavra: os comentários que explicam por que
    // `onWheel` não serve citam o nome, e um portão que os acusasse obrigaria a
    // apagar justamente a explicação que ele existe para preservar.
    const culpados = arquivos().filter((f) =>
      /onWheel\s*=/.test(readFileSync(join(PASTA, f), 'utf8')),
    );
    expect(
      culpados,
      'onWheel do React é PASSIVO: o preventDefault dentro dele é ignorado pelo ' +
        'navegador e a página rola junto com o zoom. Use useRodaNaoPassiva.',
    ).toEqual([]);
  });

  it('os dois canvases com zoom chamam useRodaNaoPassiva', () => {
    for (const f of ['BlueprintCanvas.tsx', 'ElevationCanvas.tsx']) {
      expect(readFileSync(join(PASTA, f), 'utf8'), f).toContain('useRodaNaoPassiva(canvasRef');
    }
  });

  it('o hook de vista compartilhado também não expõe um tratador de React', () => {
    // `useCanvasVista.aoRolar` é servido a qualquer canvas novo. Tipado como
    // `React.WheelEvent`, ele CONVIDA ao `onWheel` — e o convite é o defeito.
    const fonte = readFileSync(join(process.cwd(), 'hooks', 'useCanvasVista.ts'), 'utf8');
    expect(fonte).not.toContain('React.WheelEvent');
  });
});
