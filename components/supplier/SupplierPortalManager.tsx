import React, { useState, useEffect, useMemo, Suspense } from 'react';
import {
  Truck,
  CheckCircle,
  Link2,
  Mail,
  Unlink,
  Plus,
  Search,
  RefreshCw,
  ArrowLeft,
  Building2,
  AlertCircle,
  X,
} from 'lucide-react';
import Button from '../ui/Button';
import ActionIconButton from '../ui/ActionIconButton';
import { supabase } from '../../lib/supabase';
import { supplierService, getSupplierDisplayName } from '../../services/supplierService';
import { appSettingsService } from '../../services/appSettingsService';
import { supplierPortalTokenService, SupplierPortalToken } from '../../services/supplierPortalTokenService';
import { organizationService } from '../../services/organizationService';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from '../ui/TableUtils';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import { KpiCard } from '../ui/KpiCard';
import { Supplier, Organization } from '../../types';

const SupplierDashboard = React.lazy(() => import('../SupplierDashboard'));

interface SupplierPortalManagerProps {
  organizationId: string;
  profile?: { group: string; role: string; email?: string };
  onNavigate?: (link: string) => void;
}

// ui_ux_guia_unificado.md — COLUMNS fora do componente (§2)
const SUPPLIER_PORTAL_COLUMNS: ColumnConfig[] = [
  { key: 'supplier', label: 'Fornecedor', sortable: true },
  { key: 'organization', label: 'Organização', sortable: true },
  { key: 'orders', label: 'Pedidos', sortable: true },
  { key: 'quotations', label: 'Cotações', sortable: true },
  { key: 'documents', label: 'Documentos', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
];

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX.
const SUPPLIER_PORTAL_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
  supplier: { label: 'Fornecedor', className: 'px-6 py-2 border-r border-gray-100' },
  organization: { label: 'Organização', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap' },
  orders: { label: 'Pedidos', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap' },
  quotations: { label: 'Cotações', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap' },
  documents: { label: 'Documentos', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap' },
  status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap' },
};

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna.
function renderSupplierPortalCell(
  key: string,
  s: Supplier,
  ctx: { stats: { orders: number; quotations: number; documents: number }; hasAccess: boolean },
): React.ReactNode {
  switch (key) {
    case 'supplier':
      return (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <span className="text-sm font-normal text-gray-900">
            {getSupplierDisplayName(s, appSettingsService.get().supplierNameDisplay)}
          </span>
        </div>
      );
    case 'organization':
      return <span className="text-sm font-normal text-gray-700">{s.organization_id ? (s.organization_name || '-') : 'Todas as Organizações'}</span>;
    case 'orders':
      return <span className="text-sm font-normal text-gray-600">{ctx.stats.orders}</span>;
    case 'quotations':
      return <span className="text-sm font-normal text-gray-600">{ctx.stats.quotations}</span>;
    case 'documents':
      return <span className="text-sm font-normal text-gray-600">{ctx.stats.documents}</span>;
    case 'status':
      // StatusBadge — texto simples colorido, sem pílula/fundo/uppercase (§8)
      return <span className={`text-sm font-normal ${ctx.hasAccess ? 'text-emerald-700' : 'text-gray-500'}`}>{ctx.hasAccess ? 'Habilitado' : 'Sem acesso'}</span>;
    default:
      return null;
  }
}

export const SupplierPortalManager: React.FC<SupplierPortalManagerProps> = ({ organizationId, profile, onNavigate }) => {
  const confirm = useConfirm();
  const { localToast, showToast } = useToast();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(false);

  // Tela de listagem (KPI + tabela, ui_ux_guia_unificado.md) — filtros sobrevivem a navegação (§3)
  const [searchTerm, setSearchTerm] = usePersistedState('supplierPortalList:search', '');
  const tableColumns = useTableColumns(SUPPLIER_PORTAL_COLUMNS, 'supplierPortalListColumns');
  const [supplierStats, setSupplierStats] = useState<Record<string, { orders: number; quotations: number; documents: number }>>({});

  // Modal de habilitação de acesso (define/atualiza o e-mail de login do fornecedor)
  const [isEnableModalOpen, setIsEnableModalOpen] = useState(false);
  const [enableSupplierId, setEnableSupplierId] = useState('');
  const [enableEmail, setEnableEmail] = useState('');
  const [savingAccess, setSavingAccess] = useState(false);

  // Link de acesso público (sem login) — mesmo formato do Portal do Parceiro
  const [portalToken, setPortalToken] = useState<SupplierPortalToken | null>(null);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  // Fornecedor global + "Todas as organizações" no topo = nenhuma das duas fontes
  // de organização existe; em vez de bloquear a ação, deixamos escolher aqui (§5 do
  // CLAUDE.md: "criar do zero sem entidade-pai" pede seletor, não beco sem saída).
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [tokenOrgOverride, setTokenOrgOverride] = useState('');

  const refreshSuppliers = async () => {
    setLoading(true);
    try {
      // Fonte única da verdade: só fornecedores marcados com Portais = "Portal do Fornecedor".
      const sups = await supplierService.listSuppliers(organizationId);
      setSuppliers(sups.filter((s) => s.portal === 'Portal do Fornecedor'));
    } catch (err) {
      console.error('Erro ao atualizar fornecedores:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    organizationService.listOrganizations()
      .then(setOrganizations)
      .catch((err) => console.error('Erro ao carregar organizações:', err));
  }, []);

  // Carrega o link de acesso já gerado (se houver) ao selecionar um fornecedor
  useEffect(() => {
    setTokenOrgOverride('');
    if (!selectedSupplier) {
      setPortalToken(null);
      return;
    }
    (async () => {
      try {
        const tok = await supplierPortalTokenService.getTokenForSupplier(selectedSupplier.id);
        setPortalToken(tok);
      } catch (err) {
        console.error('Erro ao carregar link de acesso:', err);
      }
    })();
  }, [selectedSupplier]);

  // Contagens por fornecedor (pedidos / cotações respondidas / documentos) para a tabela e os KPIs
  useEffect(() => {
    if (suppliers.length === 0) {
      setSupplierStats({});
      return;
    }
    const ids = suppliers.map((s) => s.id);
    (async () => {
      try {
        const [{ data: orders }, { data: quotes }, { data: docs }] = await Promise.all([
          supabase.from('purchase_orders').select('supplier_id').in('supplier_id', ids),
          supabase.from('quotation_responses').select('supplier_id').in('supplier_id', ids),
          supabase.from('invoices').select('supplier_id').in('supplier_id', ids),
        ]);
        const stats: Record<string, { orders: number; quotations: number; documents: number }> = {};
        ids.forEach((id) => { stats[id] = { orders: 0, quotations: 0, documents: 0 }; });
        (orders || []).forEach((o: any) => { if (stats[o.supplier_id]) stats[o.supplier_id].orders++; });
        (quotes || []).forEach((q: any) => { if (stats[q.supplier_id]) stats[q.supplier_id].quotations++; });
        (docs || []).forEach((d: any) => { if (stats[d.supplier_id]) stats[d.supplier_id].documents++; });
        setSupplierStats(stats);
      } catch (err) {
        console.error('Erro ao carregar contagens dos fornecedores:', err);
      }
    })();
  }, [suppliers]);

  // KPIs da tela de listagem (§4.2 — "Total" em destaque + decomposição)
  const kpis = useMemo(() => ({
    total: suppliers.length,
    habilitados: suppliers.filter((s) => !!s.email).length,
    semAcesso: suppliers.filter((s) => !s.email).length,
    globais: suppliers.filter((s) => !s.organization_id).length,
  }), [suppliers]);

  const filteredSuppliers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const result = suppliers.filter((s) =>
      !q ||
      (s.name || '').toLowerCase().includes(q) ||
      (s.nickname || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q)
    );

    return result.sort((a, b) => {
      if (tableColumns.sortColumn) {
        let cmp = 0;
        switch (tableColumns.sortColumn) {
          case 'supplier':
            cmp = (a.name || '').localeCompare(b.name || '');
            break;
          case 'organization': {
            const orgA = a.organization_id ? (a.organization_name || '') : 'Todas as Organizações';
            const orgB = b.organization_id ? (b.organization_name || '') : 'Todas as Organizações';
            cmp = orgA.localeCompare(orgB);
            break;
          }
          case 'orders':
            cmp = (supplierStats[a.id]?.orders || 0) - (supplierStats[b.id]?.orders || 0);
            break;
          case 'quotations':
            cmp = (supplierStats[a.id]?.quotations || 0) - (supplierStats[b.id]?.quotations || 0);
            break;
          case 'documents':
            cmp = (supplierStats[a.id]?.documents || 0) - (supplierStats[b.id]?.documents || 0);
            break;
          case 'status':
            cmp = Number(!!a.email) - Number(!!b.email);
            break;
        }
        return tableColumns.sortDirection === 'asc' ? cmp : -cmp;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [suppliers, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection, supplierStats]);

  const openEnableModal = (supplier?: Supplier) => {
    setEnableSupplierId(supplier?.id || '');
    setEnableEmail(supplier?.email || '');
    setIsEnableModalOpen(true);
  };

  // Habilitar/atualizar o acesso ao portal = gravar o e-mail de login no cadastro do
  // fornecedor (é isso que profileService.validateAccess confere no login do grupo Fornecedor).
  const handleSaveAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enableSupplierId || !enableEmail.trim()) return;

    setSavingAccess(true);
    try {
      const updated = await supplierService.updateSupplier(enableSupplierId, { email: enableEmail.trim() });
      if ((updated.email || '').toLowerCase() !== enableEmail.trim().toLowerCase()) {
        showToast('Este e-mail já está em uso por outro fornecedor.', 'error');
        return;
      }
      setSuppliers((prev) => prev.map((s) => (s.id === updated.id ? { ...s, email: updated.email } : s)));
      setIsEnableModalOpen(false);
      setEnableSupplierId('');
      setEnableEmail('');
      showToast('Acesso ao Portal do Fornecedor habilitado.');
    } catch (err) {
      console.error('Erro ao habilitar acesso do fornecedor:', err);
      showToast('Erro ao habilitar o acesso do fornecedor.', 'error');
    } finally {
      setSavingAccess(false);
    }
  };

  // Revogar acesso = limpar o e-mail de login (o fornecedor deixa de conseguir entrar no portal)
  const handleRevokeAccess = async (supplier: Supplier) => {
    const ok = await confirm({
      title: 'Revogar acesso ao portal?',
      message: `${getSupplierDisplayName(supplier, appSettingsService.get().supplierNameDisplay)} perderá o acesso de login ao Portal do Fornecedor imediatamente.`,
      variant: 'warning',
      confirmLabel: 'Revogar',
    });
    if (!ok) return;

    try {
      const updated = await supplierService.updateSupplier(supplier.id, { email: null as any });
      setSuppliers((prev) => prev.map((s) => (s.id === supplier.id ? { ...s, email: updated.email } : s)));
      if (selectedSupplier?.id === supplier.id) {
        setSelectedSupplier((prev) => (prev ? { ...prev, email: updated.email } : null));
      }
      showToast('Acesso ao portal revogado.');
    } catch (err) {
      console.error('Erro ao revogar acesso do fornecedor:', err);
      showToast('Erro ao revogar o acesso do fornecedor.', 'error');
    }
  };

  // Fonte da organização que vai administrar o link: seletor do topo → organização
  // do próprio fornecedor → organização que já gerou o token (regenerar) → escolha
  // manual no modal (só quando nenhuma das anteriores existe).
  const derivedTokenOrgId = organizationId || selectedSupplier?.organization_id || portalToken?.org_id || '';
  const effectiveTokenOrgId = derivedTokenOrgId || tokenOrgOverride;

  // Gerar/regenerar o link de acesso público do fornecedor selecionado
  const handleGenerateToken = async () => {
    if (!selectedSupplier || !effectiveTokenOrgId) return;
    setTokenLoading(true);
    try {
      await supplierPortalTokenService.generateToken(selectedSupplier.id, effectiveTokenOrgId);
      const tok = await supplierPortalTokenService.getTokenForSupplier(selectedSupplier.id);
      setPortalToken(tok);
    } catch (err) {
      console.error('Erro ao gerar link do portal:', err);
      showToast('Erro ao gerar o link de acesso.', 'error');
    } finally {
      setTokenLoading(false);
    }
  };

  const handleCopyPortalLink = async () => {
    if (!portalToken) return;
    const url = supplierPortalTokenService.buildPortalUrl(portalToken.token);
    await navigator.clipboard.writeText(url);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  const handleRevokeToken = async () => {
    if (!selectedSupplier || !portalToken) return;
    const ok = await confirm({
      title: 'Revogar acesso ao portal?',
      message: 'O fornecedor perderá o acesso via link imediatamente.',
      variant: 'warning',
      confirmLabel: 'Revogar',
    });
    if (!ok) return;
    setTokenLoading(true);
    try {
      // Usa o org_id já gravado no próprio token (quem gerou), em vez do filtro de
      // organização atual da tela — evita falhar quando se está em "Todas as organizações".
      await supplierPortalTokenService.revokeToken(selectedSupplier.id, portalToken.org_id);
      setPortalToken(null);
    } catch (err) {
      console.error('Erro ao revogar link:', err);
      showToast('Erro ao revogar o link.', 'error');
    } finally {
      setTokenLoading(false);
    }
  };

  // Sempre dentro do <Layout> (rota 'supplier-area', nunca standalone) — o
  // <main> dele já é `position: relative` e tem seu próprio gutter/scroll
  // (§20.2). `absolute inset-0` cancela os 4 lados do padding herdado de uma
  // vez; era `h-[calc(100vh-4rem)]`, que ignora a altura REAL disponível
  // dentro do Layout (calcula 100vh menos um header hipotético de 64px, sem
  // descontar o padding vertical do <main> nem considerar que a sidebar está
  // ao LADO, não empilhada) — a caixa nascia mais alta que o espaço de
  // verdade e transbordava por baixo (confirmado com Playwright: 836px de
  // caixa contra 640px de espaço real, 2026-08-08). O `<main className="p-6">`
  // interno também duplicava o gutter do Layout; vira `p-4 md:p-6` (o padrão),
  // já que agora é a ÚNICA fonte de padding.
  return (
    <div className="absolute inset-0 overflow-y-auto bg-[#F8FAFC] text-gray-800 font-sans">
      <main className="p-4 md:p-6 flex flex-col gap-6">
        {selectedSupplier ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => setSelectedSupplier(null)}
                className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 transition-all w-fit"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar para Fornecedores
              </button>
              <button
                onClick={() => setTokenModalOpen(true)}
                className="flex items-center gap-1.5 h-9 px-3.5 bg-purple-50 text-purple-600 border border-purple-200 rounded-[6px] hover:bg-purple-100 font-medium text-[13px] transition-all active:scale-95 shrink-0"
              >
                <Link2 className="w-[15px] h-[15px]" />
                Link de Acesso
              </button>
            </div>

            <Suspense fallback={<div className="text-center py-12 text-sm text-gray-400">Carregando portal...</div>}>
              <SupplierDashboard
                profile={profile}
                supplierProfile={selectedSupplier}
                onNavigate={onNavigate}
              />
            </Suspense>
          </>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">Portal do Fornecedor</h1>
              <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie os fornecedores habilitados a acessar o Portal do Fornecedor.</p>
            </div>

            {/* "Total" em destaque (2 colunas); os demais são a decomposição (§4.2) */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <KpiCard shadow={false} size="lg" className="col-span-2" label="Total de Fornecedores" value={kpis.total} icon={<Truck className="w-4 h-4" />} color="orange" />
              <KpiCard shadow={false} size="sm" label="Portal habilitado" value={kpis.habilitados} icon={<CheckCircle className="w-4 h-4" />} color="emerald" />
              <KpiCard shadow={false} size="sm" label="Sem acesso" value={kpis.semAcesso} icon={<Mail className="w-4 h-4" />} color="gray" />
              <KpiCard shadow={false} size="sm" label="Globais" value={kpis.globais} icon={<Link2 className="w-4 h-4" />} color="violet" />
            </div>

            {/* Toolbar de botões (ui_ux_guia_unificado.md §5.3) — escopo/contexto à esquerda, ação primária à direita;
                barra própria, acima da toolbar de busca, porque não é filtro de linha, é ação da tela */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
              <span className="text-xs text-gray-400">
                {organizationId ? 'Fornecedores desta organização e globais.' : 'Visualizando fornecedores de todas as organizações.'}
              </span>
              <button
                onClick={() => openEnableModal()}
                className="flex items-center gap-1.5 h-9 px-3.5 bg-orange-500 text-white rounded-[6px] hover:bg-orange-600 font-medium text-[13px] transition-all active:scale-95 shrink-0"
              >
                <Plus className="w-[15px] h-[15px]" />
                Novo fornecedor
              </button>
            </div>

            {/* Tabela com toolbar de busca acoplada (ui_ux_guia_unificado.md §5.2) — um único card,
                border-b da toolbar é a única linha entre os dois blocos */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-2 border-b border-gray-100 bg-white">
                <div className="flex flex-col md:flex-row gap-2.5 items-center">
                  <div className="flex-1 relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar por fornecedor ou e-mail..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>

                  <button
                    onClick={refreshSuppliers}
                    className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                    title="Atualizar"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>

                  <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                  <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                    <ColumnConfigButton
                      columns={SUPPLIER_PORTAL_COLUMNS}
                      visibleColumns={tableColumns.visibleColumns}
                      showColumnConfig={tableColumns.showColumnConfig}
                      onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                      onToggleColumn={tableColumns.toggleColumn}
                      onReset={tableColumns.resetColumns}
                    />
                  </div>
                </div>
              </div>

              {/* Conteúdo — loading/empty/tabela, sem bg/border/rounded/shadow próprios (o card pai já supre) */}
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                  <p className="mt-2 text-gray-500 text-sm">Carregando...</p>
                </div>
              ) : filteredSuppliers.length === 0 ? (
                <div className="text-center py-12">
                  <Truck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum fornecedor encontrado</h3>
                  <p className="text-sm text-gray-500">
                    {searchTerm ? 'Tente ajustar sua busca.' : 'Clique em "Novo fornecedor" para habilitar o primeiro.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[70vh]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                        {tableColumns.orderedVisibleColumns.map(key => {
                          const def = SUPPLIER_PORTAL_COLUMN_HEADERS[key];
                          if (!def) return null;
                          return (
                            <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                              sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                              onSort={tableColumns.handleColumnSort}
                              onMoveColumn={tableColumns.moveColumn}
                              className={def.className} />
                          );
                        })}
                        <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredSuppliers.map((s) => {
                        const stats = supplierStats[s.id] || { orders: 0, quotations: 0, documents: 0 };
                        const hasAccess = !!s.email;
                        return (
                          <tr
                            key={s.id}
                            onClick={() => setSelectedSupplier(s)}
                            className="hover:bg-orange-50/50 transition-colors cursor-pointer group"
                          >
                            {tableColumns.orderedVisibleColumns.map(key => (
                              <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                {renderSupplierPortalCell(key, s, { stats, hasAccess })}
                              </td>
                            ))}
                            <td className="px-6 py-2.5 text-right">
                              {/* Gerenciar = clique na linha (ação dominante, §9.1). Ações aqui são só o que sobra. */}
                              <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <ActionIconButton
                                  kind="share"
                                  icon={<Link2 className="w-4 h-4" />}
                                  title="Link de Acesso"
                                  onClick={() => { setSelectedSupplier(s); setTokenModalOpen(true); }}
                                />
                                <ActionIconButton
                                  kind="edit"
                                  icon={<Mail className="w-4 h-4" />}
                                  title={hasAccess ? 'Alterar e-mail de acesso' : 'Definir e-mail de acesso'}
                                  onClick={() => openEnableModal(s)}
                                />
                                {hasAccess && (
                                  <ActionIconButton
                                    kind="delete"
                                    icon={<Unlink className="w-4 h-4" />}
                                    title="Revogar acesso ao portal"
                                    onClick={() => handleRevokeAccess(s)}
                                  />
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL: HABILITAR/ATUALIZAR ACESSO AO PORTAL */}
      {isEnableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-gray-200 max-w-md w-full p-6 rounded-2xl flex flex-col gap-4 shadow-2xl relative">
            <h3 className="text-md font-bold text-gray-900">Habilitar Portal do Fornecedor</h3>

            <form onSubmit={handleSaveAccess} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold">Fornecedor / Prestador de Serviço</label>
                <select
                  required
                  value={enableSupplierId}
                  onChange={(e) => {
                    setEnableSupplierId(e.target.value);
                    const supplier = suppliers.find((s) => s.id === e.target.value);
                    setEnableEmail(supplier?.email || '');
                  }}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-form-input text-gray-800 focus:outline-none"
                >
                  <option value="">Selecione um prestador...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {getSupplierDisplayName(s, appSettingsService.get().supplierNameDisplay)}{!organizationId ? ` — ${s.organization_name || 'Todas as Organizações'}` : ''}
                      {s.email ? ' (portal habilitado)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold">E-mail de Login</label>
                <input
                  required
                  type="email"
                  value={enableEmail}
                  onChange={(e) => setEnableEmail(e.target.value)}
                  placeholder="email@fornecedor.com"
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-form-input text-gray-800 focus:outline-none focus:border-orange-500"
                />
                <p className="text-xs text-gray-400 pt-1">
                  É este e-mail que o fornecedor usa para entrar no Portal do Fornecedor.
                </p>
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 mt-2">
                <Button variant="ghost" type="button" onClick={() => setIsEnableModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={savingAccess} className="bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50">
                  {savingAccess ? 'Salvando...' : 'Habilitar Acesso'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LINK DE ACESSO PÚBLICO (SEM LOGIN) — mesmo formato do Portal do Parceiro */}
      {tokenModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-gray-200 max-w-lg w-full p-6 rounded-2xl flex flex-col gap-4 shadow-2xl relative">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-md font-bold text-gray-900">Link de Acesso ao Portal</h3>
                <p className="text-sm text-gray-400 font-medium mt-0.5">
                  {getSupplierDisplayName(selectedSupplier, appSettingsService.get().supplierNameDisplay)}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setTokenModalOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              Compartilhe este link com o fornecedor para que ele acesse o portal direto, sem
              precisar de senha ou cadastro prévio — com as mesmas 6 abas do acesso logado
              (Estatísticas, Lances, Cotações, Pedidos, Docs e Perfil). Por segurança, excluir e
              duplicar pedido ficam disponíveis só no acesso logado.
            </p>

            {/* Fornecedor global + "Todas as organizações" no topo: nenhuma organização
                dona do link é derivável — escolha manual aqui em vez de bloquear a ação. */}
            {!derivedTokenOrgId && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold">Organização responsável pelo link</label>
                <select
                  value={tokenOrgOverride}
                  onChange={(e) => setTokenOrgOverride(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-form-input text-gray-800 focus:outline-none"
                >
                  <option value="">Selecione a organização...</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 pt-1">
                  Este fornecedor é global (sem organização própria) e nenhuma organização
                  específica está selecionada no topo do sistema — escolha quem vai administrar
                  este link (gerar, regenerar, revogar).
                </p>
              </div>
            )}

            {tokenLoading ? (
              <div className="text-center py-6 text-xs text-gray-400">Carregando...</div>
            ) : portalToken && portalToken.is_active ? (
              <>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col gap-1">
                  <p className="text-xs font-mono text-gray-700 break-all">
                    {supplierPortalTokenService.buildPortalUrl(portalToken.token)}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Expira em: {new Date(portalToken.expires_at).toLocaleDateString('pt-BR')}
                    {portalToken.last_used_at && ` · Último acesso: ${new Date(portalToken.last_used_at).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCopyPortalLink} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white">
                    {tokenCopied ? 'Copiado!' : 'Copiar Link'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleGenerateToken}
                    disabled={!effectiveTokenOrgId}
                    title={effectiveTokenOrgId ? 'Gerar um novo link (invalida o atual)' : 'Escolha a organização responsável acima'}
                  >
                    Regenerar
                  </Button>
                  <Button variant="ghost" onClick={handleRevokeToken} className="text-red-500 hover:bg-red-50" title="Revogar acesso">
                    Revogar
                  </Button>
                </div>
              </>
            ) : (
              <Button
                onClick={handleGenerateToken}
                disabled={!effectiveTokenOrgId}
                title={effectiveTokenOrgId ? undefined : 'Escolha a organização responsável acima'}
                className="bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
              >
                Gerar Link de Acesso
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Toast de notificação (§13) */}
      {localToast && (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
          localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {localToast.message}
        </div>
      )}
    </div>
  );
};

export default SupplierPortalManager;
