// Toda Edge Function que entrega um CAMINHO à service_role para assinar
// (`createSignedUrl`) ou baixar (`download`) passa esse caminho antes por
// `caminhoSemTravessia` — supabase/functions/_shared/caminhoSemTravessia.ts.
//
// Por quê: as duas chamadas montam a URL `/object/(sign/)<bucket>/<caminho>`, e
// o parser de URL do `fetch` RESOLVE `.`/`..` (inclusive `%2e%2e`). O caminho
// sai de linha gravada por quem usa o app (síndico, membro de organização) ou do
// corpo da requisição; com travessia, a service_role — que não passa pela RLS
// do Storage — assina/baixa arquivo de outra pasta e de outro bucket.
// Achados F53/F54/F57 da varredura de 15/11/2026; o F54 foi exatamente uma
// function a mais que ninguém lembrou de proteger.
//
// Esta trava lê o TEXTO das functions: cada `.storage.from(…).createSignedUrl(x`
// ou `.download(x` precisa de um `caminhoSemTravessia(x)` ANTES, no mesmo
// arquivo. `createSignedUrls` (plural), `remove` e `upload` não entram: os dois
// primeiros mandam o caminho no corpo JSON, que não passa pelo parser de URL; o
// `upload` daqui grava caminho montado no servidor.
//
// Exceção só com motivo escrito — caminho montado no servidor, nunca gravado
// por terceiro. Function nova que assina caminho de banco/corpo NÃO entra aqui:
// ganha a guarda.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const RAIZ = path.join(process.cwd(), 'supabase', 'functions');

const EXCECOES: Record<string, string> = {
    // `lerJson(admin, \`${pasta}/…\`)`: `pasta = pastaDoLote(userId, lote)`, com o
    // usuário do JWT e o lote validado como UUID (regras.ts) — nunca vem de linha.
    'pedido-fast/index.ts:path': 'caminho montado no servidor (pastaDoLote)',
};

function arquivosTs(dir: string): string[] {
    const saida: string[] = [];
    for (const nome of readdirSync(dir)) {
        const cheio = path.join(dir, nome);
        if (statSync(cheio).isDirectory()) {
            if (nome === '_shared' || nome === 'node_modules') continue;
            saida.push(...arquivosTs(cheio));
        } else if (nome.endsWith('.ts') && !nome.endsWith('.test.ts')) {
            saida.push(cheio);
        }
    }
    return saida;
}

/** Primeiro argumento da chamada que abre em `inicio` (logo depois do `(`), sem cast `as T`. */
function primeiroArgumento(texto: string, inicio: number): string {
    let nivel = 0;
    let i = inicio;
    for (; i < texto.length; i++) {
        const c = texto[i];
        if (c === '(' || c === '[' || c === '{') nivel++;
        else if (c === ')' || c === ']' || c === '}') {
            if (nivel === 0) break;
            nivel--;
        } else if (c === ',' && nivel === 0) break;
    }
    return texto.slice(inicio, i).replace(/\s+as\s+[\w.<>[\]|]+\s*$/, '').trim();
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type Chamada = { arquivo: string; metodo: string; argumento: string; linha: number; protegida: boolean };

function chamadasDoStorage(): Chamada[] {
    const chamadas: Chamada[] = [];
    for (const cheio of arquivosTs(RAIZ)) {
        const arquivo = path.relative(RAIZ, cheio).replace(/\\/g, '/');
        const texto = readFileSync(cheio, 'utf8');
        for (const m of texto.matchAll(/\.(createSignedUrl|download)\(/g)) {
            // Só a chamada do Storage: `<x>.storage[\n].from(<bucket>)[\n].metodo(` —
            // o `cliente.download(` do IMAP (email-capture-sync) não conta.
            const antes = texto.slice(Math.max(0, m.index! - 300), m.index!);
            if (!/\.storage\s*\.from\([^()]*\)\s*$/.test(antes)) continue;
            const argumento = primeiroArgumento(texto, m.index! + m[0].length);
            const guarda = new RegExp(`caminhoSemTravessia\\(\\s*${esc(argumento)}\\s*\\)`);
            const antesDaChamada = texto.slice(0, m.index!);
            chamadas.push({
                arquivo,
                metodo: m[1],
                argumento,
                linha: antesDaChamada.split('\n').length,
                protegida: guarda.test(antesDaChamada) || `${arquivo}:${argumento}` in EXCECOES,
            });
        }
    }
    return chamadas;
}

describe('Edge Functions · caminho entregue à service_role passa por caminhoSemTravessia', () => {
    const chamadas = chamadasDoStorage();

    it('a varredura enxerga os assinadores conhecidos (a trava não está cega)', () => {
        const arquivos = new Set(chamadas.map(c => c.arquivo));
        for (const a of [
            'sindico-portal-financeiro/index.ts', 'client-portal-rateio-comprovantes/index.ts',
            'supplier-portal-download/index.ts', 'partner-portal-download/index.ts',
            'client-portal-recibo-download/index.ts', 'partner-portal-recibo-download/index.ts',
            'supplier-portal-recibo-download/index.ts', 'portal-ged-download/index.ts',
            'labor-portal-ged-download/index.ts', 'credit-room-download/index.ts',
            'client-portal-condominio-download/index.ts', 'condomino-portal-download/index.ts',
            'academy-portal-media/index.ts', 'doc-gen-enviar/index.ts', 'doc-gen-ia/index.ts',
            'email-capture-sync/index.ts', 'fiscal-nfe-processor/index.ts',
            'portal-documentos-download/index.ts',
        ]) expect(arquivos, a).toContain(a);
        expect(chamadas.length).toBeGreaterThanOrEqual(20);
    });

    it('NENHUMA assinatura/download de caminho sem a guarda antes', () => {
        const soltas = chamadas.filter(c => !c.protegida)
            .map(c => `  ${c.arquivo}:${c.linha} — .${c.metodo}(${c.argumento}) sem caminhoSemTravessia(${c.argumento}) antes`);
        expect(soltas, soltas.length
            ? `\n\nCaminho entregue à service_role sem a guarda de travessia:\n\n${soltas.join('\n')}\n\n` +
              `Chame caminhoSemTravessia(<caminho>) antes (supabase/functions/_shared/caminhoSemTravessia.ts)\n` +
              `e recuse se der false. Só caminho montado no servidor entra em EXCECOES, com o motivo.\n`
            : '').toEqual([]);
    });

    it('exceção que não corresponde a nenhuma chamada sai da lista', () => {
        const vistas = new Set(chamadas.map(c => `${c.arquivo}:${c.argumento}`));
        for (const chave of Object.keys(EXCECOES)) expect(vistas, chave).toContain(chave);
    });
});
