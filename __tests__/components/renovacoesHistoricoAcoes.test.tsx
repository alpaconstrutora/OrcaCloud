// @vitest-environment jsdom
/**
 * Locações › Renovações › Histórico — coluna Ações no caso real do CTL-006
 * (25/11/2026): AD-001 e AD-002 cancelados, AD-003 e AD-004 aprovados. Editar e
 * Excluir só no AD-004 (o último); nos outros, desligados com o motivo.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
const historicoGeral = vi.fn();
vi.mock('../../services/contractRenewalService', async (original) => ({
    ...(await original<typeof import('../../services/contractRenewalService')>()),
    contractRenewalService: { historicoGeral: (...a: unknown[]) => historicoGeral(...a), undoAddendumRenewal: vi.fn(), undoRenewal: vi.fn() },
}));

import { ConfirmProvider } from '../../components/ui/confirm';
import RentalRenovacoesHistorico from '../../components/rentals/RentalRenovacoesHistorico';
import type { RegistroDeRenovacao } from '../../services/contractRenewalService';

const reg = (n: number, status: string, extra: Partial<RegistroDeRenovacao> = {}): RegistroDeRenovacao => {
    const base = {
        id: `ad${n}`, via: 'ADITIVO' as const, contract_id: 'c1', numero: `AD-00${n}`, status,
        inicio: '2019-03-23', fim: '2021-09-22', fimAnterior: '2019-03-22', valor: 4784.92, valorAnterior: 4784.92,
        parcelas: status === 'Cancelado' ? 0 : 12, descricao: null, criado_em: `2026-11-25T1${n}:00:00Z`, criado_por: null,
        cancelado_em: null, cancelado_por: null,
        contrato: { number: 'CTL-006-012-0001', title: 'Salão', client_id: 'cl1', status: 'Ativo' }, negociacaoId: 'neg1',
        ...extra,
    };
    return { ...base, aditivo: { id: base.id, contract_id: 'c1', number: base.numero, status, new_start_date: base.inicio, created_at: base.criado_em } as never };
};

const montar = (onEditRenewal = vi.fn()) => render(
    <ConfirmProvider>
        <RentalRenovacoesHistorico negociacoesDoEmpreendimento={null} nomeDoCliente={() => 'Igreja'} onEditRenewal={onEditRenewal} onMudou={() => {}} />
    </ConfirmProvider>,
);

beforeEach(() => {
    historicoGeral.mockResolvedValue([
        reg(4, 'Aprovado', { criado_por: 'quem@exemplo.com', valor: 5832.48, valorAnterior: 5832.48 }),
        reg(3, 'Aprovado'),
        reg(2, 'Cancelado', { cancelado_em: '2026-11-25T18:51:03Z', cancelado_por: 'quem@exemplo.com' }),
        reg(1, 'Cancelado'),
    ]);
});

describe('Histórico de renovações — Ações', () => {
    it('Editar só no AD-004; AD-003 diz qual é a última; cancelado diz que está cancelado', async () => {
        const editar = vi.fn();
        montar(editar);
        const ad4 = await screen.findByRole('button', { name: 'Editar o AD-004' });
        expect((ad4 as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(ad4);
        expect(editar).toHaveBeenCalledWith('c1', 'ad4');

        const desligados = screen.getAllByRole('button', { name: /última é o AD-004|cancelado/ });
        expect(desligados.every(b => (b as HTMLButtonElement).disabled)).toBe(true);
        expect(screen.getAllByRole('button', { name: /Só a última renovação pode ser editada \(a última é o AD-004\)/ })).toHaveLength(2); // editar + excluir do AD-003
    });

    it('Excluir só no AD-004', async () => {
        montar();
        const excluir = await screen.findByRole('button', { name: 'Excluir a renovação AD-004' });
        expect((excluir as HTMLButtonElement).disabled).toBe(false);
        expect(screen.queryByRole('button', { name: 'Excluir a renovação AD-003' })).toBeNull();
    });

    it('mostra autor, e quem cancelou e quando — ou que não foi registrado', async () => {
        montar();
        await screen.findByText('quem@exemplo.com');
        const cancelados = screen.getAllByText('Cancelado');
        expect(cancelados.map(c => c.getAttribute('title'))).toEqual(expect.arrayContaining([
            expect.stringMatching(/^Cancelado por quem@exemplo\.com em 25\/11\/2026/),
            'Cancelado antes de 25/11/2026: quem e quando não foram registrados.',
        ]));
    });

    it('contrato encerrado: Editar desligado com o motivo', async () => {
        historicoGeral.mockResolvedValue([reg(4, 'Aprovado', { contrato: { number: 'CTL-006-012-0001', title: null, client_id: 'cl1', status: 'Encerrado' } })]);
        montar();
        await waitFor(() => expect(screen.getAllByRole('button', { name: /está "Encerrado": reabra-o antes/ }).length).toBe(2));
    });
});
