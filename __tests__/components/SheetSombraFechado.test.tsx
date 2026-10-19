// @vitest-environment jsdom
/**
 * `ui/sheet.tsx` e `OfficesAI.tsx` — painel lateral FECHADO não projeta sombra.
 *
 * 19/10/2026: o usuário viu "uma camada cinza em cima da barra de rolagem". Medido no
 * navegador: o painel fechado só era empurrado para fora da tela (`translate-x`), mas
 * mantinha `shadow-2xl` (0 25px 50px -12px); o desfoque de 50 px vazava ~20 px para
 * dentro da tela, por cima da barra do <main> — e cada painel montado fechado somava a
 * sua sombra (uma tela de contrato monta vários).
 *
 * Plano: docs/planos/2026-10-19-sheet-sombra-do-painel-fechado.md
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Sheet } from '../../components/ui/sheet';
import { ConfirmProvider } from '../../components/ui/confirm';

const painelDe = (open: boolean) => {
    const { container } = render(
        <ConfirmProvider>
            <Sheet open={open} onClose={() => {}}>
                <span>conteúdo</span>
            </Sheet>
        </ConfirmProvider>,
    );
    // O painel é o `fixed` com `bg-white` (o wrapper `fixed inset-0` e o backdrop não têm).
    const painel = container.querySelector<HTMLElement>('div.fixed.bg-white');
    if (!painel) throw new Error('painel do Sheet não encontrado');
    return painel;
};

describe('Sheet — a sombra só existe com o painel aberto', () => {
    it('fechado: sem sombra (a de fora da tela vazava sobre a barra de rolagem)', () => {
        const painel = painelDe(false);
        expect(painel.className).toContain('shadow-none');
        expect(painel.className).not.toMatch(/(^|\s)shadow-2xl(\s|$)/);
    });

    it('aberto: mantém a sombra do painel', () => {
        const painel = painelDe(true);
        expect(painel.className).toMatch(/(^|\s)shadow-2xl(\s|$)/);
        expect(painel.className).not.toContain('shadow-none');
    });

    it('a sombra anima junto com o deslizar (transição cobre box-shadow)', () => {
        expect(painelDe(false).className).toContain('transition-[transform,box-shadow]');
    });
});

describe('OfficesAI — mesmo painel feito à mão, mesma regra', () => {
    const fonte = fs.readFileSync(path.join(process.cwd(), 'components', 'OfficesAI.tsx'), 'utf8');
    // O trecho do painel lateral: da âncora do comentário até a abertura do header.
    const trecho = fonte.slice(fonte.indexOf('Painel Lateral (Drawer)'), fonte.indexOf('Header da IA'));

    it('shadow-2xl só no ramo aberto', () => {
        expect(trecho).toContain("isOpen ? 'translate-x-0 shadow-2xl'");
        expect(trecho).toMatch(/shadow-none/);
        // fora do ternário a classe fixa não pode trazer a sombra de volta
        const semTernario = trecho.replace(/isOpen \? '[^']*' : '[^']*'/, '');
        expect(semTernario).not.toContain('shadow-2xl');
    });
});
