import React, { useState, useEffect, useMemo } from 'react';
import ActionIconButton from './ui/ActionIconButton';
import {
    FileText,
    Upload,
    Eye,
    AlertCircle,
    Loader2,
    Link as LinkIcon,
    LayoutDashboard,
    Table2,
    Search,
    FilePlus,
} from 'lucide-react';
import { invoiceService } from '../services/invoiceService';
import { orderService } from '../services/orderService';
import { Invoice, Supplier, PurchaseOrder } from '../types';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { useConfirm } from './ui/confirm';

const INVOICE_COLUMNS: ColumnConfig[] = [
    { key: 'fileName', label: 'Arquivo', sortable: true },
    { key: 'createdAt', label: 'Data', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'order', label: 'Pedido vinculado', sortable: false },
    { key: 'actions', label: 'Ações', sortable: false },
];

// StatusBadge — texto simples colorido, sem pílula/fundo/uppercase (UI UX tabela.md §7)
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    paid: { label: 'Pago', color: 'text-emerald-700' },
    rejected: { label: 'Recusado', color: 'text-red-600' },
    approved: { label: 'Aprovado', color: 'text-blue-700' },
};
const StatusLabel: React.FC<{ status: string }> = ({ status }) => {
    const s = STATUS_LABELS[status] || { label: 'Pendente', color: 'text-gray-500' };
    return <span className={`text-sm font-normal ${s.color}`}>{s.label}</span>;
};

interface InvoiceManagerProps {
    supplier: Supplier;
}

const InvoiceManager: React.FC<InvoiceManagerProps> = ({ supplier }) => {
    const confirm = useConfirm();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [viewMode, setViewMode] = usePersistedState<'grid' | 'list'>('invoiceManagerDocs:viewMode', 'list');
    const [searchTerm, setSearchTerm] = usePersistedState('invoiceManagerDocs:search', '');
    const tableColumns = useTableColumns(INVOICE_COLUMNS, 'invoiceManagerColumns');

    useEffect(() => {
        loadData();
    }, [supplier.id]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [invoiceData, orderData] = await Promise.all([
                invoiceService.listInvoices(supplier.id),
                orderService.listOrders(undefined, supplier.id, supplier.email)
            ]);
            setInvoices(invoiceData);
            setOrders(orderData);
        } catch (err) {
            console.error("Error loading data:", err);
            setError("Falha ao carregar dados.");
        } finally {
            setLoading(false);
        }
    };

    const filteredInvoices = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        const result = q ? invoices.filter(i => i.fileName.toLowerCase().includes(q)) : invoices;

        if (!tableColumns.sortColumn) {
            return [...result].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...result].sort((a, b) => {
            switch (tableColumns.sortColumn) {
                case 'fileName': return dir * a.fileName.localeCompare(b.fileName);
                case 'createdAt': return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                case 'status': return dir * a.status.localeCompare(b.status);
                default: return 0;
            }
        });
    }, [invoices, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

    const loadInvoices = async () => {
        try {
            const data = await invoiceService.listInvoices(supplier.id);
            setInvoices(data);
        } catch (err) {
            console.error("Error loading invoices:", err);
        }
    };

    const handleFileUpload = async (file: File) => {
        if (!file) return;

        // Check file type (PDF, XML, or images)
        const allowedTypes = ['application/pdf', 'text/xml', 'application/xml', 'image/jpeg', 'image/png'];
        if (!allowedTypes.includes(file.type) && !file.name.endsWith('.xml')) {
            setError("Tipo de arquivo não suportado. Use PDF, XML ou Imagens.");
            return;
        }

        // Check file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            setError("Arquivo muito grande. O limite é 5MB.");
            return;
        }

        try {
            setUploading(true);
            setError(null);
            await invoiceService.uploadInvoice(
                supplier.id,
                file,
                undefined,
                selectedOrderId === "" ? undefined : selectedOrderId
            );
            await loadInvoices();
            // Clear order selection after upload if needed, or keep for batch upload
        } catch (err: any) {
            console.error("Error uploading invoice:", err);
            const msg = err.message || "Erro ao subir arquivo.";
            setError(`${msg}. Tente novamente.`);
        } finally {
            setUploading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0]);
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    };

    const handleDelete = async (invoice: Invoice) => {
        const ok = await confirm({
            title: 'Excluir documento?',
            message: `"${invoice.fileName}" será removido permanentemente.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;

        try {
            await invoiceService.deleteInvoice(invoice.id, invoice.filePath);
            setInvoices(prev => prev.filter(i => i.id !== invoice.id));
        } catch (err) {
            console.error("Error deleting invoice:", err);
            setError("Não foi possível excluir o documento.");
        }
    };

    const handleLinkOrder = async (invoiceId: string, orderId: string) => {
        try {
            await invoiceService.updateInvoiceOrder(invoiceId, orderId === "" ? null : orderId);
            setInvoices(prev => prev.map(inv =>
                inv.id === invoiceId ? { ...inv, orderId: orderId === "" ? undefined : orderId } : inv
            ));
        } catch (err) {
            console.error("Error linking order:", err);
            setError("Erro ao vincular pedido.");
        }
    };

    return (
        <div className="space-y-6">
            {/* Zona de upload — não é tabela, mas segue a escala de radius única do app (§16) */}
            <div
                className={`relative group bg-white border-2 border-dashed rounded-[10px] transition-all duration-300 p-8 text-center
          ${dragActive ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200 hover:border-blue-200'}
        `}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                <div className="absolute top-4 right-4 z-10">
                    <select
                        value={selectedOrderId}
                        onChange={(e) => setSelectedOrderId(e.target.value)}
                        className="h-9 bg-gray-50 border border-gray-200 rounded-[6px] px-3 text-sm font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                    >
                        <option value="">Nenhum pedido</option>
                        {orders.map(order => (
                            <option key={order.id} value={order.id}>Referenciar {order.number}</option>
                        ))}
                    </select>
                </div>

                <input
                    type="file"
                    id="invoice-upload"
                    className="hidden"
                    onChange={handleFileChange}
                    accept=".pdf,.xml,image/*"
                />

                <label
                    htmlFor="invoice-upload"
                    className="cursor-pointer flex flex-col items-center gap-3 mt-6"
                >
                    <div className="w-14 h-14 bg-gray-50 rounded-[10px] flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
                        {uploading ? <Loader2 className="w-7 h-7 animate-spin" /> : <Upload className="w-7 h-7" />}
                    </div>

                    <div>
                        <h4 className="text-sm font-bold text-gray-900">Upload de NFe / Recibos</h4>
                        <p className="text-xs text-gray-400 mt-1">Arraste seus arquivos aqui ou clique para buscar — PDF, XML ou imagem, máx. 5MB</p>
                    </div>
                </label>

                {error && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-red-600">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-xs font-medium">{error}</span>
                    </div>
                )}
            </div>

            {/* Tabela com toolbar de busca acoplada (UI UX tabela.md §5) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por nome do arquivo..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={INVOICE_COLUMNS.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                            <div className="w-px h-5 bg-gray-200 mx-0.5"></div>
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
                                title="Visualização em grade"
                            >
                                <LayoutDashboard className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
                                title="Visualização em lista"
                            >
                                <Table2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500 text-sm">Carregando...</p>
                    </div>
                ) : filteredInvoices.length === 0 ? (
                    <div className="text-center py-12">
                        <FilePlus className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum documento encontrado</h3>
                        <p className="text-sm text-gray-500">{searchTerm ? 'Tente ajustar sua busca.' : 'Nenhum documento anexado ainda.'}</p>
                    </div>
                ) : viewMode === 'list' ? (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.visibleColumns.includes('fileName') && (
                                        <SortableHeader colKey="fileName" label="Arquivo" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('createdAt') && (
                                        <SortableHeader colKey="createdAt" label="Data" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && (
                                        <SortableHeader colKey="status" label="Status" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                                    )}
                                    {tableColumns.visibleColumns.includes('order') && (
                                        <th className="px-6 py-2 border-r border-gray-100 whitespace-nowrap text-sm font-semibold text-gray-500">Pedido vinculado</th>
                                    )}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredInvoices.map((invoice) => {
                                    const linkedOrder = orders.find(o => o.id === invoice.orderId);
                                    return (
                                        <tr key={invoice.id} className="hover:bg-blue-50/50 transition-colors group">
                                            {tableColumns.visibleColumns.includes('fileName') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <div className="flex items-center gap-2.5">
                                                        <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                                                        <span className="text-sm font-normal text-gray-700 truncate max-w-[220px]">{invoice.fileName}</span>
                                                    </div>
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('createdAt') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                    {new Date(invoice.createdAt).toLocaleDateString()}
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('status') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <StatusLabel status={invoice.status} />
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('order') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    {/* Select inline — mesma tipografia da célula de texto (§7.1) */}
                                                    <select
                                                        value={invoice.orderId || ""}
                                                        onChange={(e) => handleLinkOrder(invoice.id, e.target.value)}
                                                        className={`text-sm font-normal px-2 py-1 rounded border transition-all appearance-none cursor-pointer ${
                                                            linkedOrder ? 'text-gray-900 bg-gray-50 border-gray-100' : 'text-gray-400 bg-white border-dashed border-gray-200'
                                                        }`}
                                                    >
                                                        <option value="">Sem vínculo</option>
                                                        {orders.map(order => (
                                                            <option key={order.id} value={order.id}>{order.number}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('actions') && (
                                                <td className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => invoiceService.openInvoice(invoice.filePath)}
                                                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Visualizar"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </button>
                                                        <ActionIconButton kind="delete" onClick={() => handleDelete(invoice)} />
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
                        {filteredInvoices.map((invoice) => {
                            const linkedOrder = orders.find(o => o.id === invoice.orderId);
                            return (
                                <div key={invoice.id} className="bg-white p-4 rounded-[10px] border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="w-10 h-10 bg-gray-50 rounded-[6px] flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <StatusLabel status={invoice.status} />
                                            <span className="text-xs text-gray-400">{new Date(invoice.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>

                                    <h5 className="text-sm font-bold text-gray-900 truncate mb-3" title={invoice.fileName}>
                                        {invoice.fileName}
                                    </h5>

                                    <div className="flex items-center justify-between text-xs pt-3 border-t border-gray-100 mb-3">
                                        <span className="text-gray-400">Vínculo</span>
                                        <select
                                            value={invoice.orderId || ""}
                                            onChange={(e) => handleLinkOrder(invoice.id, e.target.value)}
                                            className="text-sm font-normal bg-gray-50 border border-gray-100 rounded px-2 py-1 text-gray-700 cursor-pointer"
                                        >
                                            <option value="">Nenhum</option>
                                            {orders.map(order => (
                                                <option key={order.id} value={order.id}>{order.number}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {linkedOrder && (
                                        <div className="flex items-center gap-1.5 text-xs text-blue-600 mb-3">
                                            <LinkIcon className="w-3 h-3" /> Pedido {linkedOrder.number}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-1.5 pt-3 border-t border-gray-100">
                                        <button
                                            onClick={() => invoiceService.openInvoice(invoice.filePath)}
                                            className="flex-1 flex items-center justify-center gap-1.5 h-9 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-all"
                                        >
                                            <Eye className="w-4 h-4" /> Visualizar
                                        </button>
                                        <ActionIconButton kind="delete" onClick={() => handleDelete(invoice)} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default InvoiceManager;
