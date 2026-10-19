/**
 * A variante `dark:` do Tailwind só vale por CLASSE — nunca pelo modo escuro do sistema (19/10/2026).
 *
 * Defeito: sem `@custom-variant dark`, o Tailwind v4 gera `dark:` como
 * `@media (prefers-color-scheme: dark)`. O app não liga nenhuma classe `dark`: seu modo escuro ("Escuro
 * Total", `.theme-midnight`) é feito por sobrescritas globais no index.css, sem `dark:`. Resultado: quem
 * usa o Windows em modo escuro via, em 10 arquivos com `dark:`, texto branco sobre fundo branco (a gaveta
 * "Gerar pelo modelo" foi o caso que apareceu: valor invisível, aviso rosado com texto amarelo).
 *
 * Este teste compila o Tailwind com o `index.css` REAL e olha o CSS gerado — não o texto do arquivo — e
 * leva um controle negativo (sem a linha o defeito aparece), para provar que ele enxerga o problema.
 *
 * Plano: docs/planos/2026-10-19-dark-so-por-classe.md · Guia §33.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '@tailwindcss/node';

const RAIZ = path.resolve(__dirname, '..');
const INDEX_CSS = fs.readFileSync(path.join(RAIZ, 'index.css'), 'utf8');
const CANDIDATAS = ['dark:bg-gray-800', 'dark:text-white', 'bg-white'];

async function gerar(css: string): Promise<string> {
    const c = await compile(css, { base: RAIZ, onDependency: () => {} });
    return c.build(CANDIDATAS);
}

/** A(s) linha(s) `@custom-variant dark …;` do index.css (sem comentários). */
function linhaDaVariante(): string[] {
    const semComentarios = INDEX_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    return semComentarios.match(/@custom-variant\s+dark\b[^;]*;/g) ?? [];
}

describe('dark: só por classe', () => {
    it('o index.css declara UMA @custom-variant dark, por classe', () => {
        const linhas = linhaDaVariante();
        expect(linhas).toHaveLength(1);
        expect(linhas[0]).toMatch(/\.dark/);
        expect(linhas[0]).not.toMatch(/prefers-color-scheme/);
    });

    it('com a linha do index.css, `dark:` NÃO segue o modo escuro do sistema', async () => {
        const css = await gerar(`@import "tailwindcss";\n${linhaDaVariante().join('\n')}`);
        expect(css).not.toMatch(/prefers-color-scheme/);
        // continua existindo, só que atrás da classe `dark` (ninguém a liga hoje → inerte)
        expect(css).toMatch(/\.dark\\:bg-gray-800/);
        expect(css).toMatch(/&:where\(\.dark, \.dark \*\)/);
        // utilitário comum não é afetado
        expect(css).toMatch(/\.bg-white/);
    });

    it('controle negativo: SEM a linha o defeito aparece (o teste enxerga o problema)', async () => {
        const css = await gerar('@import "tailwindcss";');
        expect(css).toMatch(/@media \(prefers-color-scheme: dark\)/);
    });

    it('nada no app liga a classe `dark` (senão as classes deixariam de ser inertes sem ninguém ver)', () => {
        const alvos = ['components', 'hooks', 'store', 'lib', 'utils', 'services'];
        const achados: string[] = [];
        const visita = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) { visita(p); continue; }
                if (!/\.(ts|tsx)$/.test(e.name)) continue;
                const t = fs.readFileSync(p, 'utf8');
                if (/classList\.(add|toggle|remove)\(\s*['"]dark['"]/.test(t)) achados.push(path.relative(RAIZ, p));
            }
        };
        for (const a of alvos) { const d = path.join(RAIZ, a); if (fs.existsSync(d)) visita(d); }
        for (const f of ['App.tsx', 'index.tsx', 'index.html']) {
            const p = path.join(RAIZ, f);
            if (fs.existsSync(p) && /classList\.(add|toggle|remove)\(\s*['"]dark['"]|<html[^>]*class="[^"]*\bdark\b/.test(fs.readFileSync(p, 'utf8'))) achados.push(f);
        }
        expect(achados).toEqual([]);
    });
});
