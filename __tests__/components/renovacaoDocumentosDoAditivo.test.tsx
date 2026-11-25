// @vitest-environment jsdom
/**
 * Renovações › Histórico › Ver: documentos DO ADITIVO (plano
 * docs/planos/2026-11-25-renovacoes-e-reajustes-um-lugar.md, item 3). Antes,
 * documento de aditivo de locação não tinha tela nenhuma.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
const painel = vi.fn();
vi.mock('../../components/contracts/DocumentVersionsPanel', () => ({
    default: (props: Record<string, unknown>) => { painel(props); return <div>painel de versões</div>; },
}));
vi.mock('../../components/EmitDocumentModal', () => ({ default: () => null }));
vi.mock('../../services/rentalDocumentContextService', () => ({ buildRentalResolveContext: vi.fn(async () => ({})) }));
vi.mock('../../services/contractService', () => ({ contractService: { getContractById: vi.fn() } }));

import RenovacaoRegistroSheet from '../../components/rentals/RenovacaoRegistroSheet';
import { ConfirmProvider } from '../../components/ui/confirm';
import type { RegistroDeRenovacao } from '../../services/contractRenewalService';

const reg = (extra: Partial<RegistroDeRenovacao> = {}): RegistroDeRenovacao => ({
    id: 'ad4', via: 'ADITIVO', contract_id: 'c1', numero: 'AD-004', status: 'Aprovado',
    inicio: '2020-03-23', fim: '2021-09-22', fimAnterior: '2020-03-22', valor: 5832.48, valorAnterior: 5832.48, parcelas: 18,
    descricao: 'Prorrogação de vigência até 2021-09-22', criado_em: '2026-11-25T19:28:00Z', criado_por: 'quem@exemplo.com',
    cancelado_em: null, cancelado_por: null,
    contrato: { number: 'CTL-006-012-0001', title: null, client_id: 'cl1', status: 'Ativo' }, negociacaoId: 'neg1',
    aditivo: { id: 'ad4', contract_id: 'c1', organization_id: 'org-1', number: 'AD-004', status: 'Aprovado' } as never,
    ...extra,
});
const montar = (r: RegistroDeRenovacao, gerenciar?: (org: string) => void) => render(
    <ConfirmProvider>
        <RenovacaoRegistroSheet registro={r} nomeDoCliente={() => 'Igreja'} onClose={() => {}} onGerenciarModelos={gerenciar} />
    </ConfirmProvider>,
);

beforeEach(() => painel.mockClear());

describe('Ver da renovação — documentos do aditivo', () => {
    it('AD-004: painel de versões DO ADITIVO e botões de gerar e de modelos', () => {
        montar(reg(), () => {});
        expect(screen.getByText('Documentos do aditivo')).toBeTruthy();
        expect(painel).toHaveBeenCalledWith(expect.objectContaining({
            ownerType: 'ADDENDUM', ownerId: 'ad4', contractId: 'c1', organizationId: 'org-1', kind: 'ADITIVO', label: 'Aditivo AD-004',
        }));
        const gerar = screen.getByRole('button', { name: 'Gerar documento do aditivo' }) as HTMLButtonElement;
        expect(gerar.disabled).toBe(false);
        expect(screen.getByRole('button', { name: 'Modelos de documento' })).toBeTruthy();
    });

    it('aditivo cancelado: a lista fica, gerar desligado com o motivo', () => {
        montar(reg({ status: 'Cancelado' }));
        expect(painel).toHaveBeenCalled();
        const gerar = screen.getByRole('button', { name: 'Gerar documento do aditivo' }) as HTMLButtonElement;
        expect(gerar.disabled).toBe(true);
        expect(gerar.parentElement?.getAttribute('title')).toBe('O AD-004 está cancelado: não se gera documento dele.');
    });

    it('renovação por contrato novo: sem a seção de documentos do aditivo', () => {
        montar(reg({ via: 'CONTRATO', aditivo: undefined, filhoId: 'f1' }));
        expect(screen.queryByText('Documentos do aditivo')).toBeNull();
        expect(painel).not.toHaveBeenCalled();
    });
});
