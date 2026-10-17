// @vitest-environment jsdom
/**
 * Ranking do corretor com dado real (17/10/2026).
 * Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md (F2, decisão P3).
 *   - gestor (visão interna, sem token): lista completa com nomes;
 *   - corretor sem token (prévia/impersonação): a mesma régua da lista, só a própria posição;
 *   - quem não vendeu no período: "Ainda sem venda", não "último".
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const lista = [
    { email: 'a@prova.dev', nome: 'Ana', vendas: 3, volume: 300000, enviadas: 3, posicao: 1, posicao_anterior: null },
    { email: 'devq1@gmail.com', nome: 'zoio', vendas: 2, volume: 1000000, enviadas: 3, posicao: 2, posicao_anterior: 1 },
    { email: 'b@prova.dev', nome: 'Bia', vendas: 0, volume: 0, enviadas: 1, posicao: null, posicao_anterior: 1 },
];

vi.mock('../../services/brokerService', () => ({ brokerService: { rankingDaOrganizacao: vi.fn(async () => lista) } }));
vi.mock('../../services/brokerPortalService', () => ({ brokerPortalService: { getRankingByToken: vi.fn() } }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import BrokerRanking, { minhaPosicaoDaLista } from '../../components/broker/BrokerRanking';

describe('BrokerRanking', () => {
    it('gestor vê a lista completa, com nomes e o "—" de quem não vendeu', async () => {
        render(<BrokerRanking brokerEmail="" organizationId="org-1" visao="gestor" />);
        expect(await screen.findByText('Ana')).toBeInTheDocument();
        expect(screen.getByText('zoio')).toBeInTheDocument();
        expect(screen.getByText('Bia')).toBeInTheDocument();
        expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('corretor sem token (prévia): só a própria posição, sem nome de colega', async () => {
        render(<BrokerRanking brokerEmail="DEVQ1@gmail.com" organizationId="org-1" visao="corretor" />);
        expect(await screen.findByText('2º')).toBeInTheDocument();
        expect(screen.getByText('de 3')).toBeInTheDocument();
        expect(screen.queryByText('Ana')).toBeNull();
        expect(screen.queryByText('Bia')).toBeNull();
    });

    it('quem não vendeu no período: "Ainda sem venda", e a meta é a do líder', () => {
        const eu = minhaPosicaoDaLista(lista, 'b@prova.dev');
        expect(eu.posicao).toBeNull();
        expect(eu.vendas_do_lider).toBe(3);
        expect(eu.com_venda).toBe(2);
        const fora = minhaPosicaoDaLista(lista, 'novo@prova.dev');
        expect(fora.total_corretores).toBe(4); // ele próprio entra no universo
    });
});
