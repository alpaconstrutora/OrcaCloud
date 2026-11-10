import React from 'react';
import { createPortal } from 'react-dom';
import SupplierSelect from './SupplierSelect';
import { ArrowLeft, Save, Building2, Package, Search, Calendar, FileText, CheckCircle2, Filter, HandCoins, AlertCircle, X, Plus, Pencil, Settings, RefreshCw, Loader2, MoveHorizontal } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedScopedSearch, useResizableColumns } from './ui/TableUtils';
import { useConfirm } from './ui/confirm';
import { getOrderNumberLockReason, regenerateOrderNumber } from '../services/orderNumberRegenService';
import PlanoContasSelect from './PlanoContasSelect';
import CostCenterSelect from './CostCenterSelect';
import Button from './ui/Button';
import { projectService, ProjectData } from '../services/projectService';
import { empreendimentoService } from '../services/empreendimentoService';
import { resolveProjectBudget } from '../services/budgetResolver';
import { supplierService } from '../services/supplierService';
import { orderService } from '../services/orderService';
import { sinapiService } from '../services/sinapiService';
import { useOrgContext } from '../hooks/useOrgContext';
import { financialRegistryService } from '../services/financialRegistryService';
import { costCenterService } from '../services/costCenterService';
import PedidoOrcamentoPicker, { type ItemDoOrcamentoEscolhido } from './suprimentos/PedidoOrcamentoPicker';
import DatabasePickerModal from './DatabasePickerModal';
import { Supplier, BudgetEntry, SinapiItem, PaymentAccount, CostCenter } from '../types';
import { CostCenterV2 } from '../types/financial';
import {
    obrasDoEmpreendimento,
    empreendimentosComObra,
    obraAoTrocarEmpreendimento,
    motivoSalvarBloqueado,
} from '../utils/pedidoObra';
// Dinheiro tem duas casas; `qtd × preço` em ponto flutuante não tem.
// `round2` é o arredondamento canônico do projeto — não reimplementar.
import { round2 } from '../utils/financialMath';
import { formatCurrency } from '../utils/financialMath';
import { temCotacao, totalEfetivoDoPedido, totalReferenciaDoPedido, valorEfetivoDoItem } from '../utils/pedidoItemValor';
import { FORMA_ENTREGA_PADRAO, FORMAS_DE_ENTREGA } from '../utils/formaEntrega';
import { pedidoPreferenciasService } from '../services/pedidoPreferenciasService';
import { FORMAS_PAGAMENTO_PEDIDO, PADROES_DO_SISTEMA, ROTULO_ORIGEM, camposAPreencher, dataPrevistaDeEntrega, resolverPadroes, vazio, type CampoPadrao, type OrigemDoPadrao, type PadroesDoPedido } from '../lib/pedidoPreferencias';

interface AvulsoItem {
    code: string; description: string; unit: string; quantity: number; unitPrice: number;
    /**
     * Total como ele já estava gravado no pedido. Só existe em item que veio do
     * banco e que NINGUÉM editou — o modal descarta este campo ao confirmar.
     *
     * Existe porque destravar o salvar não pode mexer em dinheiro sozinho: um
     * pedido gerado de NF-e guarda o total da LINHA da nota (4404.01), que não é
     * igual a `quantidade × preço` com o preço truncado em 4 casas
     * (235.85 × 18.6729 = 4404.003465). Recalcular às cegas fazia o pedido
     * mudar de R$ 6.489,75 para R$ 6.489,74 só por ter sido aberto e salvo.
     */
    total?: number;
    /**
     * Par COTADO (o que o fornecedor cobra) — ver utils/pedidoItemValor.ts.
     * `null`/ausente = sem cotação, para o fornecedor preencher no portal.
     * `quotedTotal` segue a mesma regra de preservação do `total`.
     */
    quotedUnitPrice?: number | null;
    quotedTotal?: number | null;
}

// §2 — colunas das duas tabelas desta aba, definidas FORA do componente.
// Todas ordenáveis (§6.3): cada uma carrega um valor único comparável.
const AVULSO_COLUMNS: ColumnConfig[] = [
    { key: 'code', label: 'Código', sortable: true },
    { key: 'origem', label: 'Origem', sortable: true },
    { key: 'description', label: 'Descrição', sortable: true },
    { key: 'unit', label: 'Unid.', sortable: true },
    { key: 'quantity', label: 'Qtd.', sortable: true },
    { key: 'unitPrice', label: 'Valor unit.', sortable: true },
    { key: 'total', label: 'Total', sortable: true },
    { key: 'quotedUnitPrice', label: 'Unit. cotação', sortable: true },
    { key: 'quotedTotal', label: 'Total cotação', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const AVULSO_HEADERS: Record<string, { label: string; className: string }> = {
    code: { label: 'Código', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap' },
    origem: { label: 'Origem', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap' },
    description: { label: 'Descrição', className: 'px-6 py-2 border-r border-gray-100' },
    unit: { label: 'Unid.', className: 'px-6 py-2 border-r border-gray-100 text-right' },
    quantity: { label: 'Qtd.', className: 'px-6 py-2 border-r border-gray-100 text-right' },
    unitPrice: { label: 'Valor unit.', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap' },
    total: { label: 'Total', className: 'px-6 py-2 border-r border-gray-100 text-right' },
    quotedUnitPrice: { label: 'Unit. cotação', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap' },
    quotedTotal: { label: 'Total cotação', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap' },
};

// Larguras padrão (§6.1) das duas tabelas desta aba. São ponto de partida; o
// botão de auto-ajuste (§6.1.2) mede o conteúdo real — que é o que resolve a
// Descrição, a única coluna que estoura (texto SINAPI de várias linhas).
const DEFAULT_AVULSO_COL_WIDTHS: Record<string, number> = {
    code: 120, origem: 120, description: 320, unit: 90, quantity: 90,
    unitPrice: 130, total: 130, quotedUnitPrice: 130, quotedTotal: 130, actions: 110,
};

// Alinhamento da célula por coluna — o <td> sai de um `.map`, então não dá para
// escrever a classe direto em cada um.
const CELULA_A_DIREITA = 'text-right';
const AVULSO_ALIGN: Record<string, string> = {
    code: '', description: '', unit: CELULA_A_DIREITA, quantity: CELULA_A_DIREITA,
    unitPrice: CELULA_A_DIREITA, total: CELULA_A_DIREITA,
    quotedUnitPrice: CELULA_A_DIREITA, quotedTotal: CELULA_A_DIREITA,
};
/** Quanto já foi pedido na obra, por código — pedidos não cancelados (inclui o
 *  próprio pedido em edição). Alimenta "Qtd comprada"/"A comprar" do painel. */
async function quantidadesCompradasNaObra(projectId: string): Promise<Map<string, number>> {
    const orders = await orderService.listOrders(projectId);
    const quantities = new Map<string, number>();
    orders.forEach(order => {
        if (order.status !== 'Cancelado') {
            order.items.forEach(item => {
                quantities.set(item.code, (quantities.get(item.code) || 0) + item.quantity);
            });
        }
    });
    return quantities;
}

// Ordena preservando o índice/linha original — a lista de avulsos é endereçada
// por índice (editar/excluir), então o índice não pode vir da lista ordenada.
function ordenarLinhas<T>(
    linhas: T[],
    coluna: string | null,
    direcao: 'asc' | 'desc',
    valorDe: (linha: T, coluna: string) => string | number,
): T[] {
    if (!coluna) return linhas;
    const sentido = direcao === 'desc' ? -1 : 1;
    return [...linhas].sort((a, b) => {
        const va = valorDe(a, coluna);
        const vb = valorDe(b, coluna);
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sentido;
        return String(va).localeCompare(String(vb), 'pt-BR') * sentido;
    });
}

interface SupplyChainOrderFormProps {
    onBack: () => void;
    onSave: () => void;
    editingOrderId?: string | null;
    /** Embutido na tela de detalhe do pedido: sem cabeçalho, sem abas próprias e
     *  sem o card de resumo — o detalhe é dono do cromo e das abas. */
    embedded?: boolean;
    /** Qual grupo de painéis renderizar quando embutido. */
    painel?: 'dados' | 'itens' | 'financeiro';
    /** Embutido: ponto do cabeçalho do detalhe onde o "Salvar alterações" é
     *  desenhado, ao lado de "Negociar" (pedido de 10/11/2026). Sem ele, o botão
     *  fica acima do formulário, como antes. */
    barraDeAcoes?: HTMLElement | null;
    /** Embutido: ponto da régua de "Itens do pedido" (tabela do detalhe) onde o
     *  "+ Item avulso" é desenhado. Embutido, a tabela "Itens avulsos" não
     *  aparece — repetia as linhas de "Itens do pedido" (pedido de 10/11/2026). */
    barraItens?: HTMLElement | null;
    /** Embutido: itens e versão gravados, como o detalhe os tem. Quando o
     *  detalhe grava um item (editar/excluir/incluir avulso), a versão muda e o
     *  formulário relê os itens — senão o "Salvar alterações" mandaria a lista
     *  antiga e cairia em conflito de versão. */
    itensGravados?: PedidoItemGravado[];
    versaoGravada?: number;
}

/** Item como está gravado em `purchase_orders.items`. */
type PedidoItemGravado = { code: string; description: string; unit: string; quantity: number; unitPrice: number; total?: number; quotedUnitPrice?: number | null; quotedTotal?: number | null; avulso?: boolean };

const SupplyChainOrderForm: React.FC<SupplyChainOrderFormProps> = ({ onBack, onSave, editingOrderId, embedded = false, painel = 'dados', barraDeAcoes, barraItens, itensGravados, versaoGravada }) => {
    const { orgId: contextOrgId } = useOrgContext();
    const isEditing = !!editingOrderId;
    const [loading, setLoading] = React.useState(true);

    // Número do pedido — gerado pela Nomenclatura, nunca digitado. Só aparece
    // na EDIÇÃO: pedido novo recebe o número ao salvar.
    const confirm = useConfirm();
    const [orderNumber, setOrderNumber] = React.useState<string | null>(null);
    const [numberLockReason, setNumberLockReason] = React.useState<string | null>(null);
    // Obra como está GRAVADA. O número do pedido é derivado dela (máscara com o
    // código do empreendimento), então "mudou a obra desde o último save" é o
    // gatilho de regerar — e o que a tela avisa quando regerar está travado.
    const [obraSalva, setObraSalva] = React.useState('');
    const [isRegeneratingNumber, setIsRegeneratingNumber] = React.useState(false);

    // Edição não é overlay: é TELA, renderizada in-flow pelo AppRouter dentro da
    // aba Suprimentos › Pedidos (sidebar e shell continuam visíveis). Criação
    // continua em sobreposição. Ver UI_PATTERNS.md / memória
    // "nunca tela cheia para painéis" — "tela" aqui = troca de conteúdo, não
    // Sheet nem modal.
    //
    const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
    const [projects, setProjects] = React.useState<{ id: string; name: string; organization_id?: string | null; settings?: { classification?: string } }[]>([]);
    const [accounts, setAccounts] = React.useState<PaymentAccount[]>([]);
    const [costCenters, setCostCenters] = React.useState<CostCenterV2[]>([]);
    // Plano de Contas (tabela `plano_de_contas` — dimensão canônica, distinta de
    // Centro de Custo e de financial_categories). Ver memória
    // centro-custo-vs-plano-de-contas-canonico.
    const [planoContas, setPlanoContas] = React.useState<CostCenter[]>([]);

    const [selectedSupplierId, setSelectedSupplierId] = React.useState('');
    const [selectedProjectId, setSelectedProjectId] = React.useState('');
    const [deliveryDate, setDeliveryDate] = React.useState('');
    const [paymentMethod, setPaymentMethod] = React.useState('Boleto');
    const [paymentTermType, setPaymentTermType] = React.useState<'Vista' | 'Parcelado'>('Vista');
    const [paymentDays, setPaymentDays] = React.useState(30);
    const [paymentInstallments, setPaymentInstallments] = React.useState(1);
    const [notes, setNotes] = React.useState('');
    // O comprador decide, por pedido, se as observações vão para o fornecedor
    // (portal por token e área logada). Default TRUE: é o comportamento que
    // sempre existiu — a RPC do portal corta `notes` quando FALSE.
    const [notesVisibleToSupplier, setNotesVisibleToSupplier] = React.useState(true);
    // Empreendimento: NÃO é campo do pedido — é derivado da obra (como a
    // lista e a numeração PC-{empreend}-{obra}-{seq} já fazem). O seletor
    // existe para filtrar as obras e para o usuário ver a hierarquia
    // Empreendimento → Obra no próprio pedido.
    const [empreendimentos, setEmpreendimentos] = React.useState<{ id: string; name: string }[]>([]);
    const [empreendimentoByProject, setEmpreendimentoByProject] = React.useState<Record<string, { id: string; name: string; towerName?: string }>>({});
    const [selectedEmpreendimentoId, setSelectedEmpreendimentoId] = React.useState('');
    const [bankAccount, setBankAccount] = React.useState('');
    // FK de verdade (cost_centers_v2) — costCenter (nome, texto legado) é
    // derivado dela no submit, só para não quebrar telas que ainda leem o
    // texto (FinancialOrderDetails, financialService).
    const [costCenterId, setCostCenterId] = React.useState('');
    // chartOfAccounts (texto legado) não tem estado próprio no formulário —
    // é derivado do nome do item selecionado em planoDeContasId, só no submit.
    const [planoDeContasId, setPlanoDeContasId] = React.useState('');
    const [deliveryMethod, setDeliveryMethod] = React.useState(FORMA_ENTREGA_PADRAO);
    const [deliveryLocation, setDeliveryLocation] = React.useState('Canteiro de Obras');

    // Preferências (Suprimentos › Pedidos › Preferências, plano 2026-11-09-pedido-compra-preferencias):
    // padrões do pedido NOVO. `mexidos` = campos que o usuário alterou — o padrão nunca os
    // sobrescreve. `autoPreenchidos` = o que o padrão escreveu e pode reescrever ou limpar quando a
    // organização do pedido muda (trocar para uma obra de outra empresa).
    const mexidos = React.useRef(new Set<CampoPadrao>());
    const autoPreenchidos = React.useRef(new Set<CampoPadrao>());
    const [origensAplicadas, setOrigensAplicadas] = React.useState<OrigemDoPadrao[]>([]);
    // A organização do pedido não tem padrão nenhum (nem da empresa, nem o seu) — a tela diz,
    // em vez de voltar calada para o padrão do sistema (visto em 10/11 numa obra da SPE).
    const [orgSemPadrao, setOrgSemPadrao] = React.useState(false);
    // Endereço da obra escolhida: é o local de entrega quando ninguém definiu outro.
    const enderecoDaObraRef = React.useRef('');
    const mexeu = (campo: CampoPadrao) => {
        mexidos.current.add(campo);
        autoPreenchidos.current.delete(campo);
    };

    const [projectData, setProjectData] = React.useState<ProjectData | null>(null);
    const [selectedItems, setSelectedItems] = React.useState<Set<string>>(new Set());
    const [customQuantities, setCustomQuantities] = React.useState<Map<string, number>>(new Map());
    const [customPrices, setCustomPrices] = React.useState<Map<string, number>>(new Map());
    // Valor COTADO por código, para os itens do orçamento/insumos. Separado de
    // `customPrices` de propósito: `fetchBudgetPrices` e a seleção de insumo só
    // escrevem em `customPrices`, então o SINAPI nunca sobrescreve o cotado.
    // `null` = sem cotação (o fornecedor preenche no portal). Avulso carrega o
    // cotado na própria linha (`AvulsoItem.quotedUnitPrice`).
    const [quotedPrices, setQuotedPrices] = React.useState<Map<string, number | null>>(new Map());
    const [selectedMaterialsData, setSelectedMaterialsData] = React.useState<Map<string, SinapiItem>>(new Map());

    // "+ Item do orçamento" — painel com o orçamento da obra (pedido de 10/11/2026;
    // antes a tabela "Seleção de materiais da obra" ficava sempre aberta).
    const [pickerOrcamentoAberto, setPickerOrcamentoAberto] = React.useState(false);
    const [formError, setFormError] = React.useState<string | null>(null);

    // Avulso Items State
    const [avulsoItems, setAvulsoItems] = React.useState<AvulsoItem[]>([]);
    // `codigoOrcamento`: editando um item do ORÇAMENTO na lista do Novo pedido —
    // o mesmo modal, com código/descrição/unidade travados.
    const [avulsoModalConfig, setAvulsoModalConfig] = React.useState<{ open: boolean; editingIndex: number | null; initial: AvulsoItem | null; codigoOrcamento?: string | null }>({ open: false, editingIndex: null, initial: null });

    // Load initial data
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [suppliersList, projectsList, empsList, empsByProject] = await Promise.all([
                    supplierService.listSuppliers(),
                    projectService.listProjects(),
                    // `contextOrgId` null = "Todas": o service não filtra e a RLS recorta (regra #5).
                    empreendimentoService.list(contextOrgId ?? undefined).catch(() => []),
                    empreendimentoService.mapObrasToEmpreendimentos(contextOrgId).catch(() => ({})),
                ]);
                if (cancelled) return;
                setSuppliers(suppliersList);
                setEmpreendimentos(empsList.map(e => ({ id: e.id, name: e.name })));
                setEmpreendimentoByProject(empsByProject);
                // Só obras: é o default de listProjects desde a virada da
                // assinatura (regra #3 segura por padrão). Projeto de sistema
                // também já sai no service — utils/systemProjects.ts.
                setProjects(projectsList);

                // Cadastros financeiros da organização do seletor do topo. Antes
                // usava `orgs[0]`, oferecendo conta/centro de custo de OUTRA
                // empresa no pedido. `undefined` = "Todas as organizações": os
                // services não filtram e a RLS recorta. Ver hooks/useOrgContext.tsx.
                const [accs, centers, planoContasList] = await Promise.all([
                    financialRegistryService.listPaymentAccounts(contextOrgId ?? undefined),
                    costCenterService.list(contextOrgId),
                    financialRegistryService.listPlanoContas(contextOrgId ?? undefined)
                ]);
                if (cancelled) return;
                setAccounts(accs);
                setCostCenters(centers);
                setPlanoContas(planoContasList);
            } catch (error) {
                console.error("Error loading form data:", error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [contextOrgId]);

    // Organização do pedido novo = a da obra escolhida; sem obra, a do topo.
    const orgDoPedido = projects.find(p => p.id === selectedProjectId)?.organization_id ?? contextOrgId ?? null;

    React.useEffect(() => {
        if (isEditing || loading || !orgDoPedido) return;
        let cancelado = false;
        pedidoPreferenciasService.ler(orgDoPedido)
            .then(({ empresa, pessoal }) => {
                if (cancelado) return;
                const { valores, origem } = resolverPadroes(empresa, pessoal);
                // Só o que veio de preferência GRAVADA. O padrão do sistema já é o valor inicial
                // do formulário; reescrevê-lo aqui apagava o endereço que a obra acabou de pôr no
                // local de entrega (quem chegasse por último ganhava).
                const aplicar = Object.fromEntries(
                    Object.entries(camposAPreencher(valores, mexidos.current))
                        .filter(([campo]) => origem[campo as CampoPadrao] !== 'SISTEMA'),
                ) as PadroesDoPedido;

                // O que o padrão da organização anterior escreveu e o desta não define volta ao
                // valor de quem não tem padrão (centro de custo/conta de outra empresa não servem).
                for (const campo of [...autoPreenchidos.current]) {
                    if (campo in aplicar) continue;
                    if (campo === 'planoDeContasId') setPlanoDeContasId('');
                    if (campo === 'costCenterId') setCostCenterId('');
                    if (campo === 'paymentAccountId') setBankAccount('');
                    if (campo === 'prazoEntregaDias') setDeliveryDate('');
                    if (campo === 'notes') setNotes('');
                    if (campo === 'paymentTermType') setPaymentTermType(PADROES_DO_SISTEMA.paymentTermType);
                    if (campo === 'paymentDays') setPaymentDays(PADROES_DO_SISTEMA.paymentDays);
                    if (campo === 'paymentInstallments') setPaymentInstallments(PADROES_DO_SISTEMA.paymentInstallments);
                    if (campo === 'paymentMethod') setPaymentMethod(PADROES_DO_SISTEMA.paymentMethod);
                    if (campo === 'deliveryMethod') setDeliveryMethod(PADROES_DO_SISTEMA.deliveryMethod);
                    if (campo === 'deliveryLocation') setDeliveryLocation(enderecoDaObraRef.current || PADROES_DO_SISTEMA.deliveryLocation);
                    if (campo === 'notesVisibleToSupplier') setNotesVisibleToSupplier(PADROES_DO_SISTEMA.notesVisibleToSupplier);
                    autoPreenchidos.current.delete(campo);
                }
                setOrgSemPadrao(vazio(empresa) && vazio(pessoal));

                const escritos = new Set<CampoPadrao>();
                const v = aplicar as Required<PadroesDoPedido>;
                if (aplicar.planoDeContasId !== undefined) { setPlanoDeContasId(v.planoDeContasId); escritos.add('planoDeContasId'); }
                if (aplicar.costCenterId !== undefined) { setCostCenterId(v.costCenterId); escritos.add('costCenterId'); }
                if (aplicar.paymentTermType !== undefined) { setPaymentTermType(v.paymentTermType); escritos.add('paymentTermType'); }
                if (aplicar.paymentDays !== undefined) { setPaymentDays(v.paymentDays); escritos.add('paymentDays'); }
                if (aplicar.paymentInstallments !== undefined) { setPaymentInstallments(v.paymentInstallments); escritos.add('paymentInstallments'); }
                if (aplicar.paymentMethod !== undefined) { setPaymentMethod(v.paymentMethod); escritos.add('paymentMethod'); }
                if (aplicar.paymentAccountId !== undefined) {
                    // O pedido grava o NOME da conta; conta que não está na lista não é chutada.
                    const conta = accounts.find(a => a.id === v.paymentAccountId);
                    if (conta) { setBankAccount(conta.name); escritos.add('paymentAccountId'); }
                }
                if (aplicar.deliveryMethod !== undefined) { setDeliveryMethod(v.deliveryMethod); escritos.add('deliveryMethod'); }
                if (aplicar.deliveryLocation !== undefined) { setDeliveryLocation(v.deliveryLocation); escritos.add('deliveryLocation'); }
                if (aplicar.prazoEntregaDias !== undefined) { setDeliveryDate(dataPrevistaDeEntrega(v.prazoEntregaDias)); escritos.add('prazoEntregaDias'); }
                if (aplicar.notes !== undefined) { setNotes(v.notes); escritos.add('notes'); }
                if (aplicar.notesVisibleToSupplier !== undefined) { setNotesVisibleToSupplier(v.notesVisibleToSupplier); escritos.add('notesVisibleToSupplier'); }

                escritos.forEach(c => autoPreenchidos.current.add(c));
                const origens = new Set<OrigemDoPadrao>();
                escritos.forEach(c => { const o = origem[c]; if (o) origens.add(o); });
                setOrigensAplicadas([...origens]);
            })
            // Sem preferência legível o pedido nasce como sempre nasceu — não trava o formulário.
            .catch(e => console.warn('[SupplyChainOrderForm] preferências do pedido:', e));
        return () => { cancelado = true; };
    }, [isEditing, loading, orgDoPedido, accounts]);

    /**
     * Itens do pedido como vieram do banco, ainda sem classificar.
     *
     * A classificação (item do orçamento × avulso) precisa do ORÇAMENTO, e ele
     * é carregado noutro efeito, disparado por `selectedProjectId` — que este
     * mesmo carregamento acaba de definir. Guardar os itens crus é o que
     * permite classificar quando os dois lados estiverem prontos, em vez de
     * classificar cedo e errado.
     */
    const [itensCarregados, setItensCarregados] = React.useState<PedidoItemGravado[] | null>(null);

    // Itens gravados → estado do formulário. A separação orçamento × avulso
    // fica para o efeito de classificação (depende do orçamento).
    const aplicarItensGravados = (items: PedidoItemGravado[]) => {
        setItensCarregados(items);
        // Pre-fill quantities and prices from the order
        const quantities = new Map<string, number>();
        const prices = new Map<string, number>();
        const quoted = new Map<string, number | null>();
        items.forEach((i) => {
            if (i.quantity !== undefined) quantities.set(i.code, i.quantity);
            if (i.unitPrice !== undefined) prices.set(i.code, i.unitPrice);
            if (i.quotedUnitPrice !== undefined) quoted.set(i.code, i.quotedUnitPrice);
        });
        setCustomQuantities(prev => new Map([...prev, ...quantities]));
        setQuotedPrices(prev => new Map([...prev, ...quoted]));
        setCustomPrices(prev => {
            const next = new Map(prev);
            prices.forEach((v, k) => {
                if (v > 0 || !next.has(k)) {
                    next.set(k, v);
                }
            });
            return next;
        });
    };

    // Load existing order data when editing
    React.useEffect(() => {
        if (!editingOrderId) return;
        let cancelled = false;
        (async () => {
            try {
                const allOrders = await orderService.listOrders();
                if (cancelled) return;
                const existingOrder = allOrders.find(o => o.id === editingOrderId);
                if (existingOrder) {
                    setOrderNumber(existingOrder.number ?? null);
                    setSelectedSupplierId(existingOrder.supplierId || '');
                    setSelectedProjectId(existingOrder.projectId || '');
                    setObraSalva(existingOrder.projectId || '');
                    setDeliveryDate(existingOrder.deliveryDate || '');
                    setPaymentMethod(existingOrder.paymentMethod || 'Boleto');
                    setPaymentTermType(existingOrder.paymentTermType || 'Vista');
                    setPaymentDays(existingOrder.paymentDays || 30);
                    setPaymentInstallments(existingOrder.paymentInstallments || 1);
                    setNotes(existingOrder.notes || '');
                    setNotesVisibleToSupplier(existingOrder.notesVisibleToSupplier ?? true);
                    setBankAccount(existingOrder.bankAccount || '');
                    setCostCenterId(existingOrder.costCenterId || '');
                    setPlanoDeContasId(existingOrder.planoDeContasId || '');
                    // A separação orçamento × avulso NÃO acontece aqui: ela
                    // depende do ORÇAMENTO, que é carregado noutro efeito e
                    // chega depois deste. Guardamos os itens crus e a
                    // classificação roda quando os dois estiverem prontos.
                    aplicarItensGravados(existingOrder.items);
                    setDeliveryMethod(existingOrder.deliveryMethod || FORMA_ENTREGA_PADRAO);
                    setDeliveryLocation(existingOrder.deliveryLocation || 'Canteiro de Obras');
                    setEditingVersion(existingOrder.version);
                }
            } catch (error) {
                console.error('Error loading order for editing:', error);
            }
        })();
        return () => { cancelled = true; };
    }, [editingOrderId]);

    // Trava do "Regerar número" — regra no banco
    // (fn_purchase_order_number_lock_reason: só Rascunho libera). Falha na
    // consulta trava por padrão: na dúvida, bloqueia.
    React.useEffect(() => {
        if (!editingOrderId) { setNumberLockReason(null); return; }
        let cancelled = false;
        getOrderNumberLockReason(editingOrderId)
            .then(r => { if (!cancelled) setNumberLockReason(r); })
            .catch(() => { if (!cancelled) setNumberLockReason('Não foi possível verificar se o número pode ser alterado.'); });
        return () => { cancelled = true; };
    }, [editingOrderId]);

    /**
     * Gera e grava um número novo pela máscara vigente. Usado pelo botão
     * "Regerar" e pelo salvar quando a OBRA mudou — a máscara padrão do pedido
     * carrega o código do empreendimento (`[PREFIX EMPREENDIMENTO FORNECEDOR]`),
     * que é resolvido a partir da obra (`documentNumbering/resolvers.ts`), então
     * mudar de obra sem regerar deixa o número apontando para o lugar errado.
     */
    const gerarNumeroNovo = React.useCallback(async (orderId: string, obraId: string) => {
        const project = obraId ? await projectService.loadProject(obraId) : null;
        const organizationId = (project as { organization_id?: string } | null)?.organization_id || contextOrgId;
        if (!organizationId) throw new Error('Não foi possível identificar a organização deste pedido.');
        return regenerateOrderNumber(orderId, organizationId, {
            projectId: obraId || undefined,
            supplierId: selectedSupplierId || undefined,
            costCenterId: costCenterId || undefined,
        });
    }, [contextOrgId, selectedSupplierId, costCenterId]);

    const handleRegenerateNumber = async () => {
        if (!editingOrderId) return;
        if (!await confirm({
            title: 'Regerar o número deste pedido?',
            message: `O número atual (${orderNumber ?? '—'}) será substituído por um novo, gerado pela máscara vigente em Configurações do Sistema › Nomenclatura. O anterior fica registrado no histórico.\n\nA troca é gravada na hora — não depende de "Salvar".`,
            variant: 'warning',
            confirmLabel: 'Regerar',
        })) return;

        setIsRegeneratingNumber(true);
        try {
            const novo = await gerarNumeroNovo(editingOrderId, selectedProjectId);
            setOrderNumber(novo);
            setObraSalva(selectedProjectId);
        } catch (e: unknown) {
            console.error('[SupplyChainOrderForm] Erro ao regerar número:', e);
            setNumberLockReason(e instanceof Error ? e.message : 'Erro ao regerar o número.');
        } finally {
            setIsRegeneratingNumber(false);
        }
    };

    const [editingVersion, setEditingVersion] = React.useState<number | undefined>(undefined);

    // Embutido: o detalhe gravou itens por conta própria (versão nova que não
    // veio deste formulário) → reler os itens e assumir a versão gravada.
    React.useEffect(() => {
        if (!embedded || versaoGravada == null || !itensGravados) return;
        if (editingVersion === undefined || versaoGravada === editingVersion) return;
        aplicarItensGravados(itensGravados);
        setEditingVersion(versaoGravada);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [versaoGravada]);

    // Embutido: "+ Item avulso" e "+ Item do orçamento" gravam direto no pedido,
    // como editar e excluir na tabela "Itens do pedido" — a linha aparece lá na
    // hora. Lê o pedido do servidor para não regravar itens com a lista deste
    // formulário.
    const acrescentarAoPedido = async (novos: { code: string; description: string; unit: string; quantity: number; unitPrice: number; quotedUnitPrice?: number | null; avulso?: true }[]): Promise<string | null> => {
        if (!editingOrderId) return 'Pedido não encontrado.';
        try {
            const atual = await orderService.getOrderById(editingOrderId);
            if (!atual) return 'Não foi possível ler o pedido. Tente de novo.';
            const itens = novos.map(item => ({
                code: item.code,
                description: item.description,
                unit: item.unit,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: round2(item.quantity * item.unitPrice),
                quotedUnitPrice: item.quotedUnitPrice ?? null,
                quotedTotal: item.quotedUnitPrice == null ? null : round2(item.quantity * item.quotedUnitPrice),
                ...(item.avulso ? { avulso: true as const } : {}),
            }));
            await orderService.updateOrder(editingOrderId, { items: [...atual.items, ...itens] }, atual.version);
            // "Qtd comprada" do painel conta este pedido também.
            if (selectedProjectId) {
                quantidadesCompradasNaObra(selectedProjectId).then(setPurchasedQuantities).catch(() => { /* fica a anterior */ });
            }
            onSave();
            return null;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[SupplyChainOrderForm] Erro ao incluir item no pedido:', err);
            return msg.startsWith('CONFLICT') ? msg.replace(/^CONFLICT:\s*/, '') : 'Erro ao incluir o item no pedido.';
        }
    };

    const [purchasedQuantities, setPurchasedQuantities] = React.useState<Map<string, number>>(new Map());

    // Helper to fetch and update prices for a budget
    const fetchBudgetPrices = React.useCallback(async (budget: BudgetEntry[], settings: { state?: string; socialChargesMode?: string } | null | undefined) => {
        const allCodes = new Set<string>();
        budget.forEach(item => {
            if (item.sinapiItem) {
                allCodes.add(item.sinapiItem.code);
                item.sinapiItem.composition?.forEach(comp => {
                    allCodes.add(comp.code);
                });
            }
        });
        const codes = Array.from(allCodes);
        if (codes.length === 0) return;

        const state = settings?.state || 'SP';
        const chargeType = settings?.socialChargesMode || 'Sem Desoneração';

        try {
            const items = await sinapiService.getItemsByCodes(codes, state, chargeType);
            const priceMap = new Map<string, number>();
            items.forEach(item => {
                if (item.price !== undefined && item.price !== null) {
                    priceMap.set(item.code, item.price);
                }
            });
            setCustomPrices(prev => {
                const next = new Map(prev);
                priceMap.forEach((v, k) => {
                    // Update only if current is 0 or doesn't exist
                    if (v > 0 || !next.has(k)) {
                        next.set(k, v);
                    }
                });
                return next;
            });
        } catch (err) {
            console.error("Error fetching budget prices:", err);
        }
    }, []);

    // Load project details and existing orders when selected
    React.useEffect(() => {
        if (!selectedProjectId) {
            setProjectData(null);
            setPurchasedQuantities(new Map());
            return;
        }

        let cancelled = false;

        // Load Project Data
        (async () => {
            try {
                const data = await projectService.loadProject(selectedProjectId);
                if (cancelled) return;
                let finalProjectData = data;

                // O orçamento raramente está em `project.budget`: numa OBRA ele
                // vive no projeto FILHO que aponta para ela, e num PLANEJAMENTO
                // no snapshot congelado. `services/budgetResolver.ts` é a
                // resolução canônica disso — e o próprio cabeçalho dele diz que
                // quem precisa dos itens deve passar por ali em vez de ler
                // `project.budget` cru. O formulário de COTAÇÃO já obedece;
                // este aqui tinha ficado para trás.
                //
                // ⚠️ O que havia antes procurava o vínculo na direção errada:
                // lia `obra.settings.linkedProjectId`, mas `linkedProjectId`
                // aponta sempre do FILHO para o PAI (PLANEJAMENTO → ORCAMENTO →
                // OBRA), então na obra ele é nulo. O fallback nunca disparava.
                // Medido no pedido PC-008-008-0001: a obra "Igreja Divino
                // Espirito Santo" tem `budget` vazio e o ORÇAMENTO que aponta
                // para ela tem 37 linhas — e a tela dizia "O orçamento desta
                // obra está vazio", além de não deixar incluir item nenhum do
                // orçamento.
                try {
                    const resolvido = await resolveProjectBudget(data, { searchChildren: true });
                    if (cancelled) return;
                    finalProjectData = { ...data, budget: resolvido.budget };
                } catch (err) {
                    console.error('Erro ao resolver o orçamento da obra:', err);
                }

                if (cancelled) return;
                setProjectData(finalProjectData);

                // Fetch updated prices
                if (finalProjectData?.budget) {
                    fetchBudgetPrices(finalProjectData.budget, finalProjectData.settings);
                }

                // Auto-fill delivery location
                if (!editingOrderId && finalProjectData.settings) {
                    const { street, number, neighborhood, city, state } = finalProjectData.settings;
                    const addressParts = [];
                    if (street) addressParts.push(street);
                    if (number) addressParts.push(number);
                    if (neighborhood) addressParts.push(neighborhood);

                    let formattedAddress = addressParts.join(', ');
                    if (city || state) {
                        formattedAddress += ` - ${city || ''}${city && state ? '/' : ''}${state || ''}`;
                    }

                    // O endereço só entra se ninguém definiu o local: nem o usuário à mão,
                    // nem as Preferências (10/11: o endereço apagava o local do padrão).
                    if (formattedAddress.trim()) {
                        enderecoDaObraRef.current = formattedAddress;
                        if (!mexidos.current.has('deliveryLocation') && !autoPreenchidos.current.has('deliveryLocation')) {
                            setDeliveryLocation(formattedAddress);
                        }
                    }
                }
            } catch (err) {
                console.error("Error loading project data:", err);
            }
        })();

        // Load Existing Orders
        (async () => {
            try {
                const quantities = await quantidadesCompradasNaObra(selectedProjectId);
                if (cancelled) return;
                setPurchasedQuantities(quantities);
            } catch (err) {
                console.error("Error loading orders:", err);
            }
        })();

        return () => { cancelled = true; };
    }, [selectedProjectId, editingOrderId, fetchBudgetPrices]);

    /**
     * Classifica os itens do pedido: do ORÇAMENTO ou AVULSO.
     *
     * ── O que estava errado ───────────────────────────────────────────────
     *
     * A classificação vinha da marca `avulso` gravada no item. Só que o único
     * lugar que grava essa marca é ESTE formulário: `createOrderFromNfe`,
     * `quotationService` e as duas criações de `procurementService` gravam item
     * sem marca nenhuma. Um pedido gerado de NF-e, por exemplo, chega com
     * `code` = NCM (`84145990`), que nunca vai existir no orçamento — e era
     * tratado como item de orçamento.
     *
     * O efeito não era só de exibição. O item ia para `selectedItems`, e
     * `orderItems` recompõe a lista filtrando o ORÇAMENTO por essa seleção:
     * código que não está no orçamento não volta. Resultado medido em
     * produção (pedido PC-008-008-0004, 3 itens na tela): "Salvar alterações"
     * respondia "Nenhum item válido para salvar" e não gravava nada — o pedido
     * ficava impossível de editar, inclusive para mudar só a data de entrega.
     * (Não havia perda de dado: a guarda `orderItems.length === 0` aborta antes
     * de escrever. Foi ela que evitou o pior.)
     *
     * ── A regra agora ─────────────────────────────────────────────────────
     *
     * Item é do orçamento se o código dele estiver entre os itens de TOPO do
     * orçamento da obra — que são exatamente os que `orderItems` sabe
     * reconstruir. Todo o resto é avulso: aparece em "Itens avulsos",
     * editável, e sobrevive ao salvar.
     *
     * Isso conserta o dado que já existe, na leitura, sem migration — e cobre
     * um caso maior que o do NCM: insumo de composição também caía aqui,
     * porque `selectedMaterialsData` só é preenchido pelo gesto do usuário no
     * modal e NUNCA é restaurado ao abrir um pedido. Esses insumos eram
     * descartados no salvar; agora são preservados como avulsos.
     *
     * A marca `avulso: true` continua sendo respeitada quando existe — ela só
     * deixou de ser a única fonte.
     */
    React.useEffect(() => {
        if (!itensCarregados || !projectData) return;
        // Trocar de obra troca o orçamento de referência, e o `projectData` da
        // obra ANTERIOR ainda está em mãos no render da troca. Classificar com
        // ele jogaria os itens contra o orçamento errado e zeraria
        // `itensCarregados` antes de o orçamento novo chegar.
        if (projectData.id && projectData.id !== selectedProjectId) return;

        const codigosDoOrcamento = new Set(
            (projectData.budget ?? [])
                .map((b: BudgetEntry) => b.sinapiItem?.code)
                .filter((c): c is string => !!c)
        );

        const doOrcamento: string[] = [];
        const avulsos: AvulsoItem[] = [];
        itensCarregados.forEach(item => {
            const marcadoAvulso = item.avulso === true;
            if (!marcadoAvulso && codigosDoOrcamento.has(item.code)) {
                doOrcamento.push(item.code);
            } else {
                avulsos.push({
                    code: item.code,
                    description: item.description,
                    unit: item.unit,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    // Preserva o total já gravado — ver o comentário em AvulsoItem.
                    total: item.total,
                    quotedUnitPrice: item.quotedUnitPrice ?? null,
                    quotedTotal: item.quotedTotal ?? null,
                });
            }
        });

        setSelectedItems(new Set(doOrcamento));
        setAvulsoItems(avulsos);
        // Classificado: zerar evita reclassificar por cima de edição do usuário
        // quando o orçamento for recarregado.
        setItensCarregados(null);
    }, [itensCarregados, projectData, selectedProjectId]);

    const orderItems = React.useMemo(() => {
        // 1. Get items from budget
        const budgetItems = projectData?.budget.filter(item =>
            item.sinapiItem && selectedItems.has(item.sinapiItem.code)
        ).map(item => {
            const code = item.sinapiItem!.code;
            const qty = Number(customQuantities.get(code) ?? item.quantity);
            const price = customPrices.get(code) ?? Number(item.sinapiItem!.price || 0);
            const cotado = quotedPrices.get(code) ?? null;
            return {
                code: code,
                description: item.sinapiItem!.description,
                unit: item.sinapiItem!.unit,
                quantity: qty,
                unitPrice: price,
                // Dinheiro em duas casas: `qty * price` cru gravava coisas como
                // 4404.003465 num campo de valor.
                total: round2(qty * price),
                quotedUnitPrice: cotado,
                quotedTotal: cotado === null ? null : round2(qty * cotado),
            };
        }) || [];

        // 2. Get items from materials data (compositions)
        const compositionItems = Array.from(selectedMaterialsData.values())
            .filter((insumo) => selectedItems.has(insumo.code) && !budgetItems.some((bi) => bi.code === insumo.code))
            .map((insumo) => {
                const code = insumo.code;
                const qty = Number(customQuantities.get(code) || 0);
                const price = customPrices.get(code) ?? Number(insumo.price || 0);
                const cotado = quotedPrices.get(code) ?? null;
                return {
                    code: code,
                    description: insumo.description,
                    unit: insumo.unit,
                    quantity: qty,
                    unitPrice: price,
                    total: round2(qty * price),
                    quotedUnitPrice: cotado,
                    quotedTotal: cotado === null ? null : round2(qty * cotado),
                };
            });

        // 3. Get avulso items
        const avulsoOrderItems = avulsoItems.map(item => ({
            code: item.code,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            // Item intocado mantém o total que já estava gravado; item novo ou
            // editado recalcula — e em duas casas, não no produto cru.
            total: item.total ?? round2(item.quantity * item.unitPrice),
            quotedUnitPrice: item.quotedUnitPrice ?? null,
            quotedTotal: item.quotedTotal ?? (item.quotedUnitPrice == null ? null : round2(item.quantity * item.quotedUnitPrice)),
            avulso: true as const,
        }));

        return [...budgetItems, ...compositionItems, ...avulsoOrderItems];
    }, [projectData, selectedItems, customQuantities, selectedMaterialsData, customPrices, avulsoItems]);

    const totalOrderValue = React.useMemo(() => {
        // Cotado quando houver, senão referência — utils/pedidoItemValor.
        return totalEfetivoDoPedido(orderItems);
    }, [orderItems]);
    const totalReferencia = React.useMemo(() => totalReferenciaDoPedido(orderItems), [orderItems]);
    const algumItemCotado = React.useMemo(() => orderItems.some(temCotacao), [orderItems]);

    /**
     * Itens escolhidos no painel "+ Item do orçamento" → estado do pedido. Guarda
     * o que a antiga seleção fazia: insumo de composição entra por
     * `selectedMaterialsData` (é de lá que `orderItems` o monta) e a data de
     * entrega vazia é sugerida pelo cronograma do item do orçamento.
     */
    const incluirDoOrcamento = (itens: ItemDoOrcamentoEscolhido[]) => {
        const sel = new Set(selectedItems);
        const qtds = new Map(customQuantities);
        const precos = new Map(customPrices);
        const dados = new Map(selectedMaterialsData);
        let dataSugerida: string | undefined;
        itens.forEach(it => {
            sel.add(it.code);
            qtds.set(it.code, it.quantity);
            precos.set(it.code, it.unitPrice);
            if (it.compositionCode) {
                dados.set(it.code, { code: it.code, description: it.description, unit: it.unit, price: it.unitPrice } as unknown as SinapiItem);
            }
            if (!dataSugerida) {
                const agenda = projectData?.settings?.schedule?.itemSchedules?.find(
                    (s: { id?: string; startDate?: string }) => s.id === it.budgetItemId
                );
                if (agenda?.startDate) dataSugerida = agenda.startDate;
            }
        });
        setSelectedItems(sel);
        setCustomQuantities(qtds);
        setCustomPrices(precos);
        setSelectedMaterialsData(dados);
        if (dataSugerida && !deliveryDate) setDeliveryDate(dataSugerida);
    };

    /** Item do orçamento editado pelo modal (Novo pedido): quantidade, preço e cotação. */
    const editarDoOrcamento = (code: string, item: AvulsoItem) => {
        setCustomQuantities(prev => new Map(prev).set(code, Math.max(0, item.quantity)));
        setCustomPrices(prev => new Map(prev).set(code, Math.max(0, item.unitPrice)));
        setQuotedPrices(prev => new Map(prev).set(code, item.quotedUnitPrice == null ? null : Math.max(0, item.quotedUnitPrice)));
    };

    const removerDoOrcamento = (code: string) => {
        setSelectedItems(prev => { const next = new Set(prev); next.delete(code); return next; });
        setCustomQuantities(prev => { const next = new Map(prev); next.delete(code); return next; });
        setQuotedPrices(prev => { const next = new Map(prev); next.delete(code); return next; });
    };

    const handleSaveOrder = async () => {
        setFormError(null);
        if (!selectedSupplierId || !selectedProjectId) {
            setFormError("Por favor, selecione um fornecedor e uma obra.");
            return;
        }

        if (selectedItems.size === 0 && avulsoItems.length === 0) {
            setFormError("Inclua pelo menos um item — \"+ Item do orçamento\" ou \"+ Item avulso\".");
            return;
        }

        if (!deliveryDate) {
            setFormError("Por favor, selecione uma data de entrega.");
            return;
        }

        setLoading(true);
        try {
            // Enquanto a reconciliação com o orçamento da obra não terminou
            // (`itensCarregados` cheio), quem vale são os itens CRUS: `orderItems`
            // ainda está montado contra o orçamento anterior — ou contra nenhum,
            // porque o da obra nova só chega depois — e salvaria o pedido sem as
            // linhas que vieram do orçamento. Salvar cru não perde nada: o pedido
            // segue com os itens que tinha, na obra nova.
            const itensParaSalvar = itensCarregados
                ? itensCarregados.map(i => ({ ...i, total: i.total ?? round2(i.quantity * i.unitPrice) }))
                : orderItems;
            if (itensParaSalvar.length === 0) {
                setFormError("Nenhum item válido para salvar.");
                setLoading(false);
                return;
            }

            // costCenter/chartOfAccounts (texto) são derivados do id selecionado —
            // mantém telas legadas (FinancialOrderDetails, financialService)
            // funcionando enquanto cost_center_id/plano_de_contas_id (FK) são a
            // fonte de verdade daqui pra frente.
            const costCenterName = costCenters.find(c => c.id === costCenterId)?.name || '';
            const planoDeContasName = planoContas.find(c => c.id === planoDeContasId)?.name || '';

            if (isEditing && editingOrderId) {
                // A linha gravada volta com a versão nova. Embutido no detalhe,
                // este formulário NÃO é remontado depois de salvar — sem
                // reatualizar `editingVersion` o SEGUNDO "Salvar alterações"
                // caía em CONFLICT (visto em 2026-09-17 ao salvar a flag das
                // observações duas vezes seguidas).
                const salvo = await orderService.updateOrder(editingOrderId, {
                    projectId: selectedProjectId,
                    supplierId: selectedSupplierId,
                    deliveryDate: deliveryDate,
                    paymentMethod: paymentMethod,
                    paymentTermType: paymentTermType,
                    paymentDays: paymentDays,
                    paymentInstallments: paymentInstallments,
                    notes: notes,
                    notesVisibleToSupplier,
                    bankAccount: bankAccount,
                    costCenterId: costCenterId || undefined,
                    costCenter: costCenterName,
                    planoDeContasId: planoDeContasId || undefined,
                    chartOfAccounts: planoDeContasName,
                    deliveryMethod: deliveryMethod,
                    deliveryLocation: deliveryLocation,
                    items: itensParaSalvar,
                }, editingVersion);
                if (salvo?.version !== undefined && salvo.version !== null) setEditingVersion(salvo.version);

                // O número carrega o empreendimento, que vem da OBRA: trocar a
                // obra e deixar o número velho aponta o pedido para o
                // empreendimento errado em toda tela que lê o número. Fora de
                // Rascunho o número está travado de propósito (já foi para o
                // fornecedor) — aí a tela avisa, ao lado do campo, que ele
                // continua o antigo. Falhar aqui não desfaz o save.
                const obraMudouNoSave = obraSalva !== selectedProjectId;
                setObraSalva(selectedProjectId);
                if (obraMudouNoSave && !numberLockReason) {
                    try {
                        setOrderNumber(await gerarNumeroNovo(editingOrderId, selectedProjectId));
                    } catch (e: unknown) {
                        console.error('[SupplyChainOrderForm] Erro ao regerar o número após trocar a obra:', e);
                        setFormError(`O pedido foi salvo, mas o número não pôde ser regerado para a obra nova: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
                    }
                }
            } else {
                await orderService.createOrder({
                    projectId: selectedProjectId,
                    supplierId: selectedSupplierId,
                    deliveryDate: deliveryDate,
                    paymentMethod: paymentMethod,
                    paymentTermType: paymentTermType,
                    paymentDays: paymentDays,
                    paymentInstallments: paymentInstallments,
                    status: 'Rascunho',
                    notes: notes,
                    notesVisibleToSupplier,
                    bankAccount: bankAccount,
                    costCenterId: costCenterId || undefined,
                    costCenter: costCenterName,
                    planoDeContasId: planoDeContasId || undefined,
                    chartOfAccounts: planoDeContasName,
                    deliveryMethod: deliveryMethod,
                    deliveryLocation: deliveryLocation,
                    items: itensParaSalvar,
                    projectName: projectData?.name
                });
            }
            onSave();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error("Erro ao salvar pedido:", error);
            if (error.message?.startsWith('CONFLICT')) {
                setFormError("Pedido foi modificado por outro usuário. Feche o formulário, recarregue e tente novamente.");
            } else {
                const errorMessage = error.message || "Erro desconhecido";
                setFormError(`Erro ao salvar o pedido: ${errorMessage}`);
            }
        } finally {
            setLoading(false);
        }
    };

    // Quais painéis aparecem. Embutido no detalhe, quem manda é a aba do
    // detalhe (prop `painel`); na criação, aparecem os três — fluxo único, um
    // formulário só de cima a baixo.
    const mostrarDadosGerais = !embedded || painel === 'dados';

    // Obra escolhida (ou carregada do pedido) puxa o empreendimento dela para o
    // seletor. Roda também quando o mapa chega depois do pedido.
    React.useEffect(() => {
        if (!selectedProjectId) return;
        const emp = empreendimentoByProject[selectedProjectId];
        if (emp) setSelectedEmpreendimentoId(emp.id);
    }, [selectedProjectId, empreendimentoByProject]);

    // Obras oferecidas: as do empreendimento escolhido, ou todas.
    const projectsDoEmpreendimento = React.useMemo(() => {
        const filtradas = obrasDoEmpreendimento(projects, selectedEmpreendimentoId, empreendimentoByProject);
        // A obra atual fica na lista mesmo fora do empreendimento (vínculo
        // desfeito depois do pedido) — senão o <select> mostraria vazio.
        if (selectedProjectId && !filtradas.some(p => p.id === selectedProjectId)) {
            const atual = projects.find(p => p.id === selectedProjectId);
            if (atual) return [atual, ...filtradas];
        }
        return filtradas;
    }, [projects, selectedEmpreendimentoId, empreendimentoByProject, selectedProjectId]);

    // Empreendimento sem obra vinculada é beco sem saída neste seletor: escolher
    // um deles tiraria a obra do pedido sem oferecer substituta. Ficam listados
    // (esconder levantaria "cadê o empreendimento X?"), porém desabilitados.
    const empreendimentosOfertados = React.useMemo(() => {
        const comObra = empreendimentosComObra(projects, empreendimentoByProject);
        return empreendimentos.map(e => ({ ...e, temObra: comObra.has(e.id) }));
    }, [empreendimentos, projects, empreendimentoByProject]);

    /**
     * Trocar a obra de um pedido que já existe troca o ORÇAMENTO de referência.
     * `orderItems` só monta item de orçamento que esteja no `projectData` atual,
     * então o que veio do orçamento da obra anterior sumiria no salvar, calado.
     * Devolver os itens para `itensCarregados` faz o efeito de classificação
     * re-separá-los contra o orçamento NOVO: o que existir lá continua item de
     * orçamento, o resto sobrevive como avulso (mesmo tratamento que o insumo de
     * composição já recebia).
     */
    const trocarObra = (novaObraId: string) => {
        if (novaObraId === selectedProjectId) return;
        // `itensCarregados` não-nulo = a classificação da abertura ainda não
        // rodou; ela já vai acontecer contra o orçamento novo.
        if (isEditing && selectedProjectId && itensCarregados === null) setItensCarregados(orderItems);
        setSelectedProjectId(novaObraId);
    };

    const handleEmpreendimentoChange = (empId: string) => {
        setSelectedEmpreendimentoId(empId);
        // O empreendimento não é campo do pedido — quem grava é a OBRA. Trocar de
        // empreendimento precisa RESOLVER a obra (a única do empreendimento entra
        // sozinha); só quando há várias é que a escolha sobra para o usuário, e aí
        // a tela diz isso ao lado do botão em vez de só desbotá-lo.
        trocarObra(obraAoTrocarEmpreendimento(
            selectedProjectId, empId, projects, empreendimentoByProject,
        ));
    };
    // Por que o "Salvar alterações" está desligado. `null` = pode salvar. Botão
    // desbotado sem motivo visível foi o que fez a troca de empreendimento
    // parecer "não aceita" em 22/09/2026 — o motivo aparece ao lado do botão.
    // O número do pedido é derivado da obra: enquanto a obra na tela não for a
    // gravada, o número que está no campo é o da obra anterior.
    const obraMudou = isEditing && !!obraSalva && !!selectedProjectId && selectedProjectId !== obraSalva;

    const motivoSalvar = motivoSalvarBloqueado({
        fornecedorId: selectedSupplierId,
        obraId: selectedProjectId,
        itensSelecionados: selectedItems.size,
        itensAvulsos: avulsoItems.length,
    });

    const botaoSalvarEmbutido = (
        <>
            {motivoSalvar && (
                <span className="text-xs text-amber-600">{motivoSalvar}</span>
            )}
            <button
                onClick={handleSaveOrder}
                disabled={!!motivoSalvar}
                title={motivoSalvar ?? undefined}
                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
            >
                <Save className="w-[15px] h-[15px]" />
                Salvar alterações
            </button>
        </>
    );

    const mostrarItens = !embedded || painel === 'itens';
    const mostrarFinanceiro = !embedded || painel === 'financeiro';

    // ── §3 — colunas e busca das duas tabelas desta aba ──
    // A busca é recortada pelo pedido (ou por "novo", na criação): filtro deixado
    // ligado num pedido não pode esvaziar a tabela de outro.
    const escopoBusca = editingOrderId ?? 'novo';
    const colunasAvulsos = useTableColumns(AVULSO_COLUMNS, 'pedidoAvulsosColumns');
    // §6.1 — larguras arrastáveis, persistidas por tabela.
    const larguraAvulsos = useResizableColumns(DEFAULT_AVULSO_COL_WIDTHS, 'pedidoAvulsosColWidths');

    // Soma exata das colunas visíveis — nunca w-full (§6.1).
    const chavesAvulsos = colunasAvulsos.orderedVisibleColumns.filter(k => k !== 'actions');
    const totalLarguraAvulsos = chavesAvulsos.reduce((s, k) => s + larguraAvulsos.getWidth(k), 0)
        + (colunasAvulsos.visibleColumns.includes('actions') ? larguraAvulsos.getWidth('actions') : 0);
    const [buscaAvulsos, setBuscaAvulsos] = usePersistedScopedSearch('pedidoAvulsos:busca', escopoBusca);

    const termoAvulsos = buscaAvulsos.trim().toLowerCase();
    // Novo pedido: uma lista só — itens do orçamento (estado da seleção) e
    // avulsos. `idx` endereça o avulso; `null` = item do orçamento, endereçado
    // pelo código.
    const todasAsLinhas: { item: AvulsoItem; idx: number | null; origem: string }[] = [
        ...orderItems
            .filter(i => !('avulso' in i))
            .map(i => ({
                item: { code: i.code, description: i.description, unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice, quotedUnitPrice: i.quotedUnitPrice ?? null },
                idx: null,
                origem: 'Orçamento',
            })),
        ...avulsoItems.map((item, idx) => ({ item, idx: idx as number | null, origem: 'Avulso' })),
    ];
    const codigosNoPedido = React.useMemo(() => new Set(orderItems.map(i => i.code)), [orderItems]);
    const linhasAvulsos = ordenarLinhas(
        todasAsLinhas
            .filter(({ item }) => !termoAvulsos
                || (item.code || '').toLowerCase().includes(termoAvulsos)
                || (item.description || '').toLowerCase().includes(termoAvulsos)),
        colunasAvulsos.sortColumn,
        colunasAvulsos.sortDirection,
        ({ item, origem }, coluna) => {
            switch (coluna) {
                case 'code': return item.code ?? '';
                case 'origem': return origem;
                case 'description': return item.description ?? '';
                case 'unit': return item.unit ?? '';
                case 'quantity': return item.quantity ?? 0;
                case 'unitPrice': return item.unitPrice ?? 0;
                case 'total': return (item.quantity ?? 0) * (item.unitPrice ?? 0);
                case 'quotedUnitPrice': return item.quotedUnitPrice ?? 0;
                case 'quotedTotal': return item.quotedUnitPrice == null ? 0 : (item.quantity ?? 0) * item.quotedUnitPrice;
                default: return '';
            }
        },
    );

    // §7 — tipografia por tipo de dado; `font-medium` só em valor financeiro.
    const renderCelulaAvulso = (key: string, item: AvulsoItem): React.ReactNode => {
        switch (key) {
            case 'code': return <span className="text-sm font-normal text-gray-600">{item.code || '—'}</span>;
            case 'description': return <span className="text-sm font-normal text-gray-700">{item.description}</span>;
            case 'unit': return <span className="text-sm font-normal text-gray-600">{item.unit}</span>;
            case 'quantity': return <span className="text-sm font-normal text-gray-600">{item.quantity}</span>;
            case 'unitPrice': return <span className="text-sm font-medium text-gray-800">{formatCurrency(item.unitPrice)}</span>;
            case 'total': return <span className="text-sm font-medium text-gray-800">{formatCurrency(item.quantity * item.unitPrice)}</span>;
            // Sem cotação: traço apagado — a coluna existe para o fornecedor preencher.
            case 'quotedUnitPrice': return item.quotedUnitPrice == null
                ? <span className="text-sm font-normal text-gray-300">—</span>
                : <span className="text-sm font-medium text-gray-800">{formatCurrency(item.quotedUnitPrice)}</span>;
            case 'quotedTotal': return item.quotedUnitPrice == null
                ? <span className="text-sm font-normal text-gray-300">—</span>
                : <span className="text-sm font-medium text-gray-800">{formatCurrency(round2(item.quantity * item.quotedUnitPrice))}</span>;
            default: return null;
        }
    };

    if (loading) {
        // §11 — na tela de edição o spinner é conteúdo de página; na criação
        // (sobreposição) ele preenche o card.
        return embedded ? (
            <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-500">Carregando...</p>
            </div>
        ) : (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className={
            embedded
                ? ''
                : 'absolute inset-0 z-[110] flex items-center justify-center p-2 md:p-8 lg:p-12 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300'
        }>
            <div className={
                embedded
                    ? 'space-y-6'
                    : 'relative bg-white rounded-2xl md:rounded-[3rem] shadow-2xl w-full h-full flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden border border-white/20'
            }>

                {/* Embutido: o cabeçalho é do detalhe; aqui fica só a ação de gravar —
                    desenhada no cabeçalho, ao lado de "Negociar", quando o detalhe
                    entrega o ponto (`barraDeAcoes`). */}
                {embedded ? (
                    barraDeAcoes ? createPortal(botaoSalvarEmbutido, barraDeAcoes) : (
                        <div className="flex items-center justify-end gap-3">
                            {botaoSalvarEmbutido}
                        </div>
                    )
                ) : (
                    <div className="bg-gray-50/50 border-b border-gray-100 flex items-center justify-between shrink-0 px-4 py-5 md:px-8 md:py-7 lg:px-12 lg:py-10">
                        <div className="flex items-center gap-6">
                            <button
                                onClick={onBack}
                                className="p-4 bg-white text-gray-400 hover:text-blue-600 border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all group"
                            >
                                <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                            </button>
                            <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl shadow-sm shadow-blue-100/50 hidden md:block">
                                <Package className="w-8 h-8" />
                            </div>
                            <div>
                                <h1 className="text-xl md:text-3xl font-black text-gray-900 tracking-tight">
                                    Novo Pedido de Compra
                                </h1>
                                <p className="text-gray-400 text-xs font-black uppercase tracking-[0.3em] mt-1.5 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                                    Gestão de Suprimentos • Criação de Pedido
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {motivoSalvar && (
                                <span className="text-xs text-amber-600 text-right max-w-[16rem]">{motivoSalvar}</span>
                            )}
                            <Button
                                onClick={handleSaveOrder}
                                disabled={!!motivoSalvar}
                                title={motivoSalvar ?? undefined}
                                size="lg"
                                className="gap-2 shadow-xl shadow-blue-900/20"
                            >
                                <Save className="w-4 h-4" />
                                <span>Salvar Pedido</span>
                            </Button>
                        </div>
                    </div>
                )}

                {formError && (
                    <div className={`bg-red-50 border-red-100 flex items-center gap-3 text-red-600 shrink-0 animate-in slide-in-from-top-2 duration-200 ${embedded ? 'px-4 py-3 border rounded-[10px]' : 'px-4 md:px-12 py-3 border-b'}`}>
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <p className="text-xs font-medium flex-1">{formError}</p>
                        <button onClick={() => setFormError(null)} className="text-red-400 hover:text-red-600 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                <div className={embedded ? '' : 'flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 lg:p-12'}>
                    {/* Embutido, o detalhe já tem o resumo do pedido: sem a coluna lateral. */}
                    <div className={embedded ? 'space-y-6' : 'grid grid-cols-1 lg:grid-cols-3 gap-8'}>
                        <div className={embedded ? 'space-y-6' : 'lg:col-span-2 space-y-6'}>
                            {/* ── Aba "Dados Gerais" (cabeçalho do pedido + alocação do gasto) ── */}
                            {mostrarDadosGerais && (
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-blue-500" />
                                    Dados Gerais
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Pedido novo: diz de onde vieram os campos já preenchidos. */}
                                    {!isEditing && origensAplicadas.length > 0 && (
                                        <p className="md:col-span-2 text-xs text-gray-500">
                                            Preenchido com {origensAplicadas.map(o => ROTULO_ORIGEM[o]).join(' e ')} (Pedidos de Compra › Preferências). O que você alterar aqui fica como está.
                                        </p>
                                    )}
                                    {/* Topo em "Todas" e sem obra: ainda não se sabe de qual empresa é o pedido. */}
                                    {!isEditing && !orgDoPedido && (
                                        <p className="md:col-span-2 text-xs text-gray-500">
                                            Os padrões de Pedidos de Compra › Preferências entram ao escolher a obra — cada empresa tem o seu.
                                        </p>
                                    )}
                                    {!isEditing && orgDoPedido && orgSemPadrao && (
                                        <p className="md:col-span-2 text-xs text-amber-600">
                                            A empresa desta obra não tem padrão em Pedidos de Compra › Preferências — os campos seguem o padrão do sistema.
                                        </p>
                                    )}
                                    {/* Número — só na edição (pedido novo recebe o número ao salvar).
                                        Somente leitura: o formato vem da máscara em
                                        Configurações do Sistema › Nomenclatura. */}
                                    {isEditing && (
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Número do Pedido</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    readOnly
                                                    value={orderNumber ?? ''}
                                                    placeholder="Gerado ao salvar"
                                                    className="w-full rounded-lg border border-gray-300 p-2.5 bg-gray-50 text-gray-500 font-mono outline-none"
                                                />
                                                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                                    <ActionIconButton
                                                        kind="settings"
                                                        icon={isRegeneratingNumber ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                                        title={numberLockReason ?? 'Regerar número pela máscara atual'}
                                                        disabled={!!numberLockReason || isRegeneratingNumber}
                                                        onClick={handleRegenerateNumber}
                                                    />
                                                </div>
                                            </div>
                                            {numberLockReason && (
                                                <p className="text-xs text-gray-400 mt-1">{numberLockReason}</p>
                                            )}
                                            {/* O número guarda o empreendimento, que vem da obra.
                                                Trocar a obra sem dizer nada deixaria o número
                                                apontando para o empreendimento anterior. */}
                                            {obraMudou && (
                                                <p className="text-xs text-amber-600 mt-1">
                                                    {numberLockReason
                                                        ? 'A obra mudou, mas o número continua o antigo — ele só pode ser regerado em Rascunho.'
                                                        : 'A obra mudou — o número é regerado pela máscara ao salvar.'}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
                                        <SupplierSelect
                                            suppliers={suppliers}
                                            value={selectedSupplierId}
                                            onChange={setSelectedSupplierId}
                                            placeholder="Selecione um fornecedor..."
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="pedido-empreendimento" className="block text-sm font-medium text-gray-700 mb-1">Empreendimento</label>
                                        <select
                                            id="pedido-empreendimento"
                                            value={selectedEmpreendimentoId}
                                            onChange={(e) => handleEmpreendimentoChange(e.target.value)}
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                        >
                                            <option value="">Todos os empreendimentos</option>
                                            {empreendimentosOfertados.map(e => (
                                                <option key={e.id} value={e.id} disabled={!e.temObra}>
                                                    {e.temObra ? e.name : `${e.name} (sem obra vinculada)`}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label htmlFor="pedido-obra" className="block text-sm font-medium text-gray-700 mb-1">Obra</label>
                                        <select
                                            id="pedido-obra"
                                            value={selectedProjectId}
                                            onChange={(e) => trocarObra(e.target.value)}
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                        >
                                            <option value="">Selecione a obra...</option>
                                            {projectsDoEmpreendimento.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                        {/* Empreendimento com mais de uma obra não tem escolha
                                            automática — sem esta linha o usuário só veria o
                                            botão de salvar desbotar. */}
                                        {!selectedProjectId && selectedEmpreendimentoId && (
                                            <p className="mt-1 text-xs text-amber-600">
                                                Este empreendimento tem mais de uma obra — escolha qual recebe o pedido.
                                            </p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Data de Entrega</label>
                                        <input
                                            type="date"
                                            value={deliveryDate}
                                            onChange={(e) => { mexeu('prazoEntregaDias'); setDeliveryDate(e.target.value); }}
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Entrega</label>
                                        <select
                                            value={deliveryMethod}
                                            onChange={(e) => { mexeu('deliveryMethod'); setDeliveryMethod(e.target.value); }}
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                        >
                                            {FORMAS_DE_ENTREGA.map(forma => <option key={forma} value={forma}>{forma}</option>)}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Local de Entrega</label>
                                        <input
                                            type="text"
                                            value={deliveryLocation}
                                            onChange={(e) => { mexeu('deliveryLocation'); setDeliveryLocation(e.target.value); }}
                                            placeholder="Ex: Almoxarifado / Canteiro Obra 1"
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pagamento</label>
                                        <select
                                            value={paymentMethod}
                                            onChange={(e) => { mexeu('paymentMethod'); setPaymentMethod(e.target.value); }}
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                        >
                                            {FORMAS_PAGAMENTO_PEDIDO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                        </select>
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Notas / Observações</label>
                                        <textarea
                                            value={notes}
                                            onChange={(e) => { mexeu('notes'); setNotes(e.target.value); }}
                                            rows={3}
                                            placeholder="Ex: Entregar no portão lateral..."
                                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                        />
                                        {/* Desmarcado, a RPC do portal não entrega `notes` ao
                                            fornecedor e a área logada dele também esconde. */}
                                        <label className="mt-2 flex items-center gap-2 text-sm font-normal text-gray-700 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={notesVisibleToSupplier}
                                                onChange={(e) => { mexeu('notesVisibleToSupplier'); setNotesVisibleToSupplier(e.target.checked); }}
                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            />
                                            Visível para o fornecedor
                                        </label>
                                    </div>
                                </div>
                            </div>
                            )}

                            {/* ── Aba "Financeiro" (condição de pagamento, observações e
                                alocação do gasto). Estes campos moravam no fim do card
                                "Dados Gerais", que ficou longo demais para uma aba só;
                                separados a pedido do usuário em 2026-09-04. ── */}
                            {mostrarFinanceiro && (
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <HandCoins className="w-4 h-4 text-emerald-500" />
                                    Financeiro
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                                    <div>
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Condição de Pagamento</label>
                                        <div className="flex bg-white rounded-lg p-1 border border-gray-200">
                                            <button
                                                type="button"
                                                onClick={() => { mexeu('paymentTermType'); setPaymentTermType('Vista'); }}
                                                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${paymentTermType === 'Vista' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                                            >
                                                À Vista
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { mexeu('paymentTermType'); setPaymentTermType('Parcelado'); }}
                                                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${paymentTermType === 'Parcelado' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                                            >
                                                Parcelado
                                            </button>
                                        </div>
                                    </div>

                                    {paymentTermType === 'Vista' ? (
                                        <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                                            <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Prazo de Pagamento (Dias)</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={paymentDays}
                                                    onChange={(e) => { mexeu('paymentDays'); setPaymentDays(parseInt(e.target.value) || 0); }}
                                                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none pr-12 bg-white"
                                                />
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 uppercase">Dias</div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                                            <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Quantidade de Parcelas</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={paymentInstallments}
                                                    onChange={(e) => { mexeu('paymentInstallments'); setPaymentInstallments(parseInt(e.target.value) || 1); }}
                                                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none pr-12 bg-white"
                                                />
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 uppercase">X</div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* "Notas / Observações" passou para Dados Gerais (pedido do
                                    usuário em 2026-09-17). */}
                                <div className="mt-8 space-y-6 pt-6 border-t border-gray-100">
                                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em] flex items-center gap-3">
                                        <Filter className="w-4 h-4 text-indigo-600" />
                                        Alocação do Gasto
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-3">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-[0.15em] px-1">Conta de Pagamento</label>
                                            <div className="relative group">
                                                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
                                                <select
                                                    value={bankAccount}
                                                    onChange={(e) => { mexeu('paymentAccountId'); setBankAccount(e.target.value); }}
                                                    className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none"
                                                >
                                                    <option value="">Selecione uma conta...</option>
                                                    {accounts.map(acc => (
                                                        <option key={acc.id} value={acc.name}>{acc.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-[0.15em] px-1">Centro de custo</label>
                                            <CostCenterSelect
                                                costCenters={costCenters}
                                                value={costCenterId}
                                                onChange={(v) => { mexeu('costCenterId'); setCostCenterId(v); }}
                                                placeholder="Selecione o centro de custo..."
                                                hoverCls="hover:bg-indigo-50"
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-[0.15em] px-1">Plano de contas</label>
                                            <PlanoContasSelect
                                                planoContas={planoContas}
                                                value={planoDeContasId}
                                                onChange={(v) => { mexeu('planoDeContasId'); setPlanoDeContasId(v); }}
                                                placeholder="Selecione o plano de contas..."
                                                hoverCls="hover:bg-indigo-50"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            )}

                            {/* ── Aba "Itens do Pedido" (avulsos + materiais da obra) ── */}
                            {/* §5.2 — cabeçalho e tabela num card só; §16 escala compacta. */}
                            {/* Embutido: a tabela "Itens do pedido" do detalhe já lista os
                                avulsos — aqui fica só o "+ Item avulso", desenhado na
                                régua dela (pedido de 10/11/2026). */}
                            {embedded && mostrarItens && selectedProjectId && barraItens && createPortal(
                                <>
                                {/* "+ Item do orçamento" abre o painel com o orçamento da obra
                                    (pedido de 10/11/2026 — a tabela de seleção ficava sempre aberta). */}
                                <button
                                    type="button"
                                    onClick={() => setPickerOrcamentoAberto(true)}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-[6px] text-[13px] font-medium transition-all active:scale-95 shrink-0"
                                >
                                    <Plus className="w-[15px] h-[15px]" />
                                    Item do orçamento
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAvulsoModalConfig({ open: true, editingIndex: null, initial: null })}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-[6px] text-[13px] font-medium transition-all active:scale-95 shrink-0"
                                >
                                    <Plus className="w-[15px] h-[15px]" />
                                    Item avulso
                                </button>
                                </>,
                                barraItens,
                            )}

                            {!embedded && mostrarItens && selectedProjectId && (
                                <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 overflow-hidden">
                                    {/* §5.2 — toolbar ACOPLADA: régua de controles e tabela no
                                        mesmo card, sem moldura própria. Conteúdo do §5.1: busca,
                                        ajuste de colunas e a ação da seção. */}
                                    <div className="p-2 border-b border-gray-100 bg-white">
                                        <div className="flex flex-col md:flex-row gap-2.5 md:items-center">
                                            <div className="flex items-center gap-2 px-2 shrink-0">
                                                <Package className="w-4 h-4 shrink-0 text-blue-500" />
                                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Itens do pedido</h3>
                                                {/* §8 — contagem é texto simples, sem pílula/fundo/uppercase */}
                                                {todasAsLinhas.length > 0 && (
                                                    <span className="text-sm font-normal text-gray-400 whitespace-nowrap">
                                                        {termoAvulsos
                                                            ? `${linhasAvulsos.length} de ${todasAsLinhas.length}`
                                                            : `${todasAsLinhas.length} ${todasAsLinhas.length === 1 ? 'item' : 'itens'}`}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex-1 relative w-full">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Buscar por código ou descrição..."
                                                    className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                                    value={buscaAvulsos}
                                                    onChange={e => setBuscaAvulsos(e.target.value)}
                                                />
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                                                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1">
                                                    <ColumnConfigButton
                                                        columns={AVULSO_COLUMNS.filter(c => c.key !== 'actions')}
                                                        visibleColumns={colunasAvulsos.visibleColumns}
                                                        showColumnConfig={colunasAvulsos.showColumnConfig}
                                                        onToggleShow={() => colunasAvulsos.setShowColumnConfig(!colunasAvulsos.showColumnConfig)}
                                                        onToggleColumn={colunasAvulsos.toggleColumn}
                                                        onReset={colunasAvulsos.resetColumns}
                                                    />
                                                        {/* §6.1.2 — auto-ajuste SOB COMANDO: recalcular a cada busca faria
                                                            as colunas dançarem enquanto o usuário digita. Duplo clique no
                                                            divisor segue sendo "restaurar padrão". */}
                                                        <button
                                                            type="button"
                                                            onClick={() => larguraAvulsos.autoFit()}
                                                            className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                                            title="Ajustar largura das colunas ao conteúdo"
                                                        >
                                                            <MoveHorizontal className="w-4 h-4" />
                                                        </button>
                                                </div>
                                                {/* §17 — variante compacta. O tom laranja marca que é a
                                                    ação desta seção, não a ação primária da tela. */}
                                                <button
                                    type="button"
                                    onClick={() => setPickerOrcamentoAberto(true)}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-[6px] text-[13px] font-medium transition-all active:scale-95 shrink-0"
                                >
                                    <Plus className="w-[15px] h-[15px]" />
                                    Item do orçamento
                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setAvulsoModalConfig({ open: true, editingIndex: null, initial: null })}
                                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-[6px] text-[13px] font-medium transition-all active:scale-95"
                                                >
                                                    <Plus className="w-[15px] h-[15px]" />
                                                    Item avulso
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* §12 dentro do card acoplado: sem bg/border/rounded próprios */}
                                    {todasAsLinhas.length === 0 ? (
                                        <div className="text-center py-12">
                                            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                            <h4 className="text-base font-bold text-gray-900 mb-2">Nenhum item no pedido</h4>
                                            <p className="text-sm text-gray-500">Use "+ Item do orçamento" para escolher do orçamento da obra, ou "+ Item avulso" para o que não está previsto.</p>
                                        </div>
                                    ) : linhasAvulsos.length === 0 ? (
                                        <div className="text-center py-12">
                                            <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                            <h4 className="text-base font-bold text-gray-900 mb-2">Nenhum item encontrado</h4>
                                            <p className="text-sm text-gray-500">
                                                Nada corresponde a <span className="font-semibold text-gray-700">“{buscaAvulsos.trim()}”</span>.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => setBuscaAvulsos('')}
                                                className="mt-4 text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all"
                                            >
                                                Limpar busca
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            {/* §6.1 — soma exata, nunca w-full: com fixed em
                                                100% o navegador redistribui a sobra e o
                                                arraste mexe na coluna vizinha errada. */}
                                            <table
                                                ref={larguraAvulsos.tableRef}
                                                className="text-left border-collapse"
                                                style={{ tableLayout: 'fixed', width: totalLarguraAvulsos, minWidth: '100%' }}
                                            >
                                                <colgroup>
                                                    {chavesAvulsos.map(key => (
                                                        <col key={key} data-col-key={key} style={{ width: `${larguraAvulsos.getWidth(key)}px` }} />
                                                    ))}
                                                    {/* §6.1.1 — espaçador ANTES de "Ações". */}
                                                    <col />
                                                    {colunasAvulsos.visibleColumns.includes('actions') && (
                                                        <col data-col-key="actions" style={{ width: `${larguraAvulsos.getWidth('actions')}px` }} />
                                                    )}
                                                </colgroup>
                                                {/* §6.2 sentence case (uppercase={false}) · §6.3 toda
                                                    coluna ordenável · §6.6 px-6 + separador vertical */}
                                                <thead>
                                                    <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                                        {colunasAvulsos.orderedVisibleColumns.filter(k => k !== 'actions').map(key => {
                                                            const def = AVULSO_HEADERS[key];
                                                            if (!def) return null;
                                                            return (
                                                                <SortableHeader
                                                                    key={key}
                                                                    colKey={key}
                                                                    label={def.label}
                                                                    uppercase={false}
                                                                    sortColumn={colunasAvulsos.sortColumn}
                                                                    sortDirection={colunasAvulsos.sortDirection}
                                                                    onSort={colunasAvulsos.handleColumnSort}
                                                                    onMoveColumn={colunasAvulsos.moveColumn}
                                                                    // overflow-hidden é obrigatório com ResizeHandle (§6.1).
                                                                    className={`${def.className} overflow-hidden`}
                                                                >
                                                                    <larguraAvulsos.ResizeHandle colKey={key} />
                                                                </SortableHeader>
                                                            );
                                                        })}
                                                        {/* §6.1.1 — espaçador nas TRÊS listas, mesma posição. */}
                                                        <th aria-hidden="true" className="border-r border-gray-100" />
                                                        {colunasAvulsos.visibleColumns.includes('actions') && (
                                                            <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                                        )}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200">
                                                    {linhasAvulsos.map(({ item, idx, origem }) => (
                                                        <tr key={idx === null ? `orc:${item.code}` : `av:${idx}`} className="hover:bg-blue-50/50 transition-colors">
                                                            {colunasAvulsos.orderedVisibleColumns.filter(k => k !== 'actions').map(key => (
                                                                <td
                                                                    key={key}
                                                                    className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 ${AVULSO_ALIGN[key] ?? ''}`}
                                                                >
                                                                    {key === 'origem'
                                                                        ? <span className={`text-sm font-normal ${idx === null ? 'text-blue-700' : 'text-orange-700'}`}>{origem}</span>
                                                                        : renderCelulaAvulso(key, item)}
                                                                </td>
                                                            ))}
                                                            <td aria-hidden="true" className="border-r border-gray-100"></td>
                                                            {colunasAvulsos.visibleColumns.includes('actions') && (
                                                                <td className="px-6 py-2.5 text-right">
                                                                    <div className="flex items-center justify-end gap-1.5">
                                                                        <ActionIconButton kind="edit" size="sm" tone="attention" onClick={() => setAvulsoModalConfig(idx === null
                                                                            ? { open: true, editingIndex: null, initial: item, codigoOrcamento: item.code }
                                                                            : { open: true, editingIndex: idx, initial: item })} />
                                                                        <ActionIconButton kind="delete" size="sm" onClick={() => idx === null
                                                                            ? removerDoOrcamento(item.code)
                                                                            : setAvulsoItems(prev => prev.filter((_, i) => i !== idx))} />
                                                                    </div>
                                                                </td>
                                                            )}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* §12 — a aba de itens sem obra escolhida não pode ficar em branco:
                                os materiais vêm do orçamento da obra. */}
                            {embedded && mostrarItens && !selectedProjectId && (
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 text-center py-12">
                                    <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">Escolha a obra primeiro</h3>
                                    <p className="text-sm text-gray-500">Os materiais vêm do orçamento da obra — selecione a obra na aba Dados Gerais.</p>
                                </div>
                            )}
                        </div>

                        {!embedded && (
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 sticky top-6">
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                    Resumo do Pedido
                                </h3>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500">Itens Selecionados</span>
                                        <span className="font-bold text-gray-900">{selectedItems.size}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500">Valor Total</span>
                                        <span className="font-bold text-green-600">
                                            {formatCurrency(totalOrderValue)}
                                        </span>
                                    </div>
                                    {algumItemCotado && (
                                        <div className="flex justify-between items-center text-xs -mt-2">
                                            <span className="text-gray-400">Referência</span>
                                            <span className="text-gray-400">{formatCurrency(totalReferencia)}</span>
                                        </div>
                                    )}
                                    <div className="h-px bg-gray-100" />

                                    {orderItems.length > 0 && (
                                        <div className="space-y-3">
                                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Itens Detalhados</p>
                                            <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                                {orderItems.map(item => (
                                                    <div key={item.code} className="bg-gray-50 p-3 rounded-xl border border-gray-100/50">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className="text-xs font-bold text-blue-600 uppercase tracking-tight truncate flex-1">{item.description}</span>
                                                            <span className="text-xs font-black text-gray-900 ml-2">{item.quantity} {item.unit}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-[9px] text-gray-400 font-medium">
                                                            <span>{item.code} • {formatCurrency(item.unitPrice)}</span>
                                                            <span className="text-gray-900">Subtotal: {formatCurrency(valorEfetivoDoItem(item))}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        )}
                    </div>
                </div>

                {avulsoModalConfig.open && (
                    <AvulsoItemModal
                        projectData={projectData}
                        initial={avulsoModalConfig.initial}
                        doOrcamento={!!avulsoModalConfig.codigoOrcamento}
                        onConfirm={async (item) => {
                            const { editingIndex } = avulsoModalConfig;
                            if (avulsoModalConfig.codigoOrcamento) {
                                editarDoOrcamento(avulsoModalConfig.codigoOrcamento, item);
                                setAvulsoModalConfig({ open: false, editingIndex: null, initial: null });
                                return;
                            }
                            if (embedded && isEditing && editingIndex === null) {
                                const erro = await acrescentarAoPedido([{ ...item, avulso: true }]);
                                if (erro) return erro;
                                setAvulsoModalConfig({ open: false, editingIndex: null, initial: null });
                                return;
                            }
                            // O modal monta o item com `{...form}`, e `form` nasce do
                            // `initial` — então um total gravado sobreviveria à edição e
                            // ficaria mentindo sobre a nova quantidade. Quem passa por
                            // aqui recalcula.
                            const editado: AvulsoItem = { ...item, total: undefined, quotedTotal: undefined };
                            if (editingIndex !== null) {
                                setAvulsoItems(prev => prev.map((a, i) => i === editingIndex ? editado : a));
                            } else {
                                setAvulsoItems(prev => [...prev, editado]);
                            }
                            setAvulsoModalConfig({ open: false, editingIndex: null, initial: null });
                        }}
                        onClose={() => setAvulsoModalConfig({ open: false, editingIndex: null, initial: null })}
                    />
                )}

                {/* Montado só aberto: o Sheet fechado continua no DOM, e com
                    orçamento de centenas de linhas a tabela inteira ficaria
                    desenhada escondida na aba Itens. */}
                {pickerOrcamentoAberto && (
                <PedidoOrcamentoPicker
                    open={pickerOrcamentoAberto}
                    onClose={() => setPickerOrcamentoAberto(false)}
                    budget={projectData?.budget ?? []}
                    precos={customPrices}
                    compradas={purchasedQuantities}
                    noPedido={codigosNoPedido}
                    // O Novo pedido é uma camada z-[110]; o painel vem por cima.
                    zIndex={embedded ? undefined : 130}
                    onItemAvulso={() => setAvulsoModalConfig({ open: true, editingIndex: null, initial: null })}
                    onAdd={async (itens) => {
                        if (embedded && isEditing) {
                            const erro = await acrescentarAoPedido(itens);
                            if (erro) return erro;
                        } else {
                            incluirDoOrcamento(itens);
                        }
                        setPickerOrcamentoAberto(false);
                    }}
                />
                )}
            </div>
        </div>
    );
};

interface AvulsoItemModalProps {
    projectData: ProjectData | null;
    initial: AvulsoItem | null;
    /** Item do ORÇAMENTO (lista do Novo pedido): código, descrição e unidade vêm
     *  do orçamento e ficam travados; quantidade, preço e cotação editam. */
    doOrcamento?: boolean;
    /** Devolve a mensagem de erro (o modal continua aberto e a mostra) ou nada. */
    onConfirm: (item: AvulsoItem) => void | Promise<string | null | void>;
    onClose: () => void;
}

const EMPTY_FORM: AvulsoItem = { code: '', description: '', unit: '', quantity: 1, unitPrice: 0, quotedUnitPrice: null };

// ─── Unit management ─────────────────────────────────────────────────────────
const DEFAULT_UNITS = ['kg', 'm', 'm²', 'm³', 'l', 'pç', 'un', 'bd', 'br'];
const UNITS_KEY = 'opura_units';
const loadUnits = (): string[] => { try { const s = localStorage.getItem(UNITS_KEY); return s ? JSON.parse(s) : [...DEFAULT_UNITS]; } catch { return [...DEFAULT_UNITS]; } };
const persistUnits = (u: string[]) => localStorage.setItem(UNITS_KEY, JSON.stringify(u));

interface UnitManagerModalProps { units: string[]; onClose: (updated: string[]) => void; }

const UnitManagerModal: React.FC<UnitManagerModalProps> = ({ units: init, onClose }) => {
    const [units, setUnits] = React.useState<string[]>(init);
    const [newUnit, setNewUnit] = React.useState('');
    const [editingIdx, setEditingIdx] = React.useState<number | null>(null);
    const [editVal, setEditVal] = React.useState('');
    const [error, setError] = React.useState('');

    const handleAdd = () => {
        const t = newUnit.trim();
        if (!t) { setError('Digite uma unidade.'); return; }
        if (units.map(u => u.toLowerCase()).includes(t.toLowerCase())) { setError('Unidade já existe.'); return; }
        setUnits(prev => [...prev, t]);
        setNewUnit('');
        setError('');
    };

    const handleEditSave = () => {
        const t = editVal.trim();
        if (!t || editingIdx === null) return;
        setUnits(prev => prev.map((u, i) => i === editingIdx ? t : u));
        setEditingIdx(null);
    };

    const handleClose = () => { persistUnits(units); onClose(units); };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-black text-gray-900">Gerenciar Unidades</h2>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">Unidades de medida</p>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newUnit}
                            onChange={e => { setNewUnit(e.target.value); setError(''); }}
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                            placeholder="Nova unidade..."
                            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                        />
                        <Button onClick={handleAdd} size="sm" className="gap-1.5 whitespace-nowrap">
                            <Plus className="w-3.5 h-3.5" /> Adicionar
                        </Button>
                    </div>
                    {error && <p className="text-xs text-red-500 -mt-2">{error}</p>}

                    <div className="space-y-1.5 max-h-60 overflow-y-auto custom-scrollbar">
                        {units.map((unit, i) => (
                            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                                {editingIdx === i ? (
                                    <input
                                        autoFocus
                                        type="text"
                                        value={editVal}
                                        onChange={e => setEditVal(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleEditSave()}
                                        className="flex-1 text-sm font-bold border border-blue-300 rounded-lg px-2 py-0.5 outline-none focus:ring-2 focus:ring-blue-400"
                                    />
                                ) : (
                                    <span className="flex-1 text-sm font-bold text-gray-800">{unit}</span>
                                )}
                                {editingIdx === i ? (
                                    <button onClick={handleEditSave} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-all">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                    </button>
                                ) : (
                                    <ActionIconButton kind="edit" size="sm" onClick={() => { setEditingIdx(i); setEditVal(unit); }} />
                                )}
                                <ActionIconButton kind="delete" size="sm" onClick={() => setUnits(prev => prev.filter((_, j) => j !== i))} />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="px-6 pb-6 flex justify-end">
                    <button onClick={handleClose} className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-black transition-all">
                        Concluído
                    </button>
                </div>
            </div>
        </div>
    );
};
// ─────────────────────────────────────────────────────────────────────────────

const toCurrencyDigits = (value: number) => String(Math.round(value * 100));
const fromCurrencyDigits = (digits: string) => parseInt(digits || '0', 10) / 100;
const displayCurrencyDigits = (digits: string) => {
    const num = parseInt(digits || '0', 10);
    return (num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const AvulsoItemModal: React.FC<AvulsoItemModalProps> = ({ projectData, initial, doOrcamento = false, onConfirm, onClose }) => {
    const isEditing = initial !== null;
    const [form, setForm] = React.useState<AvulsoItem>(initial ?? EMPTY_FORM);
    const [priceDigits, setPriceDigits] = React.useState(() =>
        initial ? toCurrencyDigits(initial.unitPrice) : '0'
    );
    // Cotado: '' = vazio = sem cotação (diferente de '0', que é cotação de R$ 0,00).
    const [quotedDigits, setQuotedDigits] = React.useState(() =>
        initial?.quotedUnitPrice != null ? toCurrencyDigits(initial.quotedUnitPrice) : ''
    );
    const [units, setUnits] = React.useState<string[]>(loadUnits);
    const [showUnitManager, setShowUnitManager] = React.useState(false);
    const [pickerOpen, setPickerOpen] = React.useState(false);
    const [formError, setFormError] = React.useState<string | null>(null);

    const handlePickerSelect = (item: SinapiItem) => {
        const price = item.price || 0;
        setForm(f => ({ code: item.code, description: item.description, unit: item.unit, quantity: 1, unitPrice: price, quotedUnitPrice: f.quotedUnitPrice ?? null }));
        setPriceDigits(toCurrencyDigits(price));
        setPickerOpen(false);
    };

    const [salvando, setSalvando] = React.useState(false);

    const handleConfirm = async () => {
        if (!form.description.trim()) { setFormError('Descrição obrigatória.'); return; }
        if (!form.unit.trim()) { setFormError('Unidade obrigatória.'); return; }
        if (form.quantity <= 0) { setFormError('Quantidade deve ser maior que zero.'); return; }
        setFormError(null);
        setSalvando(true);
        try {
            const erro = await onConfirm({ ...form });
            if (erro) setFormError(erro);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-8 py-6 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">{doOrcamento ? 'Editar item do orçamento' : isEditing ? 'Editar Item Avulso' : 'Adicionar Item Avulso'}</h2>
                        <p className="text-xs font-bold text-orange-500 uppercase tracking-widest mt-0.5">{doOrcamento ? 'Item do orçamento da obra' : 'Item não orçado'}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-orange-100 rounded-xl transition-all text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-8 space-y-5">
                    {/* Picker button — item do orçamento já tem código e descrição. */}
                    {!doOrcamento && (<>
                    <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className="w-full flex items-center justify-center gap-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-xl py-3 text-sm font-black uppercase tracking-wider transition-all"
                    >
                        <Search className="w-4 h-4" />
                        Buscar na base de dados
                    </button>
                    <p className="text-xs text-gray-400 -mt-3">Ou preencha os campos abaixo manualmente.</p>

                    <div className="h-px bg-gray-100" />
                    </>)}

                    {/* Manual fields */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-1.5">Código <span className="text-gray-300 font-normal normal-case tracking-normal">(opcional)</span></label>
                            <input
                                type="text"
                                value={form.code}
                                onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))}
                                readOnly={doOrcamento}
                                placeholder="Ex: 00001"
                                className="w-full rounded-xl border border-gray-200 p-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-orange-400 outline-none font-mono read-only:bg-gray-50 read-only:cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-1.5">Unidade *</label>
                            <div className="flex gap-2">
                                <select
                                    value={units.includes(form.unit) ? form.unit : form.unit ? '__custom__' : ''}
                                    onChange={e => {
                                        if (e.target.value !== '__custom__') setForm(f => ({ ...f, unit: e.target.value }));
                                    }}
                                    disabled={doOrcamento}
                                    className="flex-1 rounded-xl border border-gray-200 p-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-orange-400 outline-none bg-white disabled:bg-gray-50 disabled:cursor-not-allowed"
                                >
                                    <option value="">Selecione...</option>
                                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                                    {form.unit && !units.includes(form.unit) && (
                                        <option value="__custom__">{form.unit}</option>
                                    )}
                                </select>
                                {!doOrcamento && <button
                                    type="button"
                                    onClick={() => setShowUnitManager(true)}
                                    title="Gerenciar unidades"
                                    className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-all shrink-0"
                                >
                                    <Settings className="w-4 h-4" />
                                </button>}
                            </div>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-1.5">Descrição *</label>
                            <input
                                type="text"
                                value={form.description}
                                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                                readOnly={doOrcamento}
                                placeholder="Descrição do material ou serviço"
                                className="w-full rounded-xl border border-gray-200 p-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-orange-400 outline-none read-only:bg-gray-50 read-only:cursor-not-allowed"
                            />
                            {/* §32 — travado diz o motivo; o valor continua escuro. */}
                            {doOrcamento && (
                                <p className="text-xs text-gray-500 mt-1">Código, descrição e unidade vêm do orçamento da obra — não mudam aqui.</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-1.5">Quantidade *</label>
                            <input
                                type="number"
                                min={0.001}
                                step="any"
                                value={form.quantity}
                                onChange={(e) => setForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                                onFocus={(e) => e.target.select()}
                                className="w-full rounded-xl border border-gray-200 p-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-1.5">Preço Unitário (R$)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 pointer-events-none select-none">R$</span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={displayCurrencyDigits(priceDigits)}
                                    onChange={(e) => {
                                        const digits = e.target.value.replace(/\D/g, '');
                                        const trimmed = digits.replace(/^0+/, '') || '0';
                                        setPriceDigits(trimmed);
                                        setForm(f => ({ ...f, unitPrice: fromCurrencyDigits(trimmed) }));
                                    }}
                                    className="w-full pl-9 rounded-xl border border-gray-200 p-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none text-right font-bold"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-form-label font-bold text-gray-500 uppercase tracking-wider mb-1.5">Preço unit. da cotação (R$)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 pointer-events-none select-none">R$</span>
                            <input
                                type="text"
                                inputMode="numeric"
                                placeholder="Deixe vazio para o fornecedor preencher"
                                value={quotedDigits === '' ? '' : displayCurrencyDigits(quotedDigits)}
                                onChange={(e) => {
                                    const digits = e.target.value.replace(/\D/g, '');
                                    if (digits === '') {
                                        setQuotedDigits('');
                                        setForm(f => ({ ...f, quotedUnitPrice: null }));
                                        return;
                                    }
                                    const trimmed = digits.replace(/^0+/, '') || '0';
                                    setQuotedDigits(trimmed);
                                    setForm(f => ({ ...f, quotedUnitPrice: fromCurrencyDigits(trimmed) }));
                                }}
                                className="w-full pl-9 rounded-xl border border-gray-200 p-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none text-right font-bold placeholder:font-normal placeholder:text-gray-300"
                            />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Valor de referência acima; o cotado é o que o fornecedor cobra.</p>
                    </div>

                    {formError && (
                        <p className="text-xs text-red-600 flex items-center gap-1.5 bg-red-50 px-3 py-2 rounded-lg">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            {formError}
                        </p>
                    )}

                    {form.quantity > 0 && form.unitPrice > 0 && (
                        <div className="flex justify-between items-center bg-orange-50 rounded-xl px-4 py-3">
                            <span className="text-xs font-bold text-orange-700 uppercase tracking-wider">Total do Item</span>
                            <span className="text-sm font-black text-orange-700">
                                {formatCurrency(form.quantity * form.unitPrice)}
                            </span>
                        </div>
                    )}
                </div>

                <div className="px-8 pb-8 flex gap-3 justify-end">
                    <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all">
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={salvando}
                        title={salvando ? 'Gravando o item…' : undefined}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-black transition-all shadow-lg shadow-orange-500/20 disabled:opacity-60 disabled:cursor-wait"
                    >
                        {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : isEditing ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {salvando ? 'Salvando…' : isEditing ? 'Salvar Alterações' : 'Adicionar Item'}
                    </button>
                </div>
            </div>

            {showUnitManager && (
                <UnitManagerModal
                    units={units}
                    onClose={updated => { setUnits(updated); setShowUnitManager(false); }}
                />
            )}

            <DatabasePickerModal
                isOpen={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onSelect={handlePickerSelect}
                title="Buscar Material / Serviço"
                subtitle="Selecione um item da base de dados para adicionar ao pedido."
                zIndex={210}
            />
        </div>
    );
};

export default SupplyChainOrderForm;
