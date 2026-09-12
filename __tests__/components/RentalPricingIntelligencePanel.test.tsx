// @vitest-environment jsdom
/**
 * O bloco de precificação que vive no topo da aba "Inteligência" (Locações).
 *
 * Ele é pequeno, mas manda um `config` para um motor que **substitui o aluguel
 * de todas as unidades do prédio** — e a mesma caixa de valor serve a dois
 * significados muito diferentes: R$ por m² e R$ do prédio inteiro. Trocar um
 * pelo outro não quebra nada visível; só produz aluguel errado. Daí os casos
 * abaixo mirarem o contrato do `onApply`, não a aparência.
 *
 * Contexto: até 2026-09-12 este conteúdo era a aba "Inteligência Hedônica",
 * separada das regras que ele aplica.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RentalPricingIntelligencePanel from '../../components/RentalPricingIntelligencePanel';

const valor = () => screen.getByLabelText(/Aluguel/i) as HTMLInputElement;
const aplicar = () => screen.getByRole('button', { name: /Aplicar Inteligência/i });

describe('RentalPricingIntelligencePanel', () => {
    it('abre em R$/m² e aplica o valor digitado como base por metro', () => {
        const onApply = vi.fn();
        render(<RentalPricingIntelligencePanel onApply={onApply} />);
        fireEvent.change(valor(), { target: { value: '85' } });
        fireEvent.click(aplicar());
        expect(onApply).toHaveBeenCalledWith({ mode: 'PER_SQM', base_per_sqm: 85, target_total_rent: 0 });
    });

    it('no modo alvo total, o mesmo campo vira o total do prédio — e a base por m² fica zerada', () => {
        const onApply = vi.fn();
        render(<RentalPricingIntelligencePanel onApply={onApply} />);
        fireEvent.click(screen.getByText('Aluguel-alvo total'));
        fireEvent.change(valor(), { target: { value: '20000' } });
        fireEvent.click(aplicar());
        expect(onApply).toHaveBeenCalledWith({ mode: 'TARGET_TOTAL', base_per_sqm: 0, target_total_rent: 20000 });
    });

    it('trocar de modo não carrega o número digitado no outro — o campo vem vazio', () => {
        render(<RentalPricingIntelligencePanel onApply={vi.fn()} />);
        fireEvent.change(valor(), { target: { value: '85' } });
        fireEvent.click(screen.getByText('Aluguel-alvo total'));
        // 85 R$/m² não é 85 reais de prédio inteiro: o campo não pode herdar o valor.
        expect(valor().value).toBe('');
    });

    it('o rótulo diz qual dos dois valores está sendo pedido', () => {
        render(<RentalPricingIntelligencePanel onApply={vi.fn()} />);
        expect(screen.getByText(/Aluguel base por m² \(R\$\/mês\)/)).toBeInTheDocument();
        fireEvent.click(screen.getByText('Aluguel-alvo total'));
        expect(screen.getByText(/Aluguel-alvo total mensal do prédio/)).toBeInTheDocument();
    });

    it('enquanto a aplicação roda, o botão fica desabilitado (clique duplo = precificar duas vezes)', () => {
        const onApply = vi.fn();
        render(<RentalPricingIntelligencePanel onApply={onApply} loading />);
        expect(aplicar()).toBeDisabled();
        fireEvent.click(aplicar());
        expect(onApply).not.toHaveBeenCalled();
    });

    it('avisa que a aplicação substitui os aluguéis atuais', () => {
        render(<RentalPricingIntelligencePanel onApply={vi.fn()} />);
        expect(screen.getByText(/Substitui os aluguéis atuais/i)).toBeInTheDocument();
    });
});
