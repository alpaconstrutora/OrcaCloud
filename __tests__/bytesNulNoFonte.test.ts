/**
 * NENHUM BYTE NUL NO CÓDIGO-FONTE (24/09/2026, P2.47).
 *
 * ⚠️ ISTO JÁ ACONTECEU DUAS VEZES, e a segunda passou três semanas escondida.
 *
 * Um `\0` LITERAL dentro de uma template string — escrito como separador de
 * chave de Map, porque "NUL nunca aparece no dado" — faz o **git tratar o
 * arquivo inteiro como binário**. As consequências não são estéticas:
 *
 *   • `git diff` e `git show` não mostram mais as mudanças ("Binary files
 *     differ"), então a revisão fica cega naquele arquivo;
 *   • um merge com conflito ali não tem como ser resolvido linha a linha;
 *   • `grep`/ripgrep PULAM o arquivo por padrão — foi assim que se descobriu o
 *     caso de `quantities.ts`: uma busca por `porEsquadria` devolveu só
 *     "Binary file matches", num arquivo de 82 KB de TypeScript comum.
 *
 * Em 21/09 foi `utils/dxfLeitor.ts` (P2.33), corrigido trocando o separador
 * por `\n`. Em 24/09 apareceram mais seis: cinco em
 * `utils/blueprintKernel/quantities.ts` e um em `utils/blueprintTabelas.ts`.
 * Duas vezes é padrão, não acidente — por isso a trava é mecânica, e é um
 * teste (e não um script que alguém precisa lembrar de rodar), pelo mesmo
 * motivo que `orgContextGuard` e `segurancaMigrations` são testes: o `vitest
 * run` do CI já os executa a cada push.
 *
 * `\n` é o substituto certo: tem a mesma propriedade que se queria do NUL
 * (nunca aparece dentro de um código de item, uma função de camada ou uma
 * disciplina), e o git continua lendo o arquivo como texto.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Onde há código escrito à mão. `dist`, `node_modules` e `.git` ficam fora. */
const RAIZES = ['components', 'utils', 'hooks', 'lib', 'services', 'store', 'types', 'scripts', '__tests__', 'supabase/migrations', 'supabase/functions'];

/** Só o que é texto por natureza — o resto pode legitimamente ter NUL. */
const EXTENSOES = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sql', '.css', '.html', '.json', '.md', '.sh', '.yml', '.yaml'];

const IGNORAR = new Set(['node_modules', 'dist', '.git', 'coverage', '.vite']);

function arquivosDeTexto(dir: string, saida: string[] = []): string[] {
  let entradas: ReturnType<typeof readdirSync>;
  try {
    entradas = readdirSync(dir);
  } catch {
    return saida; // raiz que não existe nesta frente não é falha
  }
  for (const nome of entradas) {
    if (IGNORAR.has(nome)) continue;
    const caminho = join(dir, nome);
    let info;
    try {
      info = statSync(caminho);
    } catch {
      continue;
    }
    if (info.isDirectory()) arquivosDeTexto(caminho, saida);
    else if (EXTENSOES.some((e) => nome.toLowerCase().endsWith(e))) saida.push(caminho);
  }
  return saida;
}

describe('byte NUL no código-fonte', () => {
  it('nenhum arquivo de texto do projeto contém \\0 — ele faz o git tratar o arquivo como binário', () => {
    const comNul: string[] = [];
    for (const raiz of RAIZES) {
      for (const arquivo of arquivosDeTexto(raiz)) {
        const buf = readFileSync(arquivo);
        const n = buf.filter((b) => b === 0).length;
        if (n > 0) comNul.push(`${arquivo} (${n})`);
      }
    }
    // A mensagem tem de dizer O QUE FAZER: quem cair aqui provavelmente
    // escreveu `\0` querendo um separador que não colide.
    expect(
      comNul,
      `Byte NUL em ${comNul.length} arquivo(s): ${comNul.join(', ')}.\n` +
        'O git passa a tratá-los como BINÁRIOS: diff cego, merge sem linha a linha, grep pulando o arquivo. ' +
        'Se era separador de chave de Map, troque por "\\n" — tem a mesma garantia e continua sendo texto.',
    ).toEqual([]);
  });
});
