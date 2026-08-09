/**
 * Trava de prefixo duplicado em `supabase/migrations/`.
 *
 * O prefixo faz UMA coisa: dizer a ordem. Repetido, ele para de fazer.
 *
 * Aconteceu em 09/08/2026: três migrations minhas (`aplicar_20270905000006`,
 * `000007`, `000008`) colidiram com três de outra frente criadas mais cedo no
 * mesmo dia. Nada quebrou na aplicação — são `aplicar_*`, rodadas à mão, fora do
 * `schema_migrations`. O estrago é de leitura: quem abre a pasta daqui a um mês
 * não sabe qual das duas `000007` rodou primeiro, e qualquer ferramenta que
 * ordene por nome intercala as duas frentes de forma arbitrária.
 *
 * Com várias frentes no mesmo repositório, colidir é questão de tempo. Esta
 * trava é o que faz a próxima aparecer no CI em vez de num `ls` seis meses
 * depois.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const PASTA = path.join(process.cwd(), 'supabase', 'migrations');

/**
 * Colisões que JÁ EXISTIAM quando a trava foi criada.
 *
 * Ficam anistiadas de propósito. Renomear migration antiga é pior do que a
 * duplicata: as `2027*` foram aplicadas por SQL direto, fora de
 * `schema_migrations`, e mudar o nome de um arquivo já rodado só cria dúvida
 * sobre se ele rodou. A lista é FECHADA — ela não pode crescer, e é isso que
 * esta trava garante.
 */
const ANISTIADOS = new Set([
  '20270113000000',
  '20270717000001',
  '20270717000002',
  '20270815000005',
  '20270819000010',
  '20270822000012',
  '20270823000004',
  '20270825000020',
  '20270835000000',
  '20270842000000',
]);

/** `aplicar_20270905000009_x.sql` e `20270905000009_x.sql` dão o mesmo prefixo. */
function prefixoDe(arquivo: string): string | null {
  const m = /^(?:aplicar_)?(\d{14})_/.exec(arquivo);
  return m ? m[1] : null;
}

function migrations(): string[] {
  return readdirSync(PASTA).filter((f) => f.endsWith('.sql'));
}

describe('migrations · o prefixo tem de ser único', () => {
  it('NENHUMA COLISÃO NOVA', () => {
    const porPrefixo = new Map<string, string[]>();

    for (const arquivo of migrations()) {
      const p = prefixoDe(arquivo);
      if (!p) continue;
      porPrefixo.set(p, [...(porPrefixo.get(p) ?? []), arquivo]);
    }

    const novas = [...porPrefixo.entries()]
      .filter(([p, arquivos]) => arquivos.length > 1 && !ANISTIADOS.has(p))
      .map(([p, arquivos]) => `  ${p}\n${arquivos.map((a) => `    ${a}`).join('\n')}`);

    expect(
      novas,
      novas.length === 0
        ? ''
        : `Prefixo repetido em supabase/migrations/:\n\n${novas.join('\n\n')}\n\n` +
          'Renomeie a MAIS NOVA para o próximo número livre — quem chegou depois é ' +
          'quem move, para não mexer no trabalho de outra frente. E registre o ' +
          'número antigo no cabeçalho do arquivo, com um aviso se ela JÁ foi ' +
          'aplicada: sem isso, quem a encontrar depois pode rodá-la de novo.',
    ).toEqual([]);
  });

  it('a anistia não pode crescer nem envelhecer', () => {
    // Um prefixo que sai da lista (porque alguém resolveu a duplicata) tem de
    // sair da anistia também. Anistia com item morto vira lista que ninguém lê,
    // e aí a próxima colisão entra escondida no meio.
    const duplicadosHoje = new Set(
      [...migrations().reduce((m, arquivo) => {
        const p = prefixoDe(arquivo);
        if (p) m.set(p, (m.get(p) ?? 0) + 1);
        return m;
      }, new Map<string, number>())]
        .filter(([, n]) => n > 1)
        .map(([p]) => p),
    );

    const mortos = [...ANISTIADOS].filter((p) => !duplicadosHoje.has(p));

    expect(
      mortos,
      `Estes prefixos estão anistiados e não colidem mais: ${mortos.join(', ')}. ` +
        'Remova-os de ANISTIADOS.',
    ).toEqual([]);
  });

  it('todo arquivo .sql tem prefixo de 14 dígitos', () => {
    // Arquivo sem prefixo não tem lugar na ordem — e escapa da trava acima.
    const semPrefixo = migrations().filter((f) => prefixoDe(f) === null);

    expect(
      semPrefixo,
      `Sem prefixo de 14 dígitos: ${semPrefixo.join(', ')}`,
    ).toEqual([]);
  });
});
