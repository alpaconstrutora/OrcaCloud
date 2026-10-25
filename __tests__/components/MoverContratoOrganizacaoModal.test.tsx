// @vitest-environment jsdom
/**
 * Diálogo "Mover contrato" (25/10/2026 —
 * docs/planos/2026-10-25-contrato-mover-organizacao.md, item 4).
 *
 * Trava: o destino lista só organizações graváveis, sem a atual; o aviso de
 * conciliados aparece; o impedimento do banco desliga o botão com o motivo
 * escrito; mover manda o centro de custo escolhido e avisa quem abriu.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const previa = vi.fn();
const mover = vi.fn();
vi.mock('../../services/contractService', () => ({
    contractService: {
        previaMoverOrganizacao: (...a: unknown[]) => previa(...a),
        moverParaOrganizacao: (...a: unknown[]) => mover(...a),
    },
}));
vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: {
        listCostCenters: () => Promise.resolve([{ id: 'cc-14', name: 'Galeria Altavista - Locação', code: '014', organization_id: 'org-alpa' }]),
        listPlanoContas: () => Promise.resolve([]),
    },
}));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import MoverContratoOrganizacaoModal from '../../components/MoverContratoOrganizacaoModal';
import { useStore } from '../../store/useStore';

const EMAIL = 'dev@exemplo.com';
const org = (id: string, name: string, membros: string[]) =>
    ({ id, name, members: membros.map((email, i) => ({ id: `${id}-m${i}`, email, name: email, role: 'owner' })) } as never);

const PREVIA = {
    numero: 'CTS-010-036-0002', organizacao_atual: 'org-condo',
    titulos: 73, titulos_pagos: 45, titulos_conciliados: 45, recibos_ficam: 1,
    processos: 0, documentos: 1, impedimentos: [] as string[],
};

const montar = (onMovido = vi.fn()) => {
    useStore.setState({
        organizations: [org('org-condo', 'Condomínio Galeria Altavista', [EMAIL]), org('org-alpa', 'Alpa Construtora', [EMAIL]), org('org-x', 'Alheia', ['outro@exemplo.com'])] as never,
        currentProfile: { ...useStore.getState().currentProfile, email: EMAIL },
    } as never);
    render(
        <MoverContratoOrganizacaoModal
            open
            onClose={() => {}}
            contrato={{ id: 'c1', number: 'CTS-010-036-0002', organization_id: 'org-condo' }}
            nomeOrgAtual="Condomínio Galeria Altavista"
            onMovido={onMovido}
        />,
    );
    return onMovido;
};

const destino = () => screen.getByLabelText('Mover para *') as HTMLSelectElement;
const botaoMover = () => screen.getByRole('button', { name: /Mover contrato/ }) as HTMLButtonElement;

describe('MoverContratoOrganizacaoModal', () => {
    beforeEach(() => { previa.mockReset(); mover.mockReset(); });

    it('destino: só graváveis, sem a organização atual; sem destino o botão diz por quê', () => {
        montar();
        expect(Array.from(destino().options).map(o => o.textContent))
            .toEqual(['Selecione a organização de destino', 'Alpa Construtora']);
        expect(botaoMover().disabled).toBe(true);
        expect(botaoMover().title).toBe('Escolha a organização de destino.');
    });

    it('com conciliados mostra o aviso e deixa mover; mover avisa quem abriu', async () => {
        previa.mockResolvedValue(PREVIA);
        mover.mockResolvedValue(undefined);
        const onMovido = montar();
        fireEvent.change(destino(), { target: { value: 'org-alpa' } });

        await screen.findByText(/73 títulos no financeiro/);
        expect(screen.getByText(/45 títulos estão conciliados/)).toBeTruthy();
        expect(screen.getByText(/recibo já emitido fica/)).toBeTruthy();
        await waitFor(() => expect(botaoMover().disabled).toBe(false));

        fireEvent.click(botaoMover());
        await waitFor(() => expect(onMovido).toHaveBeenCalledWith('org-alpa', 'Alpa Construtora'));
        expect(mover).toHaveBeenCalledWith('c1', 'org-alpa', null, null);
    });

    it('impedimento do banco desliga o botão com o motivo escrito', async () => {
        const msg = 'Competência fechada em Contas a Pagar: 03/2026. Reabra o fechamento antes de mover.';
        previa.mockResolvedValue({ ...PREVIA, impedimentos: [msg] });
        montar();
        fireEvent.change(destino(), { target: { value: 'org-alpa' } });
        await waitFor(() => expect(botaoMover().title).toBe(msg));
        expect(botaoMover().disabled).toBe(true);
        expect(screen.getAllByText(msg).length).toBeGreaterThan(0);
    });
});
