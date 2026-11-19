// @vitest-environment jsdom
/**
 * Faixa "Editando a versão X" (plano docs/planos/2026-11-19-imovib-versoes-editar-excluir.md, F3.3).
 * Quem abriu: Salvar na versão · Descartar. Outro membro: só lê (o motivo vem do useImovibEdicao);
 * administrador: pode descartar uma edição esquecida.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ImovibFaixaEdicaoDeVersao from '../../components/ImovibFaixaEdicaoDeVersao';

const edicao = { version_id: 'v1', version_label: 'Cenário banco', started_by: 'u-ana', started_by_name: 'Ana', started_at: '2026-11-19T17:05:00Z' };

describe('ImovibFaixaEdicaoDeVersao', () => {
    it('quem abriu: diz o que está acontecendo e oferece salvar e descartar', async () => {
        const salvar = vi.fn(); const descartar = vi.fn();
        render(<ImovibFaixaEdicaoDeVersao edicao={edicao} souEu podeDescartar salvando={false} onSalvar={salvar} onDescartar={descartar} />);
        expect(screen.getByRole('status').textContent).toMatch(/Editando a versão «Cenário banco»/);
        await userEvent.click(screen.getByRole('button', { name: 'Salvar na versão' }));
        await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
        expect(salvar).toHaveBeenCalledTimes(1);
        expect(descartar).toHaveBeenCalledTimes(1);
    });

    it('outro membro sem ser administrador: nenhuma ação', () => {
        render(<ImovibFaixaEdicaoDeVersao edicao={edicao} souEu={false} podeDescartar={false} salvando={false} onSalvar={vi.fn()} onDescartar={vi.fn()} />);
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.getByRole('status').textContent).toMatch(/«Ana» está editando a versão «Cenário banco»/);
    });

    it('administrador que não abriu: só "Descartar a edição"', () => {
        render(<ImovibFaixaEdicaoDeVersao edicao={edicao} souEu={false} podeDescartar salvando={false} onSalvar={vi.fn()} onDescartar={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Salvar na versão' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Descartar a edição' })).toBeTruthy();
    });

    it('salvando: botões desligados dizendo por quê', () => {
        render(<ImovibFaixaEdicaoDeVersao edicao={edicao} souEu podeDescartar salvando onSalvar={vi.fn()} onDescartar={vi.fn()} />);
        const b = screen.getByRole('button', { name: /Salvando/ }) as HTMLButtonElement;
        expect(b.disabled).toBe(true);
        expect(b.title).toMatch(/Gravando a versão/);
    });
});
