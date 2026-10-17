// @vitest-environment jsdom
/**
 * Portal do Corretor no celular (16/10/2026).
 * Plano: docs/planos/2026-10-16-portal-corretor-mobile.md
 *
 * Com dados falsos nas RPCs do link do corretor, a casca mobile:
 *   1. respeita "Configurar abas visíveis do corretor" (D8): só as habilitadas
 *      na barra, sem "Mais" quando cabem; Saúde nunca aparece (D6);
 *   2. com tudo habilitado, 4 na barra + "Mais" com o resto (D2);
 *   3. Empreendimentos em cartões (nome, endereço, disponíveis) e, aberto, as
 *      unidades em cartões com "Adicionar" e "Fazer proposta" — sem <table>;
 *   4. "Adicionar" monta a cesta, que aparece acima da barra;
 *   5. Propostas em cartões (unidade, status por extenso, comprador, valor);
 *   6. a folha de conta tem Meus dados, Ajuda e Sair — e nada de "em breve" (D5);
 *   7. barra de status falsa só na prévia.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const predio = { id: 'b-1', type: 'BUILDING', name: '010 - Galeria Altavista', address: 'Rua Angelo Bernardo Faccio, 98', status: 'AVAILABLE' };
const ap101 = { id: 'u-101', type: 'APARTMENT', name: 'Apto 101', number: '101', parent_id: 'b-1', status: 'AVAILABLE', current_price: 812000 };
const ap102 = { id: 'u-102', type: 'APARTMENT', name: 'Apto 102', number: '102', parent_id: 'b-1', status: 'SOLD', current_price: 790000 };
const ap104 = { id: 'u-104', type: 'APARTMENT', name: 'Apto 104', number: '104', parent_id: 'b-1', status: 'AVAILABLE', current_price: 650000 };
const loja = { id: 'u-103', type: 'STORE', name: 'Loja 103', number: '103', parent_id: 'b-1', status: 'RENTED', current_price: 0 };
const item = (u: typeof ap101, extra: Record<string, unknown> = {}) => ({
    id: `i-${u.id}`, price_table_id: 't-1', property_id: u.id, price: u.current_price, current_price: u.current_price,
    property_name: u.name, property_status: u.status, private_area: 78.5, bedrooms: 3, parking_spaces: 2, floor: 1,
    created_at: '', ...extra,
});
const proposta = {
    id: 'p-1', property_id: 'u-101', broker_email: 'geleia@exemplo.com', buyer_name: 'Maria Souza', buyer_cpf: '000',
    total_value: 800000, status: 'APROVADA', units: [{ property_id: 'u-101', unit_name: '101' }],
};

vi.mock('../../services/brokerPortalService', () => ({
    brokerPortalService: {
        // como a RPC real: sem current_price e com price 0 — o preço está na TABELA
        getUnitsByToken: vi.fn(async () => [predio, ap101, ap102, ap104, loja].map(u => ({
            ...Object.fromEntries(Object.entries(u).filter(([k]) => k !== 'current_price')), price: 0,
        }))),
        getProposalsByToken: vi.fn(async () => [proposta]),
        getPriceColumnsByToken: vi.fn(async () => null),
        getPriceTableByToken: vi.fn(async () => ({
            table: { id: 't-1', version_label: 'v3', effective_date: '2026-10-01', status: 'ACTIVE', activated_at: '' },
            items: [item(ap101), item(ap102), item(ap104), item(loja)],
        })),
        getRentalPriceTableByToken: vi.fn(async () => ({ table: null, items: [] })),
        getSalesPlansByToken: vi.fn(async () => []),
        getRankingByToken: vi.fn(async () => ({ posicao: 2, posicao_anterior: 1, total_corretores: 3, com_venda: 2, vendas: 2, volume: 1000000, enviadas: 3, vendas_do_lider: 3 })),
        getMaterialsByToken: vi.fn(async () => [{ id: 'm-1', title: 'Book do Garden', type: 'BOOK', file_url: 'https://exemplo/book.pdf', version: 2, views_count: 0 }]),
        validateSalesSimulationByToken: vi.fn(async () => null),
    },
}));
vi.mock('../../services/brokerService', async (orig) => ({ ...(await orig<typeof import('../../services/brokerService')>()), brokerService: { listEnabledPropertyIds: vi.fn(async () => null), listProfiles: vi.fn(async () => []), saveProfile: vi.fn() } }));
vi.mock('../../services/commercialService', () => ({ commercialService: { listProperties: vi.fn(async () => []), listDeals: vi.fn(async () => []), saveProperty: vi.fn() } }));
vi.mock('../../services/proposalPdfService', () => ({ downloadProposalPdf: vi.fn() }));
vi.mock('../../components/portal/PortalHelp', () => ({ PortalHelp: () => null }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

import BrokerPortalMobile from '../../components/broker/BrokerPortalMobile';
import { ConfirmProvider } from '../../components/ui/confirm';

const corretor = (abas: string[] = []) => ({
    id: 'br-1', name: 'geleia', email: 'geleia@exemplo.com', creci: '123', settings: { brokerPortalTabs: abas },
});

const montar = (abas: string[] = [], previa = false) => render(
    <ConfirmProvider>
        <BrokerPortalMobile
            profile={{ group: 'CORRETOR', role: '', email: 'geleia@exemplo.com' }}
            organizationId="org-1"
            portalToken={previa ? undefined : 'tok-1'}
            initialBroker={corretor(abas) as never}
            onLogout={() => {}}
            previa={previa}
        />
    </ConfirmProvider>,
);

const barra = () => screen.getByRole('navigation', { name: 'Seções do portal' });

describe('BrokerPortalMobile', () => {
    beforeEach(() => { localStorage.clear(); });

    it('só as abas habilitadas pela engrenagem, sem as de demonstração; cabem sem "Mais" (o caso do print)', async () => {
        montar(['empreendimentos', 'propostas', 'comissoes', 'materiais', 'chat']);
        expect(screen.getByRole('heading', { level: 1, name: 'Olá, Geleia' })).toBeInTheDocument();
        const botoes = within(barra()).getAllByRole('button');
        // Chat estava ligado para o Geleia, mas é demonstração (D9): sai
        expect(botoes.map(b => b.textContent)).toEqual(['Empreend.', 'Propostas', 'Comissões', 'Materiais']);
        expect(within(barra()).getByRole('button', { name: /empreend/i })).toHaveAttribute('aria-current', 'page');
        expect(within(barra()).queryByRole('button', { name: /mais/i })).toBeNull();
        expect(await screen.findByText('010 - Galeria Altavista')).toBeInTheDocument();
    });

    it('tudo habilitado: 4 na barra + "Mais" com o resto, e nenhuma Saúde', async () => {
        const user = userEvent.setup();
        montar([]);
        const botoes = within(barra()).getAllByRole('button');
        expect(botoes.map(b => b.textContent)).toEqual(['Empreend.', 'Estoque', 'Propostas', 'Comissões', 'Mais']);
        await user.click(within(barra()).getByRole('button', { name: /mais/i }));
        const folha = screen.getByRole('dialog', { name: 'Mais seções' });
        const rotulos = within(folha).getAllByRole('button').map(b => b.textContent);
        expect(rotulos).toEqual(['Leads', 'Materiais', 'Agenda', 'Ranking', 'Analytics']);
        for (const demo of ['Chat', 'Treinamento']) expect(screen.queryByText(demo)).toBeNull();
        expect(screen.queryByText('Saúde')).toBeNull();
    });

    it('Empreendimentos e unidades em cartões, sem tabela; "Adicionar" monta a cesta', async () => {
        const user = userEvent.setup();
        const { container } = montar(['empreendimentos', 'propostas']);
        const cartao = await screen.findByRole('button', { name: /010 - Galeria Altavista/ });
        expect(within(cartao).getByText('Rua Angelo Bernardo Faccio, 98')).toBeInTheDocument();
        // 101 está livre no cadastro, mas tem proposta APROVADA: não conta como disponível
        expect(cartao.textContent).toContain('1 disponível');
        expect(cartao.textContent).toContain('de 4');
        expect(container.querySelector('table')).toBeNull();

        await user.click(cartao);
        expect(await screen.findByText('Apto 101')).toBeInTheDocument();
        expect(screen.getByText('Tabela vigente: v3')).toBeInTheDocument();
        expect(container.querySelector('table')).toBeNull();
        // item 1.2: o mesmo status do Estoque — proposta aprovada = Vendido, sem nova proposta
        const aprovada = screen.getByText('Apto 101').closest('li')!;
        expect(within(aprovada).getByText('Vendido')).toBeInTheDocument();
        expect(within(aprovada).getByText('Unidade já vendida')).toBeInTheDocument();
        expect(within(aprovada).getByRole('button', { name: 'Fazer proposta' })).toBeDisabled();

        const vendido = screen.getByText('Apto 102').closest('li')!;
        expect(within(vendido).getByText('Unidade já vendida')).toBeInTheDocument();
        expect(within(vendido).getByRole('button', { name: 'Fazer proposta' })).toBeDisabled();

        // alugada: proposta individual sim, cesta não — e o cartão diz por quê; preço 0 não vira R$ 0,00
        const alugada = screen.getByText('Loja 103').closest('li')!;
        expect(within(alugada).getByRole('button', { name: /adicionar/i })).toBeDisabled();
        expect(within(alugada).getByText('Alugado: só proposta individual')).toBeInTheDocument();
        expect(within(alugada).getByRole('button', { name: 'Fazer proposta' })).toBeEnabled();
        expect(within(alugada).getByText('Preço não informado')).toBeInTheDocument();

        const livre = screen.getByText('Apto 104').closest('li')!;
        expect(livre.textContent).toContain('78,5 m² · 3 dorm. · 2 vagas · 1º pav.');
        await user.click(within(livre).getByRole('button', { name: /adicionar/i }));
        expect(within(livre).getByRole('button', { name: /na proposta/i })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('1 unidade')).toBeInTheDocument();
        // o total da cesta vem da tabela vigente (antes: R$ 0 pelo link)
        const cesta = container.querySelector('[data-tour="cesta-barra"]') as HTMLElement;
        expect(within(cesta).getByText(/R\$\s*650\.000/)).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Fazer proposta' }).length).toBeGreaterThan(2);
    });

    it('"Fazer proposta" direto e voltar: a cesta que havia volta, a unidade avulsa não fica presa', async () => {
        const user = userEvent.setup();
        const { container } = montar(['empreendimentos', 'propostas']);
        await user.click(await screen.findByRole('button', { name: /010 - Galeria Altavista/ }));
        const livre = (await screen.findByText('Apto 104')).closest('li')!;
        await user.click(within(livre).getByRole('button', { name: 'Fazer proposta' }));
        await user.click(await screen.findByRole('button', { name: 'Voltar sem enviar a proposta' }));
        expect(container.querySelector('[data-tour="cesta-barra"]')).toBeNull();
        expect(within(barra()).getByRole('button', { name: /empreend/i })).toHaveAttribute('aria-current', 'page');
    });

    it('Materiais pelo token: linha tocável que abre o arquivo, sem "Novo Material" para o corretor (D10)', async () => {
        const user = userEvent.setup();
        const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
        const { container } = montar(['empreendimentos', 'materiais']);
        await user.click(within(barra()).getByRole('button', { name: /materiais/i }));
        const linha = await screen.findByRole('button', { name: /Book do Garden/ });
        expect(linha.textContent).toContain('v2');
        expect(screen.queryByRole('button', { name: /novo material/i })).toBeNull();
        expect(container.querySelector('table')).toBeNull();
        await user.click(linha);
        expect(abrir).toHaveBeenCalledWith('https://exemplo/book.pdf', '_blank');
        abrir.mockRestore();
    });

    it('Estoque: tocar na unidade abre a folha com as ações; vendida diz por que não aceita proposta', async () => {
        const user = userEvent.setup();
        montar(['empreendimentos', 'estoque']);
        await user.click(within(barra()).getByRole('button', { name: /estoque/i }));
        await user.click(await screen.findByText('Apto 104'));
        const folha = screen.getByRole('dialog', { name: 'Unidade Apto 104' });
        expect(within(folha).getByRole('button', { name: 'Fazer proposta' })).toBeInTheDocument();
        expect(within(folha).getByRole('button', { name: /adicionar/i })).toBeInTheDocument();
        expect(within(folha).getByRole('button', { name: /reservar 48h/i })).toBeInTheDocument();
        // tocar não pulou para o simulador
        expect(screen.queryByRole('button', { name: 'Voltar sem enviar a proposta' })).toBeNull();
        await user.click(within(folha).getByRole('button', { name: /adicionar/i }));
        expect(screen.getByText('1 unidade')).toBeInTheDocument();

        // 101 está livre no cadastro, mas tem proposta APROVADA: o espelho a pinta
        // como vendida e a folha diz o mesmo que o quadrinho
        await user.click(screen.getByText('Apto 101'));
        const vendida = screen.getByRole('dialog', { name: 'Unidade Apto 101' });
        expect(within(vendida).getByText('Vendido: esta unidade não aceita proposta agora.')).toBeInTheDocument();
        expect(within(vendida).queryByRole('button', { name: 'Fazer proposta' })).toBeNull();
    });

    it('Ranking pelo token: só a própria posição e a meta, sem nome de colega (P3)', async () => {
        const user = userEvent.setup();
        montar(['empreendimentos', 'ranking']);
        await user.click(within(barra()).getByRole('button', { name: /ranking/i }));
        const cartao = await screen.findByText('2º');
        const bloco = cartao.closest('[data-tour="ranking-posicao"]') as HTMLElement;
        expect(bloco.textContent).toContain('de 3');
        expect(bloco.textContent).toContain('caiu 1');
        expect(bloco.textContent).toContain('2/3');
        // nenhum e-mail/nome de colega no conteúdo (o "Meus dados" fica montado fora do <main>)
        expect(document.querySelector('main')!.textContent).not.toMatch(/@/);
    });

    it('Propostas em cartões: unidade, status por extenso, comprador e valor', async () => {
        const user = userEvent.setup();
        const { container } = montar(['empreendimentos', 'propostas']);
        await user.click(within(barra()).getByRole('button', { name: /propostas/i }));
        expect(await screen.findByText('Unidade 101')).toBeInTheDocument();
        expect(screen.getByText('Aprovada')).toBeInTheDocument();
        expect(screen.getByText('Maria Souza')).toBeInTheDocument();
        expect(screen.getByText(/800\.000/)).toBeInTheDocument();
        expect(container.querySelector('table')).toBeNull();
    });

    it('folha de conta: Meus dados, Ajuda e Sair — sem os itens "em breve"', async () => {
        const user = userEvent.setup();
        montar(['empreendimentos']);
        await user.click(screen.getByRole('button', { name: 'Abrir minha conta' }));
        const folha = screen.getByRole('dialog', { name: 'Minha conta' });
        expect(within(folha).getAllByRole('button').map(b => b.textContent?.trim()).filter(Boolean))
            .toEqual(['Meus dados', 'Ajuda', 'Sair']);
        expect(within(folha).queryByText(/prefer|notifica/i)).toBeNull();
    });

    it('barra de status falsa só na prévia', () => {
        const { container, unmount } = montar(['empreendimentos'], true);
        expect(container.querySelector('[data-modo="previa"]')).not.toBeNull();
        unmount();
        const aparelho = montar(['empreendimentos']);
        expect(aparelho.container.querySelector('[data-modo="aparelho"]')).not.toBeNull();
    });
});
