// @vitest-environment jsdom
/**
 * ToastProvider — o aviso aparece sem o componente precisar desenhar nada.
 *
 * O defeito que isto cura: `useToast` devolvia estado e não renderizava, então
 * quem chamasse `showToast` sem também desenhar `localToast` jogava a mensagem
 * fora. Eram 15 componentes e 95 chamadas mudas em 06/09/2026, e isso escondeu
 * duas falhas seguidas do motor de conciliação.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastProvider } from '../../components/ui/toast';
import { useToast } from '../../hooks/useToast';

/** Componente que NÃO desenha nada — o caso dos 15 componentes mudos. */
function TelaMuda({ msg, tipo }: { msg: string; tipo?: 'success' | 'error' }) {
    const { showToast } = useToast();
    return <button onClick={() => showToast(msg, tipo)}>disparar</button>;
}

/** Componente que desenha o próprio aviso — o caso dos ~23 que já funcionavam. */
function TelaQueDesenha({ msg }: { msg: string }) {
    const { localToast, showToast } = useToast();
    return (
        <>
            <button onClick={() => showToast(msg)}>disparar</button>
            {localToast && <div data-testid="aviso-local">{localToast.message}</div>}
        </>
    );
}

const clicar = async () => {
    await act(async () => { screen.getByText('disparar').click(); });
};

describe('ToastProvider', () => {
    it('componente que não desenha nada mostra o aviso mesmo assim', async () => {
        render(<ToastProvider><TelaMuda msg="Salvo com sucesso" /></ToastProvider>);
        expect(screen.queryByText('Salvo com sucesso')).toBeNull();
        await clicar();
        expect(screen.getByText('Salvo com sucesso')).toBeTruthy();
    });

    it('erro aparece com papel de alerta, para leitor de tela anunciar', async () => {
        render(<ToastProvider><TelaMuda msg="Falhou feio" tipo="error" /></ToastProvider>);
        await clicar();
        const aviso = screen.getByText('Falhou feio').closest('[role=status]');
        expect(aviso?.getAttribute('aria-live')).toBe('assertive');
    });

    it('NÃO duplica em quem já desenhava o próprio aviso', async () => {
        render(<ToastProvider><TelaQueDesenha msg="Uma vez só" /></ToastProvider>);
        await clicar();
        expect(screen.queryByTestId('aviso-local')).toBeNull();      // o local cala
        expect(screen.getAllByText('Uma vez só')).toHaveLength(1);   // o global fala
    });

    it('sem provider, o comportamento antigo é preservado', async () => {
        render(<TelaQueDesenha msg="Modo antigo" />);
        await clicar();
        expect(screen.getByTestId('aviso-local').textContent).toBe('Modo antigo');
    });

    it('mensagem vazia não vira aviso', async () => {
        render(<ToastProvider><TelaMuda msg="   " /></ToastProvider>);
        await clicar();
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('vários avisos se acumulam, sem um esconder o outro', async () => {
        function Duplo() {
            const { showToast } = useToast();
            return <button onClick={() => { showToast('primeiro'); showToast('segundo', 'error'); }}>disparar</button>;
        }
        render(<ToastProvider><Duplo /></ToastProvider>);
        await clicar();
        expect(screen.getByText('primeiro')).toBeTruthy();
        expect(screen.getByText('segundo')).toBeTruthy();
    });
});
