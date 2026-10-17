// @vitest-environment jsdom
/**
 * Corretor › Comissões no desenho do Financeiro do Parceiro (17/10/2026).
 * Plano: docs/planos/2026-10-17-parceiro-financeiro-visual-corretor.md (2º pedido).
 *   - uma linha por parcela (marco) de cada comissão, por data;
 *   - situação vem de `paid`/`released`, nunca do texto do nome;
 *   - abas Todas/Pendentes/Liberadas/Pagas filtram as linhas;
 *   - celular (`compacto`) mostra a mesma informação em lista empilhada.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { BrokerCommission } from '../../types';

const COMISSOES: BrokerCommission[] = [{
    id: 'c1', organization_id: 'o1', broker_email: 'g@x.dev', deal_type: 'RENTAL', commission_base: 'PARCELA',
    contract_number: 'CTL-010-014-0001', unit_number: 'Loja - 204', block: '010 - Galeria Altavista',
    sale_value: 1500, commission_pct: 10, commission_predicted: 400, commission_released: 250, commission_paid: 100,
    status: 'PARCIAL',
    milestones: [
        { name: 'Parcela 3/36 — aluguel a receber', date: '2099-04-10', value: 150, paid: false, released: false },
        // o texto diz "liberada", mas o campo não: vale o campo
        { name: 'Parcela 2/36 — aluguel recebido — liberada', date: '2026-03-10', value: 150, paid: false, released: true },
        { name: 'Parcela 1/36 — comissão paga', date: '2026-02-10', value: 100, paid: true, released: true },
    ],
}];

vi.mock('../../services/brokerPortalService', () => ({ brokerPortalService: { getCommissionsByToken: vi.fn(async () => COMISSOES) } }));
vi.mock('../../services/brokerService', () => ({ brokerService: { listCommissions: vi.fn(async () => []) } }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import BrokerCommissions, { parcelasDasComissoes, resumoDasComissoes, situacaoDoMarco } from '../../components/broker/BrokerCommissions';

describe('Comissões do corretor — funções puras', () => {
    it('situação vem de paid/released; sem released, só paga conta como liberada', () => {
        expect(situacaoDoMarco({ paid: true, released: false })).toBe('PAGA');
        expect(situacaoDoMarco({ paid: false, released: true })).toBe('LIBERADA');
        expect(situacaoDoMarco({ paid: false })).toBe('PENDENTE');
    });

    it('uma linha por marco, em ordem de data; marco sem data vai para o fim', () => {
        const comData = parcelasDasComissoes(COMISSOES);
        expect(comData.map(p => p.nome.slice(0, 12))).toEqual(['Parcela 1/36', 'Parcela 2/36', 'Parcela 3/36']);
        expect(comData[0].negociacao).toBe('Loja - 204 • 010 - Galeria Altavista');
        const semData = parcelasDasComissoes([{ ...COMISSOES[0], milestones: [{ name: 'Prevista', value: 1, paid: false }, ...COMISSOES[0].milestones!] }]);
        expect(semData[semData.length - 1].nome).toBe('Prevista');
    });

    it('resumo: a liberar = prevista − liberada; próxima = pendente mais antiga com data', () => {
        const r = resumoDasComissoes(COMISSOES, parcelasDasComissoes(COMISSOES));
        expect(r).toMatchObject({ prevista: 400, aLiberar: 150, liberada: 250, aReceber: 150, paga: 100 });
        expect(r.proxima?.nome).toBe('Parcela 3/36 — aluguel a receber');
    });
});

describe('BrokerCommissions (tela)', () => {
    it('tabela com uma linha por parcela, pílula de situação e abas que filtram', async () => {
        render(<BrokerCommissions brokerEmail="" portalToken="tok" />);
        expect(await screen.findByText('Parcela 1/36 — comissão paga')).toBeInTheDocument();
        expect(screen.getAllByRole('row')).toHaveLength(1 + 3); // cabeçalho + 3 parcelas
        expect(screen.getByText('Paga', { selector: 'span' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Liberadas/ }));
        expect(screen.getByText('Parcela 2/36 — aluguel recebido — liberada')).toBeInTheDocument();
        expect(screen.queryByText('Parcela 1/36 — comissão paga')).toBeNull();
        expect(screen.queryByText('Parcela 3/36 — aluguel a receber')).toBeNull();
    });

    it('celular: mesma informação em lista, sem tabela', async () => {
        render(<BrokerCommissions brokerEmail="" portalToken="tok" compacto />);
        expect(await screen.findByText('Parcela 3/36 — aluguel a receber')).toBeInTheDocument();
        expect(screen.queryByRole('table')).toBeNull();
        expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });
});
