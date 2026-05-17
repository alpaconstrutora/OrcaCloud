import React, { useState, useEffect } from 'react';
import {
    FileText,
    Upload,
    Trash2,
    Eye,
    Download,
    AlertCircle,
    CheckCircle2,
    Clock,
    X,
    FilePlus,
    Loader2,
    Tag,
    Link as LinkIcon,
    LayoutDashboard,
    Table2
} from 'lucide-react';
import { invoiceService } from '../services/invoiceService';
import { orderService } from '../services/orderService';
import { Invoice, Supplier, PurchaseOrder } from '../types';

interface InvoiceManagerProps {
    supplier: Supplier;
}

const InvoiceManager: React.FC<InvoiceManagerProps> = ({ supplier }) => {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

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
        if (!window.confirm("Deseja realmente excluir este documento?")) return;

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

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'paid':
                return (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-green-100">
                        <CheckCircle2 className="w-3 h-3" /> Pago
                    </div>
                );
            case 'rejected':
                return (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-100">
                        <X className="w-3 h-3" /> Recusado
                    </div>
                );
            case 'approved':
                return (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100">
                        <Clock className="w-3 h-3" /> Aprovado
                    </div>
                );
            default:
                return (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-50 text-gray-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-gray-100">
                        <Clock className="w-3 h-3" /> Pendente
                    </div>
                );
        }
    };

    return (
        <div className="space-y-6">
            {/* Upload Zone */}
            <div
                className={`relative group bg-white border-2 border-dashed rounded-[2.5rem] transition-all duration-300 p-8 text-center
          ${dragActive ? 'border-indigo-500 bg-indigo-50/30' : 'border-gray-100 hover:border-indigo-200'}
        `}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                <div className="absolute top-6 right-8 z-10">
                    <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
                        <Tag className="w-3.5 h-3.5 text-gray-400 ml-2" />
                        <select
                            value={selectedOrderId}
                            onChange={(e) => setSelectedOrderId(e.target.value)}
                            className="bg-transparent border-none text-[10px] font-black uppercase tracking-wider text-gray-600 focus:ring-0 cursor-pointer pr-8"
                        >
                            <option value="">Nenhum Pedido</option>
                            {orders.map(order => (
                                <option key={order.id} value={order.id}>Referenciar {order.number}</option>
                            ))}
                        </select>
                    </div>
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
                    className="cursor-pointer flex flex-col items-center gap-4 mt-4"
                >
                    <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center text-gray-400 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-sm">
                        {uploading ? <Loader2 className="w-10 h-10 animate-spin" /> : <Upload className="w-10 h-10" />}
                    </div>

                    <div>
                        <h4 className="text-lg font-black text-gray-900 tracking-tight uppercase">Upload de NFe / Recibos</h4>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Arraste seus arquivos aqui ou clique para buscar</p>
                    </div>

                    <div className="flex gap-4 mt-2">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span> PDF / XML
                        </span>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span> Máx 5MB
                        </span>
                    </div>
                </label>

                {error && (
                    <div className="mt-6 flex items-center justify-center gap-2 text-red-600 animate-in fade-in slide-in-from-top-2">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-widest">{error}</span>
                    </div>
                )}
            </div>

            {/* Invoice List */}
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Documentos Recentes</h3>
                        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid'
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-gray-400 hover:text-gray-600'
                                    }`}
                                title="Visualização em Grade"
                            >
                                <LayoutDashboard className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded-lg transition-all ${viewMode === 'list'
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-gray-400 hover:text-gray-600'
                                    }`}
                                title="Visualização em Lista"
                            >
                                <Table2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{invoices.length} Arquivos</span>
                </div>

                {loading ? (
                    <div className="p-20 flex justify-center">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    </div>
                ) : invoices.length > 0 ? (
                    viewMode === 'list' ? (
                        <div className="divide-y divide-gray-50">
                            {invoices.map((invoice) => {
                                const linkedOrder = orders.find(o => o.id === invoice.orderId);

                                return (
                                    <div key={invoice.id} className="group p-6 hover:bg-gray-50 transition-colors flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-white group-hover:shadow-sm transition-all border border-transparent group-hover:border-gray-100">
                                                <FileText className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h5 className="text-sm font-black text-gray-900 truncate max-w-[200px]">{invoice.fileName}</h5>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                        {new Date(invoice.createdAt).toLocaleDateString()}
                                                    </span>
                                                    <span className="w-1 h-1 bg-gray-200 rounded-full"></span>
                                                    {getStatusBadge(invoice.status)}

                                                    {linkedOrder && (
                                                        <>
                                                            <span className="w-1 h-1 bg-gray-200 rounded-full"></span>
                                                            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-black uppercase tracking-tight border border-indigo-100">
                                                                <LinkIcon className="w-2.5 h-2.5" /> Pedido {linkedOrder.number}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="opacity-0 group-hover:opacity-100 transition-all">
                                                <select
                                                    value={invoice.orderId || ""}
                                                    onChange={(e) => handleLinkOrder(invoice.id, e.target.value)}
                                                    className="bg-white border-gray-100 text-[10px] font-black uppercase tracking-tight text-gray-400 focus:ring-0 cursor-pointer rounded-xl py-1.5"
                                                >
                                                    <option value="">Vincular Pedido</option>
                                                    {orders.map(order => (
                                                        <option key={order.id} value={order.id}>{order.number}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                <a
                                                    href={invoiceService.getInvoiceUrl(invoice.filePath)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="p-3 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-indigo-600 hover:border-indigo-100 shadow-sm transition-all active:scale-95"
                                                    title="Visualizar"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </a>
                                                <button
                                                    onClick={() => handleDelete(invoice)}
                                                    className="p-3 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-red-600 hover:border-red-100 shadow-sm transition-all active:scale-95"
                                                    title="Excluir"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-8 bg-gray-50/30">
                            {invoices.map((invoice) => {
                                const linkedOrder = orders.find(o => o.id === invoice.orderId);

                                return (
                                    <div key={invoice.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-all group relative overflow-hidden">
                                        <div className="flex items-start justify-between mb-6">
                                            <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                                                <FileText className="w-8 h-8" />
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                {getStatusBadge(invoice.status)}
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                    {new Date(invoice.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>

                                        <h5 className="text-sm font-black text-gray-900 truncate mb-4" title={invoice.fileName}>
                                            {invoice.fileName}
                                        </h5>

                                        <div className="space-y-4 mb-6">
                                            <div className="flex items-center justify-between text-[10px] pt-4 border-t border-gray-50">
                                                <span className="font-black text-gray-400 uppercase tracking-widest">Vínculo</span>
                                                <select
                                                    value={invoice.orderId || ""}
                                                    onChange={(e) => handleLinkOrder(invoice.id, e.target.value)}
                                                    className="bg-gray-50 border-none text-[10px] font-black uppercase tracking-tight text-gray-600 focus:ring-0 cursor-pointer rounded-lg py-1 px-2"
                                                >
                                                    <option value="">Nenhum</option>
                                                    {orders.map(order => (
                                                        <option key={order.id} value={order.id}>{order.number}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            {linkedOrder && (
                                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-tight border border-indigo-100 w-fit">
                                                    <LinkIcon className="w-3 h-3" /> Pedido {linkedOrder.number}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 pt-4 border-t border-gray-50">
                                            <a
                                                href={invoiceService.getInvoiceUrl(invoice.filePath)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-gray-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-indigo-600 hover:border-indigo-100 shadow-sm transition-all"
                                            >
                                                <Eye className="w-4 h-4" /> Visualizar
                                            </a>
                                            <button
                                                onClick={() => handleDelete(invoice)}
                                                className="p-3 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-red-600 hover:border-red-100 shadow-sm transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : (
                    <div className="p-20 text-center">
                        <div className="w-16 h-16 bg-gray-50 rounded-[1.5rem] flex items-center justify-center mx-auto text-gray-300 mb-4">
                            <FilePlus className="w-8 h-8" />
                        </div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Nenhum documento anexado</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InvoiceManager;
