// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Building2, Home, TrendingUp, Plus, Search, Filter, Home as HomeIcon, MapPin, Maximize2, DollarSign, Tag, Calendar, User, Edit, Trash2, LayoutGrid, List, ChevronDown, X, BrainCircuit, Activity, Percent, Target, Mail, Phone, Briefcase, FileText, AlertCircle, RefreshCw, MoveHorizontal } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { commercialService } from '../services/commercialService';
import { empreendimentoService } from '../services/empreendimentoService';
import EmpreendimentoCell from './empreendimento/EmpreendimentoCell';
import { Property, PropertyStatus, PropertyDeal, Client, HedonicPricingConfig } from '../types';
import { TowerMatrixConfig, GridCellConfig, TowerNumberingConfig } from '../types/imovib';


interface BulkConfig {
    matrix?: TowerMatrixConfig[];
    count?: number;
    startingNumber?: number;
    increment?: number;
    prefix?: string;
    connectedTowers?: boolean;
    connectionDirection?: 'HORIZONTAL' | 'VERTICAL';
}

type PropertyFormData = Partial<Property> & {
    _bulkConfig?: BulkConfig;
};
import { clientService } from '../services/clientService';
import PropertyModal from './PropertyModal';
import DealModal from './DealModal';
import ProjectFinancialManager from './ProjectFinancialManager';
import PropertyUnitMap from './common/PropertyUnitMap';
import { SalesDashboard } from './SalesDashboard';
import PricingIntelligenceModal from './PricingIntelligenceModal';
import PriceTableManager from './PriceTableManager';
import SalesPlanManager from './SalesPlanManager';
import { pricingService } from '../services/pricingService';
import { brokerService } from '../services/brokerService';
import BrokerModal from './BrokerModal';
import { BrokerProfile } from '../types';
import { ContractsDashboard } from './ContractsDashboard';
import { ContractModal } from './ContractModal';
import ContractDetailView from './ContractDetailView';
import { contractService } from '../services/contractService';
import Button from './ui/Button';
import { KpiCard } from './ui/KpiCard';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { useConfirm } from './ui/confirm';

interface SalesModuleProps {
    organizationId?: string;
}

// ui_ux_guia_unificado.md §2 — colunas fora do componente.
// `context: 'building'` só aparece na visão de detalhe de um edifício (selectedBuildingId);
// `context: 'all'` aparece nas duas visões (mestre e detalhe).
const INVENTORY_COLUMNS: (ColumnConfig & { context: 'all' | 'building' })[] = [
    { key: 'name', label: 'Imóvel', sortable: true, context: 'all' },
    { key: 'empreendimento', label: 'Empreendimento', sortable: true, context: 'all' },
    { key: 'address', label: 'Endereço / referência', sortable: true, context: 'all' },
    { key: 'block', label: 'Bloco', sortable: true, context: 'building' },
    { key: 'private_area', label: 'Á. priv.', sortable: true, context: 'building' },
    { key: 'price', label: 'Preço', sortable: true, context: 'all' },
    { key: 'price_per_m2', label: 'Vlr/m²', sortable: true, context: 'all' },
    { key: 'position_weight', label: 'Peso pos.', sortable: true, context: 'building' },
    { key: 'sun_weight', label: 'Peso sol', sortable: true, context: 'building' },
    { key: 'floor', label: 'Andar', sortable: true, context: 'building' },
    { key: 'status', label: 'Status', sortable: true, context: 'all' },
    { key: 'actions', label: 'Ações', sortable: false, context: 'all' },
];

const DEALS_COLUMNS: ColumnConfig[] = [
    { key: 'code', label: 'Código', sortable: true },
    { key: 'property', label: 'Unidade', sortable: true },
    // Cliente saiu de dentro da célula de Unidade (era a linha secundária cinza)
    // para coluna própria: dado de outra entidade, ordenável e ocultável sozinho.
    { key: 'client', label: 'Cliente', sortable: true },
    { key: 'empreendimento', label: 'Empreendimento', sortable: true },
    { key: 'block', label: 'Bloco', sortable: true },
    { key: 'private_area', label: 'Á. priv.', sortable: true },
    { key: 'price_base', label: 'Preço base', sortable: true },
    { key: 'price_per_m2_base', label: 'Vlr/m² base', sortable: true },
    { key: 'floor', label: 'Andar', sortable: true },
    { key: 'sale_value', label: 'Vlr venda', sortable: true },
    { key: 'sale_value_per_m2', label: 'Vlr venda/m²', sortable: true },
    { key: 'variance', label: 'Var. (R$)', sortable: true },
    { key: 'variance_pct', label: 'Var. (%)', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const BROKERS_COLUMNS: ColumnConfig[] = [
    { key: 'name', label: 'Corretor', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    // Contato = e-mail + telefone combinados — sem valor único óbvio pra ordenar (guide §6.3).
    { key: 'contact', label: 'Contato', sortable: false },
    { key: 'agency', label: 'Imobiliária', sortable: true },
    { key: 'commission', label: 'Comissão', sortable: true },
    { key: 'creci', label: 'CRECI', sortable: true },
];

// Larguras padrão de coluna — redimensionável via useResizableColumns (§6.1).
const DEFAULT_INVENTORY_COL_WIDTHS: Record<string, number> = {
    name: 200, empreendimento: 184, address: 220, block: 107, private_area: 117, price: 140, price_per_m2: 130,
    position_weight: 135, sun_weight: 130, floor: 110, status: 130, actions: 200,
};
const DEFAULT_DEALS_COL_WIDTHS: Record<string, number> = {
    code: 118, property: 200, client: 220, empreendimento: 184, block: 107, private_area: 117, price_base: 145, price_per_m2_base: 149,
    floor: 110, sale_value: 134, sale_value_per_m2: 158, variance: 128, variance_pct: 123, status: 130, actions: 160,
};

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `orderedVisibleColumns` (ordem que o usuário arrasta), em vez de uma sequência
// fixa de JSX (padrão ClientList.tsx/BoletoManager.tsx). Colunas 'block',
// 'private_area', 'position_weight', 'sun_weight' e 'floor' só aparecem no
// inventário quando há um edifício aberto (context: 'building' — ver `isVisible`
// dentro do render da tabela de Unidades, abaixo).
const INVENTORY_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    name: { label: 'Imóvel', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    empreendimento: { label: 'Empreendimento', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    address: { label: 'Endereço / referência', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    block: { label: 'Bloco', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    private_area: { label: 'Á. priv.', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    price: { label: 'Preço', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    price_per_m2: { label: 'Vlr/m²', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    position_weight: { label: 'Peso pos.', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    sun_weight: { label: 'Peso sol', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    floor: { label: 'Andar', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

const DEALS_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    code: { label: 'Código', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    property: { label: 'Unidade', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    client: { label: 'Cliente', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    empreendimento: { label: 'Empreendimento', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    block: { label: 'Bloco', className: 'px-6 py-2 border-r border-gray-100 text-center overflow-hidden' },
    private_area: { label: 'Á. priv.', className: 'px-6 py-2 border-r border-gray-100 text-center whitespace-nowrap overflow-hidden' },
    price_base: { label: 'Preço base', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap overflow-hidden' },
    price_per_m2_base: { label: 'Vlr/m² base', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap overflow-hidden' },
    floor: { label: 'Andar', className: 'px-6 py-2 border-r border-gray-100 text-center overflow-hidden' },
    sale_value: { label: 'Vlr venda', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap overflow-hidden' },
    sale_value_per_m2: { label: 'Vlr venda/m²', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap overflow-hidden' },
    variance: { label: 'Var. (R$)', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap overflow-hidden' },
    variance_pct: { label: 'Var. (%)', className: 'px-6 py-2 border-r border-gray-100 text-center whitespace-nowrap overflow-hidden' },
    status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

const BROKERS_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    name: { label: 'Corretor', className: 'px-6 py-2 border-r border-gray-100' },
    status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100' },
    contact: { label: 'Contato', sortable: false, className: 'px-6 py-2 border-r border-gray-100' },
    agency: { label: 'Imobiliária', className: 'px-6 py-2 border-r border-gray-100' },
    commission: { label: 'Comissão', className: 'px-6 py-2 border-r border-gray-100' },
    creci: { label: 'CRECI', className: 'px-6 py-2 border-r border-gray-100' },
};

// Conteúdo de cada <td> da tabela de Unidades (visão de DETALHE — edifício
// aberto) — extraído para função pura para que o <tbody> possa mapear
// `orderedVisibleColumns` (ordem arrastável) em vez de repetir um bloco
// condicional fixo por coluna (padrão renderClientCell em ClientList.tsx).
function renderInventoryDetailCell(
    key: string,
    property: Property,
    ctx: {
        getStatusColor: (s: PropertyStatus) => string;
        getStatusLabel: (s: PropertyStatus) => string;
        empreendimentoByProperty: Record<string, { id: string; name: string; towerName?: string }>;
    },
): React.ReactNode {
    switch (key) {
        case 'name':
            return <span className="text-sm font-normal text-gray-700">{property.name}</span>;
        case 'empreendimento':
            return <EmpreendimentoCell value={ctx.empreendimentoByProperty[property.id]} />;
        case 'address':
            return <span className="text-sm font-normal text-gray-600">{property.address || 'Resumo do Empreendimento'}</span>;
        case 'block':
            return <span className="text-sm font-normal text-gray-700">{property.block || '-'}</span>;
        case 'private_area':
            return <span className="text-sm font-normal text-gray-600">{property.private_area ? `${property.private_area}m²` : '-'}</span>;
        case 'price':
            return <span className="text-sm font-medium text-gray-800">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(property.price || 0)}</span>;
        case 'price_per_m2':
            return <span className="text-sm font-medium text-gray-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format((property.price || 0) / (property.private_area || property.area || 1))}</span>;
        case 'position_weight':
            return (
                <div className="flex flex-col">
                    <span className="text-sm font-normal text-gray-900 leading-none mb-1">
                        {property.position_type === 'FRONT' ? '1.03x' : property.position_type === 'BACK' ? '0.97x' : '1.00x'}
                    </span>
                    <span className="text-xs font-normal text-gray-400">
                        {property.position_type === 'FRONT' ? 'Frente' : property.position_type === 'BACK' ? 'Fundos' : 'Lateral / Base'}
                    </span>
                </div>
            );
        case 'sun_weight':
            return (
                <div className="flex flex-col">
                    <span className="text-sm font-normal text-gray-900 leading-none mb-1">
                        {property.sun_orientation === 'NORTH' ? '1.02x' : property.sun_orientation === 'EAST' ? '1.01x' : property.sun_orientation === 'WEST' ? '0.99x' : property.sun_orientation === 'SOUTH' ? '0.98x' : '1.00x'}
                    </span>
                    <span className="text-xs font-normal text-gray-400">
                        {property.sun_orientation === 'NORTH' ? 'Norte' : property.sun_orientation === 'EAST' ? 'Leste' : property.sun_orientation === 'WEST' ? 'Oeste' : property.sun_orientation === 'SOUTH' ? 'Sul' : 'Base'}
                    </span>
                </div>
            );
        case 'floor':
            return <span className="text-sm font-normal text-gray-600">{property.floor ? `${property.floor}º` : 'Térreo'}</span>;
        case 'status':
            return <span className={`text-sm font-normal ${ctx.getStatusColor(property.status)}`}>{ctx.getStatusLabel(property.status)}</span>;
        default:
            return null;
    }
}

// Classe de texto extra por coluna na visão MESTRE (lista de edifícios/imóveis
// avulsos, sem edifício selecionado) — igual à que estava direto no <td> antes;
// 'cursor-pointer' + onClick (abrir o edifício) são comuns a toda coluna e ficam
// no <td> do map, no <tbody>.
const INVENTORY_MASTER_CELL_TEXT_CLASS: Record<string, string> = {
    name: 'text-sm font-normal text-gray-700 group-hover:text-blue-600 transition-colors whitespace-nowrap',
    address: 'text-sm font-normal text-gray-400',
    price: 'text-sm font-medium text-gray-800 whitespace-nowrap',
    price_per_m2: 'text-sm font-normal text-gray-400 text-center whitespace-nowrap',
};

// Conteúdo de cada <td> da tabela de Unidades na visão MESTRE — mesmo padrão de
// renderInventoryDetailCell, para a outra "forma" da mesma tabela (master view
// só mostra name/address/price/price_per_m2/status — as demais colunas são
// context: 'building' e já saem filtradas por `isVisible` antes de chegar aqui).
function renderInventoryMasterCell(
    key: string,
    property: Property,
    ctx: {
        getStatusColor: (s: PropertyStatus) => string;
        getStatusLabel: (s: PropertyStatus) => string;
        empreendimentoByProperty: Record<string, { id: string; name: string; towerName?: string }>;
    },
): React.ReactNode {
    switch (key) {
        case 'name':
            return property.name;
        case 'empreendimento':
            return <EmpreendimentoCell value={ctx.empreendimentoByProperty[property.id]} />;
        case 'address':
            return property.address || 'Resumo do Empreendimento';
        case 'price':
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(property.price || 0);
        case 'price_per_m2':
            return '---';
        case 'status':
            return <span className={`text-sm font-normal ${ctx.getStatusColor(property.status)}`}>{ctx.getStatusLabel(property.status)}</span>;
        default:
            return null;
    }
}

// Classe extra do <td> por coluna na tabela de Negociações — varia por linha nas
// colunas 'variance'/'variance_pct' (cor conforme sinal), por isso é função, não
// mapa estático.
function getDealCellClass(key: string, variancia: number): string {
    switch (key) {
        case 'code': return 'text-sm font-normal text-gray-600 whitespace-nowrap';
        case 'client': return 'text-sm font-normal text-gray-600';
        case 'block': return 'text-sm font-normal text-gray-600 text-center';
        case 'private_area': return 'text-sm font-normal text-gray-600 text-center';
        case 'price_base': return 'text-sm font-medium text-gray-600 text-right';
        case 'price_per_m2_base': return 'text-sm font-medium text-gray-600 text-right';
        case 'floor': return 'text-sm font-normal text-gray-600 text-center';
        case 'sale_value': return 'text-sm font-medium text-gray-800 text-right';
        case 'sale_value_per_m2': return 'text-sm font-medium text-blue-600 text-right';
        case 'variance': return `text-sm font-medium text-right ${variancia >= 0 ? 'text-emerald-600' : 'text-red-500'}`;
        case 'variance_pct': return `text-sm font-normal text-center ${variancia >= 0 ? 'text-emerald-600' : 'text-red-500'}`;
        default: return '';
    }
}

// Conteúdo de cada <td> da tabela de Negociações — extraído para função pura
// (padrão renderClientCell/renderBoletoCell). Os valores derivados (área e
// preço base somados, variação) já vêm calculados por linha no .map do
// <tbody> — a função só formata/exibe.
function renderDealCell(
    key: string,
    deal: PropertyDeal,
    ctx: {
        property?: Property;
        client?: Client;
        unitLabel: { name: string; extra: number; all: string };
        m2: number;
        basePrice: number;
        m2Base: number;
        m2Venda: number;
        variancia: number;
        varianciaPct: number;
        empreendimentoByProperty: Record<string, { id: string; name: string; towerName?: string }>;
    },
): React.ReactNode {
    const { property, client, unitLabel, m2, basePrice, m2Base, m2Venda, variancia, varianciaPct } = ctx;
    switch (key) {
        case 'code':
            return deal.code || '—';
        case 'property':
            return (
                <span className="text-sm font-normal text-gray-900 group-hover:text-blue-600 transition-colors">
                    {unitLabel.name || property?.name || '---'}
                    {unitLabel.extra > 0 && (
                        <span className="ml-1.5 text-xs text-gray-400">+{unitLabel.extra}</span>
                    )}
                </span>
            );
        case 'client':
            return client?.name || 'Não vinculado';
        case 'empreendimento':
            return <EmpreendimentoCell value={deal.property_id ? ctx.empreendimentoByProperty[deal.property_id] : undefined} />;
        case 'block':
            return property?.block || '-';
        case 'private_area':
            return `${m2}m²`;
        case 'price_base':
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(basePrice);
        case 'price_per_m2_base':
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(m2Base);
        case 'floor':
            return property?.floor ? `${property.floor}º` : 'T';
        case 'sale_value':
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(deal.value);
        case 'sale_value_per_m2':
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(m2Venda);
        case 'variance':
            return `${variancia >= 0 ? '+' : ''}${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(variancia)}`;
        case 'variance_pct':
            return `${Math.abs(varianciaPct).toFixed(1)}%`;
        case 'status':
            return (
                <span className={`text-sm font-normal ${deal.status === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {deal.status === 'COMPLETED' ? 'Concluído' : 'Pendente'}
                </span>
            );
        default:
            return null;
    }
}

// Conteúdo de cada <td> da tabela de Corretores — mesmo padrão.
function renderBrokerCell(key: string, broker: BrokerProfile): React.ReactNode {
    switch (key) {
        case 'name':
            return (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 font-semibold text-sm shrink-0">
                        {broker.name.charAt(0)}
                    </div>
                    <span className="text-sm font-normal text-gray-900">{broker.name}</span>
                </div>
            );
        case 'status':
            return (
                <span className={`text-sm font-normal ${broker.is_active ? 'text-emerald-700' : 'text-gray-400'}`}>
                    {broker.is_active ? 'Ativo' : 'Inativo'}
                </span>
            );
        case 'contact':
            return (
                <div className="space-y-1">
                    <div className="flex items-center text-sm font-normal text-gray-600">
                        <Mail className="w-3.5 h-3.5 mr-1.5 text-blue-500 shrink-0" />
                        {broker.email}
                    </div>
                    {broker.phone && (
                        <div className="flex items-center text-sm font-normal text-gray-600">
                            <Phone className="w-3.5 h-3.5 mr-1.5 text-gray-400 shrink-0" />
                            {broker.phone}
                        </div>
                    )}
                </div>
            );
        case 'agency':
            return <span className="text-sm font-normal text-blue-600">{broker.agency_name || 'Autônomo'}</span>;
        case 'commission':
            return <span className="text-sm font-medium text-gray-800">{broker.commission_rate}%</span>;
        case 'creci':
            return <span className="text-sm font-normal text-gray-600">{broker.creci || '-'}</span>;
        default:
            return null;
    }
}

const getPositionWeight = (p?: { position_type?: string | null }) =>
    p?.position_type === 'FRONT' ? 1.03 : p?.position_type === 'BACK' ? 0.97 : 1.00;

const getSunWeight = (p?: { sun_orientation?: string | null }) =>
    p?.sun_orientation === 'NORTH' ? 1.02 : p?.sun_orientation === 'EAST' ? 1.01 : p?.sun_orientation === 'WEST' ? 0.99 : p?.sun_orientation === 'SOUTH' ? 0.98 : 1.00;

const SalesModule: React.FC<SalesModuleProps> = ({ organizationId }) => {
    const [activeTab, setActiveTab] = useState<'inventory' | 'deals' | 'dashboard' | 'simulation' | 'price-tables' | 'sales-plans' | 'brokers' | 'contracts'>(
        (localStorage.getItem('sales_active_tab') as 'inventory' | 'deals' | 'dashboard' | 'simulation' | 'price-tables' | 'sales-plans' | 'brokers' | 'contracts') || 'inventory'
    );
    const [properties, setProperties] = useState<Property[]>([]);
    // Imóvel → empreendimento. O vínculo não é FK na tabela do Comercial: vem de
    // `empreendimento_units.commercial_property_id` (unidade) ou de
    // `empreendimentos.commercial_building_id` (edifício-pai).
    const [empreendimentoByProperty, setEmpreendimentoByProperty] = useState<Record<string, { id: string; name: string; towerName?: string }>>({});
    const [brokers, setBrokers] = useState<BrokerProfile[]>([]);
    const [brokerAccess, setBrokerAccess] = useState<Record<string, boolean>>({});

    const [deals, setDeals] = useState<PropertyDeal[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    // F2: filtros sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('salesModuleFilters:search', '');
    // Busca própria da aba Negociações — a de cima recorta Unidades/Corretores,
    // e misturar as duas faria um filtro invisível saltar de aba pra aba.
    const [dealsSearch, setDealsSearch] = usePersistedState('salesModuleFilters:dealsSearch', '');
    const [viewMode, setViewMode] = usePersistedState<'grid' | 'list' | 'tower'>('salesModuleFilters:viewMode', 'list');
    const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
    const [lastCheckedIndex, setLastCheckedIndex] = useState<number | null>(null);
    const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(() => {
        const saved = localStorage.getItem('sales_selected_building_id');
        return (saved && saved !== 'undefined') ? saved : null;
    });
    // ui_ux_guia_unificado.md §3 — colunas + ordenação persistidas via useTableColumns.
    const inventoryColumns = useTableColumns(INVENTORY_COLUMNS, 'salesModuleInventoryColumns');
    const dealsColumns = useTableColumns(DEALS_COLUMNS, 'salesModuleDealsColumns');
    const brokersColumns = useTableColumns(BROKERS_COLUMNS, 'salesModuleBrokersColumns');
    const inventoryResize = useResizableColumns(DEFAULT_INVENTORY_COL_WIDTHS, 'salesModuleInventoryColWidths');
    const dealsResize = useResizableColumns(DEFAULT_DEALS_COL_WIDTHS, 'salesModuleDealsColWidths');


    // Modals Control
    const [isPropertyModalOpen, setIsPropertyModalOpen] = useState(false);
    const [isDealModalOpen, setIsDealModalOpen] = useState(false);
    const [editingProperty, setEditingProperty] = useState<Property | undefined>(undefined);
    const [editingDeal, setEditingDeal] = useState<PropertyDeal | undefined>(undefined);
    const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
    const [isBrokerModalOpen, setIsBrokerModalOpen] = useState(false);
    const [editingBroker, setEditingBroker] = useState<BrokerProfile | undefined>(undefined);

    // Contratos de Venda de Ativos (domain='VENDAS') — isolado dos demais domínios.
    const [isContractModalOpen, setIsContractModalOpen] = useState(false);
    const [editingContract, setEditingContract] = useState<any | undefined>(undefined);
    const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
    const [contractsVersion, setContractsVersion] = useState(0);


    // Simulation States
    const [simMonthlySales, setSimMonthlySales] = useState<number>(2);
    const [simPriceAdjust, setSimPriceAdjust] = useState<number>(0);

    const confirm = useConfirm();
    const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
    const [bulkPriceValue, setBulkPriceValue] = useState('');

    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const loadData = async () => {
        console.log('[Commercial] Loading data for organization:', organizationId);
        setLoading(true);
        try {
            // `projectService.listProjects` saiu daqui: o resultado alimentava um
            // `projects` que NENHUM ponto da tela lia — estado morto e uma consulta
            // por carregamento. Encontrado ao revisar as chamadas na virada da
            // assinatura de listProjects (CLAUDE.md regra #3).
            const [propsData, dealsData, clientsData, empMap] = await Promise.all([
                commercialService.listProperties(organizationId),
                commercialService.listDeals(),
                clientService.listClients(),
                // Eixo de VENDA (commercial_property_id) — independente do de locação.
                empreendimentoService.mapPropertiesToEmpreendimentos(organizationId, 'SALE').catch(() => ({})),
            ]);
            setProperties(propsData.filter(p => !p.purpose || p.purpose === 'SALE' || p.purpose === 'BOTH'));
            setDeals(dealsData.filter(d => d.type === 'SALE'));
            setClients(clientsData);
            setEmpreendimentoByProperty(empMap);

        } catch (err) {
            console.error('[Commercial] Error loading data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!selectedBuildingId) {
            if (activeTab !== 'inventory') setActiveTab('inventory');
            if (viewMode === 'tower') setViewMode('list');
        }
    }, [selectedBuildingId, activeTab, viewMode]);

    useEffect(() => {
        loadData();
    }, [organizationId]);

    // Habilitação de corretor por empreendimento (Portal do Corretor) — carrega
    // só quando a aba Corretores está aberta num prédio específico.
    useEffect(() => {
        if (activeTab !== 'brokers' || !selectedBuildingId) return;
        brokerService.listPropertyAccess(selectedBuildingId)
            .then(setBrokerAccess)
            .catch(err => console.error('[Commercial] Error loading broker access:', err));
    }, [activeTab, selectedBuildingId]);

    const handleToggleBrokerAccess = async (brokerId: string, enabled: boolean) => {
        if (!selectedBuildingId) return;
        setBrokerAccess(prev => ({ ...prev, [brokerId]: enabled }));
        try {
            await brokerService.setPropertyAccess(brokerId, selectedBuildingId, enabled);
        } catch (err) {
            console.error('[Commercial] Error toggling broker access:', err);
            setBrokerAccess(prev => ({ ...prev, [brokerId]: !enabled }));
        }
    };

    // Persistência de estado da aba e edifício selecionado
    useEffect(() => {
        if (activeTab) localStorage.setItem('sales_active_tab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        if (selectedBuildingId) {
            localStorage.setItem('sales_selected_building_id', selectedBuildingId);
        } else {
            localStorage.removeItem('sales_selected_building_id');
        }
    }, [selectedBuildingId]);


    const handleSaveProperty = async (data: PropertyFormData) => {
        if (!effectiveOrganizationId && !data.organization_id) {
            notify('Erro: Nenhuma organização ativa selecionada. Por favor, selecione uma empresa no menu lateral.', 'error');
            return;
        }

        try {
            const { _bulkConfig, ...propertyData } = data;

            // Organização em cascata: usa effectiveOrganizationId (que prioriza a org
            // do edifício aberto sobre o seletor do topo). Se o imóvel for uma unidade
            // (tem parent_id), o commercialService.saveProperty ainda sobrescreve com a
            // org do prédio-pai — esta linha só é autoritativa para edifício/avulso.
            const propertyToSave: Partial<Property> & { organization_id?: string } = {
                ...propertyData,
                organization_id: propertyData.organization_id || effectiveOrganizationId
            };

            if (propertyToSave.type === 'BUILDING' && _bulkConfig && _bulkConfig.matrix) {
                propertyToSave.specs = {
                    ...(propertyToSave.specs || {}),
                    matrixConfig: _bulkConfig.matrix,
                    connectedTowers: _bulkConfig.connectedTowers,
                    connectionDirection: _bulkConfig.connectionDirection
                };
            }

            console.log('[Commercial] Saving property with organization:', propertyToSave.organization_id);
            const savedProperty = await commercialService.saveProperty(propertyToSave);

            // Se for Edifício e houver configuração de unidades em lote via Matriz
            if (propertyToSave.type === 'BUILDING' && _bulkConfig && _bulkConfig.matrix) {
                // 1. Buscar unidades existentes para preservar IDs e status (especialmente VENDIDO/ALUGADO)
                let existingUnits: Property[] = [];
                if (savedProperty.id) {
                    existingUnits = await commercialService.listProperties(undefined, undefined); // Filtrar depois ou adicionar método no service
                    existingUnits = existingUnits.filter(u => u.parent_id === savedProperty.id);
                }

                const units: Partial<Property>[] = [];
                let totalCount = 0;
                const usedIds: string[] = [];
                
                _bulkConfig.matrix.forEach((tower: TowerMatrixConfig) => {
                    const floors = tower.floors || 0;
                    const gridCells = tower.gridCells || [];

                    for (let f = 1; f <= floors; f++) {
                        gridCells.forEach((cell: GridCellConfig) => {
                            const numCfg: TowerNumberingConfig = tower.numberingConfig || { type: 'FLOOR_BASED', startNumber: 101, prefix: 'Apto ' };
                            let displayNum = 0;
                            if (numCfg.type === 'FLOOR_BASED') {
                                const unitOffset = numCfg.startNumber % 100;
                                displayNum = (f * 100) + (cell.unitIndex - 1 + unitOffset);
                            } else {
                                displayNum = numCfg.startNumber + ((f - 1) * gridCells.length + (cell.unitIndex - 1));
                            }
                            const finalName = `${numCfg.prefix || ''}${displayNum}${numCfg.suffix || ''}`;
                            
                            // TENTAR ENCONTRAR UNIDADE EXISTENTE PARA PRESERVAR ID E STATUS
                            const existing = existingUnits.find(u => 
                                String(u.name).trim().toUpperCase() === finalName.trim().toUpperCase() && 
                                String(u.block || '').trim().toUpperCase() === String(tower.name).trim().toUpperCase()
                            );

                            if (existing?.id) usedIds.push(existing.id);

                            totalCount++;
                            units.push({
                                id: existing?.id,
                                name: finalName,
                                type: 'APARTMENT',
                                address: propertyToSave.address,
                                area: propertyToSave.area || 0,
                                private_area: propertyToSave.private_area || 0,
                                common_area: propertyToSave.common_area || 0,
                                total_area: propertyToSave.total_area || 0,
                                block: tower.name,
                                floor: f,
                                number: String(displayNum),
                                position_type: (cell.position_type === 'NONE' ? undefined : cell.position_type) || 'LATERAL',
                                sun_orientation: cell.sun_orientation,
                                price: propertyToSave.price || 0,
                                initial_price: propertyToSave.initial_price || propertyToSave.price || 0,
                                status: existing?.status || PropertyStatus.AVAILABLE,
                                organization_id: propertyToSave.organization_id,
                                parent_id: savedProperty.id,
                                specs: { 
                                    ...(propertyToSave.specs || {}),
                                    grid_x: cell.x,
                                    grid_y: cell.y 
                                }
                            });
                        });
                    }
                });

                if (units.length > 0) {
                    await commercialService.savePropertiesBatch(units);

                    // 2. Limpar unidades que NÃO estão mais na matriz e NÃO têm negócios
                    const unusedIds = existingUnits
                        .filter(u => u.id && !usedIds.includes(u.id))
                        .map(u => u.id as string);
                    
                    if (unusedIds.length > 0) {
                        // Tentar deletar. Supabase falhará silenciosamente nos que têm DEALS (se houver restrição)
                        // ou nós podemos filtrar os que têm deals se quisermos ser proativos.
                        for(const id of unusedIds) {
                            try {
                                await commercialService.deleteProperty(id);
                            } catch (e) {
                                console.log(`[SalesModule] Could not delete unused unit ${id} (possibly has deals)`);
                            }
                        }
                    }

                    notify(`Edifício e ${totalCount} unidades processados com sucesso!`);
                } else {
                    notify('Imóvel cadastrado com sucesso! (Nenhuma unidade gerada)');
                }
            } else if (propertyToSave.type === 'BUILDING' && _bulkConfig && (_bulkConfig.count ?? 0) > 0) {
                // Fallback legado
                const units: Partial<Property>[] = [];
                for (let i = 0; i < (_bulkConfig.count ?? 0); i++) {
                    const unitNumber = (_bulkConfig.startingNumber ?? 1) + (i * (_bulkConfig.increment || 1));
                    units.push({
                        name: `${_bulkConfig.prefix}${unitNumber}`,
                        type: 'APARTMENT',
                        address: propertyToSave.address,
                        area: propertyToSave.area || 0,
                        private_area: propertyToSave.private_area || 0,
                        common_area: propertyToSave.common_area || 0,
                        total_area: propertyToSave.total_area || 0,
                        block: propertyToSave.block,
                        floor: propertyToSave.floor,
                        number: String(unitNumber),
                        price: propertyToSave.price || 0,
                        initial_price: propertyToSave.initial_price || propertyToSave.price || 0,
                        status: PropertyStatus.AVAILABLE,
                        organization_id: propertyToSave.organization_id,
                        parent_id: savedProperty.id,
                        specs: { ...(propertyToSave.specs || {}) }
                    });
                }
                await commercialService.savePropertiesBatch(units);
                notify(`Edifício e ${_bulkConfig.count} unidades cadastrados com sucesso!`);
            } else {
                notify(editingProperty ? 'Imóvel atualizado com sucesso!' : 'Imóvel cadastrado com sucesso!');
            }

            setIsPropertyModalOpen(false);
            setEditingProperty(undefined);
            loadData();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('[Commercial] Save Error:', error);
            notify('Erro ao salvar imóvel: ' + error.message, 'error');
        }
    };

    const handleSaveDeal = async (data: Partial<PropertyDeal>) => {
        try {
            const savedDeal = await commercialService.saveDeal(data);

            // Vincular cliente ao imóvel e atualizar status se o negócio for concluído
            // (Esta responsabilidade agora é do commercialService.ts)


            notify('Negociação registrada com sucesso!');
            setIsDealModalOpen(false);
            setEditingDeal(undefined);
            loadData();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            notify('Erro ao registrar negócio: ' + error.message, 'error');
        }
    };

    const handleApplyPricing = async (config: HedonicPricingConfig) => {
        if (!selectedBuildingId) return;

        try {
            setLoading(true);
            // 1. Get all units for this building
            const units = properties.filter(p => p.parent_id === selectedBuildingId);
            
            // 2. Calculate new prices using the service
            const updatedUnits = pricingService.calculatePrices(units, config);

            // 3. Save to database in batch
            await commercialService.savePropertiesBatch(updatedUnits);

            notify(`${updatedUnits.length} unidades precificadas com sucesso usando Inteligência Hedônica!`);
            setIsPricingModalOpen(false);
            loadData();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('[Pricing] Error applying hedonic pricing:', error);
            notify('Erro ao aplicar precificação: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteDeal = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir negociação?',
            message: 'Tem certeza que deseja excluir esta negociação?',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await commercialService.deleteDeal(id);
            notify('Negociação excluída com sucesso!');
            loadData();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            notify(`Impossível excluir: ${error.message}`, 'error');
        }
    };

    const handleDeleteProperty = async (id: string) => {
        // Mede o estrago ANTES de perguntar: excluir um edifício leva junto as
        // unidades filhas e as negociações delas (FK CASCADE em commercial_deals).
        let impact = { children: 0, deals: 0 };
        try {
            impact = await commercialService.getPropertyDeleteImpact(id);
        } catch (err) {
            console.error('[Sales] falha ao medir impacto da exclusão:', err);
        }

        const parts: string[] = [];
        if (impact.children > 0) parts.push(`${impact.children} unidade${impact.children > 1 ? 's' : ''}`);
        if (impact.deals > 0) parts.push(`${impact.deals} negociaç${impact.deals > 1 ? 'ões' : 'ão'}`);

        const ok = await confirm({
            title: impact.children > 0 ? 'Excluir edifício e tudo dentro dele?' : 'Excluir imóvel?',
            message: parts.length
                ? `Isto vai apagar ${parts.join(' e ')} vinculada(s) a este imóvel. Não pode ser desfeito.`
                : 'Tem certeza que deseja excluir este imóvel?',
            variant: 'danger',
            confirmLabel: impact.children > 0 ? 'Excluir tudo' : 'Excluir',
        });
        if (!ok) return;

        try {
            await commercialService.deleteProperty(id, impact.children > 0);
            notify('Imóvel excluído!');
            loadData();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            notify(error.message || 'Erro ao excluir imóvel.', 'error');
        }
    };

    const handleSaveBroker = async (data: Partial<BrokerProfile>) => {
        // Mesma cascata: corretor cadastrado dentro de um edifício fica na org DELE
        // (do Empreendimento), não na do seletor do topo.
        const targetOrgId = currentBuilding?.organization_id || organizationId;

        if (!targetOrgId) {
            notify('Erro: Selecione uma organização ou um empreendimento para cadastrar o corretor.', 'error');
            return;
        }

        try {
            await brokerService.saveProfile({
                ...data,
                organization_id: targetOrgId
            });
            notify(data.id ? 'Corretor atualizado!' : 'Corretor cadastrado!');
            loadData();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            notify('Erro ao salvar corretor: ' + error.message, 'error');
        }
    };

    const handleDeleteBroker = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir corretor?',
            message: 'Tem certeza que deseja excluir este corretor?',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (ok) {
            try {
                await brokerService.deleteProfile(id);
                notify('Corretor excluído!');
                loadData();
            } catch (err: unknown) {
                const error = err instanceof Error ? err : new Error(String(err));
                notify('Erro ao excluir: ' + error.message, 'error');
            }
        }
    };


    // Texto simples colorido — sem pílula/fundo/uppercase (ui_ux_guia_unificado.md §8).
    const getStatusColor = (status: PropertyStatus) => {
        switch (status) {
            case PropertyStatus.AVAILABLE: return 'text-emerald-600';
            case PropertyStatus.SOLD: return 'text-red-600';
            case PropertyStatus.RENTED: return 'text-purple-600';
            case PropertyStatus.RESERVED: return 'text-amber-600';
            case PropertyStatus.EXCHANGED: return 'text-blue-600';
            default: return 'text-gray-600';
        }
    };

    const getStatusLabel = (status: PropertyStatus) => {
        switch (status) {
            case PropertyStatus.AVAILABLE: return 'Disponível';
            case PropertyStatus.SOLD: return 'Vendido';
            case PropertyStatus.RENTED: return 'Alugado';
            case PropertyStatus.RESERVED: return 'Reservado';
            case PropertyStatus.EXCHANGED: return 'Permutado';
            default: return status;
        }
    };

    // ui_ux_guia_unificado.md §6.3 — valor de ordenação de cada coluna de propriedade.
    const getInventorySortValue = (p: Property, key: string): string | number => {
        switch (key) {
            case 'name': return (p.name || '').toLowerCase();
            // Derivado do imóvel (não é campo dele) — ver empreendimentoByProperty.
            case 'empreendimento': return (empreendimentoByProperty[p.id]?.name || '').toLowerCase();
            case 'address': return (p.address || '').toLowerCase();
            case 'block': return (p.block || '').toLowerCase();
            case 'private_area': return p.private_area || 0;
            case 'price': return p.price || 0;
            case 'price_per_m2': return (p.price || 0) / (p.private_area || p.area || 1);
            case 'position_weight': return getPositionWeight(p);
            case 'sun_weight': return getSunWeight(p);
            case 'floor': return p.floor ?? -1;
            case 'status': return getStatusLabel(p.status);
            default: return '';
        }
    };

    const filteredProperties = useMemo(() => {
        let result = properties.filter(p => {
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.address.toLowerCase().includes(searchTerm.toLowerCase());

            if (!selectedBuildingId) {
                // Master View: Show only Buildings or main units (parent_id null)
                // If search term is present, show everything that matches
                if (searchTerm) return matchesSearch;

                // Relaxed rule: if it's a BUILDING, it belongs to master view regardless of parent_id
                return matchesSearch && (p.type === 'BUILDING' || !p.parent_id);
            }

            // Detail View: Show only children of the selected building
            return matchesSearch && String(p.parent_id).toLowerCase() === String(selectedBuildingId).toLowerCase();
        });

        if (inventoryColumns.sortColumn) {
            const { sortColumn, sortDirection } = inventoryColumns;
            result.sort((a, b) => {
                const aValue = getInventorySortValue(a, sortColumn);
                const bValue = getInventorySortValue(b, sortColumn);
                if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [properties, searchTerm, selectedBuildingId, inventoryColumns.sortColumn, inventoryColumns.sortDirection, empreendimentoByProperty]);

    const currentBuilding = selectedBuildingId ? properties.find(p => String(p.id).toLowerCase() === String(selectedBuildingId).toLowerCase()) : null;

    // Organização em cascata: quando há um edifício aberto (currentBuilding), a
    // org DELE é a fonte de verdade — ele veio do Empreendimento, e tudo abaixo
    // (unidades, negociações, corretores) deve ficar na mesma org. O seletor do
    // topo do app é só o fallback quando não há edifício em contexto (ex: inventário
    // geral, ou "Todas as organizações" com organizationId undefined). Antes a
    // precedência era invertida (seletor > edifício), o que deixava criar unidade
    // numa org e edifício em outra — origem da mistura entre as duas "Alpa".
    const effectiveOrganizationId = currentBuilding?.organization_id || organizationId;

    // Corretores seguem a mesma cascata: um fornecedor "Todas as organizações" é
    // materializado em broker_profiles UMA VEZ POR ORGANIZAÇÃO (ver
    // supplierService.syncRealEstateBrokerProfile) — sem escopar pela org do
    // edifício aberto, as linhas de cada organização apareciam juntas na lista
    // (mesmo corretor "triplicado" quando o usuário gerencia 3 organizações).
    useEffect(() => {
        brokerService.listSupplierLinkedProfiles(effectiveOrganizationId)
            .then(setBrokers)
            .catch(err => console.error('[Commercial] Error loading brokers:', err));
    }, [effectiveOrganizationId]);

    // ─────────────────────────────────────────────────────────────────────
    // UNIDADES DA NEGOCIAÇÃO
    // Uma venda pode reunir mais de uma unidade. `deal.value` é a SOMA, então
    // toda métrica de R$/m² tem que dividir pela ÁREA SOMADA — usar só a área
    // da unidade principal infla o indicador proporcionalmente ao nº de
    // unidades. Contratos de 1 unidade caem no mesmo caminho, sem mudança.
    // ─────────────────────────────────────────────────────────────────────
    const unitPropertiesOf = useCallback((deal: PropertyDeal): Property[] => {
        const ids = (deal.units && deal.units.length > 0)
            ? deal.units.map(u => u.property_id)
            : (deal.property_id ? [deal.property_id] : []);
        return ids.map(id => properties.find(p => p.id === id)).filter(Boolean) as Property[];
    }, [properties]);

    /** Área privativa somada das unidades (nunca 0, para não dividir por zero). */
    const dealAreaOf = useCallback((deal: PropertyDeal): number => {
        const total = unitPropertiesOf(deal)
            .reduce((s, p) => s + (p.private_area || p.area || 0), 0);
        return total > 0 ? total : 1;
    }, [unitPropertiesOf]);

    /** Preço de tabela somado das unidades — base da variação por m². */
    const dealBasePriceOf = useCallback((deal: PropertyDeal): number =>
        unitPropertiesOf(deal).reduce((s, p) => s + (p.price || 0), 0), [unitPropertiesOf]);

    /** Rótulo "Apto 101 +2" e o title com todas as unidades. */
    const dealUnitLabelOf = useCallback((deal: PropertyDeal) => {
        const units = unitPropertiesOf(deal);
        const primary = properties.find(p => p.id === deal.property_id) || units[0];
        return {
            name: primary?.name || '',
            extra: Math.max(0, units.length - 1),
            all: units.map(u => u.name).filter(Boolean).join(' + '),
        };
    }, [unitPropertiesOf, properties]);

    // Um contrato aparece no edifício se QUALQUER uma de suas unidades pertence
    // a ele — não só a principal.
    const buildingDeals = selectedBuildingId ? deals.filter(deal => {
        const units = unitPropertiesOf(deal);
        if (units.length === 0) return false;
        return units.some(property => {
            const isChild = String(property.parent_id).toLowerCase() === String(selectedBuildingId).toLowerCase();
            const isSelf = String(property.id).toLowerCase() === String(selectedBuildingId).toLowerCase();
            return isChild || isSelf;
        });
    }) : deals;

    // Busca da toolbar acoplada (§5.2) — código, unidade(s) e cliente, que são
    // as três formas de o usuário se referir a uma negociação.
    const searchedBuildingDeals = useMemo(() => {
        const q = dealsSearch.trim().toLowerCase();
        if (!q) return buildingDeals;
        return buildingDeals.filter(deal => {
            const client = clients.find(c => c.id === deal.client_id);
            const units = unitPropertiesOf(deal).map(u => u.name || '').join(' ');
            return [deal.code || '', units, client?.name || '']
                .some(v => v.toLowerCase().includes(q));
        });
    }, [buildingDeals, clients, dealsSearch, unitPropertiesOf]);

    // ui_ux_guia_unificado.md §6.3 — valor de ordenação de cada coluna de negociação.
    const getDealSortValue = (deal: PropertyDeal, key: string): string | number => {
        const property = properties.find(p => p.id === deal.property_id);
        const m2 = dealAreaOf(deal);
        const basePrice = dealBasePriceOf(deal);
        switch (key) {
            case 'code': return deal.code || '';
            case 'property': return (property?.name || '').toLowerCase();
            case 'client': return (clients.find(c => c.id === deal.client_id)?.name || '').toLowerCase();
            // Derivado do imóvel do negócio — ver empreendimentoByProperty.
            case 'empreendimento': return (deal.property_id ? (empreendimentoByProperty[deal.property_id]?.name || '') : '').toLowerCase();
            case 'block': return (property?.block || '').toLowerCase();
            case 'private_area': return dealAreaOf(deal);
            case 'price_base': return basePrice;
            case 'price_per_m2_base': return basePrice / m2;
            case 'floor': return property?.floor ?? -1;
            case 'sale_value': return deal.value || 0;
            case 'sale_value_per_m2': return (deal.value || 0) / m2;
            case 'variance': return (deal.value || 0) / m2 - basePrice / m2;
            case 'variance_pct': {
                const base = basePrice / m2;
                const venda = (deal.value || 0) / m2;
                return base > 0 ? ((venda - base) / base) * 100 : 0;
            }
            case 'status': return deal.status || '';
            default: return '';
        }
    };

    const sortedBuildingDeals = useMemo(() => {
        if (!dealsColumns.sortColumn) return searchedBuildingDeals;
        const { sortColumn, sortDirection } = dealsColumns;
        return [...searchedBuildingDeals].sort((a, b) => {
            const aValue = getDealSortValue(a, sortColumn);
            const bValue = getDealSortValue(b, sortColumn);
            if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [searchedBuildingDeals, properties, clients, dealsColumns.sortColumn, dealsColumns.sortDirection, empreendimentoByProperty]);

    const stats = useMemo(() => {
        // Filtrar unidades vendáveis (excluir permutas da base estratégica)
        const vendaveis = filteredProperties.filter(p => p.status !== PropertyStatus.EXCHANGED);
        const soldUnitsCount = vendaveis.filter(p => p.status === PropertyStatus.SOLD).length;
        const totalVendavel = vendaveis.length;
        
        const vgvRealizado = buildingDeals
            .filter(d => d.type === 'SALE' && d.status === 'COMPLETED')
            .reduce((acc, d) => acc + (Number(d.value) || 0), 0);
            
        const vgvRemanescente = vendaveis
            .filter(p => p.status === PropertyStatus.AVAILABLE)
            .reduce((acc, p) => acc + (Number(p.price || p.initial_price) || 0), 0);
            
        const sellThrough = totalVendavel > 0 ? (soldUnitsCount / totalVendavel) * 100 : 0;
        const ticketMedio = soldUnitsCount > 0 ? vgvRealizado / soldUnitsCount : 0;

        return {
            totalVendavel,
            soldUnitsCount,
            vgvRealizado,
            vgvRemanescente,
            sellThrough: sellThrough.toFixed(1),
            ticketMedio
        };
    }, [filteredProperties, buildingDeals]);

    const handleBulkUpdate = async (updates: Partial<Property>) => {
        if (selectedProperties.length === 0) return;

        try {
            setLoading(true);
            await commercialService.updatePropertiesBatch(selectedProperties, updates);
            notify(`${selectedProperties.length} imóveis atualizados com sucesso!`);
            setSelectedProperties([]);
            loadData();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            notify('Erro na atualização em massa: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectProperty = (propertyId: string) => {
        setSelectedProperties(prev =>
            prev.includes(propertyId) ? prev.filter(id => id !== propertyId) : [...prev, propertyId]
        );
    };

    // ui_ux_guia_unificado.md §10.1 — Shift+clique seleciona o intervalo entre a última linha marcada e a atual.
    const handleRowCheck = (propertyId: string, index: number, shiftKey: boolean) => {
        if (shiftKey && lastCheckedIndex !== null) {
            const [start, end] = lastCheckedIndex < index ? [lastCheckedIndex, index] : [index, lastCheckedIndex];
            const rangeIds = filteredProperties.slice(start, end + 1).map(p => p.id);
            setSelectedProperties(prev => [...new Set([...prev, ...rangeIds])]);
        } else {
            handleSelectProperty(propertyId);
            setLastCheckedIndex(index);
        }
    };

    const handleSelectAllInBuilding = (buildingId: string, unitIds: string[]) => {
        const allSelected = unitIds.every(id => selectedProperties.includes(id));
        if (allSelected) {
            setSelectedProperties(prev => prev.filter(id => !unitIds.includes(id)));
        } else {
            setSelectedProperties(prev => [...new Set([...prev, ...unitIds])]);
        }
    };

    const PropertyCard: React.FC<{
        property: Property,
        onEdit: () => void,
        onDelete: () => void,
        onRegisterDeal: () => void,
        getStatusColor: (s: PropertyStatus) => string,
        getStatusLabel: (s: PropertyStatus) => string,
        selected?: boolean,
        onSelect?: () => void,
        compact?: boolean
    }> = ({ property, onEdit, onDelete, onRegisterDeal, getStatusColor, getStatusLabel, selected, onSelect, compact }) => (
        <div 
            onClick={() => {
                if (property.type === 'BUILDING' && !selectedBuildingId) {
                    setSelectedBuildingId(property.id);
                } else {
                    onRegisterDeal();
                }
            }}
            className={`bg-white border rounded-[10px] overflow-hidden group hover:shadow-lg transition-all duration-300 cursor-pointer ${compact ? 'scale-95 origin-top' : ''} ${selected ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-gray-200'}`}
        >
            <div className="aspect-[16/11] bg-gray-100 relative overflow-hidden">
                <div className="absolute top-6 left-6 z-10">
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => { e.stopPropagation(); onSelect?.(); }}
                        className="w-6 h-6 rounded-lg border-white/20 bg-white/10 backdrop-blur-md text-blue-600 focus:ring-blue-500 cursor-pointer shadow-xl transition-all accent-blue-600"
                    />
                </div>
                <div className="absolute top-6 right-6 z-10 flex flex-col gap-2 scale-90 origin-top-right">
                    <span className={`text-sm font-normal drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] ${getStatusColor(property.status)}`}>
                        {getStatusLabel(property.status)}
                    </span>
                    <div className="flex gap-2">
                        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-2 bg-white/90 backdrop-blur-md rounded-[6px] text-gray-600 hover:text-blue-600 shadow-lg transition-all"><Edit className="w-4 h-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-2 bg-white/90 backdrop-blur-md rounded-[6px] text-gray-600 hover:text-red-500 shadow-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                </div>
                {property.client_id && (
                    <div className="absolute top-24 left-6 z-10 animate-in fade-in zoom-in duration-500">
                        <div className="px-4 py-2 bg-white/90 backdrop-blur-md rounded-[10px] border border-white shadow-xl flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-[9px] font-black text-blue-900 uppercase tracking-widest leading-none">
                                {clients.find(c => c.id === property.client_id)?.name || 'Proprietário'}
                            </span>
                        </div>
                    </div>
                )}
                {property.images?.[0] ? (
                    <img src={property.images[0]} alt={property.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" />
                ) : <div className="w-full h-full flex items-center justify-center"><Home className="w-16 h-16 text-gray-200" /></div>}
                <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white">
                    <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-black text-blue-200 uppercase tracking-widest leading-none">
                            {property.type === 'BUILDING' ? (property.address.split('-')[1]?.trim() || property.address) : (properties.find(p => p.id === property.parent_id)?.name || 'Unidade Independente')}
                        </span>
                    </div>
                    <h3 className="text-xl font-black leading-tight mb-2 group-hover:text-blue-400 transition-colors uppercase">{property.name}</h3>
                    <div className="flex items-center gap-4 text-gray-300 font-bold text-xs uppercase tracking-widest">
                        <span>{property.type === 'BUILDING' ? 'Edifício' : property.type}</span>
                        <span>• {property.area} m²</span>
                    </div>
                </div>
            </div>
            <div className="p-8">
                {empreendimentoByProperty[property.id] && (
                    /* Tipografia conforme §21/§7 (sentence case, peso normal) — o resto
                       deste card é legado "gritado" e está pendente de migração; código novo
                       não reproduz o estilo deprecado. */
                    <div className="flex flex-col mb-4">
                        <span className="text-xs font-semibold text-slate-500 mb-1">Empreendimento</span>
                        <EmpreendimentoCell value={empreendimentoByProperty[property.id]} />
                    </div>
                )}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Preço Sugerido</span>
                        <span className="text-2xl font-black text-gray-900 font-mono tracking-tighter">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(property.price || 0)}
                        </span>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-[10px] group-hover:bg-blue-50 transition-colors">
                        <TrendingUp className="w-5 h-5 text-gray-400 group-hover:text-blue-500" />
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-6">
                    <div className="flex-1 bg-gray-50 p-3 rounded-[10px] flex flex-col items-center justify-center border border-gray-100">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Valor m²</span>
                        <span className="text-xs font-black text-gray-700">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format((property.price || 0) / (property.private_area || property.area || 1))}
                        </span>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-[10px] flex flex-col items-center justify-center border border-blue-100">
                        <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest mb-1">Posição</span>
                        <span className="text-xs font-black text-blue-700">
                            {property.position_type === 'FRONT' ? '1.03x' : property.position_type === 'BACK' ? '0.97x' : '1.00x'}
                        </span>
                    </div>
                    <div className="bg-amber-50 p-3 rounded-[10px] flex flex-col items-center justify-center border border-amber-100">
                        <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest mb-1">Sol</span>
                        <span className="text-xs font-black text-amber-700">
                            {property.sun_orientation === 'NORTH' ? '1.02x' : property.sun_orientation === 'EAST' ? '1.01x' : property.sun_orientation === 'WEST' ? '0.99x' : property.sun_orientation === 'SOUTH' ? '0.98x' : '1.00x'}
                        </span>
                    </div>
                </div>

                {/* CTA — variante compacta (§17): font-medium, sentence case, sem shadow-xl */}
                <button
                    onClick={onRegisterDeal}
                    className="w-full h-9 flex items-center justify-center bg-gray-900 text-white rounded-[6px] font-medium text-[13px] hover:bg-blue-600 transition-all active:scale-95"
                >
                    Registrar negócio
                </button>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* 1. Título — §1 (h1 solto; os controles que estavam nesta linha viram
                a toolbar de botões da §4, abaixo do KPI). */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Venda de Ativos</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Controle de inventário de vendas, negociações e performance imobiliária.</p>
            </div>

            {/* Pricing Modal */}
            <PricingIntelligenceModal
                isOpen={isPricingModalOpen}
                onClose={() => setIsPricingModalOpen(false)}
                onApply={handleApplyPricing}
                buildingName={currentBuilding?.name || ''}
            />

            {/* 2. KPI cards — só existem na aba "Unidades do edifício" (inventory).
                Precisam vir ANTES das abas/botões (§1); antes ficavam depois, porque
                o header (agora §4) e as abas internas (§3) eram renderizados no topo
                incondicionalmente. Nas demais abas (deals/dashboard/...), que não têm
                KPI, a tela cai direto de título para abas/botões — ainda válido, §2
                é "só se houver". */}
            {activeTab === 'inventory' && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <KpiCard shadow={false} size="sm" label="Estoque (und)" value={`${stats.soldUnitsCount} / ${stats.totalVendavel}`} icon={<Building2 className="w-4 h-4" />} color="blue" />
                    <KpiCard shadow={false} size="sm" label="VGV Vendido" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.vgvRealizado)} icon={<DollarSign className="w-4 h-4" />} color="emerald" />
                    <KpiCard shadow={false} size="sm" label="Sell-Through" value={`${stats.sellThrough}%`} icon={<Percent className="w-4 h-4" />} color="purple" />
                    <KpiCard shadow={false} size="sm" label="VGV Remanescente" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.vgvRemanescente)} icon={<Target className="w-4 h-4" />} color="amber" />
                    <KpiCard shadow={false} size="sm" label="Ticket Médio" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.ticketMedio)} icon={<TrendingUp className="w-4 h-4" />} color="cyan" />
                </div>
            )}

            {/* 3. Toolbar de abas (§3) — navegação entre as vistas de UM empreendimento
                selecionado. Trilho bg-gray-50 + aba ativa bg-white text-blue-600
                shadow-sm (antes: bg-blue-600 text-white, sem trilho — cor de toggle de
                ação, não de navegação). Vem ANTES da toolbar de botões (§1: KPI → abas
                → botões) — as duas estavam invertidas numa primeira passada. */}
            {selectedBuildingId && (
                <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    <button
                        onClick={() => setActiveTab('inventory')}
                        className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'inventory' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        <HomeIcon className="w-3.5 h-3.5" />
                        Unidades do edifício
                    </button>
                    <button
                        onClick={() => setActiveTab('deals')}
                        className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'deals' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        <Tag className="w-3.5 h-3.5" />
                        Negociações
                    </button>
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        <TrendingUp className="w-3.5 h-3.5" />
                        Resultados
                    </button>
                    <button
                        onClick={() => setActiveTab('simulation')}
                        className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'simulation' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        <Activity className="w-3.5 h-3.5" />
                        Simulação
                    </button>
                    <button
                        onClick={() => setActiveTab('price-tables')}
                        className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'price-tables' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        <DollarSign className="w-3.5 h-3.5" />
                        Tabela de preços
                    </button>
                    <button
                        onClick={() => setActiveTab('sales-plans')}
                        className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'sales-plans' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        <Percent className="w-3.5 h-3.5" />
                        Planos de vendas
                    </button>
                    <button
                        onClick={() => setActiveTab('brokers')}
                        className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'brokers' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        <User className="w-3.5 h-3.5" />
                        Corretores
                    </button>
                    <button
                        onClick={() => setActiveTab('contracts')}
                        className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'contracts' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                        <FileText className="w-3.5 h-3.5" />
                        Contratos
                    </button>
                </div>
                </div>
            )}

            {/* 4. Toolbar de botões (§4) — escopo (Ver todos empreendimentos) e ações
                (Inteligência de preços/Relatórios) à esquerda, ação primária (Novo
                imóvel) à direita. Antes ficavam espremidos na linha do h1. */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-2">
                    {selectedBuildingId && (
                        <button
                            onClick={() => {
                                setSelectedBuildingId(null);
                                if (viewMode === 'tower') setViewMode('grid');
                            }}
                            className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition-all"
                        >
                            <ChevronDown className="w-4 h-4 rotate-90" />
                            Ver todos empreendimentos
                        </button>
                    )}
                    {selectedBuildingId && (
                        <button
                            onClick={() => setIsPricingModalOpen(true)}
                            className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all"
                        >
                            <BrainCircuit className="w-4 h-4" />
                            Inteligência de preços
                        </button>
                    )}
                    <button className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition-all">
                        <Maximize2 className="w-4 h-4" />
                        Relatórios
                    </button>
                    {selectedBuildingId && (
                        <span className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] bg-blue-50 text-blue-700 text-sm font-medium">
                            <Building2 className="w-4 h-4" />
                            Visualizando: {currentBuilding?.name}
                        </span>
                    )}
                </div>

                <button
                    onClick={() => {
                        setEditingProperty(undefined);
                        setIsPropertyModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    Novo imóvel
                </button>
            </div>

            {/* 5. Conteúdo da aba ativa */}
            {activeTab === 'inventory' && (
                <div className="space-y-6">
                    {/* KPI já renderizado acima (item 2 da anatomia, §1) — não repetir aqui. */}

                    {/* Toolbar acoplada à tabela (§5.2, padrão OpuraDocsModule/GED) — toolbar e
                        conteúdo dividem um único card (border/rounded/shadow só no container
                        pai); a costura visível entre os dois é o border-b da toolbar. */}
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center p-2 border-b border-gray-100 bg-white">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por imóvel, endereço ou referência..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition-all whitespace-nowrap">
                            <Filter className="w-4 h-4" />
                            Mais filtros
                        </button>
                        <button onClick={loadData} className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shrink-0" title="Atualizar">
                            <RefreshCw className="w-4 h-4" />
                        </button>

                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            {viewMode === 'list' && (
                                <>
                                    <ColumnConfigButton
                                        columns={INVENTORY_COLUMNS.filter(c => c.key !== 'actions' && (c.context === 'all' || selectedBuildingId))}
                                        visibleColumns={inventoryColumns.visibleColumns}
                                        showColumnConfig={inventoryColumns.showColumnConfig}
                                        onToggleShow={() => inventoryColumns.setShowColumnConfig(!inventoryColumns.showColumnConfig)}
                                        onToggleColumn={inventoryColumns.toggleColumn}
                                        onReset={inventoryColumns.resetColumns}
                                    />
                                    {/* Autofit sob comando explícito — nunca automático (§6.1.2).
                                        Duplo clique no divisor segue "restaurar padrão". */}
                                    <button
                                        onClick={() => inventoryResize.autoFit()}
                                        className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                        title="Ajustar largura das colunas ao conteúdo"
                                    >
                                        <MoveHorizontal className="w-4 h-4" />
                                    </button>
                                    <div className="w-px h-5 bg-gray-200 mx-0.5"></div>
                                </>
                            )}
                            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`} title="Grade"><LayoutGrid className="w-4 h-4" /></button>
                            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`} title="Lista"><List className="w-4 h-4" /></button>
                            {selectedBuildingId && (
                                <button onClick={() => setViewMode('tower')} className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'tower' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`} title="Torres"><Building2 className="w-4 h-4" /></button>
                            )}
                        </div>
                    </div>

                    {/* Property Display — sem bg/border/rounded próprios: já está dentro do
                        card acoplado toolbar+conteúdo (ver abertura acima) */}
                    {loading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Consultando inventário...</p>
                        </div>
                    ) : filteredProperties.length > 0 ? (
                        <div className="flex flex-col gap-6 p-4">
                            {viewMode === 'grid' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                    {selectedBuildingId ? (
                                         // DETAIL VIEW MODE
                                         filteredProperties.length > 0 ? (
                                             filteredProperties.map((property) => (
                                                <div key={property.id}>
                                                    <PropertyCard
                                                        property={property}
                                                        selected={selectedProperties.includes(property.id)}
                                                        onSelect={() => handleSelectProperty(property.id)}
                                                        onEdit={() => { setEditingProperty(property); setIsPropertyModalOpen(true); }}
                                                        onDelete={() => handleDeleteProperty(property.id)}
                                                        onRegisterDeal={() => {
                                                            setEditingDeal({ id: '', property_id: property.id, client_id: '', type: 'SALE', value: property.price, date: new Date().toISOString().split('T')[0], status: 'PENDING', units: [{ property_id: property.id, value: property.price, is_primary: true }] });
                                                            setIsDealModalOpen(true);
                                                        }}
                                                        getStatusColor={getStatusColor}
                                                        getStatusLabel={getStatusLabel}
                                                    />
                                                </div>
                                             ))
                                         ) : (
                                              <div className="col-span-full py-16 text-center">
                                                  <p className="text-sm text-gray-500">Nenhuma unidade encontrada para este edifício.</p>
                                              </div>
                                         )
                                    ) : (
                                         // MASTER VIEW MODE
                                        filteredProperties.map((property) => {
                                            return (
                                                <div key={property.id} onClick={() => setSelectedBuildingId(property.id)} className="cursor-pointer transition-transform hover:-translate-y-1">
                                                    <PropertyCard
                                                        property={property}
                                                        selected={selectedProperties.includes(property.id)}
                                                        onSelect={() => handleSelectProperty(property.id)}
                                                        onEdit={() => { setEditingProperty(property); setIsPropertyModalOpen(true); }}
                                                        onDelete={() => handleDeleteProperty(property.id)}
                                                        onRegisterDeal={() => {
                                                            setEditingDeal({ id: '', property_id: property.id, client_id: '', type: 'SALE', value: property.price, date: new Date().toISOString().split('T')[0], status: 'PENDING', units: [{ property_id: property.id, value: property.price, is_primary: true }] });
                                                            setIsDealModalOpen(true);
                                                        }}
                                                        getStatusColor={getStatusColor}
                                                        getStatusLabel={getStatusLabel}
                                                    />
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}

                            {viewMode === 'list' && (() => {
                                const visible = inventoryColumns.visibleColumns;
                                const isVisible = (key: string) => visible.includes(key) && (
                                    INVENTORY_COLUMNS.find(c => c.key === key)?.context === 'all' || !!selectedBuildingId
                                );
                                // Ordem arrastável (§ "Reordenar colunas por arraste"), filtrada por
                                // visibilidade+contexto — 'actions' fica de fora por ser renderizada fixa.
                                const orderedVisible = inventoryColumns.orderedVisibleColumns.filter(key => key !== 'actions' && isVisible(key));
                                // +2: checkbox + espaçador (não entram no filter acima)
                                const colSpan = 2 + INVENTORY_COLUMNS.filter(c => isVisible(c.key)).length;
                                const sortHeaderProps = {
                                    sortColumn: inventoryColumns.sortColumn,
                                    sortDirection: inventoryColumns.sortDirection,
                                    onSort: inventoryColumns.handleColumnSort,
                                    uppercase: false as const,
                                };
                                const inventoryTableTotalWidth = 40
                                    + INVENTORY_COLUMNS.filter(c => c.key !== 'actions')
                                        .reduce((sum, c) => sum + (isVisible(c.key) ? inventoryResize.getWidth(c.key) : 0), 0)
                                    + inventoryResize.getWidth('actions');
                                return (
                                <div className="overflow-x-auto">
                                    <table ref={inventoryResize.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: inventoryTableTotalWidth, minWidth: '100%' }}>
                                        <colgroup>
                                            {/* checkbox */}
                                            <col style={{ width: '40px' }} />
                                            {orderedVisible.map(key => (
                                                <col key={key} data-col-key={key} style={{ width: `${inventoryResize.getWidth(key)}px` }} />
                                            ))}
                                            {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio, para a
                                                borda de "Ações" não andar a cada redimensionamento. */}
                                            <col />
                                            <col data-col-key="actions" style={{ width: `${inventoryResize.getWidth('actions')}px` }} />
                                        </colgroup>
                                        {/* thead em sentence case (§6.2) — escala compacta, colunas via SortableHeader (§6/§6.3).
                                            Ordem vem de orderedVisible — arrastar um header (onMoveColumn) reordena e persiste. */}
                                        <thead>
                                            <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                                <th className="w-10 px-4 py-2 border-r border-gray-100 text-center"></th>
                                                {orderedVisible.map(key => {
                                                    const def = INVENTORY_COLUMN_HEADERS[key];
                                                    if (!def) return null;
                                                    return (
                                                        <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} {...sortHeaderProps}
                                                            onMoveColumn={inventoryColumns.moveColumn}
                                                            className={def.className}>
                                                            <inventoryResize.ResizeHandle colKey={key} />
                                                        </SortableHeader>
                                                    );
                                                })}
                                                {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                                <th aria-hidden="true" className="border-r border-gray-100" />
                                                <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                                                    Ações
                                                    <inventoryResize.ResizeHandle colKey="actions" />
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {selectedBuildingId ? (
                                                filteredProperties.length > 0 ? (
                                                    filteredProperties.map((property, index) => (
                                                        <tr key={property.id} className={`hover:bg-blue-50/50 transition-colors ${selectedProperties.includes(property.id) ? 'bg-blue-50/60' : ''}`}>
                                                            <td className="px-4 py-2.5 border-r border-gray-100 text-center">
                                                                <input
                                                                    type="checkbox"
                                                                    title="Dica: segure Shift e clique para selecionar um intervalo"
                                                                    checked={selectedProperties.includes(property.id)}
                                                                    onChange={(e) => handleRowCheck(property.id, index, (e.nativeEvent as MouseEvent).shiftKey)}
                                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                                />
                                                            </td>
                                                            {orderedVisible.map(key => (
                                                                <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                                    {renderInventoryDetailCell(key, property, { getStatusColor, getStatusLabel, empreendimentoByProperty })}
                                                                </td>
                                                            ))}
                                                            {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                                            <td aria-hidden="true" className="border-r border-gray-100"></td>
                                                            <td className="px-6 py-2.5 text-right">
                                                                <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                                                                    <button
                                                                        onClick={() => {
                                                                            setEditingDeal({ id: '', property_id: property.id, client_id: '', type: 'SALE', value: property.price, date: new Date().toISOString().split('T')[0], status: 'PENDING', units: [{ property_id: property.id, value: property.price, is_primary: true }] });
                                                                            setIsDealModalOpen(true);
                                                                        }}
                                                                        className="text-emerald-600 hover:text-emerald-800 text-sm font-medium p-1.5 hover:bg-emerald-50 rounded-lg transition-all"
                                                                    >
                                                                        Negociação
                                                                    </button>
                                                                    <button onClick={() => { setEditingProperty(property); setIsPropertyModalOpen(true); }} className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all">Editar</button>
                                                                    <ActionIconButton kind="delete" onClick={() => handleDeleteProperty(property.id)} />
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan={colSpan} className="px-6 py-10 text-center text-sm text-gray-400 border-b border-gray-100">Nenhuma unidade encontrada.</td>
                                                    </tr>
                                                )
                                            ) : (
                                                filteredProperties.filter(p => p.type === 'BUILDING' || !p.parent_id).map((property, index) => (
                                                    <tr key={property.id} className={`hover:bg-blue-50/50 transition-colors group ${selectedProperties.includes(property.id) ? 'bg-blue-50/60' : ''}`}>
                                                        <td className="px-4 py-2.5 border-r border-gray-100 text-center" onClick={(e) => e.stopPropagation()}>
                                                            <input
                                                                type="checkbox"
                                                                title="Dica: segure Shift e clique para selecionar um intervalo"
                                                                checked={selectedProperties.includes(property.id)}
                                                                onChange={(e) => handleRowCheck(property.id, index, (e.nativeEvent as MouseEvent).shiftKey)}
                                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                            />
                                                        </td>
                                                        {orderedVisible.map(key => (
                                                            <td key={key}
                                                                className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 cursor-pointer ${INVENTORY_MASTER_CELL_TEXT_CLASS[key] || ''}`}
                                                                onClick={() => setSelectedBuildingId(property.id)}>
                                                                {renderInventoryMasterCell(key, property, { getStatusColor, getStatusLabel, empreendimentoByProperty })}
                                                            </td>
                                                        ))}
                                                        {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                                        <td aria-hidden="true" className="border-r border-gray-100"></td>
                                                        <td className="px-6 py-2.5 text-right">
                                                            <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                                <ActionIconButton kind="edit" onClick={() => { setEditingProperty(property); setIsPropertyModalOpen(true); }} />
                                                                <ActionIconButton kind="delete" onClick={() => handleDeleteProperty(property.id)} />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                );
                            })()}

                            {viewMode === 'tower' && (
                                <PropertyUnitMap
                                    units={filteredProperties}
                                    parentProperty={properties.find(p => p.id === selectedBuildingId)}
                                    deals={deals}
                                    mode="admin"
                                    onEditUnit={(unit) => { setEditingProperty(unit); setIsPropertyModalOpen(true); }}
                                    onSelectUnit={(unit) => {
                                        if (!selectedBuildingId && (unit.type === 'BUILDING' || !unit.parent_id)) {
                                            setSelectedBuildingId(unit.id);
                                        } else {
                                            setEditingDeal({ id: '', property_id: unit.id, client_id: '', type: 'SALE', value: unit.price, date: new Date().toISOString().split('T')[0], status: 'PENDING', units: [{ property_id: unit.id, value: unit.price, is_primary: true }] });
                                            setIsDealModalOpen(true);
                                        }
                                    }}
                                />
                            )}


                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <Home className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum imóvel cadastrado</h3>
                            <p className="text-sm text-gray-500 mb-6">Adicione o primeiro imóvel para iniciar a gestão comercial.</p>
                            <button
                                onClick={() => setIsPropertyModalOpen(true)}
                                className="text-blue-600 font-bold hover:underline"
                            >
                                Cadastrar primeiro imóvel
                            </button>
                        </div>
                    )}
                    </div>

                    {/* Bulk Actions Bar */}
                    {selectedProperties.length > 0 && (
                        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-[10px] shadow-lg shadow-blue-900/20">
                            <span className="flex-1 text-sm font-bold whitespace-nowrap">
                                {selectedProperties.length} selecionado{selectedProperties.length !== 1 ? 's' : ''}
                            </span>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setIsBulkEditOpen(true)}
                                className="text-blue-700 border-none hover:bg-blue-50"
                            >
                                <Edit className="w-3.5 h-3.5" />
                                Editar em Lote
                            </Button>
                            <button
                                onClick={() => setSelectedProperties([])}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-500 rounded-[6px] text-[13px] font-medium hover:bg-blue-400 transition-all active:scale-95"
                            >
                                <X className="w-3.5 h-3.5" />
                                Desmarcar
                            </button>
                        </div>
                    )}

                    {/* Modal de Edição em Lote (§10) */}
                    {isBulkEditOpen && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm" onClick={() => setIsBulkEditOpen(false)}>
                            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-100" onClick={(e) => e.stopPropagation()}>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">Editar {selectedProperties.length} imóve{selectedProperties.length !== 1 ? 'is' : 'l'} em lote</h3>
                                <p className="text-sm text-gray-500 mb-5">Escolha uma ação para aplicar a todos os imóveis selecionados.</p>

                                <div className="space-y-2 mb-5">
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Alterar status para</span>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => { handleBulkUpdate({ status: PropertyStatus.AVAILABLE }); setIsBulkEditOpen(false); }}
                                            className="h-9 px-3 rounded-[6px] text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all"
                                        >
                                            Disponível
                                        </button>
                                        <button
                                            onClick={() => { handleBulkUpdate({ status: PropertyStatus.RESERVED }); setIsBulkEditOpen(false); }}
                                            className="h-9 px-3 rounded-[6px] text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all"
                                        >
                                            Reservar
                                        </button>
                                        <button
                                            onClick={() => { handleBulkUpdate({ status: PropertyStatus.EXCHANGED }); setIsBulkEditOpen(false); }}
                                            className="h-9 px-3 rounded-[6px] text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all"
                                        >
                                            Permutar
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mudar preço sugerido para</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            value={bulkPriceValue}
                                            onChange={(e) => setBulkPriceValue(e.target.value)}
                                            placeholder="Novo preço (R$)"
                                            className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        />
                                        <button
                                            onClick={() => {
                                                const price = parseFloat(bulkPriceValue);
                                                if (!isNaN(price)) {
                                                    handleBulkUpdate({ price });
                                                    setBulkPriceValue('');
                                                    setIsBulkEditOpen(false);
                                                }
                                            }}
                                            disabled={!bulkPriceValue || isNaN(parseFloat(bulkPriceValue))}
                                            className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Aplicar
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setIsBulkEditOpen(false)}
                                    className="w-full mt-6 px-6 py-2.5 bg-gray-50 text-gray-500 rounded-[6px] text-sm font-medium hover:bg-gray-100 transition-all"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'simulation' && selectedBuildingId && (
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-[10px] border border-gray-100">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 tracking-tight">Motor de simulação VGV</h3>
                                <p className="text-gray-500 text-sm">Ajuste os parâmetros para projetar o futuro financeiro de {currentBuilding?.name}</p>
                            </div>
                            <BrainCircuit className="w-5 h-5 text-purple-600" />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                            <div className="lg:col-span-1 space-y-6 p-5 bg-gray-50 rounded-[10px] border border-gray-100">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Velocidade de Vendas</label>
                                        <span className="text-sm font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-[6px]">{simMonthlySales} und/mês</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="1"
                                        max="20"
                                        step="1"
                                        value={simMonthlySales}
                                        onChange={(e) => setSimMonthlySales(Number(e.target.value))}
                                        className="w-full h-2 bg-gray-200 rounded-[6px] appearance-none cursor-pointer accent-blue-600"
                                    />
                                    <p className="text-[9px] font-bold text-gray-400 leading-tight">Define quantas unidades do estoque são absorvidas mensalmente.</p>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Ajuste de Preço (VGV)</label>
                                        <span className={`text-sm font-black px-2 py-1 rounded-[6px] ${simPriceAdjust >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                                            {simPriceAdjust > 0 ? '+' : ''}{simPriceAdjust}%
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="-20"
                                        max="50"
                                        step="1"
                                        value={simPriceAdjust}
                                        onChange={(e) => setSimPriceAdjust(Number(e.target.value))}
                                        className="w-full h-2 bg-gray-200 rounded-[6px] appearance-none cursor-pointer accent-blue-600"
                                    />
                                    <p className="text-[9px] font-bold text-gray-400 leading-tight">Simula valorização ou descontos agressivos no estoque remanescente.</p>
                                </div>

                                <div className="pt-6 border-t border-gray-200 space-y-4">
                                    <div className="p-4 bg-gray-900 rounded-[10px] text-white">
                                        <div className="flex items-center gap-2 mb-2">
                                            <TrendingUp className="w-4 h-4 text-blue-400" />
                                            <span className="text-[9px] font-black uppercase tracking-widest">Tempo de Esgotamento</span>
                                        </div>
                                        <p className="text-2xl font-black">
                                            {Math.ceil(filteredProperties.length / (simMonthlySales || 1))}
                                            <span className="text-xs text-gray-400 ml-1">Meses</span>
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Cenários de Absorção (curva S)</span>
                                        {pricingService.compareScenarios(filteredProperties.length, 60, [
                                            { label: 'Lenta', velocity: 0.25 },
                                            { label: 'Moderada', velocity: 0.5 },
                                            { label: 'Agressiva', velocity: 0.9 },
                                        ]).map(s => (
                                            <div key={s.label} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-[6px] border border-gray-100">
                                                <span className="text-xs font-bold text-gray-600">{s.label}</span>
                                                <span className="text-xs font-black text-blue-600">{s.monthsToSellOut} meses</span>
                                            </div>
                                        ))}
                                    </div>

                                    <button
                                        onClick={() => { setSimMonthlySales(2); setSimPriceAdjust(0); }}
                                        className="w-full h-9 bg-white text-gray-500 hover:text-gray-900 text-sm font-medium rounded-[6px] border border-gray-200 transition-all"
                                    >
                                        Resetar simulação
                                    </button>
                                </div>
                            </div>

                            <div className="lg:col-span-3">
                                <SalesDashboard
                                    buildings={properties} 
                                    selectedBuildingId={selectedBuildingId} 
                                    mode="simulation"
                                    organizationId={effectiveOrganizationId}
                                    simulationParams={{
                                        monthlySales: simMonthlySales,
                                        priceAdjust: simPriceAdjust
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'price-tables' && selectedBuildingId && currentBuilding && effectiveOrganizationId && (
                <div className="animate-in slide-in-from-bottom-5 duration-500">
                    <PriceTableManager
                        organizationId={effectiveOrganizationId}
                        buildingId={selectedBuildingId}
                        buildingName={currentBuilding.name}
                    />
                </div>
            )}

            {activeTab === 'sales-plans' && selectedBuildingId && currentBuilding && effectiveOrganizationId && (
                <div className="animate-in slide-in-from-bottom-5 duration-500">
                    <SalesPlanManager
                        organizationId={effectiveOrganizationId}
                        buildingId={selectedBuildingId}
                        buildingName={currentBuilding.name}
                    />
                </div>
            )}

            {activeTab === 'deals' && (
                    /* §20.1 — 24px entre o título da seção e a toolbar acoplada. */
                    <div className="space-y-6">
                        <div className="flex items-center gap-2">
                            <Tag className="w-5 h-5 text-blue-600" />
                            <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                                Registro de negociações {selectedBuildingId && currentBuilding ? `— ${currentBuilding.name} (${searchedBuildingDeals.length} de ${deals.length})` : `(${searchedBuildingDeals.length}${searchedBuildingDeals.length !== deals.length ? ` de ${deals.length}` : ''})`}
                            </h3>
                        </div>

                        {/* §5.2 — toolbar acoplada: busca + colunas + autofit + viewMode e a
                            tabela dividem UM card; só o border-b separa os dois blocos. */}
                        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                            <div className="p-2 border-b border-gray-100 bg-white">
                                <div className="flex flex-col md:flex-row gap-2.5 items-center">
                                    <div className="flex-1 relative w-full">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Buscar por código, unidade ou cliente..."
                                            value={dealsSearch}
                                            onChange={(e) => setDealsSearch(e.target.value)}
                                            className="w-full h-9 pl-9 pr-9 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        />
                                        {dealsSearch && (
                                            <button
                                                onClick={() => setDealsSearch('')}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                                title="Limpar busca"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>

                                    <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                                    <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                        {viewMode === 'list' && (
                                            <>
                                                <ColumnConfigButton
                                                    columns={DEALS_COLUMNS.filter(c => c.key !== 'actions')}
                                                    visibleColumns={dealsColumns.visibleColumns}
                                                    showColumnConfig={dealsColumns.showColumnConfig}
                                                    onToggleShow={() => dealsColumns.setShowColumnConfig(!dealsColumns.showColumnConfig)}
                                                    onToggleColumn={dealsColumns.toggleColumn}
                                                    onReset={dealsColumns.resetColumns}
                                                />
                                                {/* Autofit sob comando explícito — nunca automático (§6.1.2).
                                                    Duplo clique no divisor segue "restaurar padrão". */}
                                                <button
                                                    onClick={() => dealsResize.autoFit()}
                                                    className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                                    title="Ajustar largura das colunas ao conteúdo"
                                                >
                                                    <MoveHorizontal className="w-4 h-4" />
                                                </button>
                                                <div className="w-px h-5 bg-gray-200 mx-0.5"></div>
                                            </>
                                        )}
                                        <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`} title="Grade"><LayoutGrid className="w-4 h-4" /></button>
                                        <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`} title="Lista"><List className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            </div>

                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                                {searchedBuildingDeals.map(deal => {
                                    const property = properties.find(p => p.id === deal.property_id);
                                    return (
                                        <div key={deal.id} className="bg-white p-6 rounded-[10px] border border-gray-100 hover:border-blue-200 transition-colors relative group">
                                            <div className="absolute top-6 right-6 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                <ActionIconButton kind="edit" onClick={() => { setEditingDeal(deal); setIsDealModalOpen(true); }} />
                                                <ActionIconButton kind="delete" onClick={() => handleDeleteDeal(deal.id)} />
                                            </div>
                                            <div className="flex items-center gap-2 mb-4">
                                                <span className={`text-sm font-normal ${deal.status === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                    {deal.status === 'COMPLETED' ? 'Concluído' :
                                                        deal.status === 'PENDING' ? 'Pendente' :
                                                            deal.status === 'CANCELLED' ? 'Cancelado' : 'Em Negociação'}
                                                </span>
                                                <span className="text-xs text-gray-400 ml-auto">
                                                    {new Date(deal.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                                </span>
                                            </div>

                                            <div className="mb-6">
                                                <span className="text-xs font-medium text-blue-600 mb-1 inline-block">
                                                    Venda direta
                                                </span>
                                                <h4 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors"
                                                    title={dealUnitLabelOf(deal).all || undefined}>
                                                    {dealUnitLabelOf(deal).name || property?.name || 'Imóvel em referência'}
                                                    {dealUnitLabelOf(deal).extra > 0 && (
                                                        <span className="ml-1.5 text-sm font-normal text-gray-400">+{dealUnitLabelOf(deal).extra}</span>
                                                    )}
                                                </h4>
                                                <div className="flex items-center gap-2 mt-2 text-gray-500">
                                                    <User className="w-4 h-4" />
                                                    <span className="text-sm font-normal">
                                                        {deal.client_id ? (clients.find(c => c.id === deal.client_id)?.name || `ID: ${deal.client_id.substring(0, 8)}`) : 'Cliente não informado'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="p-4 bg-blue-50/50 rounded-[10px] border border-blue-100 flex items-center justify-between mb-4">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-medium text-blue-600 mb-1">Valor do contrato</span>
                                                    <span className="text-xl font-bold text-gray-900">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.value)}
                                                    </span>
                                                </div>
                                                <DollarSign className="w-5 h-5 text-emerald-500" />
                                            </div>

                                            {deal.notes && (
                                                <div className="p-3 bg-gray-50 rounded-[10px] italic text-gray-500 text-sm font-normal border-l-2 border-gray-200">
                                                    "{deal.notes}"
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* Add New Deal Placeholder */}
                                <button
                                    onClick={() => {
                                        setEditingDeal({ id: '', property_id: '', client_id: '', type: 'SALE', value: 0, date: new Date().toISOString().split('T')[0], status: 'PENDING' } as PropertyDeal);
                                        setIsDealModalOpen(true);
                                    }}
                                    className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[10px] p-6 flex flex-col items-center justify-center group hover:bg-white hover:border-blue-200 transition-all min-h-[220px]"
                                >
                                    <Plus className="w-8 h-8 text-gray-300 group-hover:text-blue-600 mb-3" />
                                    <span className="text-sm font-bold text-gray-400 group-hover:text-gray-900">Nova negociação</span>
                                    <p className="text-xs text-gray-400 text-center mt-1 px-4">Inicie o registro de uma nova venda de imóvel.</p>
                                </button>
                            </div>
                        ) : (() => {
                            const dv = dealsColumns.visibleColumns;
                            const dSortProps = {
                                sortColumn: dealsColumns.sortColumn,
                                sortDirection: dealsColumns.sortDirection,
                                onSort: dealsColumns.handleColumnSort,
                                uppercase: false as const,
                            };
                            const dealsTableTotalWidth = DEALS_COLUMNS.filter(c => c.key !== 'actions')
                                .reduce((sum, c) => sum + (dv.includes(c.key) ? dealsResize.getWidth(c.key) : 0), 0)
                                + dealsResize.getWidth('actions');
                            return (
                            /* Sem moldura própria — o card acoplado acima já a supre (§5.2). */
                            <>
                                <div className="overflow-x-auto">
                                <table ref={dealsResize.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: dealsTableTotalWidth, minWidth: '100%' }}>
                                    <colgroup>
                                        {dv.includes('code') && <col data-col-key="code" style={{ width: `${dealsResize.getWidth('code')}px` }} />}
                                        {dv.includes('property') && <col data-col-key="property" style={{ width: `${dealsResize.getWidth('property')}px` }} />}
                                        {dv.includes('client') && <col data-col-key="client" style={{ width: `${dealsResize.getWidth('client')}px` }} />}
                                        {dv.includes('empreendimento') && <col data-col-key="empreendimento" style={{ width: `${dealsResize.getWidth('empreendimento')}px` }} />}
                                        {dv.includes('block') && <col data-col-key="block" style={{ width: `${dealsResize.getWidth('block')}px` }} />}
                                        {dv.includes('private_area') && <col data-col-key="private_area" style={{ width: `${dealsResize.getWidth('private_area')}px` }} />}
                                        {dv.includes('price_base') && <col data-col-key="price_base" style={{ width: `${dealsResize.getWidth('price_base')}px` }} />}
                                        {dv.includes('price_per_m2_base') && <col data-col-key="price_per_m2_base" style={{ width: `${dealsResize.getWidth('price_per_m2_base')}px` }} />}
                                        {dv.includes('floor') && <col data-col-key="floor" style={{ width: `${dealsResize.getWidth('floor')}px` }} />}
                                        {dv.includes('sale_value') && <col data-col-key="sale_value" style={{ width: `${dealsResize.getWidth('sale_value')}px` }} />}
                                        {dv.includes('sale_value_per_m2') && <col data-col-key="sale_value_per_m2" style={{ width: `${dealsResize.getWidth('sale_value_per_m2')}px` }} />}
                                        {dv.includes('variance') && <col data-col-key="variance" style={{ width: `${dealsResize.getWidth('variance')}px` }} />}
                                        {dv.includes('variance_pct') && <col data-col-key="variance_pct" style={{ width: `${dealsResize.getWidth('variance_pct')}px` }} />}
                                        {dv.includes('status') && <col data-col-key="status" style={{ width: `${dealsResize.getWidth('status')}px` }} />}
                                        {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio, para a
                                            borda de "Ações" não andar a cada redimensionamento. */}
                                        <col />
                                        <col data-col-key="actions" style={{ width: `${dealsResize.getWidth('actions')}px` }} />
                                    </colgroup>
                                    {/* thead em sentence case (§6.2) — escala compacta, colunas via SortableHeader (§6/§6.3) */}
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            {dv.includes('code') && <SortableHeader colKey="code" label="Código" {...dSortProps} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden"><dealsResize.ResizeHandle colKey="code" /></SortableHeader>}
                                            {dv.includes('property') && <SortableHeader colKey="property" label="Unidade" {...dSortProps} className="px-6 py-2 border-r border-gray-100 overflow-hidden"><dealsResize.ResizeHandle colKey="property" /></SortableHeader>}
                                            {dv.includes('client') && <SortableHeader colKey="client" label="Cliente" {...dSortProps} className="px-6 py-2 border-r border-gray-100 overflow-hidden"><dealsResize.ResizeHandle colKey="client" /></SortableHeader>}
                                            {dv.includes('empreendimento') && <SortableHeader colKey="empreendimento" label="Empreendimento" {...dSortProps} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden"><dealsResize.ResizeHandle colKey="empreendimento" /></SortableHeader>}
                                            {dv.includes('block') && <SortableHeader colKey="block" label="Bloco" {...dSortProps} className="px-6 py-2 border-r border-gray-100 text-center overflow-hidden"><dealsResize.ResizeHandle colKey="block" /></SortableHeader>}
                                            {dv.includes('private_area') && <SortableHeader colKey="private_area" label="Á. priv." {...dSortProps} className="px-6 py-2 border-r border-gray-100 text-center whitespace-nowrap overflow-hidden"><dealsResize.ResizeHandle colKey="private_area" /></SortableHeader>}
                                            {dv.includes('price_base') && <SortableHeader colKey="price_base" label="Preço base" {...dSortProps} className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap overflow-hidden"><dealsResize.ResizeHandle colKey="price_base" /></SortableHeader>}
                                            {dv.includes('price_per_m2_base') && <SortableHeader colKey="price_per_m2_base" label="Vlr/m² base" {...dSortProps} className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap overflow-hidden"><dealsResize.ResizeHandle colKey="price_per_m2_base" /></SortableHeader>}
                                            {dv.includes('floor') && <SortableHeader colKey="floor" label="Andar" {...dSortProps} className="px-6 py-2 border-r border-gray-100 text-center overflow-hidden"><dealsResize.ResizeHandle colKey="floor" /></SortableHeader>}
                                            {dv.includes('sale_value') && <SortableHeader colKey="sale_value" label="Vlr venda" {...dSortProps} className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap overflow-hidden"><dealsResize.ResizeHandle colKey="sale_value" /></SortableHeader>}
                                            {dv.includes('sale_value_per_m2') && <SortableHeader colKey="sale_value_per_m2" label="Vlr venda/m²" {...dSortProps} className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap overflow-hidden"><dealsResize.ResizeHandle colKey="sale_value_per_m2" /></SortableHeader>}
                                            {dv.includes('variance') && <SortableHeader colKey="variance" label="Var. (R$)" {...dSortProps} className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap overflow-hidden"><dealsResize.ResizeHandle colKey="variance" /></SortableHeader>}
                                            {dv.includes('variance_pct') && <SortableHeader colKey="variance_pct" label="Var. (%)" {...dSortProps} className="px-6 py-2 border-r border-gray-100 text-center whitespace-nowrap overflow-hidden"><dealsResize.ResizeHandle colKey="variance_pct" /></SortableHeader>}
                                            {dv.includes('status') && <SortableHeader colKey="status" label="Status" {...dSortProps} className="px-6 py-2 border-r border-gray-100 overflow-hidden"><dealsResize.ResizeHandle colKey="status" /></SortableHeader>}
                                            {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                            <th aria-hidden="true" className="border-r border-gray-100" />
                                            <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                                                Ações
                                                <dealsResize.ResizeHandle colKey="actions" />
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {sortedBuildingDeals.map(deal => {
                                            const property = properties.find(p => p.id === deal.property_id);
                                            const client = clients.find(c => c.id === deal.client_id);
                                            // Área e preço de tabela SOMADOS das unidades do contrato.
                                            const unitLabel = dealUnitLabelOf(deal);
                                            const m2 = dealAreaOf(deal);
                                            const basePrice = dealBasePriceOf(deal);
                                            const m2Base = basePrice / m2;
                                            const m2Venda = deal.value / m2;
                                            const variancia = m2Venda - m2Base;
                                            const varianciaPct = m2Base > 0 ? (variancia / m2Base) * 100 : 0;
                                            return (
                                                <tr key={deal.id} className="hover:bg-blue-50/50 transition-colors cursor-pointer group" onClick={() => { setEditingDeal(deal); setIsDealModalOpen(true); }}>
                                                    {dv.includes('code') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                                                            {deal.code || '—'}
                                                        </td>
                                                    )}
                                                    {dv.includes('property') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0" title={unitLabel.all || undefined}>
                                                            {/* §6.1.2 — `truncate` só recorta em elemento de bloco. */}
                                                            <span className="block truncate text-sm font-normal text-gray-900 group-hover:text-blue-600 transition-colors">
                                                                {unitLabel.name || property?.name || '---'}
                                                                {unitLabel.extra > 0 && (
                                                                    <span className="ml-1.5 text-xs text-gray-400">+{unitLabel.extra}</span>
                                                                )}
                                                            </span>
                                                        </td>
                                                    )}
                                                    {dv.includes('client') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0" title={client?.name || undefined}>
                                                            <span className={`block truncate text-sm font-normal ${client?.name ? 'text-gray-600' : 'text-gray-400'}`}>
                                                                {client?.name || 'Não vinculado'}
                                                            </span>
                                                        </td>
                                                    )}
                                                    {dv.includes('empreendimento') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                            <EmpreendimentoCell value={deal.property_id ? empreendimentoByProperty[deal.property_id] : undefined} />
                                                        </td>
                                                    )}
                                                    {dv.includes('block') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 text-center">
                                                            {property?.block || '-'}
                                                        </td>
                                                    )}
                                                    {dv.includes('private_area') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 text-center">
                                                            {dealAreaOf(deal)}m²
                                                        </td>
                                                    )}
                                                    {dv.includes('price_base') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-600 text-right">
                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(basePrice)}
                                                        </td>
                                                    )}
                                                    {dv.includes('price_per_m2_base') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-600 text-right">
                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(m2Base)}
                                                        </td>
                                                    )}
                                                    {dv.includes('floor') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 text-center">
                                                            {property?.floor ? `${property.floor}º` : 'T'}
                                                        </td>
                                                    )}
                                                    {dv.includes('sale_value') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800 text-right">
                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(deal.value)}
                                                        </td>
                                                    )}
                                                    {dv.includes('sale_value_per_m2') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-blue-600 text-right">
                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(m2Venda)}
                                                        </td>
                                                    )}
                                                    {dv.includes('variance') && (
                                                        <td className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-right ${variancia >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                            {variancia >= 0 ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(variancia)}
                                                        </td>
                                                    )}
                                                    {dv.includes('variance_pct') && (
                                                        <td className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-center ${variancia >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                            {Math.abs(varianciaPct).toFixed(1)}%
                                                        </td>
                                                    )}
                                                    {dv.includes('status') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                            <span className={`text-sm font-normal ${deal.status === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                                {deal.status === 'COMPLETED' ? 'Concluído' : 'Pendente'}
                                                            </span>
                                                        </td>
                                                    )}
                                                    {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                                    <td aria-hidden="true" className="border-r border-gray-100"></td>
                                                    <td className="px-6 py-2.5 text-right">
                                                        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                            <ActionIconButton kind="edit" onClick={() => { setEditingDeal(deal); setIsDealModalOpen(true); }} />
                                                            <ActionIconButton kind="delete" onClick={() => handleDeleteDeal(deal.id)} />
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {sortedBuildingDeals.length === 0 && (
                                            <tr>
                                                <td colSpan={dv.length + 2} className="px-6 py-12 text-center text-sm font-normal text-gray-400">
                                                    {dealsSearch
                                                        ? `Nenhuma negociação encontrada para "${dealsSearch}".`
                                                        : 'Nenhuma negociação registrada.'}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                </div>
                                <button
                                    onClick={() => {
                                        setEditingDeal({ type: 'SALE' } as PropertyDeal);
                                        setIsDealModalOpen(true);
                                    }}
                                    className="w-full py-4 bg-gray-50/50 hover:bg-gray-50 text-gray-500 font-medium text-sm transition-all border-t border-gray-100 flex items-center justify-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    Registrar nova negociação
                                </button>
                            </>
                            );
                        })()}
                        </div>
                    </div>
                )
            }

            {
                activeTab === 'dashboard' && (
                    <SalesDashboard 
                        selectedBuildingId={selectedBuildingId} 
                        buildings={properties} 
                        organizationId={currentBuilding?.organization_id || organizationId}
                    />
                )
            }

            {activeTab === 'brokers' && (() => {
                const filteredBrokers = brokers
                    .filter(b => b.name.toLowerCase().includes(searchTerm.toLowerCase()) || b.email.toLowerCase().includes(searchTerm.toLowerCase()))
                    .sort((a, b) => {
                        if (brokersColumns.sortColumn) {
                            const col = brokersColumns.sortColumn;
                            const dir = brokersColumns.sortDirection === 'asc' ? 1 : -1;
                            if (col === 'name') return a.name.localeCompare(b.name) * dir;
                            if (col === 'status') return (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1) * dir;
                            if (col === 'agency') return (a.agency_name || '').localeCompare(b.agency_name || '') * dir;
                            if (col === 'commission') return ((a.commission_rate || 0) - (b.commission_rate || 0)) * dir;
                            if (col === 'creci') return (a.creci || '').localeCompare(b.creci || '') * dir;
                        }
                        // Sem coluna clicada, ordenação default é nome A-Z (guide §6.4).
                        return a.name.localeCompare(b.name);
                    });

                return (
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <User className="w-5 h-5 text-blue-600" />
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 tracking-tight">Gestão de corretores</h3>
                                <p className="text-xs text-gray-400">Parceiros e comissionamento</p>
                            </div>
                        </div>
                        <div className="h-9 flex items-center px-3 rounded-[6px] bg-amber-50 text-amber-700 text-xs font-medium">
                            Cadastre em Minha Organização &gt; Fornecedores &gt; Corretor Imobiliário
                        </div>
                    </div>

                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex flex-col md:flex-row gap-2.5 items-center p-2 border-b border-gray-100 bg-white">
                            <div className="flex-1 relative w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar por nome ou e-mail..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>
                            <button onClick={loadData} className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shrink-0" title="Atualizar">
                                <RefreshCw className="w-4 h-4" />
                            </button>

                            <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                <ColumnConfigButton
                                    columns={BROKERS_COLUMNS}
                                    visibleColumns={brokersColumns.visibleColumns}
                                    showColumnConfig={brokersColumns.showColumnConfig}
                                    onToggleShow={() => brokersColumns.setShowColumnConfig(!brokersColumns.showColumnConfig)}
                                    onToggleColumn={brokersColumns.toggleColumn}
                                    onReset={brokersColumns.resetColumns}
                                />
                            </div>
                        </div>

                        {filteredBrokers.length === 0 ? (
                            <div className="text-center py-12">
                                <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum corretor encontrado</h3>
                                <p className="text-sm text-gray-500">
                                    {searchTerm ? 'Tente buscar por outro termo.' : 'Cadastre corretores em Minha Organização > Fornecedores > Corretor Imobiliário.'}
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-auto max-h-[70vh]">
                                <table className="w-full text-left border-collapse">
                                    {/* thead em sentence case (§6.2) — uppercase={false} porque SortableHeader força uppercase internamente por padrão. */}
                                    <thead>
                                        <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            {brokersColumns.orderedVisibleColumns.map(key => {
                                                const def = BROKERS_COLUMN_HEADERS[key];
                                                if (!def) return null;
                                                return (
                                                    <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                        sortColumn={brokersColumns.sortColumn} sortDirection={brokersColumns.sortDirection}
                                                        onSort={brokersColumns.handleColumnSort}
                                                        onMoveColumn={brokersColumns.moveColumn}
                                                        className={def.className} />
                                                );
                                            })}
                                            <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Acesso ao portal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {filteredBrokers.map(broker => (
                                            <tr key={broker.id} className="hover:bg-blue-50/50 transition-colors">
                                                {brokersColumns.orderedVisibleColumns.map(key => (
                                                    <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                        {renderBrokerCell(key, broker)}
                                                    </td>
                                                ))}
                                                <td className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                                                        <label className="relative inline-flex items-center cursor-pointer" title="Ver este empreendimento no Portal">
                                                            <input
                                                                type="checkbox"
                                                                className="sr-only peer"
                                                                checked={!!brokerAccess[broker.id]}
                                                                onChange={e => handleToggleBrokerAccess(broker.id, e.target.checked)}
                                                            />
                                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                                        </label>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="bg-amber-50/40 border border-dashed border-amber-100 rounded-[10px] p-4 text-center">
                        <span className="text-sm font-bold text-amber-700">Cadastro centralizado</span>
                        <p className="text-xs text-amber-600 mt-1">Novos corretores devem ser fornecedores na categoria Corretor Imobiliário.</p>
                    </div>
                </div>
                );
            })()}

            {/* Contratos de Venda de Ativos (domain='VENDAS') */}
            {activeTab === 'contracts' && (
                selectedContractId ? (
                    <ContractDetailView
                        contractId={selectedContractId}
                        onBack={() => setSelectedContractId(null)}
                        budget={[]}
                        organizationId={effectiveOrganizationId}
                        onEdit={(contract) => { setEditingContract(contract); setIsContractModalOpen(true); }}
                    />
                ) : (
                    <ContractsDashboard
                        key={contractsVersion}
                        organizationId={effectiveOrganizationId || ''}
                        domain="VENDAS"
                        onViewContract={(id) => setSelectedContractId(id)}
                        onCreateNew={() => {
                            setEditingContract({
                                contract_type: 'Compra e Venda',
                                nature: 'Venda',
                                direction: 'OUTGOING',
                                domain: 'VENDAS',
                            });
                            setIsContractModalOpen(true);
                        }}
                    />
                )
            )}

            {(effectiveOrganizationId || editingContract?.organization_id) && (
                <ContractModal
                    isOpen={isContractModalOpen}
                    onClose={() => { setIsContractModalOpen(false); setEditingContract(undefined); }}
                    onSubmit={async (data) => {
                        const effectiveOrgId = effectiveOrganizationId || editingContract?.organization_id;
                        const payload = { ...data, direction: 'OUTGOING' as const, domain: 'VENDAS' as const, organization_id: effectiveOrgId };
                        let saved;
                        if (editingContract?.id) {
                            saved = await contractService.updateContract(editingContract.id, payload);
                        } else {
                            saved = await contractService.createContract(payload);
                        }
                        setContractsVersion(v => v + 1);
                        setIsContractModalOpen(false);
                        setEditingContract(undefined);
                        setSelectedContractId(saved.id);
                    }}
                    projectId={editingContract?.project_id ?? ''}
                    organizationId={effectiveOrganizationId || editingContract?.organization_id}
                    initialData={editingContract ?? undefined}
                    // Sem `domain` o ContractModal caía no formato legado de 3
                    // dígitos e escondia o botão "Regerar número" (o onSubmit
                    // abaixo já gravava domain:'VENDAS' — só a numeração ficava fora).
                    domain="VENDAS"
                    titleNew="Novo Contrato de Venda"
                    moduleLabel="Contratos de Venda de Ativos"
                />
            )}



            <PropertyModal
                isOpen={isPropertyModalOpen}
                onClose={() => { setIsPropertyModalOpen(false); setEditingProperty(undefined); }}
                onSubmit={handleSaveProperty}
                initialData={editingProperty || (selectedBuildingId ? { parent_id: selectedBuildingId, type: 'APARTMENT' } as Property : undefined)}
                defaultPurpose="SALE"
                organizationId={effectiveOrganizationId}
            />

            <DealModal
                isOpen={isDealModalOpen}
                onClose={() => { setIsDealModalOpen(false); setEditingDeal(undefined); }}
                onSave={() => { loadData(); /* aviso de salvamento agora é emitido dentro do próprio DealModal */ }}
                initialData={editingDeal}
                organizationId={effectiveOrganizationId}
                buildingId={selectedBuildingId || undefined}
            />

            <BrokerModal
                isOpen={isBrokerModalOpen}
                onClose={() => { setIsBrokerModalOpen(false); setEditingBroker(undefined); }}
                onSave={handleSaveBroker}
                initialData={editingBroker}
                organizationId={effectiveOrganizationId}
            />

            {/* Toast de Notificação — §13 */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-[10px] shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div >
    );
};

export default SalesModule;
