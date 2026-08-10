import React, { useState, useEffect, useMemo } from 'react';
import { Building2, Home, Key, TrendingUp, Plus, Search, Filter, RefreshCw, Home as HomeIcon, MapPin, DollarSign, Tag, User, Edit, Trash2, LayoutGrid, List, ChevronDown, X, AlertCircle, Mail, Phone, Briefcase, BrainCircuit, MoveHorizontal, BarChart3, Clock, Calendar, Check } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { commercialService } from '../services/commercialService';
import { supabase } from '../lib/supabase';
import { brokerService } from '../services/brokerService';
import { Property, PropertyStatus, PropertyDeal, Client, BrokerProfile } from '../types';
import { TowerMatrixConfig, GridCellConfig, TowerNumberingConfig } from '../types/imovib';
import { ColumnConfig, useTableColumns, ColumnConfigButton, useResizableColumns, usePersistedState, SortableHeader } from './ui/TableUtils';
import { KpiCard } from './ui/KpiCard';
import { useConfirm } from './ui/confirm';


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
import { RentalsDashboard } from './RentalsDashboard';
import PropertyUnitMap from './common/PropertyUnitMap';
import { PriceTableManager } from './PriceTableManager';
import RentalPricingIntelligenceModal from './RentalPricingIntelligenceModal';
import { rentalPricingService } from '../services/rentalPricingService';
import { rentalPriceTableService } from '../services/rentalPriceTableService';
import { RentalPricingConfig } from '../types';
import RentalRenewals from './rentals/RentalRenewals';
import { contractRenewalService } from '../services/contractRenewalService';
import { getStepByStatus, getStepIndex, WORKFLOW_STEPS, DealWorkflowStatus } from '../lib/dealWorkflow';
// Conta de carteira compartilhada com services/rentalsDashboardService.ts — as
// duas telas mostram os mesmos KPIs e já divergiram por terem cópias da fórmula.
// getDealInstallmentValue trabalha na escala do CONTRATO (campos do próprio
// `deal`), sem o lookup por propriedade de getContractedRentalValue, que poderia
// achar um OUTRO contrato ativo da mesma unidade se este estiver cancelado.
import { sumPortfolioValue, leafNodes, getDealInstallmentValue } from '../lib/rentalPortfolio';
import { rentalVacancyService, type RentalVacancyMetrics } from '../services/rentalVacancyService';
import { rentalNoiService, type RentalNoiMetrics } from '../services/rentalNoiService';
import { rentalExecutiveService, type RentalExecutiveMetrics } from '../services/rentalExecutiveService';
import { financialOccupancy } from '../lib/rentalExecutive';

interface RentalsModuleProps {
    organizationId?: string;
}

type RentalsTab = 'inventory' | 'analysis' | 'deals' | 'dashboard' | 'renewals' | 'brokers' | 'price-tables';

// Valor de locação canônico da unidade: rental_price (gravado pela Inteligência
// de Aluguéis e pela Tabela de aluguéis); fallback para price ("Aluguel base"
// legado) enquanto rental_price não foi definido. Mesmo padrão de
// rentalPriceTableService.getTableItems.
const rentalValueOf = (p: Partial<Property>): number =>
    (p.rental_price != null ? Number(p.rental_price) : (p.price != null ? Number(p.price) : 0));

// Colunas da tabela de Unidades (§2/§5.2) — a mesma tabela troca de contexto
// (edifícios × unidades de um edifício, ver `selectedBuildingId`), então esta
// lista cobre as colunas dos dois modos; cada célula de cabeçalho/dado já
// checa qual modo está ativo antes de aplicar `visibleColumns`.
const PROPERTY_COLUMNS: ColumnConfig[] = [
    { key: 'name', label: 'Imóvel', sortable: true },
    { key: 'address', label: 'Endereço', sortable: true },
    { key: 'occupancy', label: 'Ocupação', sortable: false },
    { key: 'block', label: 'Bloco', sortable: true },
    { key: 'floor', label: 'Pavimento', sortable: true },
    { key: 'private_area', label: 'Área privativa', sortable: true },
    { key: 'rental_analysis', label: 'Análise', sortable: false },
    { key: 'rental_value', label: 'Valor aluguel', sortable: false },
    { key: 'price', label: 'Valor', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

// Larguras padrão do redimensionamento de colunas (§6.1). Calibradas em
// 2026-08-07 medindo no navegador, contra o container real de 1130px (viewport
// 1440, gutter §20.2), duas coisas diferentes:
//   • o PISO DO CABEÇALHO — largura do rótulo + seta de ordenação + 48px de
//     padding (§6.6). Independe do dado: abaixo dele o cabeçalho é cortado, o
//     que é sempre defeito. É a régua das colunas de dado.
//   • o CONTEÚDO DA CÉLULA DE AÇÕES — 213px (botão "Negociação" + 2
//     ActionIconButton). Também independe do dado.
// ⚠️ `actions` estava em 130px contra 213px de conteúdo. A célula de ação é um
// flex com `whitespace-nowrap`: não trunca nem quebra — TRANSBORDA para a
// esquerda e pinta por cima da coluna de Status ("DisponíNegociação"). Coluna
// de ação nunca é candidata a aperto.
//
// Os dois modos da tabela (edifícios × unidades de um edifício) têm records
// separados porque disputavam a mesma largura de `name`: nome de edifício
// ("Edifício Vista Alegre") pede 206px, nome de unidade ("Apto 101") pede 115.
// Um valor só obrigava a escolher entre quebrar o nome do edifício em duas
// linhas ou estourar o container no modo Unidades. A chave de storage continua
// única — o que o usuário arrastar vale nos dois modos, como antes.
const BUILDING_MODE_COL_WIDTHS: Record<string, number> = {
    name: 210, address: 330, price: 145, occupancy: 120, status: 115, actions: 210,
};
// Soma 1141 num container de 1130: os 11px que sobram são comidos pelo padding
// direito da última célula (24px), então nenhum ícone de ação some. Não dá para
// baixar mais sem cortar cabeçalho — 9 colunas com `px-6` não cabem em 1130.
// Quem quiser ajuste ao dado real tem o autofit (§6.1.2) na régua de controles.
const UNIT_MODE_COL_WIDTHS: Record<string, number> = {
    name: 115, block: 108, floor: 98, private_area: 118,
    rental_analysis: 100, rental_value: 138, price: 141, status: 113, actions: 210,
};

// Colunas de dado aplicáveis a cada modo da tabela (edifícios × unidades de um
// edifício) — usado para somar a largura total (§6.1) e montar o colgroup.
// rental_analysis/rental_value só existem no modo Unidades (dentro de um
// edifício) — building-mode não tem "valor de aluguel" próprio da unidade.
const buildingModeColumnKeys = ['name', 'address', 'price', 'occupancy', 'status'] as const;
const unitModeColumnKeys = ['name', 'block', 'floor', 'private_area', 'rental_analysis', 'rental_value', 'price', 'status'] as const;

// Colunas da aba Contratos (§5.2/§6.1).
const DEAL_COLUMNS: ColumnConfig[] = [
    { key: 'id', label: 'ID', sortable: true },
    { key: '_propertyName', label: 'Imóvel', sortable: true },
    { key: '_clientName', label: 'Cliente', sortable: true },
    { key: 'type', label: 'Tipo', sortable: true },
    { key: 'value', label: 'Valor', sortable: true },
    { key: 'date', label: 'Data', sortable: true },
    { key: 'rental_analysis', label: 'Análise', sortable: false },
    { key: 'rental_value', label: 'Valor aluguel', sortable: false },
    { key: 'rental_base', label: 'Valor base', sortable: false },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];
// Mesma calibragem por piso de cabeçalho. Somavam 1560px; com 11
// colunas visíveis não existe arranjo legível que caiba nos 1130px do container
// — aqui o scroll horizontal interno é o comportamento correto, e quem quiser a
// tela inteira esconde coluna pela engrenagem (§3). O que foi corrigido é o
// excesso gratuito (1560 → 1410) e a folga da coluna de ação.
const DEAL_DEFAULT_COL_WIDTHS: Record<string, number> = {
    id: 95, _propertyName: 150, _clientName: 200, type: 100, value: 130, date: 115,
    rental_analysis: 110, rental_value: 137, rental_base: 130, status: 120, actions: 130,
};

// Colunas da aba Corretores (§5.2/§6.1).
const BROKER_COLUMNS: ColumnConfig[] = [
    { key: 'name', label: 'Corretor', sortable: true },
    { key: 'email', label: 'E-mail', sortable: true },
    { key: 'phone', label: 'Telefone', sortable: true },
    { key: 'agency_name', label: 'Imobiliária', sortable: true },
    { key: 'commission_rate', label: 'Comissão', sortable: true },
    { key: 'creci', label: 'CRECI', sortable: true },
    { key: 'is_active', label: 'Status', sortable: false },
    { key: 'access', label: 'Acesso ao Portal', sortable: false },
];
const BROKER_DEFAULT_COL_WIDTHS: Record<string, number> = {
    name: 200, email: 220, phone: 140, agency_name: 180, commission_rate: 136, creci: 111, is_active: 100, access: 140,
};

// ---------------------------------------------------------------------------
// Reordenar colunas por arraste (estilo ClickUp, ver GUIA_TABLE_UTILS.md) —
// cada tabela mapeia `tableColumns.orderedVisibleColumns` (ordem que o usuário
// arrasta) para colgroup/thead/tbody, em vez de uma sequência fixa de JSX.
// 'actions' fica fora dos mapas de header — é coluna estrutural fixa no fim,
// nunca arrastável.
// ---------------------------------------------------------------------------

// Header por coluna da tabela de Unidades — dois mapas porque a mesma tabela
// troca de colunas conforme o modo (edifícios × unidades de um edifício, ver
// `selectedBuildingId`); 'price'/'name'/'status' existem nos dois modos mas
// 'price' muda de rótulo ("Patrimônio" × "Valor base") e formatação
// (renderUnitsCell decide pelo `selectedBuildingId` do ctx).
interface UnitsHeaderDef { label: string; sortable?: boolean; className: string }

const UNITS_BUILDING_COLUMN_HEADERS: Record<string, UnitsHeaderDef> = {
    name:      { label: 'Imóvel',                sortable: true,  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    address:   { label: 'Endereço / referência',  sortable: true,  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    price:     { label: 'Patrimônio',             sortable: true,  className: 'px-6 py-2 border-r border-gray-100 text-right overflow-hidden' },
    occupancy: { label: 'Ocupação',               sortable: false, className: 'px-6 py-2 border-r border-gray-100 text-center overflow-hidden' },
    status:    { label: 'Status',                 sortable: true,  className: 'px-6 py-2 border-r border-gray-100 text-center overflow-hidden' },
};

const UNITS_UNIT_COLUMN_HEADERS: Record<string, UnitsHeaderDef> = {
    name:            { label: 'Imóvel',        sortable: true,  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    block:           { label: 'Bloco',         sortable: true,  className: 'px-6 py-2 border-r border-gray-100 text-center overflow-hidden' },
    floor:           { label: 'Pav.',          sortable: true,  className: 'px-6 py-2 border-r border-gray-100 text-center overflow-hidden' },
    private_area:    { label: 'Á. priv.',      sortable: true,  className: 'px-6 py-2 border-r border-gray-100 text-center whitespace-nowrap overflow-hidden' },
    rental_analysis: { label: 'Análise',       sortable: false, className: 'px-6 py-2 border-r border-gray-100 text-right overflow-hidden whitespace-nowrap' },
    rental_value:    { label: 'Valor aluguel', sortable: false, className: 'px-6 py-2 border-r border-gray-100 text-right overflow-hidden whitespace-nowrap' },
    price:           { label: 'Valor base',    sortable: true,  className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap overflow-hidden' },
    status:          { label: 'Status',        sortable: true,  className: 'px-6 py-2 border-r border-gray-100 text-center overflow-hidden' },
};

// Classes específicas por coluna do <td> (além da base comum aplicada na
// renderização da linha) — extraídas 1:1 do que já estava hardcoded em cada
// <td>. 'price' usa as mesmas classes nos dois modos (só o valor formatado muda).
const UNITS_TD_CLASS: Record<string, string> = {
    name: '',
    address: 'text-sm font-normal text-gray-600',
    price: 'text-sm font-medium text-gray-800 text-right',
    occupancy: 'text-center',
    block: 'text-sm font-normal text-gray-600 text-center',
    floor: 'text-sm font-normal text-gray-600 text-center',
    private_area: 'text-sm font-normal text-gray-600 text-center',
    rental_analysis: 'text-right',
    rental_value: 'text-sm font-medium text-gray-800 text-right',
    status: 'text-center',
};

interface UnitsRowCtx {
    selectedBuildingId: string | null;
    properties: Property[];
    getContractedRentalValue: (propertyId: string) => number | null;
    getUnitStatusDisplay: (property: Property) => { label: string; color: string };
}

function renderUnitsCell(key: string, property: Property, ctx: UnitsRowCtx): React.ReactNode {
    switch (key) {
        case 'name':
            return (
                <div className="flex items-center gap-2">
                    {property.type === 'BUILDING' ? (
                        <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                    ) : (
                        <Home className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                    <span className="text-sm font-normal text-gray-900 group-hover:text-blue-600 transition-colors">{property.name}</span>
                </div>
            );
        case 'address':
            return property.address;
        case 'price':
            return ctx.selectedBuildingId
                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rentalValueOf(property))
                : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(property.price || 0);
        case 'occupancy': {
            const bUnits = ctx.properties.filter(u => u.parent_id === property.id);
            const rentedCount = bUnits.filter(u => u.status === PropertyStatus.RENTED).length;
            const pct = bUnits.length > 0 ? (rentedCount / bUnits.length) * 100 : 0;
            return (
                <div className="flex flex-col items-center gap-1">
                    <span className="text-sm font-normal text-blue-600">{pct.toFixed(0)}%</span>
                    <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                    </div>
                </div>
            );
        }
        case 'block':
            return property.block || '-';
        case 'floor':
            return property.floor ? `${property.floor}º` : 'T';
        case 'private_area':
            return property.private_area ? `${property.private_area}m²` : '-';
        case 'rental_analysis': {
            const base = rentalValueOf(property);
            const contratado = ctx.getContractedRentalValue(property.id);
            if (contratado == null) {
                return <span className="text-sm text-gray-400">—</span>;
            }
            const diff = contratado - base;
            const ratio = base > 0 ? (contratado / base) * 100 : null;
            const diffColor = diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-gray-400';
            return (
                <div className="flex flex-col items-end leading-tight">
                    <span className={`text-sm font-medium ${diffColor}`}>
                        {diff > 0 ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(diff)}
                    </span>
                    <span className="text-xs text-gray-400">
                        {ratio != null ? `${ratio.toFixed(1)}%` : '—'}
                    </span>
                </div>
            );
        }
        case 'rental_value': {
            const contratado = ctx.getContractedRentalValue(property.id);
            return contratado != null
                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contratado)
                : <span className="text-gray-400 font-normal">Sem contrato</span>;
        }
        case 'status':
            return (
                <span className={`text-sm font-normal ${ctx.getUnitStatusDisplay(property).color}`}>
                    {ctx.getUnitStatusDisplay(property).label}
                </span>
            );
        default:
            return null;
    }
}

// Header por coluna da tabela de Contratos (ver DEAL_COLUMNS acima).
const DEAL_COLUMN_HEADERS: Record<string, UnitsHeaderDef> = {
    id:              { label: 'ID',            sortable: true,  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    _propertyName:   { label: 'Imóvel',         sortable: true,  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    _clientName:     { label: 'Cliente',        sortable: true,  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    type:            { label: 'Tipo',           sortable: true,  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    value:           { label: 'Valor',          sortable: true,  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    date:            { label: 'Data',           sortable: true,  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    rental_analysis: { label: 'Análise',        sortable: false, className: 'px-6 py-2 border-r border-gray-100 text-right overflow-hidden whitespace-nowrap' },
    rental_value:    { label: 'Valor aluguel',  sortable: false, className: 'px-6 py-2 border-r border-gray-100 text-right overflow-hidden whitespace-nowrap' },
    rental_base:     { label: 'Valor base',     sortable: false, className: 'px-6 py-2 border-r border-gray-100 text-right overflow-hidden whitespace-nowrap' },
    status:          { label: 'Status',         sortable: true,  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

const DEAL_TD_CLASS: Record<string, string> = {
    id: 'text-sm font-normal text-blue-600 truncate',
    _propertyName: 'text-sm font-normal text-gray-900 group-hover:text-blue-600 transition-colors truncate',
    _clientName: 'text-sm font-normal text-gray-600 truncate',
    type: 'text-sm font-normal text-gray-600',
    value: 'text-sm font-medium text-gray-800 truncate',
    date: 'text-sm font-normal text-gray-600',
    rental_analysis: 'text-right',
    rental_value: 'text-sm font-medium text-gray-800 text-right',
    rental_base: 'text-sm font-medium text-gray-800 text-right',
    status: '',
};

// Mesmo shape do item que `sortedDeals` produz (ver useMemo mais abaixo no
// componente) — negócio + os campos resolvidos (_propertyName/_clientName/...).
type SortedDeal = PropertyDeal & { _propertyName: string; _unitCount: number; _unitNames: string; _clientName: string };

interface DealRowCtx {
    properties: Property[];
    clients: Client[];
    getDealBaseValue: (deal: PropertyDeal) => number;
    getDealStatusDisplay: (status?: string) => { label: string; color: string };
}

function renderDealCell(key: string, deal: SortedDeal, ctx: DealRowCtx): React.ReactNode {
    switch (key) {
        case 'id':
            return `#${deal.id.substring(0, 8).toUpperCase()}`;
        case '_propertyName': {
            const property = ctx.properties.find(p => p.id === deal.property_id);
            return (
                <span title={deal._unitNames || undefined}>
                    {deal._propertyName || property?.name || '---'}
                    {deal._unitCount > 1 && (
                        <span className="ml-1.5 text-xs text-gray-400">+{deal._unitCount - 1}</span>
                    )}
                </span>
            );
        }
        case '_clientName': {
            const client = ctx.clients.find(c => c.id === deal.client_id);
            return client?.name || 'Não vinculado';
        }
        case 'type':
            return deal.type === 'SALE' ? 'Venda' : 'Locação';
        case 'value':
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.value);
        case 'date':
            return new Date(deal.date).toLocaleDateString('pt-BR');
        case 'rental_analysis': {
            const base = ctx.getDealBaseValue(deal);
            const contratado = getDealInstallmentValue(deal);
            const diff = contratado - base;
            const ratio = base > 0 ? (contratado / base) * 100 : null;
            const diffColor = diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-gray-400';
            return (
                <div className="flex flex-col items-end leading-tight">
                    <span className={`text-sm font-medium ${diffColor}`}>
                        {diff > 0 ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(diff)}
                    </span>
                    <span className="text-xs text-gray-400">
                        {ratio != null ? `${ratio.toFixed(1)}%` : '—'}
                    </span>
                </div>
            );
        }
        case 'rental_value':
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(getDealInstallmentValue(deal));
        case 'rental_base':
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ctx.getDealBaseValue(deal));
        case 'status':
            return (
                <span className={`text-sm font-normal ${ctx.getDealStatusDisplay(deal.status).color}`}>
                    {ctx.getDealStatusDisplay(deal.status).label}
                </span>
            );
        default:
            return null;
    }
}

// Header por coluna da tabela de Corretores (ver BROKER_COLUMNS acima).
const BROKER_COLUMN_HEADERS: Record<string, UnitsHeaderDef> = {
    name:            { label: 'Corretor',          sortable: true,  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    email:           { label: 'E-mail',            sortable: true,  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    phone:           { label: 'Telefone',          sortable: true,  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    agency_name:     { label: 'Imobiliária',       sortable: true,  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    commission_rate: { label: 'Comissão',          sortable: true,  className: 'px-6 py-2 border-r border-gray-100 text-right overflow-hidden' },
    creci:           { label: 'CRECI',             sortable: true,  className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    is_active:       { label: 'Status',            sortable: false, className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    access:          { label: 'Acesso ao Portal',  sortable: false, className: 'px-6 py-2 overflow-hidden' },
};

const BROKER_TD_CLASS: Record<string, string> = {
    name: 'text-sm font-normal text-gray-900 truncate',
    email: 'text-sm font-normal text-gray-600 truncate',
    phone: 'text-sm font-normal text-gray-600 truncate',
    agency_name: 'text-sm font-normal text-blue-600 truncate',
    commission_rate: 'text-sm font-medium text-gray-800 text-right truncate',
    creci: 'text-sm font-normal text-gray-600 truncate',
    is_active: '',
    access: '',
};

interface BrokerRowCtx {
    brokerAccess: Record<string, boolean>;
    onToggleAccess: (brokerId: string, enabled: boolean) => void;
}

function renderBrokerCell(key: string, broker: BrokerProfile, ctx: BrokerRowCtx): React.ReactNode {
    switch (key) {
        case 'name':
            return broker.name;
        case 'email':
            return broker.email;
        case 'phone':
            return broker.phone || '---';
        case 'agency_name':
            return broker.agency_name || 'Autônomo';
        case 'commission_rate':
            return `${broker.commission_rate}%`;
        case 'creci':
            return broker.creci || '---';
        case 'is_active':
            return (
                <span className={`text-sm font-normal ${broker.is_active ? 'text-emerald-600' : 'text-red-600'}`}>
                    {broker.is_active ? 'Ativo' : 'Inativo'}
                </span>
            );
        case 'access':
            return (
                <label className="relative inline-flex items-center cursor-pointer">
                    <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={!!ctx.brokerAccess[broker.id]}
                        onChange={e => ctx.onToggleAccess(broker.id, e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
            );
        default:
            return null;
    }
}

const RentalsModule: React.FC<RentalsModuleProps> = ({ organizationId }) => {
    const [activeTab, setActiveTab] = useState<RentalsTab>(
        (localStorage.getItem('rentals_active_tab') as RentalsTab) || 'inventory'
    );
    // Contratos de locação vencendo em 30 dias — badge da aba Renovações.
    const [renewalsBadge, setRenewalsBadge] = useState(0);
    // `null` = não medido (log de status ainda não existe no banco), que é
    // diferente de zero. Ver services/rentalVacancyService.ts.
    const [vacancy, setVacancy] = useState<RentalVacancyMetrics | null>(null);
    // `null` = apropriação de despesa por imóvel ainda não existe no banco.
    // Sem ela o "NOI" seria a receita disfarçada de resultado — pior que ocultar.
    const [noi, setNoi] = useState<RentalNoiMetrics | null>(null);
    // WALE, renovação e cobrança (Fase 3). `null` = não foi possível medir.
    const [executive, setExecutive] = useState<RentalExecutiveMetrics | null>(null);
    // O painel executivo são 8 indicadores; o resto fica recolhido. "20 não é
    // dashboard, é relatório" — decisão registrada no plano da Fase 3.
    const [showDetail, setShowDetail] = usePersistedState('rentals:analysisDetail', false);
    // A aba Renovações é só a FILA. Contrato, vigência, renovações e documentos
    // moram todos em Gerenciar Negociação › Contrato e Assinatura — abrir um
    // detalhe de contrato aqui dentro criaria um segundo caminho para a mesma
    // coisa. Por isso "Ver contrato" e "Renovar" levam para lá.
    const [dealModalTab, setDealModalTab] = useState<string | undefined>(undefined);
    const [properties, setProperties] = useState<Property[]>([]);
    const [deals, setDeals] = useState<PropertyDeal[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [brokers, setBrokers] = useState<BrokerProfile[]>([]);
    const [brokerAccess, setBrokerAccess] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    // F2: filtros sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('rentalsModuleFilters:search', '');
    const [dealSearchTerm, setDealSearchTerm] = usePersistedState('rentalsModuleFilters:dealSearch', '');
    const [brokerSearchTerm, setBrokerSearchTerm] = usePersistedState('rentalsModuleFilters:brokerSearch', '');
    const [viewMode, setViewMode] = usePersistedState<'grid' | 'list' | 'tower'>('rentalsModuleFilters:viewMode', 'list');
    const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
    const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
    const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(() => {
        const saved = localStorage.getItem('rentals_selected_building_id');
        return (saved && saved !== 'undefined') ? saved : null;
    });
    // Colunas + ordenação + visibilidade da tabela de Unidades (§1/§2/§5.2) —
    // substitui o antigo sortConfig local; handleColumnSort/visibleColumns vêm daqui.
    const unitsTableColumns = useTableColumns(PROPERTY_COLUMNS, 'rentalsUnitsColumns');
    const sortConfig = unitsTableColumns.sortColumn
        ? { key: unitsTableColumns.sortColumn, direction: unitsTableColumns.sortDirection }
        : null;
    const handleSort = unitsTableColumns.handleColumnSort;
    // Redimensionamento de colunas (§6.1) — a tabela troca de colunas conforme o
    // modo (edifícios × unidades de um edifício), por isso a largura total soma
    // só as colunas de dado do modo ativo, além de "Ações".
    // `getWidth` lê `defaultWidths` a cada render (não captura no mount), então
    // trocar o record ao entrar/sair do edifício vale na hora.
    const unitsCols = useResizableColumns(
        selectedBuildingId ? UNIT_MODE_COL_WIDTHS : BUILDING_MODE_COL_WIDTHS,
        'rentalsUnitsColWidths',
    );
    const unitsModeColumnKeys = selectedBuildingId ? unitModeColumnKeys : buildingModeColumnKeys;
    const unitsTableTotalWidth = unitsModeColumnKeys
        .filter(key => unitsTableColumns.visibleColumns.includes(key))
        .reduce((sum, key) => sum + unitsCols.getWidth(key), 0)
        + unitsCols.getWidth('actions');
    // Colunas + ordenação + redimensionamento da aba Contratos (§5.2/§6.1).
    const dealTableColumns = useTableColumns(DEAL_COLUMNS, 'rentalsDealsColumns');
    const dealCols = useResizableColumns(DEAL_DEFAULT_COL_WIDTHS, 'rentalsDealsColWidths');
    const dealSortConfig = dealTableColumns.sortColumn
        ? { key: dealTableColumns.sortColumn, direction: dealTableColumns.sortDirection }
        : null;
    const handleDealSort = dealTableColumns.handleColumnSort;
    const dealsTableTotalWidth = DEAL_COLUMNS
        .filter(c => dealTableColumns.visibleColumns.includes(c.key))
        .reduce((sum, c) => sum + dealCols.getWidth(c.key), 0);

    // Colunas + ordenação + redimensionamento da aba Corretores (§5.2/§6.1).
    const brokerTableColumns = useTableColumns(BROKER_COLUMNS, 'rentalsBrokersColumns');
    const brokerCols = useResizableColumns(BROKER_DEFAULT_COL_WIDTHS, 'rentalsBrokersColWidths');
    const brokerSortConfig = brokerTableColumns.sortColumn
        ? { key: brokerTableColumns.sortColumn, direction: brokerTableColumns.sortDirection }
        : null;
    const handleBrokerSort = brokerTableColumns.handleColumnSort;
    const brokersTableTotalWidth = BROKER_COLUMNS
        .filter(c => brokerTableColumns.visibleColumns.includes(c.key))
        .reduce((sum, c) => sum + brokerCols.getWidth(c.key), 0);

    // Modals Control
    const [isPropertyModalOpen, setIsPropertyModalOpen] = useState(false);
    const [isDealModalOpen, setIsDealModalOpen] = useState(false);
    const [editingProperty, setEditingProperty] = useState<Property | undefined>(undefined);
    const [editingDeal, setEditingDeal] = useState<PropertyDeal | undefined>(undefined);
    const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
    const [bulkPriceValue, setBulkPriceValue] = useState('');

    const confirm = useConfirm();
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const loadData = async () => {
        console.log('[Commercial] Loading data for organization:', organizationId);
        setLoading(true);
        try {
            const [propsData, dealsData, clientsData] = await Promise.all([
                commercialService.listProperties(organizationId),
                commercialService.listDeals(),
                clientService.listClients(),
            ]);
            setProperties(propsData.filter(p => !p.purpose || p.purpose === 'RENTAL' || p.purpose === 'BOTH'));
            setDeals(dealsData.filter(d => d.type === 'RENTAL'));
            setClients(clientsData);
        } catch (err) {
            console.error('[Commercial] Error loading data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [organizationId]);

    /**
     * Da fila de Renovações para a negociação de origem, já na aba
     * "Contrato e Assinatura" — é lá que vivem vigência, renovações e documentos.
     * O vínculo é `contracts.deal_id`; contrato sem negociação (ex.: filho de uma
     * renovação anterior) não tem para onde ir, e a fila avisa em vez de abrir vazio.
     */
    const openDealForContract = async (contractId: string) => {
        try {
            // Sobe a cadeia de renovação até achar a negociação. Contrato-filho
            // não herda `deal_id` de propósito (getContractByDealId usa
            // maybeSingle; dois contratos no mesmo deal quebrariam o DealModal),
            // então sem esta subida ele ficaria sem porta de entrada por
            // Locações. A renovação por ADITIVO — a via padrão do Sheet — não
            // cria esse caso: mantém o mesmo contrato e a mesma negociação.
            let atual = contractId;
            let numero = '';
            let dealId: string | undefined;
            const visitados = new Set<string>();

            for (let i = 0; i < 20 && !dealId; i++) {
                if (visitados.has(atual)) break;
                visitados.add(atual);
                const { data } = await supabase
                    .from('contracts')
                    .select('deal_id, number, parent_contract_id')
                    .eq('id', atual)
                    .maybeSingle();
                if (!data) break;
                if (!numero) numero = (data.number as string) ?? '';
                if (data.deal_id) { dealId = data.deal_id as string; break; }
                if (!data.parent_contract_id) break;
                atual = data.parent_contract_id as string;
            }

            const deal = dealId ? deals.find(d => d.id === dealId) : undefined;
            if (!deal) {
                notify(`O contrato ${numero} não tem negociação vinculada nesta organização — abra por Comercial › Contratos.`, 'error');
                return;
            }
            setEditingDeal(deal);
            setDealModalTab('contrato');
            setIsDealModalOpen(true);
        } catch (e) {
            notify(`Erro ao abrir a negociação: ${e instanceof Error ? e.message : ''}`, 'error');
        }
    };

    // Badge da aba Renovações. REGRA #5: org nula não bloqueia — a RLS recorta.
    useEffect(() => {
        let active = true;
        contractRenewalService.listRentalsExpiring(organizationId, 30)
            .then(list => { if (active) setRenewalsBadge(list.length); })
            .catch(err => console.error('[Rentals] Erro ao contar renovações pendentes:', err));
        return () => { active = false; };
    }, [organizationId]);

    // Habilitação de corretor por empreendimento (Portal do Corretor) — carrega
    // só quando a aba Corretores está aberta num prédio específico. Toggle
    // independente do mesmo prédio em Venda de Ativos (eixo separado).
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

    // Persistência de estado
    useEffect(() => {
        if (activeTab) localStorage.setItem('rentals_active_tab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        if (selectedBuildingId) {
            localStorage.setItem('rentals_selected_building_id', selectedBuildingId);
        } else {
            localStorage.removeItem('rentals_selected_building_id');
        }
    }, [selectedBuildingId]);

    // Reset de navegação se o edifício for removido
    useEffect(() => {
        if (!selectedBuildingId) {
            if (activeTab !== 'inventory' && activeTab !== 'analysis') setActiveTab('inventory');
            if (sortConfig) unitsTableColumns.setSortColumn(null);
            if (viewMode === 'tower') setViewMode('grid');
        }
    }, [selectedBuildingId, activeTab, sortConfig, viewMode]);


    const handleSaveProperty = async (data: PropertyFormData) => {
        if (!organizationId && !data.organization_id) {
            notify('Erro: Nenhuma organização ativa selecionada. Por favor, selecione uma empresa no menu lateral.', 'error');
            return;
        }

        try {
            const { _bulkConfig, ...propertyData } = data;

            // Garantir que a organização está vinculada ao criar novo imóvel
            const propertyToSave: Partial<Property> & { organization_id?: string } = {
                ...propertyData,
                organization_id: propertyData.organization_id || organizationId
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
                    existingUnits = await commercialService.listProperties(undefined, undefined);
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
                                purpose: propertyToSave.purpose || 'BOTH',
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
                        for(const id of unusedIds) {
                            try {
                                await commercialService.deleteProperty(id);
                            } catch (e) {
                                console.log(`[RentalsModule] Could not delete unused unit ${id}`);
                            }
                        }
                    }

                    notify(`Edifício e ${totalCount} unidades processados com sucesso!`);
                }
            } 
            // Fallback legado
            else if (propertyToSave.type === 'BUILDING' && _bulkConfig && (_bulkConfig.count ?? 0) > 0) {
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

    // Excluir direto (sem diálogo) — usado pelo InlineDisclosureMenu, se necessário no futuro.
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
            notify('Negociação excluída!');
            loadData();
        } catch (err: any) {
            notify('Erro ao excluir: ' + (err.message || 'Erro desconhecido'), 'error');
        }
    };

    const handleDeleteProperty = async (id: string) => {
        // Mede o estrago ANTES de perguntar: excluir um edifício leva junto as
        // unidades filhas e as negociações delas (FK CASCADE em commercial_deals).
        let impact = { children: 0, deals: 0 };
        try {
            impact = await commercialService.getPropertyDeleteImpact(id);
        } catch (err) {
            console.error('[Rentals] falha ao medir impacto da exclusão:', err);
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
        } catch (err: any) {
            notify(err.message || 'Erro ao excluir imóvel.', 'error');
        }
    };

    const filteredProperties = useMemo(() => {
        let result = properties.filter(p => {
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.address.toLowerCase().includes(searchTerm.toLowerCase());
            
            if (!selectedBuildingId) {
                // Master View: Mostrar apenas Edifícios ou unidades que NÃO são filhas de edifícios (parent_id null)
                // Se o termo de busca for preenchido, mostrar tudo que bater com o nome para facilitar a localização
                if (searchTerm) return matchesSearch;
                
                // Relaxamos a regra: se for BUILDING, mostramos sempre na visão mestre (mesmo que tenha parent_id por erro)
                return matchesSearch && (p.type === 'BUILDING' || !p.parent_id);
            }
            
            // Detail View: Mostrar apenas filhos do edifício selecionado
            return matchesSearch && String(p.parent_id).toLowerCase() === String(selectedBuildingId).toLowerCase();
        });

        if (sortConfig) {
            result.sort((a: any, b: any) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                if (aValue === null || aValue === undefined) aValue = sortConfig.direction === 'asc' ? Infinity : -Infinity;
                if (bValue === null || bValue === undefined) bValue = sortConfig.direction === 'asc' ? Infinity : -Infinity;

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [properties, searchTerm, selectedBuildingId, sortConfig]);

    // Contratos ordenáveis (§6.3) — Imóvel/Cliente não são campos diretos do
    // negócio, então resolvemos o nome uma vez antes de comparar.
    const sortedDeals = useMemo(() => {
        // Dentro de "Gestão de Unidades" a aba Contratos mostra SÓ os contratos
        // deste edifício — antes listava todos os contratos de locação da
        // organização, misturando unidades de imóveis diferentes. O vínculo é
        // pela unidade: qualquer unidade do contrato (units[] ou property_id)
        // que seja filha do edifício aberto — ou o próprio edifício, quando ele
        // é alugado inteiro.
        const pertenceAoEdificio = (id?: string | null) => {
            if (!id) return false;
            if (String(id).toLowerCase() === String(selectedBuildingId).toLowerCase()) return true;
            const unidade = properties.find(p => p.id === id);
            return !!unidade && String(unidade.parent_id ?? '').toLowerCase() === String(selectedBuildingId).toLowerCase();
        };
        const escopo = selectedBuildingId
            ? deals.filter(d => {
                const ids = (d.units && d.units.length > 0)
                    ? d.units.map(u => u.property_id)
                    : [d.property_id];
                return ids.some(pertenceAoEdificio);
            })
            : deals;

        const withLookup = escopo.map(d => {
            // Um contrato pode reunir várias unidades — o rótulo mostra a
            // principal + a contagem das demais; o title lista todas.
            const unitIds = (d.units && d.units.length > 0)
                ? d.units.map(u => u.property_id)
                : (d.property_id ? [d.property_id] : []);
            const unitNames = unitIds
                .map(id => properties.find(p => p.id === id)?.name || '')
                .filter(Boolean);
            const primaryName = properties.find(p => p.id === d.property_id)?.name || unitNames[0] || '';
            return {
                ...d,
                _propertyName: primaryName,
                _unitCount: unitIds.length,
                _unitNames: unitNames.join(' + '),
                _clientName: clients.find(c => c.id === d.client_id)?.name || '',
            };
        });
        const term = dealSearchTerm.toLowerCase();
        const filtered = term
            ? withLookup.filter(d =>
                d._propertyName.toLowerCase().includes(term) ||
                d._clientName.toLowerCase().includes(term) ||
                d.id.toLowerCase().includes(term)
            )
            : withLookup;
        if (!dealSortConfig) return filtered;
        const { key, direction } = dealSortConfig;
        return [...filtered].sort((a: any, b: any) => {
            let aValue = a[key];
            let bValue = b[key];
            // "status" cru (IN_NEGOTIATION/PENDING/RESERVA/...) não tem ordem
            // alfabética que bata com a progressão mostrada em tela
            // (getDealStatusDisplay) — dessincroniza ordenação × rótulo exibido.
            // Ordena pelo índice do workflow (lib/dealWorkflow.ts); CANCELLED
            // não é um step da esteira, então fica sempre por último.
            if (key === 'status') {
                aValue = aValue === 'CANCELLED' ? WORKFLOW_STEPS.length : getStepIndex(aValue as DealWorkflowStatus);
                bValue = bValue === 'CANCELLED' ? WORKFLOW_STEPS.length : getStepIndex(bValue as DealWorkflowStatus);
            }
            if (aValue === null || aValue === undefined) aValue = direction === 'asc' ? Infinity : -Infinity;
            if (bValue === null || bValue === undefined) bValue = direction === 'asc' ? Infinity : -Infinity;
            if (aValue < bValue) return direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [deals, properties, clients, dealSortConfig, selectedBuildingId, dealSearchTerm]);

    // Corretores ordenáveis (§6.3) — busca própria (§5.2): o searchTerm global
    // pertence à aba Unidades e não tem input visível aqui, então a aba
    // Corretores precisa da sua própria caixa de busca persistida.
    const sortedBrokers = useMemo(() => {
        const filtered = brokers.filter(b =>
            b.name.toLowerCase().includes(brokerSearchTerm.toLowerCase()) || b.email.toLowerCase().includes(brokerSearchTerm.toLowerCase())
        );
        if (!brokerSortConfig) return filtered;
        const { key, direction } = brokerSortConfig;
        return [...filtered].sort((a: any, b: any) => {
            let aValue = a[key];
            let bValue = b[key];
            if (aValue === null || aValue === undefined) aValue = direction === 'asc' ? Infinity : -Infinity;
            if (bValue === null || bValue === undefined) bValue = direction === 'asc' ? Infinity : -Infinity;
            if (aValue < bValue) return direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [brokers, brokerSearchTerm, brokerSortConfig]);

    const currentBuilding = selectedBuildingId ? properties.find(p => String(p.id).toLowerCase() === String(selectedBuildingId).toLowerCase()) : null;

    // Organização em cascata (mesmo padrão do SalesModule): quando há um edifício
    // aberto, a org DELE é a fonte de verdade para corretores — um fornecedor
    // "Todas as organizações" é materializado em broker_profiles UMA VEZ POR
    // ORGANIZAÇÃO, então sem esse escopo os corretores apareciam repetidos, um
    // por organização que o usuário gerencia.
    const effectiveOrganizationId = currentBuilding?.organization_id || organizationId;

    useEffect(() => {
        brokerService.listSupplierLinkedProfiles(effectiveOrganizationId)
            .then(setBrokers)
            .catch(err => console.error('[Commercial] Error loading brokers:', err));
    }, [effectiveOrganizationId]);

    // Vacância (Fase 1). Só busca na aba Análise — o log pode ter muitos eventos
    // e não faz sentido pagar essa consulta em quem está mexendo no inventário.
    // `selectedBuildingId` entra na chave porque dentro de um edifício a métrica
    // é só das unidades dele.
    useEffect(() => {
        if (activeTab !== 'analysis') return;
        let alive = true;
        rentalVacancyService
            .getVacancyMetrics(effectiveOrganizationId, selectedBuildingId)
            .then(data => { if (alive) setVacancy(data); });
        return () => { alive = false; };
    }, [activeTab, effectiveOrganizationId, selectedBuildingId]);

    // NOI (Fase 2). Janela: ano corrente até o mês atual — a despesa é somada no
    // período, e o cap rate é anualizado a partir dela.
    useEffect(() => {
        if (activeTab !== 'analysis') return;
        let alive = true;
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        rentalNoiService
            .getNoiMetrics(effectiveOrganizationId, `${year}-01-01`, `${year}-${month}-28`)
            .then(data => { if (alive) setNoi(data); });
        return () => { alive = false; };
    }, [activeTab, effectiveOrganizationId]);

    // WALE, taxa de renovação e cobrança (Fase 3). Vem de `contracts` +
    // `vw_receivables`, não de `deals` — por isso não cabe no `stats`.
    useEffect(() => {
        if (activeTab !== 'analysis') return;
        let alive = true;
        rentalExecutiveService
            .load(effectiveOrganizationId)
            .then(data => { if (alive) setExecutive(data); });
        return () => { alive = false; };
    }, [activeTab, effectiveOrganizationId]);

    const stats = useMemo(() => {
        // Patrimônio: cada imóvel entra UMA vez, por rollup. As unidades mandam
        // quando têm preço; senão vale o preço do próprio edifício — que em
        // locação é o caso comum, porque a unidade carrega `rental_price` e
        // deixa `price` vazio (ver sumPortfolioValue).
        const totalValue = sumPortfolioValue(properties, p => p.price || 0);

        // Receita mensal é a soma das PARCELAS contratadas. Usava `deal.value`,
        // que no aluguel é o valor mensal SUGERIDO pela Inteligência — o KPI
        // mostrava preço de tabela no lugar de receita (e contaminava o yield).
        const activeRentals = deals.filter(d => d.type === 'RENTAL' && d.status === 'COMPLETED');
        const monthlyRevenue = activeRentals.reduce((acc, d) => acc + getDealInstallmentValue(d), 0);

        // Unidades locáveis = folhas da carteira, a mesma base do patrimônio.
        // Antes era `type !== 'BUILDING'`, que descartava o edifício locado
        // INTEIRO (galpão, loja de rua) — ele não tem unidade filha, então
        // sumia da conta e a ocupação ficava cega para ele. Edifício COM
        // unidades continua fora: quem ocupa são as unidades.
        const leaseableUnits = leafNodes(properties);
        const totalUnitsCount = leaseableUnits.length;
        const rentedCount = leaseableUnits.filter(p => p.status === PropertyStatus.RENTED).length;

        const occupancyRate = totalUnitsCount > 0 ? ((rentedCount / totalUnitsCount) * 100).toFixed(1) : '0.0';
        const yieldValue = totalValue > 0 ? ((monthlyRevenue / totalValue) * 100).toFixed(2) : '0.00';

        return {
            activeAssets: properties.filter(p => p.type === 'BUILDING' || !p.parent_id).length,
            monthlyRevenue,
            monthlyYield: yieldValue,
            occupancyRate,
            totalValue
        };
    }, [properties, deals]);

    // Texto simples colorido — sem pílula/fundo/uppercase (ui_ux_guia_unificado.md §8).
    const getStatusColor = (status: PropertyStatus) => {
        switch (status) {
            case PropertyStatus.AVAILABLE: return 'text-emerald-600';
            case PropertyStatus.SOLD: return 'text-blue-600';
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

    // Mesmo vocabulário/cores do StatusStepper do DealModal (lib/dealWorkflow.ts) —
    // antes a aba Contratos colapsava Proposta/Aprovação/Reserva/Contrato/Assinatura
    // num genérico "Pendente", dessincronizado do status (mais granular) que a
    // Unidade já exibe a partir do mesmo negócio.
    const getDealStatusDisplay = (status?: string) => {
        if (status === 'CANCELLED') return { label: 'Cancelado', color: 'text-red-600' };
        const step = getStepByStatus((status || 'IN_NEGOTIATION') as DealWorkflowStatus);
        return step ? { label: step.label, color: step.color } : { label: status || '', color: 'text-gray-600' };
    };

    // Status da UNIDADE no mesmo vocabulário da aba Contratos.
    //
    // As duas abas descreviam o mesmo estado com palavras diferentes: a unidade
    // de um contrato em Assinatura aparecia como "Reservado" aqui e "Assinatura"
    // lá — o dado sempre esteve correto (RESERVED é o reflexo certo de
    // ASSINATURA), mas o usuário lia como dessincronia porque as palavras não
    // batiam. Agora a unidade mostra o ESTÁGIO do contrato que a ocupa;
    // "Disponível" só quando não há contrato ativo nenhum.
    const getUnitStatusDisplay = (property: Property) => {
        const deal = deals.find(d => d.status !== 'CANCELLED' &&
            (d.units && d.units.length > 0
                ? d.units.some(u => u.property_id === property.id)
                : d.property_id === property.id));
        if (deal) return getDealStatusDisplay(deal.status);
        // Sem contrato ativo: cai no estado do cadastro. Vendido/Permutado não
        // vêm de contrato de locação, então continuam com o rótulo próprio.
        return { label: getStatusLabel(property.status), color: getStatusColor(property.status) };
    };

    // Valor efetivamente CONTRATADO desta unidade — a PARCELA mensal, não o
    // total do contrato (mesma armadilha de project_locacao_valor_parcela_vs_total:
    // `deal.value`/`unit.value` são a soma/participação no TOTAL; quem carrega o
    // valor mensal é `installment_value`). Uma unidade tem no máximo um
    // contrato ativo (regra de unicidade do commercialService), então o
    // primeiro achado já é o certo.
    /**
     * @param onlyCompleted quando true, considera SÓ contrato fechado
     *   (`COMPLETED`). A coluna da tabela quer o contrato vigente em qualquer
     *   estágio; já a **ocupação financeira** precisa da mesma definição de
     *   "contratado" que a Receita mensal usa — senão dois cards vizinhos
     *   medem coisas diferentes com o mesmo nome, e a ocupação financeira
     *   incorpora negociação que ainda pode não fechar.
     */
    const getContractedRentalValue = (propertyId: string, onlyCompleted = false): number | null => {
        const deal = deals.find(d => d.type === 'RENTAL' &&
            (onlyCompleted ? d.status === 'COMPLETED' : d.status !== 'CANCELLED') &&
            (d.units && d.units.length > 0
                ? d.units.some(u => u.property_id === propertyId)
                : d.property_id === propertyId));
        if (!deal) return null;
        // Contrato legado sem installment_value gravado: cai no value bruto da
        // unidade (ou do negócio, se não houver lista de unidades).
        if (deal.installment_value == null) {
            const unit = deal.units?.find(u => u.property_id === propertyId);
            return unit ? unit.value : deal.value;
        }
        // installment_value é do CONTRATO inteiro. Com várias unidades, rateia
        // pela participação de cada uma no total (mesma proporção de unit.value
        // dentro da soma deal.value) — sem isso, cada unidade mostraria a
        // parcela cheia do contrato, multiplicando o valor.
        const units = deal.units && deal.units.length > 1 ? deal.units : null;
        if (!units) return deal.installment_value;
        const unit = units.find(u => u.property_id === propertyId);
        if (!unit || !(deal.value > 0)) return deal.installment_value;
        return deal.installment_value * (unit.value / deal.value);
    };

    /**
     * Ocupação FINANCEIRA (Fase 3) — quanto da receita possível está contratada.
     *
     * Mede coisa diferente da ocupação física, e a diferença é o que interessa:
     * 90% das unidades alugadas com as caras vazias pode ser 60% financeiro. Uma
     * esconde o problema que a outra mostra.
     *
     * Base: as MESMAS folhas da ocupação física e do patrimônio (`leafNodes`),
     * para as três não divergirem — foi por cópias da fórmula que patrimônio e
     * receita já mostraram números diferentes em telas diferentes.
     */
    const financialOcc = useMemo(() => {
        const folhas = leafNodes(properties);
        const resultado = financialOccupancy(
            folhas.map(p => ({
                id: p.id,
                rental_price: rentalValueOf(p),
                // `true` = só contrato fechado, a MESMA base da Receita mensal.
                contracted: getContractedRentalValue(p.id, true) ?? 0,
            })),
        );
        // Unidade sem preço não entra no potencial (não dá para supor preço de
        // quem não tem). Mas isso INFLA a taxa: com metade da carteira sem
        // preço, 98% de ocupação financeira fala de meia carteira. Quem exibe
        // precisa poder avisar.
        const semPreco = folhas.filter(p => rentalValueOf(p) <= 0).length;
        return { ...resultado, leafCount: folhas.length, withoutPrice: semPreco };
    }, [properties, deals]);

    // Soma do valor gerado pela Inteligência de Aluguéis (rentalValueOf) de
    // cada unidade do contrato — baseline para comparar com a parcela
    // efetivamente contratada (getDealInstallmentValue).
    const getDealBaseValue = (deal: PropertyDeal): number => {
        const propertyIds = deal.units && deal.units.length > 0
            ? deal.units.map(u => u.property_id)
            : (deal.property_id ? [deal.property_id] : []);
        return propertyIds.reduce((sum, id) => {
            const property = properties.find(p => p.id === id);
            return sum + (property ? rentalValueOf(property) : 0);
        }, 0);
    };

    const handleBulkUpdate = async (updates: Partial<Property>) => {
        if (selectedProperties.length === 0) return;

        try {
            setLoading(true);
            await commercialService.updatePropertiesBatch(selectedProperties, updates);
            notify(`${selectedProperties.length} imóveis atualizados com sucesso!`);
            setSelectedProperties([]);
            loadData();
        } catch (err: any) {
            notify('Erro na atualização em massa: ' + (err.message || 'Erro desconhecido'), 'error');
        } finally {
            setLoading(false);
        }
    };

    // Inteligência de Aluguéis — precifica rental_price das unidades do prédio
    // selecionado pelo modelo hedônico (R$/m² ou aluguel-alvo total). Espelha
    // handleApplyPricing do SalesModule, mas grava SOMENTE rental_price.
    const handleApplyRentalPricing = async (config: RentalPricingConfig) => {
        if (!selectedBuildingId) return;
        try {
            setLoading(true);
            const units = properties.filter(p => p.parent_id === selectedBuildingId);
            const updated = rentalPricingService.calculateRents(units, config);
            if (updated.length === 0) {
                notify('Nenhuma unidade elegível para precificação neste edifício.', 'error');
                return;
            }
            await commercialService.savePropertiesBatch(updated);
            // Mantém a tabela de aluguéis ATIVA coerente com o novo vigente: sem isso
            // o Portal do Corretor (lê o item da versão ativa) mostraria valor defasado
            // e reativar a versão sobrescreveria o vigente de volta. No-op se não há
            // tabela ativa. Ver rentalPriceTableService.syncActiveTableItems.
            const rentByPropertyId = Object.fromEntries(
                updated.filter(u => u.id != null).map(u => [u.id as string, Number(u.rental_price ?? 0)]),
            );
            const sync = await rentalPriceTableService.syncActiveTableItems(selectedBuildingId, rentByPropertyId);
            setIsPricingModalOpen(false);
            notify(
                sync.hadActiveTable
                    ? `${updated.length} unidades precificadas — tabela de aluguéis ativa também atualizada.`
                    : `${updated.length} unidades precificadas com sucesso usando Inteligência Hedônica!`,
            );
            loadData();
        } catch (err: any) {
            notify('Erro ao aplicar inteligência de aluguéis: ' + (err.message || 'Erro desconhecido'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectProperty = (id: string) => {
        setSelectedProperties(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    // Seleção de intervalo com Shift+clique (§10.1) — só existe hoje na visão em
    // grade, onde o checkbox de seleção em lote mora.
    const [lastCheckedIndex, setLastCheckedIndex] = useState<number | null>(null);
    const handleRowCheck = (id: string, index: number, shiftKey: boolean) => {
        if (shiftKey && lastCheckedIndex !== null) {
            const [start, end] = lastCheckedIndex < index ? [lastCheckedIndex, index] : [index, lastCheckedIndex];
            const rangeIds = filteredProperties.slice(start, end + 1).map(p => p.id);
            setSelectedProperties(prev => Array.from(new Set([...prev, ...rangeIds])));
        } else {
            handleSelectProperty(id);
            setLastCheckedIndex(index);
        }
    };



    const PropertyCard: React.FC<{
        property: Property,
        onEdit: () => void,
        onDelete: () => void,
        onRegisterDeal: () => void,
        /** Resolve rótulo+cor no vocabulário do contrato (ver getUnitStatusDisplay). */
        getStatusDisplay: (p: Property) => { label: string; color: string },
        selected?: boolean,
        onSelect?: (shiftKey: boolean) => void,
        compact?: boolean
    }> = ({ property, onEdit, onDelete, onRegisterDeal, getStatusDisplay, selected, onSelect, compact }) => (
        <div 
            onClick={() => {
                if (property.type === 'BUILDING' && !selectedBuildingId) {
                    setSelectedBuildingId(property.id);
                }
            }}
            className={`bg-white border rounded-[10px] overflow-hidden group hover:shadow-lg transition-all duration-300 cursor-pointer ${compact ? 'scale-95 origin-top' : ''} ${selected ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-gray-200'}`}
        >
            <div className="aspect-[16/11] bg-gray-100 relative overflow-hidden">
                <div className="absolute top-6 left-6 z-10" onClick={(e) => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={selected}
                        title="Dica: segure Shift e clique para selecionar um intervalo"
                        onChange={(e) => { e.stopPropagation(); onSelect?.((e.nativeEvent as MouseEvent).shiftKey); }}
                        className="w-6 h-6 rounded-lg border-white/20 bg-white/10 backdrop-blur-md text-blue-600 focus:ring-blue-500 cursor-pointer shadow-xl transition-all accent-blue-600"
                    />
                </div>
                <div className="absolute top-6 right-6 z-10 flex flex-col gap-2 scale-90 origin-top-right">
                    <span className={`text-sm font-normal drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] ${getStatusDisplay(property).color}`}>
                        {getStatusDisplay(property).label}
                    </span>
                    <div className="flex gap-2">
                        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-2 bg-white/90 backdrop-blur-md rounded-xl text-gray-600 hover:text-blue-600 shadow-lg transition-all"><Edit className="w-4 h-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-2 bg-white/90 backdrop-blur-md rounded-xl text-gray-600 hover:text-red-500 shadow-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                </div>
                {property.client_id && (
                    <div className="absolute top-24 left-6 z-10 animate-in fade-in zoom-in duration-500">
                        <div className="px-4 py-2 bg-white/90 backdrop-blur-md rounded-2xl border border-white shadow-xl flex items-center gap-2">
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
                <div className="flex items-center justify-between mb-6">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Aluguel Sugerido</span>
                        <span className="text-2xl font-black text-gray-900 font-mono tracking-tighter">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(rentalValueOf(property))}
                        </span>
                    </div>
                </div>
                
                <div className="flex flex-wrap gap-2 mb-6">
                    <div className="flex-1 bg-gray-50 p-3 rounded-2xl flex flex-col items-center justify-center border border-gray-100">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Valor m²</span>
                        <span className="text-xs font-black text-gray-700">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(rentalValueOf(property) / (property.private_area || property.area || 1))}
                        </span>
                    </div>
                    {property.position_type && (
                        <div className="bg-blue-50 p-3 rounded-2xl flex flex-col items-center justify-center border border-blue-100">
                            <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest mb-1">Posição</span>
                            <span className="text-xs font-black text-blue-700 uppercase">
                                {property.position_type === 'FRONT' ? 'Frente' : property.position_type === 'BACK' ? 'Fundo' : 'Lat.'}
                            </span>
                        </div>
                    )}
                    {property.sun_orientation && (
                        <div className="bg-amber-50 p-3 rounded-2xl flex flex-col items-center justify-center border border-amber-100">
                            <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest mb-1">Sol</span>
                            <span className="text-xs font-black text-amber-700 uppercase">
                                {property.sun_orientation === 'NORTH' ? 'Norte' : property.sun_orientation === 'EAST' ? 'Leste' : 'Oeste'}
                            </span>
                        </div>
                    )}
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onRegisterDeal(); }}
                    className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-button uppercase tracking-[0.2em] hover:bg-blue-600 transition-all active:scale-95 shadow-xl shadow-gray-900/10 hover:shadow-blue-600/20"
                >
                    Registrar Negócio
                </button>
            </div>
        </div>
    );

    // Toast de Notificação — §13 (compartilhado entre a lista e a tela do imóvel)
    const notificationToast = notification && (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
            notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            {notification.message}
        </div>
    );

    // Editar/criar imóvel abre uma tela dedicada (UI_PATTERNS §2: fluxo multi-aba),
    // não um painel — a lista fica atrás e volta pelo "Voltar" do cabeçalho.
    if (isPropertyModalOpen) {
        return (
            <div>
                <PropertyModal
                    renderMode="page"
                    isOpen
                    onClose={() => { setIsPropertyModalOpen(false); setEditingProperty(undefined); }}
                    onSubmit={handleSaveProperty}
                    initialData={editingProperty}
                    defaultPurpose="RENTAL"
                    buildings={properties.filter(p => p.type === 'BUILDING')}
                    organizationId={organizationId}
                />
                {notificationToast}
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            {/* Header — §20 (flat, sem hero). */}
            <div className="flex items-center gap-3">
                {selectedBuildingId && (
                    <button
                        onClick={() => setSelectedBuildingId(null)}
                        className="h-9 w-9 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-[6px] transition-all"
                        title="Voltar para Edifícios"
                    >
                        <ChevronDown className="w-4 h-4 rotate-90" />
                    </button>
                )}
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                        {currentBuilding ? 'Gestão de Unidades' : 'Gestão de Locações'}
                    </h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">
                        {currentBuilding ? `Administração de ativos para ${currentBuilding.name}` : 'Controle de inventário, ocupação e performance imobiliária.'}
                    </p>
                </div>
            </div>

            {/* Toolbar de abas da visão mestre — mesmo padrão §19.1 da toolbar de
                "Gestão de Unidades" (trilho cinza dentro de card branco). Os KPIs que
                ficavam soltos aqui (Ativos sob gestão, Receita mensal, Yield mensal,
                Taxa de ocupação, Valor patrimonial) migraram para dentro da aba "Análise",
                a pedido do usuário. */}
            {!currentBuilding && (
                <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                    <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                        <button
                            onClick={() => setActiveTab('inventory')}
                            className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'inventory' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                            <HomeIcon className="w-3.5 h-3.5" />
                            Imóveis
                        </button>
                        <button
                            onClick={() => setActiveTab('analysis')}
                            className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'analysis' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                            <BarChart3 className="w-3.5 h-3.5" />
                            Análise
                        </button>
                    </div>
                </div>
            )}

            {/* ── PAINEL EXECUTIVO (Fase 3) ───────────────────────────────────
                Os 8 indicadores que respondem praticamente tudo. O catálogo
                original sugeria 20 no topo; 20 não é dashboard, é relatório —
                o resto foi para o detalhamento recolhível abaixo.
                `—` onde a conta não tem base: "não medido" nunca vira zero. */}
            {!currentBuilding && activeTab === 'analysis' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                    <KpiCard shadow={false} size="sm" label="Ocupação física" value={`${stats.occupancyRate}%`} icon={<Key className="w-4 h-4" />} color="purple" />
                    {/* Ao lado da física de propósito: a diferença entre as duas
                        é que denuncia carteira cheia de unidade barata. */}
                    <KpiCard shadow={false} size="sm" label="Ocupação financeira" value={financialOcc.rate != null ? `${(financialOcc.rate * 100).toFixed(1)}%` : '—'} icon={<DollarSign className="w-4 h-4" />} color="emerald" />
                    <KpiCard shadow={false} size="sm" label="Vacância média" value={vacancy ? `${vacancy.averageDays} dias` : '—'} icon={<Clock className="w-4 h-4" />} color="amber" />
                    <KpiCard shadow={false} size="sm" label="Receita mensal" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.monthlyRevenue)} icon={<DollarSign className="w-4 h-4" />} color="indigo" />
                    <KpiCard shadow={false} size="sm" label="Vencido há mais de 90 dias" value={executive?.collection.overdue90Rate != null ? `${(executive.collection.overdue90Rate * 100).toFixed(1)}%` : '—'} icon={<AlertCircle className="w-4 h-4" />} color="red" />
                    <KpiCard shadow={false} size="sm" label="NOI" value={noi ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(noi.noi) : '—'} icon={<TrendingUp className="w-4 h-4" />} color={noi && noi.noi < 0 ? 'red' : 'teal'} />
                    <KpiCard shadow={false} size="sm" label="WALE da carteira" value={executive?.wale.years != null ? `${executive.wale.years.toFixed(1)} anos` : '—'} icon={<Calendar className="w-4 h-4" />} color="blue" />
                    <KpiCard shadow={false} size="sm" label="Taxa de renovação" value={executive?.renewal.rate != null ? `${(executive.renewal.rate * 100).toFixed(0)}%` : '—'} icon={<RefreshCw className="w-4 h-4" />} color="violet" />
                </div>
            )}

            {/* Avisos que impedem leitura errada dos números acima. Cada um só
                aparece quando o caso existe — aviso permanente vira ruído. */}
            {!currentBuilding && activeTab === 'analysis' && (executive || financialOcc.withoutPrice > 0) && (
                <div className="space-y-1 -mt-1 mb-3">
                    {/* Sem isto, "98% de ocupação financeira" parece carteira
                        rentabilizada quando pode ser meia carteira sem preço. */}
                    {financialOcc.withoutPrice > 0 && (
                        <p className="text-xs text-gray-400">
                            {financialOcc.withoutPrice} de {financialOcc.leafCount} unidades não têm aluguel de
                            referência cadastrado e ficam fora da <strong>ocupação financeira</strong> — a taxa
                            fala apenas das {financialOcc.leafCount - financialOcc.withoutPrice} precificadas.
                        </p>
                    )}
                    {/* Sem este aviso, "0,8% recebido" é lido como inadimplência
                        de 99% — quando o que falta é baixa no sistema. */}
                    {executive && executive.collection.collectionRate != null && executive.collection.collectionRate < 0.5 && (
                        <p className="text-xs text-gray-400">
                            Apenas {(executive.collection.collectionRate * 100).toFixed(1)}% dos aluguéis lançados
                            estão baixados como recebidos. O indicador mede <strong>conciliação no sistema</strong>,
                            não necessariamente atraso do locatário.
                        </p>
                    )}
                    {executive && executive.wale.expiredStillActive > 0 && (
                        <p className="text-xs text-gray-400">
                            {executive.wale.expiredStillActive} contrato{executive.wale.expiredStillActive > 1 ? 's' : ''} com
                            data de término já vencida e ainda em vigor — fora do WALE, porque prazo negativo
                            distorceria a média. Renove ou encerre para o número refletir a carteira.
                        </p>
                    )}
                    {executive && executive.renewal.rate == null && executive.contractsConsidered > 0 && (
                        <p className="text-xs text-gray-400">
                            Taxa de renovação sem base: nenhum contrato terminou no período. Não é 0%.
                        </p>
                    )}
                </div>
            )}

            {/* Detalhamento — recolhido por padrão (§ decisão da Fase 3). */}
            {!currentBuilding && activeTab === 'analysis' && (
                <button
                    onClick={() => setShowDetail(!showDetail)}
                    className="flex items-center gap-1.5 h-9 px-3.5 mb-3 bg-white border border-gray-100 rounded-[10px] shadow-sm text-sm font-medium text-gray-600 hover:text-gray-900 transition-all"
                >
                    <ChevronDown className={`w-4 h-4 transition-transform ${showDetail ? 'rotate-180' : ''}`} />
                    {showDetail ? 'Ocultar detalhamento' : 'Ver detalhamento'}
                </button>
            )}

            {!currentBuilding && activeTab === 'analysis' && showDetail && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-3">
                    <KpiCard shadow={false} size="sm" label="Ativos sob gestão" value={stats.activeAssets} icon={<Building2 className="w-4 h-4" />} color="blue" />
                    <KpiCard shadow={false} size="sm" label="Yield mensal" value={`${stats.monthlyYield}%`} icon={<TrendingUp className="w-4 h-4" />} color="indigo" />
                    <KpiCard shadow={false} size="sm" label="Valor patrimonial" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stats.totalValue)} icon={<Home className="w-4 h-4" />} color="amber" />
                    <KpiCard shadow={false} size="sm" label="Receita potencial" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(financialOcc.potential)} icon={<DollarSign className="w-4 h-4" />} color="emerald" />
                    <KpiCard shadow={false} size="sm" label="Aluguéis recebidos" value={executive ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(executive.collection.received) : '—'} icon={<Check className="w-4 h-4" />} color="teal" />
                </div>
            )}

            {/* Vacância (Fase 1) — só aparece quando o log de status existe.
                `null` significa "não medido" (migration ainda não aplicada), que
                é diferente de zero; mostrar "0 dias" sem ter medido seria pior
                que não mostrar nada. */}
            {!currentBuilding && activeTab === 'analysis' && showDetail && vacancy && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-3">
                        <KpiCard shadow={false} size="sm" label="Unidades vagas" value={vacancy.vacantCount} icon={<HomeIcon className="w-4 h-4" />} color="blue" />
                        <KpiCard shadow={false} size="sm" label="Vacância média" value={`${vacancy.averageDays} dias`} icon={<Clock className="w-4 h-4" />} color="amber" />
                        {/* Mediana ao lado da média de propósito: uma unidade parada
                            há anos distorce a média e esconde a carteira saudável. */}
                        <KpiCard shadow={false} size="sm" label="Vacância mediana" value={`${vacancy.medianDays} dias`} icon={<Clock className="w-4 h-4" />} color="indigo" />
                        <KpiCard shadow={false} size="sm" label="Estoque envelhecido" value={vacancy.over90} icon={<AlertCircle className="w-4 h-4" />} color="red" />
                        <KpiCard shadow={false} size="sm" label="Absorção líquida (30d)" value={vacancy.netAbsorption30d.net} icon={<TrendingUp className="w-4 h-4" />} color="emerald" />
                    </div>

                    {/* Enquanto houver marco de backfill entre as vagas, os dias são
                        um PISO — o `changed_at` daquelas linhas é o `updated_at` do
                        imóvel, não a data real da mudança de status. Some sozinho
                        conforme as unidades passam por uma mudança real. */}
                    {vacancy.approximateCount > 0 && (
                        <p className="text-xs text-gray-400 -mt-1 mb-3">
                            {vacancy.approximateCount === vacancy.vacantCount
                                ? 'Tempo de vacância ainda estimado: o histórico começou a ser medido agora.'
                                : `${vacancy.approximateCount} de ${vacancy.vacantCount} unidades vagas ainda usam a data estimada do início da medição.`}
                            {' '}O número tende a crescer até a medição real assumir.
                        </p>
                    )}
                </>
            )}

            {/* Rentabilidade (Fase 2) — o bloco que responde "quanto RENDE", e
                não "quanto fatura". Só existe com despesa apropriada por imóvel;
                sem ela o NOI seria a receita com outro nome. */}
            {!currentBuilding && activeTab === 'analysis' && showDetail && noi && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                    <KpiCard shadow={false} size="sm" label="Receita no período" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(noi.revenue)} icon={<DollarSign className="w-4 h-4" />} color="emerald" />
                    <KpiCard shadow={false} size="sm" label="Despesa no período" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(noi.expense)} icon={<Briefcase className="w-4 h-4" />} color="orange" />
                    <KpiCard shadow={false} size="sm" label="NOI" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(noi.noi)} icon={<TrendingUp className="w-4 h-4" />} color={noi.noi >= 0 ? 'teal' : 'red'} />
                    {/* Margem e cap rate são `null` quando indefinidos (sem
                        receita / sem patrimônio) — mostrar "0%" afirmaria algo
                        que a conta não sustenta. */}
                    <KpiCard shadow={false} size="sm" label="Margem NOI" value={noi.margin != null ? `${(noi.margin * 100).toFixed(1)}%` : '—'} icon={<BarChart3 className="w-4 h-4" />} color="violet" />
                </div>
            )}

            {/* Toolbar de abas — ui_ux_guia_unificado.md §19.1: card branco externo
                envolvendo o trilho cinza interno onde ficam os botões das abas.
                Antes só existia o trilho, sem o card — abas ficavam "soltas" na
                página. "Inteligência de aluguéis" mora à direita, fora do trilho
                (não é uma aba). */}
            {selectedBuildingId && (
                <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                    <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                        <button
                            onClick={() => setActiveTab('inventory')}
                            className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'inventory' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                            <HomeIcon className="w-3.5 h-3.5" />
                            Unidades
                        </button>
                        <button
                            onClick={() => setActiveTab('deals')}
                            className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'deals' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                            <Tag className="w-3.5 h-3.5" />
                            Contratos
                        </button>
                        <button
                            onClick={() => setActiveTab('dashboard')}
                            className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                            <TrendingUp className="w-3.5 h-3.5" />
                            Resultados
                        </button>
                        <button
                            onClick={() => setActiveTab('renewals')}
                            className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'renewals' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Renovações
                            {renewalsBadge > 0 && (
                                <span className="ml-0.5 px-1.5 rounded-[6px] bg-amber-100 text-amber-700 text-xs font-medium">
                                    {renewalsBadge}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('brokers')}
                            className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'brokers' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                            <User className="w-3.5 h-3.5" />
                            Corretores
                        </button>
                        <button
                            onClick={() => setActiveTab('price-tables')}
                            className={`flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'price-tables' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                            <DollarSign className="w-3.5 h-3.5" />
                            Tabela de aluguéis
                        </button>
                    </div>
                    {/* "Inteligência de aluguéis" migrou da toolbar de botões (removida —
                        só tinha ela e o "Relatórios", que não tinha onClick nenhum, e
                        "Novo imóvel", removido a pedido do usuário) para cá. */}
                    <button
                        onClick={() => setIsPricingModalOpen(true)}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-blue-200 text-blue-600 rounded-[6px] hover:bg-blue-50 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                    >
                        <BrainCircuit className="w-4 h-4" />
                        Inteligência de aluguéis
                    </button>
                </div>
            )}

            {/* Content */}
            {activeTab === 'inventory' && (
                <div className="space-y-6">
                    {/* Toolbar acoplada à tabela (§5.2, padrão OpuraDocsModule/GED) — toolbar e
                        conteúdo dividem um único card (border/rounded/shadow só no container
                        pai); a costura visível entre os dois é o border-b da toolbar. */}
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center p-4 border-b border-gray-100 bg-white">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder={selectedBuildingId ? "Buscar por unidade ou bloco..." : "Escolha um empreendimento para gerenciar..."}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button className="flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition-all whitespace-nowrap">
                            <Filter className="w-4 h-4" />
                            Mais filtros
                        </button>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            {/* ColumnConfigButton — só faz sentido em modo lista (§5.1): grade e torre não renderizam <table>. */}
                            {viewMode === 'list' && (
                                <>
                                    <ColumnConfigButton
                                        columns={PROPERTY_COLUMNS.filter(c => c.key !== 'actions')}
                                        visibleColumns={unitsTableColumns.visibleColumns}
                                        showColumnConfig={unitsTableColumns.showColumnConfig}
                                        onToggleShow={() => unitsTableColumns.setShowColumnConfig(!unitsTableColumns.showColumnConfig)}
                                        onToggleColumn={unitsTableColumns.toggleColumn}
                                        onReset={unitsTableColumns.resetColumns}
                                    />
                                    {/* Ajustar largura ao conteúdo (§6.1.2) — sob comando explícito, nunca
                                        automático. Duplo clique no divisor da coluna já significa "restaurar padrão". */}
                                    <button
                                        onClick={() => unitsCols.autoFit()}
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
                                <button onClick={() => setViewMode('tower')} className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'tower' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`} title="Torre"><Building2 className="w-4 h-4" /></button>
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
                        <>
                            {viewMode === 'grid' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-4">
                                    {filteredProperties.map((property, index) => (
                                        <PropertyCard
                                            key={property.id}
                                            property={property}
                                            selected={selectedProperties.includes(property.id)}
                                            onSelect={(shiftKey) => handleRowCheck(property.id, index, shiftKey)}
                                            onEdit={() => { setEditingProperty(property); setIsPropertyModalOpen(true); }}
                                            onDelete={() => handleDeleteProperty(property.id)}
                                            onRegisterDeal={() => {
                                                setEditingDeal({
                                                    id: '', property_id: property.id, client_id: '', type: 'RENTAL',
                                                    value: rentalValueOf(property), date: new Date().toISOString().split('T')[0], status: 'PENDING',
                                                    // O contrato nasce com esta unidade; outras podem ser
                                                    // acrescentadas na aba Unidade do DealModal.
                                                    units: [{ property_id: property.id, value: rentalValueOf(property), is_primary: true }]
                                                });
                                                setIsDealModalOpen(true);
                                            }}
                                            getStatusDisplay={getUnitStatusDisplay}
                                        />
                                    ))}
                                </div>
                            )}

                            {viewMode === 'list' && (
                                <div className="overflow-auto max-h-[70vh]">
                                    <table ref={unitsCols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: unitsTableTotalWidth }}>
                                        <colgroup>
                                            {unitsTableColumns.orderedVisibleColumns.filter(key => (unitsModeColumnKeys as readonly string[]).includes(key)).map(key => (
                                                <col key={key} data-col-key={key} style={{ width: `${unitsCols.getWidth(key)}px` }} />
                                            ))}
                                            {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio, para a
                                                borda de "Ações" não andar a cada redimensionamento. */}
                                            <col />
                                            <col data-col-key="actions" style={{ width: `${unitsCols.getWidth('actions')}px` }} />
                                        </colgroup>
                                        {/* thead em sentence case (§6.2) — escala compacta; colunas ordenáveis
                                            ligadas ao sortConfig que já filtrava filteredProperties (§6.3).
                                            Visibilidade por coluna vem do ColumnConfigButton (§5.2/unitsTableColumns);
                                            ordem vem de `orderedVisibleColumns` (arraste estilo ClickUp) filtrada pelas
                                            colunas do modo ativo (edifícios × unidades de um edifício — ver
                                            unitsModeColumnKeys). Mapa de header troca com o modo porque 'price' muda
                                            de rótulo ("Patrimônio" × "Valor base"). */}
                                        <thead>
                                            <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                                {unitsTableColumns.orderedVisibleColumns.filter(key => (unitsModeColumnKeys as readonly string[]).includes(key)).map(key => {
                                                    const def = (selectedBuildingId ? UNITS_UNIT_COLUMN_HEADERS : UNITS_BUILDING_COLUMN_HEADERS)[key];
                                                    if (!def) return null;
                                                    return (
                                                        <SortableHeader
                                                            key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                            sortColumn={sortConfig?.key ?? null} sortDirection={sortConfig?.direction ?? 'asc'}
                                                            onSort={handleSort}
                                                            onMoveColumn={unitsTableColumns.moveColumn}
                                                            className={def.className}
                                                        >
                                                            <unitsCols.ResizeHandle colKey={key} />
                                                        </SortableHeader>
                                                    );
                                                })}
                                                {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                                <th aria-hidden="true" className="border-r border-gray-100" />
                                                <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                                                    Ações
                                                    <unitsCols.ResizeHandle colKey="actions" />
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {filteredProperties.map((property) => {
                                                const unitsRowCtx: UnitsRowCtx = { selectedBuildingId, properties, getContractedRentalValue, getUnitStatusDisplay };
                                                return (
                                                    <tr
                                                    key={property.id}
                                                    className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                                    onClick={() => {
                                                        if (property.type === 'BUILDING' && !selectedBuildingId) {
                                                            setSelectedBuildingId(property.id);
                                                        } else {
                                                            setEditingProperty(property);
                                                            setIsPropertyModalOpen(true);
                                                        }
                                                    }}
                                                >
                                                    {unitsTableColumns.orderedVisibleColumns.filter(key => (unitsModeColumnKeys as readonly string[]).includes(key)).map(key => (
                                                        <td key={key} className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 ${UNITS_TD_CLASS[key] || ''}`}>
                                                            {renderUnitsCell(key, property, unitsRowCtx)}
                                                        </td>
                                                    ))}
                                                    <td aria-hidden="true" className="border-r border-gray-100"></td>
                                                    <td className="px-6 py-2.5 text-right">
                                                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                            <button
                                                                onClick={() => {
                                                                    setEditingDeal({
                                                    id: '', property_id: property.id, client_id: '', type: 'RENTAL',
                                                    value: rentalValueOf(property), date: new Date().toISOString().split('T')[0], status: 'PENDING',
                                                    // O contrato nasce com esta unidade; outras podem ser
                                                    // acrescentadas na aba Unidade do DealModal.
                                                    units: [{ property_id: property.id, value: rentalValueOf(property), is_primary: true }]
                                                });
                                                                    setIsDealModalOpen(true);
                                                                }}
                                                                className="text-emerald-600 hover:text-emerald-800 text-sm font-medium p-1.5 hover:bg-emerald-50 rounded-lg transition-all"
                                                            >
                                                                Negociação
                                                            </button>
                                                            <ActionIconButton kind="edit" onClick={() => { setEditingProperty(property); setIsPropertyModalOpen(true); }} />
                                                            <ActionIconButton kind="delete" onClick={() => handleDeleteProperty(property.id)} />
                                                        </div>
                                                    </td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}


                            {viewMode === 'tower' && (
                                <div className="p-4">
                                <PropertyUnitMap
                                    units={properties.filter(p => String(p.parent_id).toLowerCase() === String(selectedBuildingId).toLowerCase())}
                                    parentProperty={properties.find(p => p.id === selectedBuildingId)}
                                    deals={deals}
                                    mode="admin"
                                    onEditUnit={(unit) => {
                                        setEditingProperty(unit);
                                        setIsPropertyModalOpen(true);
                                    }}
                                    onSelectUnit={(unit) => {
                                        setEditingDeal({ 
                                            id: '', 
                                            property_id: unit.id, 
                                            client_id: '', 
                                            type: 'RENTAL',
                                            value: rentalValueOf(unit as Partial<Property>),
                                            date: new Date().toISOString().split('T')[0], 
                                            status: 'PENDING' 
                                        });
                                        setIsDealModalOpen(true);
                                    }}
                                />
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-12">
                            <Home className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">
                                {searchTerm ? 'Nenhum resultado encontrado' : 'Nenhum imóvel cadastrado'}
                            </h3>
                            <p className="text-sm text-gray-500 mb-6">
                                {searchTerm
                                    ? `Não encontramos imóveis para "${searchTerm}" nesta organização. Verifique os filtros ou tente outro termo.`
                                    : 'Adicione o primeiro imóvel para iniciar a gestão de locações.'}
                            </p>
                            <button
                                onClick={() => setIsPropertyModalOpen(true)}
                                className="text-blue-600 font-bold hover:underline"
                            >
                                Cadastrar primeiro imóvel
                            </button>
                        </div>
                    )}
                    </div>

                    {/* Barra de ações em lote (§10) */}
                    {selectedProperties.length > 0 && (
                        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
                            <span className="flex-1 text-sm font-bold whitespace-nowrap">
                                {selectedProperties.length} selecionado{selectedProperties.length !== 1 ? 's' : ''}
                            </span>
                            <button
                                onClick={() => setIsBulkEditOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 transition-colors"
                            >
                                <Edit className="w-3.5 h-3.5" />
                                Editar em Lote
                            </button>
                            <button
                                onClick={() => setSelectedProperties([])}
                                className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-blue-400 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                                Desmarcar
                            </button>
                        </div>
                    )}

                    {/* Modal de Edição em Lote (§10) */}
                    {isBulkEditOpen && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm" onClick={() => setIsBulkEditOpen(false)}>
                            <div className="bg-white rounded-[10px] shadow-2xl max-w-md w-full p-6 border border-gray-100" onClick={(e) => e.stopPropagation()}>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">Editar {selectedProperties.length} imóve{selectedProperties.length !== 1 ? 'is' : 'l'} em lote</h3>
                                <p className="text-sm text-gray-500 mb-5">Escolha uma ação para aplicar a todos os imóveis selecionados.</p>

                                <div className="space-y-2 mb-5">
                                    <span className="text-xs font-semibold text-gray-500">Alterar status para</span>
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
                                    <label className="text-xs font-semibold text-gray-500">Mudar preço sugerido para</label>
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

            {
                (selectedBuildingId && activeTab === 'deals') && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-2">
                            <Tag className="w-5 h-5 text-blue-600" />
                            <h3 className="text-lg font-bold text-gray-900 tracking-tight">Registro de contratos</h3>
                        </div>

                        {/* Toolbar acoplada à tabela — §5.2: toolbar e conteúdo (grade OU
                            lista) dividem um único card (border/rounded/shadow só no
                            container pai); a costura visível é o border-b da toolbar. */}
                        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                            <div className="flex flex-col md:flex-row gap-2.5 items-center p-4 border-b border-gray-100 bg-white">
                                <div className="flex-1 relative w-full">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar contrato por imóvel, cliente ou ID..."
                                        value={dealSearchTerm}
                                        onChange={(e) => setDealSearchTerm(e.target.value)}
                                        className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    />
                                </div>
                                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                    {viewMode === 'list' && (
                                        <>
                                            <ColumnConfigButton
                                                columns={DEAL_COLUMNS.filter(c => c.key !== 'actions')}
                                                visibleColumns={dealTableColumns.visibleColumns}
                                                showColumnConfig={dealTableColumns.showColumnConfig}
                                                onToggleShow={() => dealTableColumns.setShowColumnConfig(!dealTableColumns.showColumnConfig)}
                                                onToggleColumn={dealTableColumns.toggleColumn}
                                                onReset={dealTableColumns.resetColumns}
                                            />
                                            {/* Ajustar largura ao conteúdo (§6.1.2) — sob comando explícito, nunca automático. */}
                                            <button
                                                onClick={() => dealCols.autoFit()}
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

                            {/* Conteúdo — sem bg/border/rounded próprios: já está dentro do
                                card acoplado toolbar+conteúdo (ver abertura acima). */}
                            {viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                                {sortedDeals.map(deal => {
                                    const property = properties.find(p => p.id === deal.property_id);
                                    return (
                                        <div key={deal.id} className="bg-white p-6 rounded-[10px] border border-gray-100 hover:border-blue-200 transition-colors relative group">
                                            <div className="absolute top-6 right-6 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                <ActionIconButton kind="edit" onClick={() => { setEditingDeal(deal); setIsDealModalOpen(true); }} />
                                                <ActionIconButton kind="delete" onClick={() => handleDeleteDeal(deal.id)} />
                                            </div>
                                            <div className="flex items-center gap-2 mb-4">
                                                <span className={`text-sm font-normal ${getDealStatusDisplay(deal.status).color}`}>
                                                    {getDealStatusDisplay(deal.status).label}
                                                </span>
                                                <div className="flex flex-col items-end ml-auto">
                                                    <span className="text-xs font-medium text-blue-600">#{deal.id.substring(0, 8).toUpperCase()}</span>
                                                    <span className="text-xs text-gray-400 mt-0.5">
                                                        {new Date(deal.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="mb-6">
                                                <h4 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors"
                                                    title={deal._unitNames || undefined}>
                                                    {deal._propertyName || property?.name || 'Imóvel em referência'}
                                                    {deal._unitCount > 1 && (
                                                        <span className="ml-1.5 text-sm font-normal text-gray-400">+{deal._unitCount - 1}</span>
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
                                        setEditingDeal({ id: '', property_id: '', client_id: '', type: 'RENTAL', value: 0, date: new Date().toISOString().split('T')[0], status: 'PENDING' } as any);
                                        setIsDealModalOpen(true);
                                    }}
                                    className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[10px] p-6 flex flex-col items-center justify-center group hover:bg-white hover:border-blue-200 transition-all min-h-[220px]"
                                >
                                    <Plus className="w-8 h-8 text-gray-300 group-hover:text-blue-600 mb-3" />
                                    <span className="text-sm font-bold text-gray-400 group-hover:text-gray-900">Novo contrato</span>
                                    <p className="text-xs text-gray-400 text-center mt-1 px-4">Inicie o registro de um novo contrato de aluguel.</p>
                                </button>
                            </div>
                            ) : (
                            <>
                                <div className="overflow-auto max-h-[70vh]">
                                <table ref={dealCols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: dealsTableTotalWidth }}>
                                    <colgroup>
                                        {dealTableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                            <col key={key} data-col-key={key} style={{ width: `${dealCols.getWidth(key)}px` }} />
                                        ))}
                                        {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio, para a
                                            borda de "Ações" não andar a cada redimensionamento. */}
                                        <col />
                                        <col data-col-key="actions" style={{ width: `${dealCols.getWidth('actions')}px` }} />
                                    </colgroup>
                                    {/* thead em sentence case (§6.2) — escala compacta; ordenável (§6.3);
                                        ordem vem de orderedVisibleColumns (arraste estilo ClickUp) */}
                                    <thead>
                                        <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            {dealTableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                                                const def = DEAL_COLUMN_HEADERS[key];
                                                if (!def) return null;
                                                return (
                                                    <SortableHeader
                                                        key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                        sortColumn={dealSortConfig?.key ?? null} sortDirection={dealSortConfig?.direction ?? 'asc'}
                                                        onSort={handleDealSort}
                                                        onMoveColumn={dealTableColumns.moveColumn}
                                                        className={def.className}
                                                    >
                                                        <dealCols.ResizeHandle colKey={key} />
                                                    </SortableHeader>
                                                );
                                            })}
                                            {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                            <th aria-hidden="true" className="border-r border-gray-100" />
                                            <th className="px-6 py-2 text-right relative overflow-hidden text-table-header font-semibold text-gray-500">
                                                Ações
                                                <dealCols.ResizeHandle colKey="actions" />
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {sortedDeals.map(deal => {
                                            const dealRowCtx: DealRowCtx = { properties, clients, getDealBaseValue, getDealStatusDisplay };
                                            return (
                                                <tr key={deal.id} className="hover:bg-blue-50/50 transition-colors cursor-pointer group" onClick={() => { setEditingDeal(deal); setIsDealModalOpen(true); }}>
                                                    {dealTableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                                        <td key={key} className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 ${DEAL_TD_CLASS[key] || ''}`}>
                                                            {renderDealCell(key, deal, dealRowCtx)}
                                                        </td>
                                                    ))}
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
                                    </tbody>
                                </table>
                                </div>
                                <button
                                    onClick={() => {
                                        setEditingDeal({ type: 'RENTAL' } as any);
                                        setIsDealModalOpen(true);
                                    }}
                                    className="w-full py-4 bg-gray-50/50 hover:bg-gray-50 text-gray-500 font-medium text-sm transition-all border-t border-gray-100 flex items-center justify-center gap-2"
                                >
                                    <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                                    Registrar Novo Contrato
                                </button>
                            </>
                            )}
                        </div>
                    </div>
                )
            }

            {
                activeTab === 'dashboard' && (
                    <RentalsDashboard
                        selectedBuildingId={selectedBuildingId}
                        organizationId={effectiveOrganizationId}
                    />
                )
            }

            {activeTab === 'renewals' && (
                <RentalRenewals
                    organizationId={effectiveOrganizationId}
                    clients={clients}
                    onChanged={(message) => { loadData(); notify(message); }}
                    onOpenContract={openDealForContract}
                />
            )}

            {activeTab === 'brokers' && (
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

                    {/* Toolbar acoplada à tabela — §5.2: busca própria desta aba +
                        conteúdo dividem um único card (border/rounded/shadow só no pai). */}
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center p-4 border-b border-gray-100 bg-white">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar corretor por nome ou e-mail..."
                                value={brokerSearchTerm}
                                onChange={(e) => setBrokerSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button onClick={loadData} className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95" title="Atualizar">
                            <RefreshCw className="w-4 h-4" />
                        </button>

                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={BROKER_COLUMNS}
                                visibleColumns={brokerTableColumns.visibleColumns}
                                showColumnConfig={brokerTableColumns.showColumnConfig}
                                onToggleShow={() => brokerTableColumns.setShowColumnConfig(!brokerTableColumns.showColumnConfig)}
                                onToggleColumn={brokerTableColumns.toggleColumn}
                                onReset={brokerTableColumns.resetColumns}
                            />
                            {/* Ajustar largura ao conteúdo (§6.1.2) — sob comando explícito, nunca automático. */}
                            <button
                                onClick={() => brokerCols.autoFit()}
                                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                title="Ajustar largura das colunas ao conteúdo"
                            >
                                <MoveHorizontal className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {sortedBrokers.length > 0 ? (
                            <div className="overflow-auto max-h-[70vh]">
                            <table ref={brokerCols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: brokersTableTotalWidth }}>
                                <colgroup>
                                    {brokerTableColumns.orderedVisibleColumns.map(key => (
                                        <col key={key} data-col-key={key} style={{ width: `${brokerCols.getWidth(key)}px` }} />
                                    ))}
                                </colgroup>
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        {brokerTableColumns.orderedVisibleColumns.map(key => {
                                            const def = BROKER_COLUMN_HEADERS[key];
                                            if (!def) return null;
                                            return (
                                                <SortableHeader
                                                    key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                    sortColumn={brokerSortConfig?.key ?? null} sortDirection={brokerSortConfig?.direction ?? 'asc'}
                                                    onSort={handleBrokerSort}
                                                    onMoveColumn={brokerTableColumns.moveColumn}
                                                    className={def.className}
                                                >
                                                    <brokerCols.ResizeHandle colKey={key} />
                                                </SortableHeader>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {sortedBrokers.map(broker => {
                                        const brokerRowCtx: BrokerRowCtx = { brokerAccess, onToggleAccess: handleToggleBrokerAccess };
                                        return (
                                            <tr key={broker.id} className="hover:bg-blue-50/50 transition-colors">
                                                {brokerTableColumns.orderedVisibleColumns.map(key => (
                                                    <td key={key} className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 ${BROKER_TD_CLASS[key] || ''}`}>
                                                        {renderBrokerCell(key, broker, brokerRowCtx)}
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            </div>
                    ) : (
                        <div className="text-center py-12">
                            <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum corretor encontrado</h3>
                            <p className="text-sm text-gray-500">Tente ajustar sua busca ou cadastre um corretor em Minha Organização &gt; Fornecedores.</p>
                        </div>
                    )}
                    </div>

                    <div className="bg-amber-50/40 border border-dashed border-amber-100 rounded-[10px] p-4 flex items-center gap-3">
                        <span className="text-sm font-bold text-amber-700 shrink-0">Cadastro centralizado:</span>
                        <p className="text-xs text-amber-600">Novos corretores devem ser fornecedores na categoria Corretor Imobiliário.</p>
                    </div>
                </div>
            )}

            {activeTab === 'price-tables' && selectedBuildingId && currentBuilding && effectiveOrganizationId && (
                <div className="animate-in slide-in-from-bottom-5 duration-500">
                    <PriceTableManager
                        mode="rental"
                        organizationId={effectiveOrganizationId}
                        buildingId={selectedBuildingId}
                        buildingName={currentBuilding.name}
                    />
                </div>
            )}

            <DealModal
                isOpen={isDealModalOpen}
                onClose={() => { setIsDealModalOpen(false); setEditingDeal(undefined); setDealModalTab(undefined); }}
                onSave={() => loadData()}
                initialData={editingDeal}
                organizationId={organizationId}
                initialTab={dealModalTab}
                // Dentro de "Gestão de Unidades" a negociação só pode enxergar as
                // unidades DESTE edifício — sem isso o seletor de unidades listava
                // as unidades de todos os imóveis misturadas (Vendas já passava).
                buildingId={selectedBuildingId || undefined}
            />

            <RentalPricingIntelligenceModal
                isOpen={isPricingModalOpen}
                onClose={() => setIsPricingModalOpen(false)}
                onApply={handleApplyRentalPricing}
                buildingName={currentBuilding?.name || ''}
            />

            {notificationToast}
        </div >
    );
};

export default RentalsModule;
