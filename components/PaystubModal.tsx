import React, { useState, useEffect, useRef } from 'react';
import {
    X, Printer, Loader2, FileText, AlertCircle, Download, Plus
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { payrollService, PayrollItem, PayrollRun, PayrollRubric, PayrollEvent, PayrollResultWithEmployee } from '../services/payrollService';
import { payrollEngine } from '../services/payrollEngine';

interface PaystubModalProps {
    orgId: string;
    runId: string;
    employeeId: string;
    onClose: () => void;
    adiantamentoOnly?: boolean;
}

const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
};

const formatMonthYear = (dateStr: string) => {
    if (!dateStr) return '';
    if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];
    const parts = dateStr.split('-');
    if (parts.length < 2) return dateStr;
    const [year, month] = parts;
    const months = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    return `${months[parseInt(month) - 1]} de ${year}`;
};

const PaystubModal: React.FC<PaystubModalProps> = ({ orgId, runId, employeeId, onClose, adiantamentoOnly = false }) => {
    const [result, setResult] = useState<PayrollResultWithEmployee | null>(null);
    const [items, setItems] = useState<PayrollItem[]>([]);
    const [events, setEvents] = useState<PayrollEvent[]>([]);
    const [rubrics, setRubrics] = useState<PayrollRubric[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [noValue, setNoValue] = useState(false);
    const [run, setRun] = useState<PayrollRun | null>(null);
    const [exporting, setExporting] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadData();
    }, [runId, employeeId]);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            setNoValue(false);

            const [runData, resData, itemsData, rubricsData, eventsData] = await Promise.all([
                payrollService.getRun(runId),
                payrollService.getPayrollResult(runId, employeeId).catch(() => null),
                payrollService.getEmployeeItems(runId, employeeId).catch(() => []),
                payrollService.listRubrics(),
                payrollService.listEvents('all', runId)
            ]);

            setRun(runData);
            setRubrics(rubricsData);
            const empEvents = eventsData.filter((e) => e.employee_id === employeeId);
            setEvents(empEvents);

            // Recibo de adiantamento: gerado a partir do evento, em qualquer tipo de run
            if (adiantamentoOnly || runData.type === 'adiantamento') {
                let advEv = empEvents.find(
                    e => e.rubric_code === 'ADIANTAMENTO' || e.code === 'ADIANTAMENTO'
                );
                // Fallback: busca em qualquer run do mesmo período (ex: evento na folha mensal)
                if (!advEv || advEv.amount <= 0) {
                    advEv = await payrollService.findAdiantamentoEvent(
                        employeeId, runData.start_date, runData.end_date
                    ) ?? undefined;
                }

                if (advEv && advEv.amount > 0) {
                    const syntheticItem = {
                        id: advEv.id ?? 'synthetic',
                        payroll_run_id: runId,
                        employee_id: employeeId,
                        code: 'ADIANTAMENTO',
                        type: 'provento' as const,
                        amount: advEv.amount,
                        base_amount: advEv.amount,
                        reference: 1,
                    };
                    const baseResult = resData ?? {
                        employee_id: employeeId,
                        payroll_run_id: runId,
                        gross: 0, discounts: 0, net: 0, employer_cost: 0,
                        base_inss: 0, base_fgts: 0, base_irrf: 0,
                        employee: undefined,
                    } as unknown as PayrollResultWithEmployee;
                    setItems([syntheticItem]);
                    setResult({ ...baseResult, gross: advEv.amount, discounts: 0, net: advEv.amount, employer_cost: advEv.amount });
                    // Força o badge "Recibo de Adiantamento" independente do tipo do run
                    setRun({ ...runData, type: 'adiantamento' });
                    if (runData.type === 'adiantamento') {
                        payrollEngine.calculateEmployeePayroll(employeeId, runId).catch(console.error);
                    }
                    return;
                }

                // Adiantamento sem evento lançado → tela orientativa (não é erro)
                setNoValue(true);
                return;
            }

            if (!resData) {
                setError('Nenhum dado financeiro encontrado para este colaborador.');
                return;
            }

            setResult(resData);
            setItems(itemsData);
        } catch (err: unknown) {
            console.error('Error loading paystub data:', err);
            setError(err instanceof Error ? err.message : 'Falha ao carregar dados do holerite.');
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadPDF = async () => {
        if (!contentRef.current) return;
        
        try {
            setExporting(true);
            const element = contentRef.current;
            
            // Forçamos o render de elementos que seriam ocultos no print se necessário,
            // mas aqui html2canvas renderiza o que está no DOM.
            const canvas = await html2canvas(element, {
                scale: 2, // Aumenta a qualidade
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'px',
                format: [canvas.width / 2, canvas.height / 2] // Mantém a proporção
            });

            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
            const fileName = `Holerite_${result?.employee?.name.replace(/\s+/g, '_') ?? 'colaborador'}_${run?.start_date}.pdf`;
            pdf.save(fileName);
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            alert('Não foi possível gerar o PDF. Tente imprimir como PDF.');
        } finally {
            setExporting(false);
        }
    };

    if (loading) return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white p-12 rounded-3xl shadow-2xl flex flex-col items-center gap-4 relative">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-xl">
                    <X className="w-5 h-5 text-slate-400" />
                </button>
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Gerando Holerite...</p>
            </div>
        </div>
    );

    if (noValue) return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mx-auto">
                    <Plus className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase">Valor não lançado</h3>
                <p className="text-sm font-bold text-slate-500 leading-relaxed">
                    Nenhum adiantamento foi lançado para este colaborador ainda.
                </p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                    Volte à listagem da folha, clique em <strong className="text-indigo-600">+</strong> ao lado do colaborador e adicione a rubrica <strong className="text-indigo-600">ADIANTAMENTO</strong> com o valor desejado.
                </p>
                <button
                    onClick={onClose}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-colors"
                >
                    Voltar
                </button>
            </div>
        </div>
    );

    if (error || !result) return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto">
                    <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase">Ops! Algo deu errado</h3>
                <p className="text-sm font-bold text-slate-400 uppercase leading-relaxed">{error || 'Não foi possível gerar o documento.'}</p>
                <button
                    onClick={onClose}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-colors"
                >
                    Fechar
                </button>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 md:p-12 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300 overflow-y-auto scrollbar-hide py-10 md:py-20">
            <div className="bg-white w-full max-w-4xl rounded-[40px] shadow-2xl overflow-hidden print:shadow-none print:rounded-none relative mb-10">
                {/* Header / Toolbar - Hidden on Print */}
                <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center print:hidden">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-900 uppercase">Recibo de Pagamento</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                {run?.type === 'adiantamento' ? 'Adiantamento — ' : 'Referência: '}{formatMonthYear(run?.start_date || '')}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleDownloadPDF}
                            disabled={exporting}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-all font-black text-[10px] uppercase tracking-widest"
                        >
                            {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            PDF
                        </button>
                        <button 
                            onClick={handlePrint}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-black text-[10px] uppercase tracking-widest"
                        >
                            <Printer className="w-3 h-3" /> Imprimir
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-colors">
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>
                </div>

                {/* Content Area - Paystub Template */}
                <div className="p-8 md:p-12 print:p-0" id="paystub-content" ref={contentRef}>
                    {/* Paystub Card Template */}
                    <div className="border border-slate-200 rounded-2xl overflow-hidden print:border-slate-300">
                        {/* Company Header */}
                        <div className="p-6 border-b border-slate-200 flex justify-between items-start bg-slate-50/50">
                            <div className="space-y-1">
                                <h4 className="text-sm font-black text-slate-900 uppercase">OrçaCloud SaaS Pro</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">CNPJ: 00.000.000/0001-00</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Endereço: Unidade Operacional - Obra Garden</p>
                            </div>
                            <div className="text-right">
                                <span className="px-3 py-1 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest">
                                    {run?.type === 'mensal' ? 'Folha Mensal' :
                                     run?.type === 'adiantamento' ? 'Recibo de Adiantamento' :
                                     run?.type === 'ferias' ? 'Recibo de Férias' :
                                     run?.type === 'decimo_terceiro' ? `13º Salário ${run.subtype ? `(${run.subtype})` : ''}` :
                                     run?.type === 'rescisao' ? 'Rescisão de Contrato' : 'Folha de Pagamento'}
                                </span>
                            </div>
                        </div>

                        {/* Employee Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 border-b border-slate-200">
                            <div className="p-4 border-r border-slate-200 last:border-0">
                                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Colaborador</p>
                                <p className="text-xs font-bold text-slate-900">{result.employee?.name}</p>
                            </div>
                            <div className="p-4 border-r border-slate-200 last:border-0">
                                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">CPF</p>
                                <p className="text-xs font-bold text-slate-900">{result.employee?.cpf || '***.***.***-**'}</p>
                            </div>
                            <div className="p-4 border-r border-slate-200 last:border-0">
                                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Cargo</p>
                                <p className="text-xs font-bold text-slate-900">{result.employee?.role}</p>
                            </div>
                            <div className="p-4 border-r border-slate-200 last:border-0">
                                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Período</p>
                                <p className="text-xs font-bold text-slate-900">{formatDate(run?.start_date || '')} - {formatDate(run?.end_date || '')}</p>
                            </div>
                        </div>

                        {/* Rubrics Table */}
                        <div className="min-h-[400px]">
                            <table className="w-full">
                                <thead className="bg-slate-50 border-b border-slate-200 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                    <tr>
                                        <th className="py-2 px-4 text-left">Cód</th>
                                        <th className="py-2 px-4 text-left">Descrição</th>
                                        <th className="py-2 px-4 text-right">Referência</th>
                                        <th className="py-2 px-4 text-right">Vencimentos</th>
                                        <th className="py-2 px-4 text-right">Descontos</th>
                                    </tr>
                                </thead>
                                <tbody className="text-xs">
                                    {[...items].sort((a, b) => {
                                        const priority: Record<string, number> = { 'provento': 1, 'desconto': 2, 'informativa': 3, 'encargo': 3 };
                                        return (priority[a.type] || 9) - (priority[b.type] || 9);
                                    }).map((item, idx) => {
                                        const rubric = rubrics.find(r => r.code === item.code);
                                        // Busca evento manual apenas se for rubrica genérica
                                        const manualEvent = (item.code === 'OUTROS' || item.code === 'BONUS' || item.code === 'VAL') ? events.find(e => 
                                            (e.rubric_code === item.code || !e.rubric_code) && 
                                            Math.abs(e.amount - item.amount) < 0.1 &&
                                            String(e.type).toLowerCase() === String(item.type).toLowerCase()
                                        ) : null;

                                        const displayName = (manualEvent?.description || rubric?.name || item.code || 'RUBRICA').toUpperCase();

                                        return (
                                        <tr key={idx} className="border-b border-slate-50 last:border-0">
                                            <td className="py-3 px-4 font-bold text-slate-400">{(item.code || '???').substring(0, 3)}</td>
                                            <td className="py-3 px-4 font-black text-slate-900 uppercase text-[11px] leading-tight">{displayName}</td>
                                            <td className="py-3 px-4 text-center font-bold text-slate-600 italic text-[10px]">
                                                {item.reference ? 
                                                    (typeof item.reference === 'number' ? 
                                                        `${(item.reference > 1 ? item.reference : item.reference * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%` : 
                                                        item.reference) 
                                                : ''}
                                            </td>
                                            <td className="py-3 px-4 text-right font-black">
                                                {item.type === 'provento' ? (
                                                    <span className="text-slate-900">R$ {(item.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                ) : (item.type === 'informativa' || item.type === 'encargo') ? (
                                                    <span className="text-slate-400 font-bold italic text-[10px]">R$ {(item.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                ) : ''}
                                            </td>
                                            <td className="py-3 px-4 text-right font-black">
                                                {item.type === 'desconto' ? (
                                                    <span className="text-rose-500">R$ {(item.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                ) : ''}
                                            </td>
                                        </tr>
                                        );
                                    })}
                                    {/* Fill space */}
                                    {Array.from({ length: Math.max(0, 10 - items.length) }).map((_, i) => (
                                        <tr key={`empty-${i}`} className="border-b border-slate-50 last:border-0 h-10">
                                            <td colSpan={5}></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Totals Footer */}
                        <div className="bg-slate-50 border-t border-slate-200">
                            <div className="grid grid-cols-1 md:grid-cols-3">
                                <div className="p-6 border-r border-slate-200">
                                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total de Vencimentos</p>
                                    <p className="text-lg font-black text-slate-900">R$ {result.gross.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                                <div className="p-6 border-r border-slate-200">
                                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total de Descontos</p>
                                    <p className="text-lg font-black text-rose-500">R$ {result.discounts.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                                <div className="p-6 bg-slate-900">
                                    <p className="text-[10px] font-black text-slate-400/60 uppercase mb-1">Valor Líquido a Receber</p>
                                    <p className="text-2xl font-black text-white">R$ {result.net.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                            </div>
                        </div>

                        {/* Bases and Info */}
                        <div className="p-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 bg-white border-t border-slate-200 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                            <div>
                                <p className="mb-1 text-slate-500">Salário Base</p>
                                <p className="text-slate-900 font-black">R$ {result.employee?.base_salary?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                            <div>
                                <p className="mb-1 text-slate-500">Base INSS</p>
                                <p className="text-slate-900 font-black">R$ {(result.base_inss ?? items.find(i => i.code === 'INSS')?.base_amount ?? result.gross).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                            <div>
                                <p className="mb-1 text-slate-500">Base FGTS</p>
                                <p className="text-slate-900 font-black">R$ {(result.base_fgts ?? items.find(i => i.code === 'FGTS')?.base_amount ?? result.gross).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                            <div>
                                <p className="mb-1 text-slate-500">FGTS do Mês</p>
                                <p className="text-slate-900 font-black">R$ {(items.find(i => i.code === 'FGTS')?.amount ?? (result.base_fgts ?? result.gross) * 0.08).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                            <div>
                                <p className="mb-1 text-slate-500">Base IRRF</p>
                                <p className="text-slate-900 font-black">R$ {(result.base_irrf ?? items.find(i => i.code === 'IRRF')?.base_amount ?? result.gross).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                            <div>
                                <p className="mb-1 text-slate-500">Dep. IRRF</p>
                                <p className="text-slate-900 font-black">0</p>
                            </div>
                        </div>
                    </div>

                    {/* Receipt Signature Area - Only for Print */}
                    <div className="hidden print:block mt-20">
                        <div className="flex justify-between items-end gap-20">
                            <div className="flex-1 border-t border-slate-900 pt-4 text-center">
                                <p className="text-[10px] font-black uppercase text-slate-900">Assinatura do Colaborador</p>
                                <p className="text-[8px] text-slate-500 mt-1">Declaro ter recebido a importância líquida discriminada neste recibo</p>
                            </div>
                            <div className="flex-1 border-t border-slate-900 pt-4 text-center">
                                <p className="text-[10px] font-black uppercase text-slate-900">Data e Local</p>
                                <p className="text-xs font-bold text-slate-900 mt-2">____/____/________ __________________</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PaystubModal;
