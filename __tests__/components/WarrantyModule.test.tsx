// @vitest-environment jsdom
/**
 * Pós-Obra & Garantia — pedido de 2026-08-30
 * (docs/planos/2026-08-30-pos-obra-garantia-vinculos-abas-ui.md).
 *
 * Cobre o que o typecheck e o `check-ui-standard.sh` não veem: que a tela
 * RENDERIZA com as peças novas, e que o comportamento pedido acontece.
 *
 *  2/3/4. colunas Empreendimento, Obra e Cliente, preenchidas pelo vínculo;
 *  5.     aba Análise com os KPIs, e a pílula de estado da aba Chamados NÃO
 *         mexe nos números dela;
 *  6.     toolbar de abas, com o <h1> mudando junto;
 *  7.     botão de editar sempre visível na coluna de ações;
 *  8.     o cabeçalho da coluna de estado diz "Status".
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const listClaims = vi.fn();

// Diretório de unidades (`warranty_unit_directory`) — pedido de 2026-10-10:
// escolher o cliente preenche unidade, empreendimento e obra.
const DIRETORIO = [{
    unit_id: 'u302', unit_name: '302', unit_floor: 3, quadra: null, lote: null,
    tower_name: 'Torre A', empreendimento_id: 'emp1', empreendimento_name: 'Edifício Ferraz',
    project_id: 'obraA',
    clients: [{ client_id: 'cli1', client_name: 'Maria Silva', role: 'PROPRIETARIO', since: '2020-01-10', fonte: 'ocupacao' }],
    entrega_data: '2020-01-10', entrega_fonte: 'posse_proprietario',
}];

vi.mock('../../services/warrantyService', () => ({
    warrantyService: {
        list: (...args: unknown[]) => listClaims(...args),
        getTaxonomySystems: vi.fn(async () => [{ code: 'HID', name: 'Hidráulica', normRef: 'NBR 17170' }]),
        getTaxonomyPathologies: vi.fn(async () => [{ code: 'HID.VAZ', name: 'Vazamento', systemCode: 'HID' }]),
        getTerms: vi.fn(async () => []),
        getEvents: vi.fn(async () => []),
        getEvidence: vi.fn(async () => []),
        getLegacyConditionEvidence: vi.fn(async () => []),
        update: vi.fn(async () => ({})),
        classify: vi.fn(async () => ({})),
        triage: vi.fn(async () => ({})),
        close: vi.fn(async () => ({})),
        delete: vi.fn(async () => undefined),
        getUnitDirectory: vi.fn(async () => DIRETORIO),
    },
}));

// Centro de custo da obra B (filho de um grupo) — a tela o sugere quando a obra
// é escolhida (pedido de 2026-10-10: "falta centro de custo e plano de contas").
vi.mock('../../services/costCenterService', () => ({
    costCenterService: {
        list: vi.fn(async () => [
            { id: 'ccGrupo', name: 'Obras', code: '1', parent_id: null, organization_id: 'org1' },
            { id: 'ccBeta', name: 'CC Residencial Beta', code: '1.2', parent_id: 'ccGrupo', project_id: 'obraB', organization_id: 'org1' },
        ]),
    },
}));
vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: {
        listPlanoContas: vi.fn(async () => [{ id: 'pc1', name: 'Assistência técnica', code: '4.1', organization_id: 'org1' }]),
    },
}));

vi.mock('../../services/clientEmpreendimentoService', () => ({
    clientEmpreendimentoService: { listIdsByClient: vi.fn(async () => []) },
}));

vi.mock('../../services/empreendimentoService', () => ({
    empreendimentoService: {
        // Fora de ordem de propósito: a tela ordena por nome (pedido de 2026-10-10).
        list: vi.fn(async () => [{ id: 'emp1', name: 'Edifício Ferraz' }, { id: 'emp2', name: 'Coronel Lambert 316', project_id: 'obraB' }]),
        mapObrasToEmpreendimentos: vi.fn(async () => ({
            obraB: { id: 'emp2', name: 'Coronel Lambert 316' },
        })),
    },
}));

vi.mock('../../services/clientService', () => ({
    clientService: { listClients: vi.fn(async () => [{ id: 'cli1', name: 'Maria Silva' }]) },
}));

vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: 'org1' }),
    useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(async () => null), orgTargetModal: null }),
}));

// `showToast` precisa ser ESTÁVEL entre renders — o `load` do módulo o traz nas
// dependências, e uma `vi.fn()` nova a cada render dispararia recarga em laço.
// O hook real é `useCallback(..., [])`, então isto reproduz o comportamento de
// produção em vez de mascará-lo.
const showToast = vi.fn();
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast, localToast: null }) }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

// recharts mede o container com ResizeObserver; em jsdom ele tem largura 0 e
// nada é desenhado. O que interessa aqui é a composição da aba, não o SVG.
// Stubs NOMEADOS, não um Proxy: um Proxy responde também a `default`,
// `__esModule` e chaves Symbol, e o interop de ESM entra em laço com isso.
vi.mock('recharts', () => {
    const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
    const Vazio = () => null;
    return {
        ResponsiveContainer: Passthrough,
        BarChart: Passthrough, LineChart: Passthrough,
        Bar: Vazio, Line: Vazio, Cell: Vazio,
        XAxis: Vazio, YAxis: Vazio, CartesianGrid: Vazio, Tooltip: Vazio, Legend: Vazio,
    };
});

import WarrantyModule from '../../components/WarrantyModule';

const chamado = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    organization_id: 'org1',
    sistema_descricao: 'Impermeabilização da laje',
    descricao: 'Infiltração no teto',
    severity: 'alta',
    state: 'ABERTO',
    version: 1,
    created_at: '2026-08-10T09:00:00Z',
    updated_at: '2026-08-10T09:00:00Z',
    opened_by: { actorId: 'u', actorType: 'user', name: 'U' },
    ...over,
});

const PROJETOS = [
    { id: 'obraA', name: 'Residencial Alfa' },
    { id: 'obraB', name: 'Residencial Beta' },
];

function linhaDe(texto: string): HTMLElement {
    return screen.getByText(texto).closest('tr') as HTMLElement;
}

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    listClaims.mockResolvedValue([
        chamado({
            id: 'c1', development_id: 'emp1', project_id: 'obraA',
            // `client_id` preenchido: sem ele o botão de salvar da edição nasce
            // desabilitado (cliente é obrigatório desde 2026-08-30).
            client_id: 'cli1', client_name: 'Maria Silva', unidade_ref: 'Apt 302 · Torre A',
        }),
        chamado({
            id: 'c2', sistema_descricao: 'Esquadria da sacada', state: 'ENCERRADO',
            project_id: 'obraB', client_name: 'João Souza',
        }),
    ]);
});

describe('Pós-Obra & Garantia · vínculos nas colunas', () => {
    /**
     * Empreendimento é oculta por padrão desde 2026-09-12 (Descrição entrou
     * visível e as duas não cabem com Ações na tela). Estes casos ligam a
     * coluna como o usuário faria pela engrenagem — preferência persistida.
     */
    function comEmpreendimentoVisivel() {
        localStorage.setItem('warrantyClaimsColumns', JSON.stringify({
            visibleColumns: ['chamado', 'descricao', 'development', 'obra', 'unidade', 'cliente', 'state', 'severity', 'sla_deadline', 'actions'],
            sortColumn: null, sortDirection: 'asc',
            knownColumns: ['chamado', 'descricao', 'development', 'obra', 'unidade', 'cliente', 'patologia', 'state', 'severity', 'sla_deadline', 'quality_score', 'created_at', 'actions'],
            columnOrder: ['chamado', 'descricao', 'development', 'obra', 'unidade', 'cliente', 'patologia', 'state', 'severity', 'sla_deadline', 'quality_score', 'created_at', 'actions'],
        }));
    }

    it('mostra empreendimento, obra, unidade e cliente em colunas próprias', async () => {
        comEmpreendimentoVisivel();
        render(<WarrantyModule projects={PROJETOS} />);
        await waitFor(() => expect(screen.getByText('Impermeabilização da laje')).toBeInTheDocument());

        const linha = linhaDe('Impermeabilização da laje');
        expect(within(linha).getByText('Edifício Ferraz')).toBeInTheDocument();
        expect(within(linha).getByText('Residencial Alfa')).toBeInTheDocument();
        expect(within(linha).getByText('Apt 302 · Torre A')).toBeInTheDocument();
        expect(within(linha).getByText('Maria Silva')).toBeInTheDocument();
    });

    it('a célula Chamado não empilha mais a unidade como subtítulo', async () => {
        render(<WarrantyModule projects={PROJETOS} />);
        await waitFor(() => expect(screen.getByText('Impermeabilização da laje')).toBeInTheDocument());

        // A unidade aparece UMA vez na linha — na coluna própria, não repetida
        // sob o título do chamado.
        const linha = linhaDe('Impermeabilização da laje');
        expect(within(linha).getAllByText('Apt 302 · Torre A')).toHaveLength(1);

        // E a célula do chamado tem só o texto do chamado.
        const celulaChamado = within(linha).getByText('Impermeabilização da laje').closest('td')!;
        expect(celulaChamado.textContent?.trim()).toBe('Impermeabilização da laje');
    });

    it('chamado sem unidade mostra o travessão, não "Sem unidade" empilhado', async () => {
        render(<WarrantyModule projects={PROJETOS} />);
        await waitFor(() => expect(screen.getByText('Esquadria da sacada')).toBeInTheDocument());

        const linha = linhaDe('Esquadria da sacada');
        expect(within(linha).queryByText('Sem unidade')).not.toBeInTheDocument();
        expect(within(linha).getByText('Esquadria da sacada').closest('td')!.textContent?.trim())
            .toBe('Esquadria da sacada');
    });

    it('chamado sem vínculo próprio deduz o empreendimento pela obra, e diz que deduziu', async () => {
        comEmpreendimentoVisivel();
        render(<WarrantyModule projects={PROJETOS} />);
        await waitFor(() => expect(screen.getByText('Esquadria da sacada')).toBeInTheDocument());

        const deduzido = within(linhaDe('Esquadria da sacada')).getByText('Coronel Lambert 316');
        expect(deduzido).toBeInTheDocument();
        expect(deduzido.getAttribute('title')).toMatch(/deduzido da obra/i);
    });

    it('o cabeçalho da coluna de estado diz "Status"', async () => {
        render(<WarrantyModule projects={PROJETOS} />);
        await waitFor(() => expect(screen.getByText('Impermeabilização da laje')).toBeInTheDocument());

        const cabecalhos = screen.getAllByRole('columnheader').map(th => th.textContent ?? '');
        expect(cabecalhos.some(t => t.includes('Status'))).toBe(true);
        expect(cabecalhos.some(t => t.includes('Estado'))).toBe(false);
    });
});

describe('Pós-Obra & Garantia · coluna de ações', () => {
    it('o botão de editar aparece em toda linha, sem depender de hover', async () => {
        render(<WarrantyModule projects={PROJETOS} />);
        await waitFor(() => expect(screen.getByText('Impermeabilização da laje')).toBeInTheDocument());

        for (const titulo of ['Impermeabilização da laje', 'Esquadria da sacada']) {
            const botoes = within(linhaDe(titulo));
            expect(botoes.getByTitle('Editar chamado')).toBeVisible();
            expect(botoes.getByTitle('Excluir chamado')).toBeVisible();
        }
    });

    it('editar abre o detalhe já em modo edição, sem o clique escapar para a linha', async () => {
        const user = userEvent.setup();
        render(<WarrantyModule projects={PROJETOS} />);
        await waitFor(() => expect(screen.getByText('Impermeabilização da laje')).toBeInTheDocument());

        await user.click(within(linhaDe('Impermeabilização da laje')).getByTitle('Editar chamado'));
        expect(await screen.findByText('Editando chamado')).toBeInTheDocument();
    });

    it('clicar na linha abre o detalhe em LEITURA, não em edição', async () => {
        const user = userEvent.setup();
        render(<WarrantyModule projects={PROJETOS} />);
        await waitFor(() => expect(screen.getByText('Impermeabilização da laje')).toBeInTheDocument());

        await user.click(screen.getByText('Impermeabilização da laje'));
        await waitFor(() => expect(screen.getByText('Descrição do problema')).toBeInTheDocument());
        expect(screen.queryByText('Editando chamado')).not.toBeInTheDocument();
    });
});

/**
 * "Tela" tem significado técnico neste app: troca de conteúdo IN-FLOW, com o
 * shell visível. Não é `fixed inset-0`, não é Sheet, não é modal — os três já
 * foram tentados e rejeitados numa tarefa anterior por não serem "tela".
 * Estes testes existem para essa distinção não se perder de novo.
 */
describe('Pós-Obra & Garantia · o chamado abre como TELA, não overlay', () => {
    async function abrirChamado() {
        const user = userEvent.setup();
        render(<WarrantyModule projects={PROJETOS} />);
        await waitFor(() => expect(screen.getByText('Impermeabilização da laje')).toBeInTheDocument());
        await user.click(screen.getByText('Impermeabilização da laje'));
        await waitFor(() => expect(screen.getByRole('button', { name: /voltar/i })).toBeInTheDocument());
        return user;
    }

    it('substitui a lista em vez de sobrepor — a tabela sai do DOM', async () => {
        await abrirChamado();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        // ...e a toolbar de abas da LISTA também sai (é outra tela agora).
        expect(screen.queryByRole('button', { name: 'Análise', exact: true })).not.toBeInTheDocument();
    });

    it('não desenha backdrop nem container de overlay', async () => {
        const { container } = render(<WarrantyModule projects={PROJETOS} />);
        const user = userEvent.setup();
        await waitFor(() => expect(screen.getByText('Impermeabilização da laje')).toBeInTheDocument());
        await user.click(screen.getByText('Impermeabilização da laje'));
        await waitFor(() => expect(screen.getByRole('button', { name: /voltar/i })).toBeInTheDocument());

        expect(container.querySelector('.fixed.inset-0')).toBeNull();
        expect(container.querySelector('[class*="backdrop-blur"]')).toBeNull();
        expect(container.querySelector('[class*="bg-black/"]')).toBeNull();
    });

    it('o título do chamado é um h1, como cabeçalho de tela', async () => {
        await abrirChamado();
        expect(screen.getByRole('heading', { level: 1 }))
            .toHaveTextContent('Impermeabilização da laje');
    });

    it('a seta voltar devolve para a lista', async () => {
        const user = await abrirChamado();
        await user.click(screen.getByRole('button', { name: /voltar/i }));
        await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
        expect(screen.getByText('Esquadria da sacada')).toBeInTheDocument();
    });

    it('salvar a edição NÃO fecha a tela (§25) e recarrega o chamado', async () => {
        const user = await abrirChamado();
        await user.click(screen.getByTitle('Editar chamado'));
        expect(screen.getByText('Editando chamado')).toBeInTheDocument();

        // §25 — sem alteração o botão fica desabilitado; altera um campo antes.
        await user.type(screen.getByDisplayValue('Impermeabilização da laje'), ' — revisado');
        listClaims.mockClear();
        await user.click(screen.getByRole('button', { name: /Salvar alterações/i }));

        // Continua na tela do chamado — a lista não voltou.
        await waitFor(() => expect(listClaims).toHaveBeenCalled());
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1 }))
            .toHaveTextContent('Impermeabilização da laje');
    });
});

describe('Pós-Obra & Garantia · abas', () => {
    it('o título muda junto com a aba', async () => {
        const user = userEvent.setup();
        render(<WarrantyModule projects={PROJETOS} />);
        await waitFor(() => expect(screen.getByText('Impermeabilização da laje')).toBeInTheDocument());

        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pós-Obra & Garantia');
        await user.click(screen.getByRole('button', { name: 'Análise' }));
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Análise de Pós-Obra');
    });

    it('a tabela some na aba Análise, e os KPIs aparecem', async () => {
        const user = userEvent.setup();
        render(<WarrantyModule projects={PROJETOS} />);
        await waitFor(() => expect(screen.getByText('Impermeabilização da laje')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: 'Análise' }));
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        expect(screen.getByText('Em aberto')).toBeInTheDocument();
        expect(screen.getByText('SLA vencidos')).toBeInTheDocument();
    });

    /**
     * A razão de o filtro de estado ter virado client-side: enquanto ele ia ao
     * servidor, a aba Análise contava só o recorte escolhido na outra aba.
     */
    it('a pílula de estado da aba Chamados NÃO altera os números da Análise', async () => {
        const user = userEvent.setup();
        render(<WarrantyModule projects={PROJETOS} />);
        await waitFor(() => expect(screen.getByText('Impermeabilização da laje')).toBeInTheDocument());

        // Filtra por "Encerrado" pelo popover de estado (§5.4): sobra 1 linha das 2.
        await user.click(screen.getByRole('button', { name: 'Status' }));
        await user.click(screen.getByRole('menuitemradio', { name: 'Encerrado' }));
        expect(screen.queryByText('Impermeabilização da laje')).not.toBeInTheDocument();
        expect(screen.getByText('Esquadria da sacada')).toBeInTheDocument();

        // …e a Análise continua contando o conjunto inteiro (1 aberto, 1 encerrado).
        await user.click(screen.getByRole('button', { name: 'Análise' }));
        const emAberto = screen.getByText('Em aberto').closest('div')?.parentElement;
        expect(emAberto).toHaveTextContent('1');

        // Uma consulta só: o filtro não voltou ao servidor.
        expect(listClaims).toHaveBeenCalledTimes(1);
        expect(listClaims.mock.calls[0][0]).not.toHaveProperty('state');
    });
});

describe('Pós-Obra & Garantia · escolher o cliente preenche o resto (2026-10-10)', () => {
    it('cliente com uma unidade preenche unidade, empreendimento e obra na edição', async () => {
        const user = userEvent.setup();
        render(<WarrantyModule projects={PROJETOS} />);
        await waitFor(() => expect(screen.getByText('Esquadria da sacada')).toBeInTheDocument());
        await user.click(screen.getByText('Esquadria da sacada'));
        await user.click(await screen.findByTitle('Editar chamado'));

        await user.click(screen.getByRole('button', { name: /Selecionar cliente/i }));
        await user.click(await screen.findByText('Maria Silva'));

        await waitFor(() => expect(screen.getByRole('button', { name: /Torre A · 302/ })).toBeInTheDocument());
        const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
        expect(selects.some(s => s.value === 'emp1')).toBe(true);
        expect(selects.some(s => s.value === 'obraA')).toBe(false);   // obraB era escolha do chamado — não se sobrescreve
        expect(screen.getAllByText('Preenchido automaticamente').length).toBeGreaterThan(0);
    });
});

describe('Pós-Obra & Garantia · Empreendimento ordenado e Obra recortada (2026-10-10)', () => {
    it('empreendimentos em ordem de nome; escolher um mostra só as obras dele e preenche a única', async () => {
        const user = userEvent.setup();
        render(<WarrantyModule projects={PROJETOS} />);
        await waitFor(() => expect(screen.getByText('Impermeabilização da laje')).toBeInTheDocument());
        await user.click(screen.getByText('Impermeabilização da laje'));
        await user.click(await screen.findByTitle('Editar chamado'));

        const [selEmp, selObra] = screen.getAllByRole('combobox') as HTMLSelectElement[];
        expect(Array.from(selEmp.options).map(o => o.text))
            .toEqual(['Sem empreendimento', 'Coronel Lambert 316', 'Edifício Ferraz']);

        await user.selectOptions(selEmp, 'emp2');
        await waitFor(() => expect(selObra.value).toBe('obraB'));
        expect(Array.from(selObra.options).map(o => o.text)).toEqual(['Sem obra vinculada', 'Residencial Beta']);
        // …e a obra, por sua vez, traz o centro de custo dela.
        await waitFor(() => expect(screen.getByText('CC Residencial Beta')).toBeInTheDocument());
        expect(screen.getByText('Centro de custo')).toBeInTheDocument();
        expect(screen.getByText('Plano de contas')).toBeInTheDocument();
        expect(screen.getAllByText('Preenchido automaticamente').length).toBeGreaterThan(0);
    });
});
