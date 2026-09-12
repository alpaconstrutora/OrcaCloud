// @vitest-environment jsdom
/**
 * O bloco de precificação que vive no topo da aba "Inteligência" (Venda de
 * Unidades).
 *
 * Ele é pequeno, mas manda um `config` para um motor que **substitui o preço de
 * todas as unidades do edifício**. Desde 2026-09-12 o cálculo é área × regras
 * da aba Inteligência, então o contrato do `onApply` é só VGV-alvo + recorte de
 * permutadas — nenhum peso de andar/posição/vista/sol pode voltar a sair daqui.
 *
 * Contexto: até 2026-09-12 este conteúdo era um modal ("Inteligência de
 * Precificação") aberto da toolbar, com os pesos hedônicos dentro.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SalesPricingIntelligencePanel from '../../components/SalesPricingIntelligencePanel';

const vgv = () => screen.getByLabelText(/VGV-alvo do edifício/i) as HTMLInputElement;
const aplicar = () => screen.getByRole('button', { name: /Aplicar Inteligência/i });
const permutadas = () => screen.getByLabelText(/Incluir unidades permutadas/i) as HTMLInputElement;

describe('SalesPricingIntelligencePanel', () => {
    it('aplica só VGV-alvo e o recorte de permutadas — nenhum peso hedônico sai daqui', () => {
        const onApply = vi.fn();
        render(<SalesPricingIntelligencePanel onApply={onApply} />);
        fireEvent.change(vgv(), { target: { value: '2500000' } });
        fireEvent.click(aplicar());
        expect(onApply).toHaveBeenCalledTimes(1);
        expect(onApply).toHaveBeenCalledWith({ target_vgv: 2500000, include_exchanged: false });
        const enviado = onApply.mock.calls[0][0];
        for (const campo of ['floor_coefficient', 'position_weights', 'view_weights', 'orientation_weights']) {
            expect(enviado).not.toHaveProperty(campo);
        }
    });

    it('os campos do modelo hedônico não existem mais na tela', () => {
        render(<SalesPricingIntelligencePanel onApply={vi.fn()} />);
        for (const texto of [/Coeficiente de Andar/i, /Pesos por Atendimento/i, /Sol da Manhã/i, /Valorização por Pavimento/i, /Modelo Hedônico/i]) {
            expect(screen.queryByText(texto)).not.toBeInTheDocument();
        }
        expect(screen.queryByRole('slider')).not.toBeInTheDocument();
        expect(screen.getAllByRole('spinbutton')).toHaveLength(1); // só o VGV
        expect(screen.getAllByRole('checkbox')).toHaveLength(1);   // só permutadas
    });

    it('o toggle de permutadas segue no contrato', () => {
        const onApply = vi.fn();
        render(<SalesPricingIntelligencePanel onApply={onApply} />);
        fireEvent.change(vgv(), { target: { value: '1000' } });
        fireEvent.click(permutadas());
        fireEvent.click(aplicar());
        expect(onApply).toHaveBeenCalledWith({ target_vgv: 1000, include_exchanged: true });
    });

    it('sem VGV-alvo o botão fica desabilitado (VGV zero zeraria todos os preços)', () => {
        const onApply = vi.fn();
        render(<SalesPricingIntelligencePanel onApply={onApply} />);
        expect(aplicar()).toBeDisabled();
        fireEvent.click(aplicar());
        expect(onApply).not.toHaveBeenCalled();
    });

    it('enquanto a aplicação roda, o botão fica desabilitado (clique duplo = precificar duas vezes)', () => {
        const onApply = vi.fn();
        render(<SalesPricingIntelligencePanel onApply={onApply} loading />);
        fireEvent.change(vgv(), { target: { value: '1000' } });
        expect(aplicar()).toBeDisabled();
        fireEvent.click(aplicar());
        expect(onApply).not.toHaveBeenCalled();
    });

    it('diz que o cálculo é área × regras abaixo, e que substitui os preços atuais', () => {
        render(<SalesPricingIntelligencePanel onApply={vi.fn()} />);
        expect(screen.getByText(/regras abaixo/i)).toBeInTheDocument();
        expect(screen.getByText(/Substitui os preços atuais/i)).toBeInTheDocument();
    });
});
