// Bucket PRIVADO não tem URL pública: `getPublicUrl` nele devolve um link que dá
// 400 — e, pior, o costume de gravar esse link no banco é o que deixou contrato,
// atestado e foto de colaborador abertos para quem tivesse o endereço (achados
// F8/F9 da varredura de 15/11/2026, docs/planos/2026-11-18-seguranca-storage-privado.md).
//
// Esta trava lê o TEXTO do app e das Edge Functions: todo `getPublicUrl` tem o
// bucket resolvido (literal, ou `const X = '…'` no mesmo arquivo, ou constante
// exportada por lib/storageAssinado.ts) e falha se for um bucket de
// `BUCKETS_PRIVADOS`. Bucket que não dá para resolver também falha — escreva o
// nome (ou a constante) no próprio arquivo, para a trava enxergar.
//
// Leitura certa: lib/storageAssinado.ts (`abrirArquivoAssinado`, `urlAssinada`,
// `abrirDocumentoDoPortal`) e hooks/useUrlAssinada.ts (`<img>`).
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const RAIZ = process.cwd();
const PASTAS_FORA = new Set(['node_modules', 'dist', 'dist-ssr', '__tests__', 'docs', '.git', '.rascunho-seg', 'migrations', 'coverage', 'public']);

/** Lidos do próprio lib/storageAssinado.ts — mudou lá, a trava acompanha. */
function constantesDoHelper(): { consts: Record<string, string>; privados: string[] } {
    const texto = readFileSync(path.join(RAIZ, 'lib', 'storageAssinado.ts'), 'utf8');
    const consts: Record<string, string> = {};
    for (const m of texto.matchAll(/export const (BUCKET_[A-Z_]+)\s*=\s*'([^']+)'/g)) consts[m[1]] = m[2];
    const lista = /export const BUCKETS_PRIVADOS\s*=\s*\[([^\]]*)\]/.exec(texto)?.[1] ?? '';
    const privados = lista.split(',').map(s => s.trim()).filter(Boolean).map(s => consts[s] ?? s.replace(/['"]/g, ''));
    return { consts, privados };
}

/** Os call sites que embrulham o Storage e recebem o bucket como parâmetro. */
const EMBRULHOS = new Set(['services/storageService.ts']);

function arquivos(dir: string): string[] {
    const saida: string[] = [];
    for (const nome of readdirSync(dir)) {
        if (PASTAS_FORA.has(nome)) continue;
        const cheio = path.join(dir, nome);
        const st = statSync(cheio);
        if (st.isDirectory()) saida.push(...arquivos(cheio));
        else if (/\.(ts|tsx|mts|js|mjs)$/.test(nome) && !/\.(test|spec)\./.test(nome) && !nome.endsWith('.d.ts')) saida.push(cheio);
    }
    return saida;
}

type Chamada = { arquivo: string; linha: number; bucket: string | null; trecho: string };

/** Acha cada `getPublicUrl(` e resolve o bucket. Exportada para o teste de "não está cega". */
export function chamadasDeUrlPublica(arquivo: string, texto: string, constsGlobais: Record<string, string>): Chamada[] {
    const saida: Chamada[] = [];
    const resolver = (expr: string): string | null => {
        const e = expr.trim();
        const literal = /^(['"`])([^'"`$]+)\1$/.exec(e);
        if (literal) return literal[2];
        if (/^[A-Za-z_$][\w$]*$/.test(e)) {
            const local = new RegExp(`(?:const|let|var)\\s+${e}\\s*(?::\\s*string)?\\s*=\\s*(['"\`])([^'"\`$]+)\\1`).exec(texto);
            if (local) return local[2];
            if (constsGlobais[e]) return constsGlobais[e];
        }
        return null;
    };
    for (const m of texto.matchAll(/getPublicUrl\s*\(/g)) {
        const i = m.index!;
        const linha = texto.slice(0, i).split('\n').length;
        // Comentário (linha com `//` antes, ou linha de bloco `*`) não é chamada.
        const inicioDaLinha = texto.lastIndexOf('\n', i - 1) + 1;
        const prefixo = texto.slice(inicioDaLinha, i);
        if (prefixo.includes('//') || /^\s*(\*|\/\*)/.test(prefixo)) continue;
        const antes = texto.slice(Math.max(0, i - 400), i);
        // Definição do método (embrulho) — `getPublicUrl(bucket: string, …) {`
        if (/(?:^|[\s{,])$/.test(antes) && /^getPublicUrl\s*\(\s*\w+\s*:/.test(texto.slice(i))) continue;
        let bucket: string | null = null;
        // storageService.getPublicUrl(BUCKET, path)
        if (/storageService\s*\.\s*$/.test(antes)) {
            const arg = /^getPublicUrl\s*\(\s*([^,)]+)/.exec(texto.slice(i))?.[1] ?? '';
            bucket = resolver(arg);
        } else {
            // <x>.storage.from(BUCKET)[\n].getPublicUrl(path)
            const from = /\.from\(\s*([^()]+?)\s*\)\s*\.\s*$/.exec(antes);
            bucket = from ? resolver(from[1]) : null;
        }
        saida.push({ arquivo, linha, bucket, trecho: texto.slice(Math.max(0, i - 60), i + 40).replace(/\s+/g, ' ') });
    }
    return saida;
}

describe('getPublicUrl nunca em bucket privado', () => {
    const { consts, privados } = constantesDoHelper();
    const chamadas = arquivos(RAIZ).flatMap(cheio => {
        const rel = path.relative(RAIZ, cheio).replace(/\\/g, '/');
        return chamadasDeUrlPublica(rel, readFileSync(cheio, 'utf8'), consts);
    });

    it('a lista de privados saiu do helper (documents e organization-assets)', () => {
        expect(privados).toEqual(expect.arrayContaining(['documents', 'organization-assets']));
    });

    it('a varredura enxerga as chamadas legítimas (a trava não está cega)', () => {
        // Buckets públicos de verdade que o app usa com getPublicUrl.
        const buckets = new Set(chamadas.map(c => c.bucket));
        expect(chamadas.length).toBeGreaterThanOrEqual(8);
        expect(buckets.has('properties')).toBe(true);
    });

    it('detecta as três formas, com literal, constante local e constante do helper', () => {
        const amostra = [
            `await storageService.uploadFile('documents', p, f); storageService.getPublicUrl('documents', p);`,
            `const BUCKET = 'organization-assets';\nsupabase.storage.from(BUCKET)\n  .getPublicUrl(path);`,
            `admin.storage.from(BUCKET_DOCUMENTOS).getPublicUrl(path)`,
            `supabase.storage.from("documents").getPublicUrl(x).data.publicUrl`,
        ].join('\n');
        const achadas = chamadasDeUrlPublica('amostra.ts', amostra, consts);
        expect(achadas.map(c => c.bucket)).toEqual(['documents', 'organization-assets', 'documents', 'documents']);
    });

    it('NENHUM getPublicUrl em bucket privado, e nenhum com bucket que a trava não resolve', () => {
        const proibidas = chamadas
            .filter(c => !EMBRULHOS.has(c.arquivo))
            .filter(c => c.bucket === null || privados.includes(c.bucket))
            .map(c => `  ${c.arquivo}:${c.linha} — bucket ${c.bucket ?? '(não resolvido)'} — …${c.trecho}…`);
        expect(proibidas, proibidas.length
            ? `\n\ngetPublicUrl em bucket privado (ou com bucket que a trava não resolve):\n\n${proibidas.join('\n')}\n\n` +
              `Bucket privado: grave o CAMINHO e leia com lib/storageAssinado.ts (abrirArquivoAssinado / urlAssinada /\n` +
              `abrirDocumentoDoPortal) ou hooks/useUrlAssinada.ts. Bucket público: escreva o nome (ou a constante)\n` +
              `no mesmo arquivo, para a trava resolver.\n`
            : '').toEqual([]);
    });
});
