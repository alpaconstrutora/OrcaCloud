// @vitest-environment jsdom
/**
 * Abas pelo teclado (10/11/2026, pedido do usuário: "Corrigir abas"): `TabsBar`, usado
 * em ~50 telas, tinha o papel de aba para o leitor de tela mas o teclado parava em cada
 * botão e ignorava as setas. Agora: Tab entra só na aba ativa; ←/→ dão a volta; Home/End.
 * Lógica em `components/ui/abasPeloTeclado.ts`, a mesma da negociação (`DealModal`).
 */
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TabsBar } from '../../components/ui/TabsBar';

const ABAS = [
    { id: 'a', label: 'Resumo' },
    { id: 'b', label: 'Parcelas' },
    { id: 'c', label: 'Contrato' },
];

function Tela({ inicial = 'a' }: { inicial?: string }) {
    const [aba, setAba] = useState(inicial);
    return (
        <>
            <TabsBar tabs={ABAS} value={aba} onChange={setAba} />
            <p data-testid="painel">{aba}</p>
        </>
    );
}

const aba = (nome: string) => screen.getByRole('tab', { name: nome });

describe('TabsBar · teclado', () => {
    it('só a aba ativa fica na ordem do Tab', () => {
        render(<Tela inicial="b" />);
        expect(ABAS.map(t => aba(t.label).tabIndex)).toEqual([-1, 0, -1]);
    });

    it('seta para a direita escolhe a próxima aba e leva o foco junto', () => {
        render(<Tela />);
        aba('Resumo').focus();
        fireEvent.keyDown(aba('Resumo'), { key: 'ArrowRight' });
        expect(screen.getByTestId('painel').textContent).toBe('b');
        expect(document.activeElement).toBe(aba('Parcelas'));
        expect(aba('Parcelas').getAttribute('aria-selected')).toBe('true');
    });

    it('as setas dão a volta nas pontas', () => {
        render(<Tela />);
        aba('Resumo').focus();
        fireEvent.keyDown(aba('Resumo'), { key: 'ArrowLeft' });
        expect(screen.getByTestId('painel').textContent).toBe('c');
        fireEvent.keyDown(aba('Contrato'), { key: 'ArrowRight' });
        expect(screen.getByTestId('painel').textContent).toBe('a');
    });

    it('Home e End vão para a primeira e a última', () => {
        render(<Tela inicial="b" />);
        aba('Parcelas').focus();
        fireEvent.keyDown(aba('Parcelas'), { key: 'End' });
        expect(screen.getByTestId('painel').textContent).toBe('c');
        fireEvent.keyDown(aba('Contrato'), { key: 'Home' });
        expect(screen.getByTestId('painel').textContent).toBe('a');
    });

    it('valor fora da lista não tira o trilho do Tab: a primeira aba fica alcançável', () => {
        render(<TabsBar tabs={ABAS} value="zzz" onChange={() => {}} />);
        expect(ABAS.map(t => aba(t.label).tabIndex)).toEqual([0, -1, -1]);
    });

    it('dentro de um formulário a aba não envia o formulário', () => {
        let enviou = false;
        render(<form onSubmit={(e) => { e.preventDefault(); enviou = true; }}><Tela /></form>);
        fireEvent.click(aba('Parcelas'));
        expect(enviou).toBe(false);
    });
});
