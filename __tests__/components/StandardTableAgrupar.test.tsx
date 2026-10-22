// @vitest-environment jsdom
/**
 * StandardTable — prop `agrupamento` (guia de UI §6.12), usada pela fila de
 * Aprovação Financeira. Pedido de 15/10/2026,
 * docs/planos/2026-10-15-financeiro-agrupar-propagacao.md
 *
 * O caso sutil é agrupar COM paginação: a página conta linhas de dado, o
 * cabeçalho repete com "(continua)" quando o grupo vem da página anterior, e a
 * contagem/total do cabeçalho são do grupo inteiro, não da fatia.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import StandardTable, { type StandardTableColumn } from '../../components/ui/StandardTable';
import { chavePorNome } from '../../utils/agruparLinhas';

type Item = { id: string; nome: string; obra: string | null; valor: number };

const COLUNAS: StandardTableColumn[] = [
    { key: 'nome', label: 'Nome', sortable: true, width: 200 },
    { key: 'obra', label: 'Obra', sortable: true, width: 200 },
];

// 60 itens da obra A, 50 da B, 5 sem obra — a página de 50 corta A.
const ITENS: Item[] = [
    ...Array.from({ length: 60 }, (_, i) => ({ id: `a${i}`, nome: `Item A${i}`, obra: 'Obra A', valor: 10 })),
    ...Array.from({ length: 50 }, (_, i) => ({ id: `b${i}`, nome: `Item B${i}`, obra: 'Obra B', valor: 1 })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, nome: `Item S${i}`, obra: null, valor: 2 })),
];

const AGRUPAR = {
    opcoes: [{ value: 'obra', label: 'Obra' }],
    chave: (_campo: string, i: Item) => chavePorNome(i.obra),
    semRotulo: () => 'Sem obra',
    valor: (i: Item) => i.valor,
    title: 'Agrupar os itens',
};

function Tela({ selecionados = new Set<string>(), onSel = () => {} }: { selecionados?: Set<string>; onSel?: (s: Set<string>) => void }) {
    return (
        <StandardTable<Item>
            storageKey="teste:agrupar"
            columns={COLUNAS}
            rows={ITENS}
            rowKey={i => i.id}
            renderCell={(k, i) => <span>{k === 'nome' ? i.nome : i.obra ?? '—'}</span>}
            pagination={{ defaultPageSize: 50, pageSizes: [50] }}
            agrupamento={AGRUPAR}
            selection={{ selected: selecionados, onChange: onSel }}
        />
    );
}

/** Texto de cada cabeçalho de grupo, com os pedaços (rótulo, continua, contagem, total) separados por espaço. */
const cabecalhos = () => Array.from(document.querySelectorAll('tbody span.font-semibold'))
    .map(e => Array.from(e.parentElement!.children).map(c => c.textContent!.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' '));
const clicarNoGrupo = (rotulo: string) => fireEvent.click(screen.getByText(rotulo, { selector: 'span.font-semibold' }));
const linhasDeDado = () => document.querySelectorAll('tbody tr td input[type="checkbox"]').length;

describe('StandardTable — agrupamento', () => {
    beforeEach(() => window.localStorage.clear());

    it('sem escolher nada, nada muda: sem linha de grupo', () => {
        render(<Tela />);
        expect(cabecalhos()).toEqual([]);
        expect(linhasDeDado()).toBe(50);
    });

    it('agrupado e paginado: cabeçalho com contagem e total do grupo INTEIRO; "(continua)" na página seguinte', () => {
        render(<Tela />);
        fireEvent.change(screen.getByTitle('Agrupar os itens'), { target: { value: 'obra' } });

        // Página 1: só A (50 das 60 linhas), mas o cabeçalho diz 60 e R$ 600,00.
        expect(cabecalhos()).toHaveLength(1);
        expect(cabecalhos()[0]).toMatch(/^Obra A 60 R\$\s?600,00$/);
        expect(linhasDeDado()).toBe(50);

        fireEvent.click(screen.getByText('Próxima'));
        // Página 2: resto de A (continua) + B inteira (50 → só 40 cabem) — 50 linhas.
        expect(cabecalhos()[0]).toMatch(/^Obra A \(continua\) 60 /);
        expect(cabecalhos()[1]).toMatch(/^Obra B 50 /);
        expect(linhasDeDado()).toBe(50);

        fireEvent.click(screen.getByText('Próxima'));
        // Página 3: resto de B (continua) + "Sem obra" por último.
        const p3 = cabecalhos();
        expect(p3[0]).toContain('Obra B');
        expect(p3[0]).toContain('(continua)');
        expect(p3[1]).toMatch(/^Sem obra 5/);
        expect(linhasDeDado()).toBe(15);
        expect(screen.getByText('Página 3 de 3')).toBeTruthy();
    });

    it('recolher um grupo encurta a paginação; "selecionar todos" marca só a página visível', () => {
        let selecionados = new Set<string>();
        const { rerender } = render(<Tela selecionados={selecionados} onSel={s => { selecionados = s; }} />);
        fireEvent.change(screen.getByTitle('Agrupar os itens'), { target: { value: 'obra' } });

        // Recolhe A: sobram B (50) + Sem obra (5) = 55 linhas → 2 páginas.
        clicarNoGrupo('Obra A');
        expect(screen.getByText('Página 1 de 2')).toBeTruthy();
        expect(cabecalhos()[0]).toMatch(/^Obra A 60/);   // recolhido, mas continua na tela
        expect(linhasDeDado()).toBe(50);

        const marcarTodos = document.querySelector('thead input[type="checkbox"]') as HTMLInputElement;
        fireEvent.click(marcarTodos);
        rerender(<Tela selecionados={selecionados} onSel={s => { selecionados = s; }} />);
        expect(selecionados.size).toBe(50);
        expect([...selecionados].every(id => id.startsWith('b'))).toBe(true);
    });

    it('Crescente/Decrescente ordena os grupos e persiste; "Sem obra" fica no fim', () => {
        const { unmount } = render(<Tela />);
        const ordem = () => screen.getByRole('combobox', { name: 'Ordem dos grupos' }) as HTMLSelectElement;
        expect(ordem().disabled).toBe(true);
        fireEvent.change(screen.getByTitle('Agrupar os itens'), { target: { value: 'obra' } });
        expect(ordem().disabled).toBe(false);
        fireEvent.change(ordem(), { target: { value: 'desc' } });
        // Página 1 (50 linhas): Obra B inteira; Obra A começa na página 2.
        expect(cabecalhos()).toEqual(['Obra B 50 R$ 50,00']);
        unmount();
        render(<Tela />);
        expect(ordem().value).toBe('desc');
        // Página 2: Obra A (60 linhas) a enche; página 3: o resto de A e o "Sem obra", por último.
        fireEvent.click(screen.getByText('Próxima'));
        expect(cabecalhos().map(c => c.split(' ').slice(0, 2).join(' '))).toEqual(['Obra A']);
        fireEvent.click(screen.getByText('Próxima'));
        expect(cabecalhos().map(c => c.split(' ').slice(0, 2).join(' '))).toEqual(['Obra A', 'Sem obra']);
    });

    it('campo guardado que não está mais entre as opções vale como sem agrupamento', () => {
        // Ex.: "Organização" só é opção em "Todas as organizações" (BI › Movimentações).
        window.localStorage.setItem('teste:agrupar:groupBy', JSON.stringify('org'));
        render(<Tela />);
        expect(cabecalhos()).toEqual([]);
        expect((screen.getByTitle('Agrupar os itens') as HTMLSelectElement).value).toBe('none');
        expect(linhasDeDado()).toBe(50);
    });

    it('o campo escolhido persiste e "Agrupar" volta ao normal', () => {
        const { unmount } = render(<Tela />);
        fireEvent.change(screen.getByTitle('Agrupar os itens'), { target: { value: 'obra' } });
        unmount();
        render(<Tela />);
        expect((screen.getByTitle('Agrupar os itens') as HTMLSelectElement).value).toBe('obra');
        expect(cabecalhos().length).toBeGreaterThan(0);
        fireEvent.change(screen.getByTitle('Agrupar os itens'), { target: { value: 'none' } });
        expect(cabecalhos()).toEqual([]);
        // Botão "recolher todos" continua à vista, desligado (§6.12).
        expect((within(document.body).getByRole('button', { name: 'Recolher todos os grupos' }) as HTMLButtonElement).disabled).toBe(true);
    });
});
