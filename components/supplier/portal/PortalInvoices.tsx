import React from 'react';
import { AlertCircle, Eye, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { Invoice, PurchaseOrder, Supplier } from '../../../types';
import { invoiceService } from '../../../services/invoiceService';
import { supplierPortalTokenService } from '../../../services/supplierPortalTokenService';
import { useConfirm } from '../../ui/confirm';
import {
    CardHeader, fmtBRLCents, fmtDate, PortalCard, PortalEmpty, PortalLoading,
    SoftButton, StatusPill, Td, Th,
} from '../../portal/PortalKit';
import { INVOICE_STATUS } from './status';

interface Props {
    supplier: Supplier;
    orders: PurchaseOrder[];
    /** Acesso via link público — troca os services autenticados pelas RPCs por token. */
    portalToken?: string;
    /** Avisa o dashboard para recarregar os KPIs depois de enviar/excluir. */
    onChanged?: () => void;
}

const ACCEPTED = ['application/pdf', 'text/xml', 'application/xml', 'image/jpeg', 'image/png'];
const MAX_BYTES = 5 * 1024 * 1024;

const PortalInvoices: React.FC<Props> = ({ supplier, orders, portalToken, onChanged }) => {
    const confirm = useConfirm();
    const [invoices, setInvoices] = React.useState<Invoice[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [uploading, setUploading] = React.useState(false);
    const [dragActive, setDragActive] = React.useState(false);
    const [linkOrderId, setLinkOrderId] = React.useState('');
    const [error, setError] = React.useState<string | null>(null);

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const data = portalToken
                ? await supplierPortalTokenService.getInvoices(portalToken)
                : await invoiceService.listInvoices(supplier.id);
            setInvoices(data);
        } catch (err) {
            console.error('Erro ao carregar notas fiscais:', err);
            setError('Não foi possível carregar suas notas fiscais.');
        } finally {
            setLoading(false);
        }
    }, [supplier.id, portalToken]);

    React.useEffect(() => { load(); }, [load]);

    const orderNumber = React.useMemo(() => {
        const map = new Map<string, string>();
        orders.forEach(o => map.set(o.id, o.number || o.id.slice(0, 8)));
        return map;
    }, [orders]);

    const handleUpload = async (file: File) => {
        if (!file) return;
        if (!ACCEPTED.includes(file.type) && !file.name.endsWith('.xml')) {
            setError('Tipo de arquivo não suportado. Use PDF, XML ou imagem.');
            return;
        }
        if (file.size > MAX_BYTES) {
            setError('Arquivo muito grande. O limite é 5MB.');
            return;
        }
        setUploading(true);
        setError(null);
        try {
            if (portalToken) {
                await supplierPortalTokenService.uploadInvoice(portalToken, file, linkOrderId || undefined);
            } else {
                await invoiceService.uploadInvoice(supplier.id, file, undefined, linkOrderId || undefined);
            }
            await load();
            onChanged?.();
        } catch (err) {
            console.error('Erro ao enviar nota fiscal:', err);
            setError(err instanceof Error ? err.message : 'Erro ao enviar o arquivo. Tente novamente.');
        } finally {
            setUploading(false);
        }
    };

    const handleView = async (filePath: string) => {
        try {
            if (portalToken) {
                const url = await supplierPortalTokenService.getInvoiceDownloadUrl(portalToken, filePath);
                window.open(url, '_blank', 'noreferrer');
            } else {
                await invoiceService.openInvoice(filePath);
            }
        } catch (err) {
            console.error('Erro ao abrir nota fiscal:', err);
            setError('Erro ao gerar o link de acesso ao documento.');
        }
    };

    // §14 — confirmação destrutiva pelo useConfirm() global, nunca window.confirm.
    const handleDelete = async (invoice: Invoice) => {
        const ok = await confirm({
            title: 'Excluir documento?',
            message: `"${invoice.fileName}" será removido permanentemente.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            if (portalToken) {
                await supplierPortalTokenService.deleteInvoice(portalToken, invoice.id);
            } else {
                await invoiceService.deleteInvoice(invoice.id, invoice.filePath);
            }
            // §22 — estado local, sem recarregar a lista inteira.
            setInvoices(prev => prev.filter(i => i.id !== invoice.id));
            onChanged?.();
        } catch (err) {
            console.error('Erro ao excluir nota fiscal:', err);
            setError('Não foi possível excluir o documento.');
        }
    };

    const handleLink = async (invoiceId: string, orderId: string) => {
        try {
            if (portalToken) {
                await supplierPortalTokenService.linkInvoiceOrder(portalToken, invoiceId, orderId || null);
            } else {
                await invoiceService.updateInvoiceOrder(invoiceId, orderId || null);
            }
            setInvoices(prev => prev.map(i => i.id === invoiceId ? { ...i, orderId: orderId || undefined } : i));
            onChanged?.();
        } catch (err) {
            console.error('Erro ao vincular pedido:', err);
            setError('Erro ao vincular o pedido.');
        }
    };

    const rows = React.useMemo(
        () => [...invoices].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        [invoices],
    );

    return (
        <div className="space-y-3">
            {error && (
                <PortalCard className="px-5 py-3.5 flex items-start gap-3 border-[#F3D9D1] bg-[#FDF8F6]">
                    <AlertCircle className="w-4 h-4 text-[#C24428] shrink-0 mt-0.5" />
                    <p className="text-[13px] text-[#C24428] flex-1">{error}</p>
                    <button type="button" onClick={() => setError(null)} className="text-[13px] text-[#8A8F9A] hover:text-[#1F2430]">
                        Fechar
                    </button>
                </PortalCard>
            )}

            {/* Envio — zona de arraste no vocabulário do portal */}
            <PortalCard>
                <CardHeader
                    title="Enviar nota fiscal"
                    subtitle="PDF, XML ou imagem, até 5MB"
                    right={
                        <select
                            value={linkOrderId}
                            onChange={e => setLinkOrderId(e.target.value)}
                            className="h-8 rounded-[8px] border border-[#ECECEF] bg-white px-2.5 text-[13px] text-[#4A505C] outline-none focus:border-[#E1553C] cursor-pointer"
                        >
                            <option value="">Sem pedido vinculado</option>
                            {orders.map(o => (
                                <option key={o.id} value={o.id}>Vincular ao {o.number || o.id.slice(0, 8)}</option>
                            ))}
                        </select>
                    }
                />
                <div className="px-5 pb-5">
                    <label
                        htmlFor="portal-invoice-upload"
                        onDragEnter={e => { e.preventDefault(); setDragActive(true); }}
                        onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                        onDragLeave={e => { e.preventDefault(); setDragActive(false); }}
                        onDrop={e => {
                            e.preventDefault();
                            setDragActive(false);
                            if (e.dataTransfer.files?.[0]) handleUpload(e.dataTransfer.files[0]);
                        }}
                        className={`flex flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${
                            dragActive ? 'border-[#E1553C] bg-[#FDF8F6]' : 'border-[#ECECEF] hover:border-[#F3D9D1] hover:bg-[#FDFBFA]'
                        }`}
                    >
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FDEDE8] text-[#C24428]">
                            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                        </span>
                        <span className="text-sm font-semibold text-[#1F2430]">
                            {uploading ? 'Enviando...' : 'Arraste o arquivo ou clique para escolher'}
                        </span>
                        <span className="text-[13px] text-[#8A8F9A]">
                            {linkOrderId ? `Será vinculado ao pedido ${orderNumber.get(linkOrderId) ?? ''}` : 'Você pode vincular a um pedido depois'}
                        </span>
                    </label>
                    <input
                        id="portal-invoice-upload"
                        type="file"
                        className="hidden"
                        accept=".pdf,.xml,image/*"
                        onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); e.target.value = ''; }}
                    />
                </div>
            </PortalCard>

            {/* Enviadas */}
            <PortalCard className="overflow-hidden">
                <CardHeader
                    title="Notas enviadas"
                    subtitle={rows.length > 0 ? `${rows.length} documento${rows.length === 1 ? '' : 's'}` : undefined}
                />
                {loading ? (
                    <div className="border-t border-[#ECECEF]"><PortalLoading label="Carregando documentos..." /></div>
                ) : (
                    <div className="overflow-x-auto border-t border-[#ECECEF]">
                        <table className="w-full min-w-[760px]">
                            <thead>
                                <tr className="border-b border-[#ECECEF]">
                                    <Th>Data</Th>
                                    <Th>Arquivo</Th>
                                    <Th>Valor</Th>
                                    <Th>Pedido vinculado</Th>
                                    <Th>Status</Th>
                                    <Th className="text-right">Ações</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F4F4F6]">
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={6}>
                                            <PortalEmpty
                                                icon={<FileText className="w-9 h-9" />}
                                                title="Nenhuma nota fiscal enviada"
                                                subtitle="Envie a NFe do pedido acima para que a construtora consiga liberar o pagamento."
                                            />
                                        </td>
                                    </tr>
                                ) : rows.map(inv => {
                                    const st = INVOICE_STATUS[inv.status] ?? { label: inv.status, tone: 'muted' as const };
                                    return (
                                        <tr key={inv.id} className="hover:bg-gray-50/70 transition-colors">
                                            <Td className="text-[#8A8F9A] whitespace-nowrap">{fmtDate(inv.createdAt)}</Td>
                                            <Td className="text-[#1F2430] font-medium">
                                                <span className="inline-flex items-center gap-2 min-w-0">
                                                    <FileText className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                                                    <span className="truncate max-w-[240px]">{inv.fileName}</span>
                                                </span>
                                            </Td>
                                            <Td className="tabular-nums">{inv.amount ? fmtBRLCents(inv.amount) : '—'}</Td>
                                            <Td>
                                                {/* §7.1 — select inline com a MESMA tipografia da célula */}
                                                <select
                                                    value={inv.orderId || ''}
                                                    onChange={e => handleLink(inv.id, e.target.value)}
                                                    className={`text-sm rounded-[6px] border px-2 py-1 cursor-pointer outline-none transition-colors ${
                                                        inv.orderId
                                                            ? 'text-[#1F2430] bg-[#F6F6F8] border-[#ECECEF]'
                                                            : 'text-[#A0A4AD] bg-white border-dashed border-[#ECECEF]'
                                                    }`}
                                                >
                                                    <option value="">Sem vínculo</option>
                                                    {orders.map(o => (
                                                        <option key={o.id} value={o.id}>{o.number || o.id.slice(0, 8)}</option>
                                                    ))}
                                                </select>
                                            </Td>
                                            <Td><StatusPill tone={st.tone}>{st.label}</StatusPill></Td>
                                            <Td className="text-right">
                                                {/* §9 — ações sempre visíveis, nunca em hover */}
                                                <div className="inline-flex items-center gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleView(inv.filePath)}
                                                        title="Visualizar"
                                                        className="text-[#8A8F9A] hover:text-[#C24428] transition-colors"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(inv)}
                                                        title="Excluir"
                                                        className="text-[#8A8F9A] hover:text-red-600 transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </Td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </PortalCard>

            <div className="flex justify-end">
                <SoftButton onClick={load}>Atualizar lista</SoftButton>
            </div>
        </div>
    );
};

export default PortalInvoices;
