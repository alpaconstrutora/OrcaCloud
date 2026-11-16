import { describe, it, expect, beforeAll } from 'vitest';
import { compile } from '@tailwindcss/node';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Animações de entrada do app (`animate-in` + `fade-in` / `zoom-in-95` / `slide-in-from-*`).
 *
 * Até 16/11/2026 eram ~437 usos SEM EFEITO NENHUM: essas classes vêm do plugin de animação
 * (`tw-animate-css` no Tailwind v4) e o `index.css` não o importava. O CSS de produção não tinha
 * uma regra delas, o build não reclama de classe desconhecida, e ninguém percebeu por meses —
 * a pendência apareceu no pedido "/impeccable animate portal do investidor".
 *
 * A trava compila o `index.css` de verdade (mesmo compilador do build) com todas as classes
 * dessa família que o código usa, e exige que cada uma gere regra. Classe inventada
 * (`animate-fade-in`) ou plugin removido = teste vermelho, em vez de tela parada em silêncio.
 * Guia: docs/ui_ux_guia_unificado.md §35.
 */

const RAIZ = path.resolve(__dirname, '..');
const PASTAS = ['components', 'hooks', 'utils', 'lib', 'services', 'store', 'constants'];
const ARQUIVOS_SOLTOS = ['App.tsx', 'index.tsx'];

/** Utilitário da família, sem variante na frente (`md:`, `group-hover:`) — a base é o que importa. */
const FAMILIA = /(?<![\w-])(animate-[a-z0-9-]+|fade-in(?:-\d+)?|zoom-in(?:-\d+)?|slide-in-from-(?:top|bottom|left|right)(?:-[a-z0-9.]+)?)(?![\w-])/g;

function arquivosDoApp(): string[] {
    const saida: string[] = [];
    const andar = (dir: string) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, ent.name);
            if (ent.isDirectory()) andar(p);
            else if (/\.(tsx|ts)$/.test(ent.name) && !/\.test\./.test(ent.name)) saida.push(p);
        }
    };
    for (const pasta of PASTAS) {
        const p = path.join(RAIZ, pasta);
        if (fs.existsSync(p)) andar(p);
    }
    for (const f of ARQUIVOS_SOLTOS) {
        const p = path.join(RAIZ, f);
        if (fs.existsSync(p)) saida.push(p);
    }
    return saida;
}

/** classe → arquivos onde aparece (para a mensagem de erro dizer onde consertar). */
function classesUsadas(): Map<string, string[]> {
    const usos = new Map<string, string[]>();
    for (const arq of arquivosDoApp()) {
        const texto = fs.readFileSync(arq, 'utf8');
        for (const m of texto.matchAll(FAMILIA)) {
            const lista = usos.get(m[1]) ?? [];
            const rel = path.relative(RAIZ, arq);
            if (!lista.includes(rel)) lista.push(rel);
            usos.set(m[1], lista);
        }
    }
    return usos;
}

const seletor = (classe: string) => '.' + classe.replace(/[.:/[\]%]/g, c => `\\${c}`);

describe('animações de entrada (tw-animate-css)', () => {
    let usos: Map<string, string[]>;
    let css: string;

    beforeAll(async () => {
        usos = classesUsadas();
        const fonte = fs.readFileSync(path.join(RAIZ, 'index.css'), 'utf8');
        const compilador = await compile(fonte, { base: RAIZ, from: path.join(RAIZ, 'index.css'), onDependency: () => {} });
        css = compilador.build([...usos.keys()]);
    }, 60_000);

    it('o código usa a família (o recenseamento acha os ~437 usos)', () => {
        expect(usos.get('animate-in')?.length ?? 0).toBeGreaterThan(100);
        expect(usos.has('slide-in-from-bottom-4')).toBe(true);
        expect(usos.has('zoom-in-95')).toBe(true);
    });

    it('toda classe da família usada no código gera regra no CSS', () => {
        const semRegra = [...usos.entries()]
            .filter(([classe]) => !css.includes(`${seletor(classe)} {`) && !css.includes(`${seletor(classe)}{`))
            .map(([classe, arquivos]) => `${classe} — ${arquivos.slice(0, 3).join(', ')}`);
        expect(semRegra).toEqual([]);
    });

    it('animate-in roda a animação de entrada; slide/zoom/fade só ajustam o ponto de partida', () => {
        expect(css).toMatch(/@keyframes enter/);
        // A duração vem do `duration-*` da própria linha (--tw-duration); sem ele, 150 ms.
        expect(css).toMatch(/\.animate-in \{\s*animation: enter var\(--tw-animation-duration,var\(--tw-duration,/);
        expect(css).toMatch(/\.slide-in-from-bottom-4 \{\s*--tw-enter-translate-y:/);
        expect(css).toMatch(/\.zoom-in-95 \{\s*--tw-enter-scale:/);
        expect(css).toMatch(/\.fade-in \{\s*--tw-enter-opacity: 0/);
    });

    it('menos movimento: a entrada só esmaece — nada desliza nem cresce', () => {
        const bloco = css.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\.animate-in \{[^}]*\}/)?.[0] ?? '';
        expect(bloco).toMatch(/--tw-enter-translate-x: 0/);
        expect(bloco).toMatch(/--tw-enter-translate-y: 0/);
        expect(bloco).toMatch(/--tw-enter-scale: 1/);
    });

    it('zoom-in sem número cresce do ZERO — modal e menu do app entram de 95% (zoom-in-95)', () => {
        expect(usos.get('zoom-in') ?? []).toEqual([]);
    });
});
