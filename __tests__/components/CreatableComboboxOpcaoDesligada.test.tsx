// @vitest-environment jsdom
/**
 * CreatableCombobox — opção desligada com motivo e aviso sem vínculo configurável.
 * Pedido de 16/11/2026 (Usuários › Convidar membro a partir de um colaborador do RH):
 * quem já é usuário da organização aparece na lista, desligado, dizendo por quê
 * (botão desligado sempre diz o motivo), e não pode ser escolhido por nenhum caminho.
 * Plano: docs/planos/2026-11-16-usuarios-convidar-colaborador.md (Tarefa 1).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { CreatableCombobox } from '../../components/ui/CreatableCombobox';

type Item = { id: string; name: string };
const OPCOES: Item[] = [{ id: '1', name: 'Ana' }, { id: '2', name: 'Bia' }];
const motivo = (o: Item) => (o.id === '2' ? 'Já é usuário desta organização' : undefined);

const Campo = (props: Partial<React.ComponentProps<typeof CreatableCombobox<Item>>>) => (
    <CreatableCombobox<Item>
        value=""
        selectedId={null}
        options={OPCOES}
        onSelect={() => {}}
        onTextChange={() => {}}
        getDisabledReason={motivo}
        ariaLabel="Colaborador"
        {...props}
    />
);

describe('CreatableCombobox — opção desligada', () => {
    it('mostra o motivo e não escolhe no clique', () => {
        const onSelect = vi.fn();
        render(<Campo onSelect={onSelect} />);
        fireEvent.focus(screen.getByRole('combobox'));
        const bia = screen.getByRole('option', { name: /Bia/ });
        expect(bia.getAttribute('aria-disabled')).toBe('true');
        expect(bia.textContent).toContain('Já é usuário desta organização');
        fireEvent.click(bia);
        expect(onSelect).not.toHaveBeenCalled();
        // a opção habilitada continua escolhível
        fireEvent.click(screen.getByRole('option', { name: /Ana/ }));
        expect(onSelect).toHaveBeenCalledWith(OPCOES[0]);
    });

    it('Enter na opção desligada não escolhe', () => {
        const onSelect = vi.fn();
        render(<Campo onSelect={onSelect} />);
        const input = screen.getByRole('combobox');
        fireEvent.focus(input);
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('blur com o nome exato da desligada não vincula', () => {
        const onSelect = vi.fn();
        const { unmount } = render(<Campo value="Bia" onSelect={onSelect} />);
        fireEvent.blur(screen.getByRole('combobox'));
        expect(onSelect).not.toHaveBeenCalled();
        unmount();

        render(<Campo value="Ana" onSelect={onSelect} />);
        fireEvent.blur(screen.getByRole('combobox'));
        expect(onSelect).toHaveBeenCalledWith(OPCOES[0]);
    });

    it('avisoSemVinculo troca o aviso sem onCreate', () => {
        render(<Campo value="Zé" avisoSemVinculo="Nenhum colaborador escolhido — o convite não fica vinculado ao RH." />);
        expect(screen.getByText('Nenhum colaborador escolhido — o convite não fica vinculado ao RH.')).toBeTruthy();
        expect(screen.queryByText('Não vinculado ao catálogo.')).toBeNull();
    });
});
