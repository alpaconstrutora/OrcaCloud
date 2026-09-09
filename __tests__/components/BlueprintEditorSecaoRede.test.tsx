// @vitest-environment jsdom
/**
 * ⚠️ Selecionar uma peça de INSTALAÇÃO abre a seção onde ela se edita.
 *
 * ─── O RELATO ───────────────────────────────────────────────────────────────
 *
 * *"Onde fica a edição dos pontos elétricos?"* (09/09/2026)
 *
 * Fica na seção **Componentes** do painel direito — a mesma da parede. E era
 * justamente esse o problema: a seção abria sozinha ao selecionar parede,
 * abertura ou estrutura, e NÃO ao selecionar ponto, trecho ou quadro. Com ela
 * fechada, clicar na tomada destacava a peça no desenho e a lateral seguia
 * muda: nem as propriedades, nem o circuito, nem um sinal de que havia algo
 * para ver.
 *
 * ─── ⚠️ POR QUE ESTE TESTE É SOBRE A FONTE ─────────────────────────────────
 *
 * `BlueprintEditor` monta o canvas, o viewer 3D e uma dúzia de serviços — não
 * sobe em jsdom. A condição que decide isto é uma expressão booleana de cinco
 * linhas, e o defeito era uma AUSÊNCIA nela: três famílias que ninguém somou.
 * Um portão sobre a fonte pega exatamente essa classe de erro, que é a que
 * aconteceu, e diz o motivo na mensagem.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ARQUIVO = join(process.cwd(), 'components', 'blueprint', 'BlueprintEditor.tsx');

/** A expressão que decide se a seção Componentes abre sozinha. */
function condicao(): string {
  const fonte = readFileSync(ARQUIVO, 'utf8');
  const i = fonte.indexOf('const selecaoTemComponente =');
  expect(i, 'a condição mudou de nome — o portão precisa acompanhar').toBeGreaterThan(0);
  return fonte.slice(i, fonte.indexOf(';', i));
}

describe('BlueprintEditor · a seção do painel abre para a peça selecionada', () => {
  it('⚠️ o arquivo foi lido — senão o portão aprova o vácuo', () => {
    expect(readFileSync(ARQUIVO, 'utf8').length).toBeGreaterThan(50_000);
  });

  it('as famílias de sempre continuam abrindo a seção', () => {
    const c = condicao();
    for (const f of ['paredesSelecionadas', 'aberturasSelecionadas', 'estruturasSelecionadas']) {
      expect(c, f).toContain(f);
    }
  });

  it('⚠️ a REDE também abre — o painel dela vive na MESMA seção', () => {
    const c = condicao();
    for (const familia of ['trechos', 'terminais', 'quadros']) {
      expect(
        c,
        `selecionar ${familia} precisa abrir a seção Componentes: é onde o painel ` +
          'da peça é renderizado, e com ela fechada a seleção não mostra nada',
      ).toContain(`model.${familia}`);
    }
  });
});
