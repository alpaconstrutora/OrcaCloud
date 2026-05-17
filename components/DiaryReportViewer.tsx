import React, { useMemo } from 'react';
import { ProjectSettings, Organization } from '../types';
import {
    Printer,
    FileText,
    Building2,
    Calendar,
    Sun,
    CloudSun,
    CloudRain,
    CheckCircle2,
    Users,
    ImageIcon,
    MessageSquare,
    AlertTriangle,
    ChevronLeft
} from 'lucide-react';

interface DiaryReportViewerProps {
    settings: ProjectSettings;
    organizations: Organization[];
    onBack?: () => void;
}

const DiaryReportViewer: React.FC<DiaryReportViewerProps> = ({ settings, organizations, onBack }) => {
    const entries = useMemo(() => {
        const list = settings.diaryEntries || [];
        return [...list].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [settings.diaryEntries]);

    const selectedOrganization = organizations.length > 0 ? organizations[0] : null;

    const weatherIcons: Record<string, React.ReactNode> = {
        'Ensolarado': <Sun className="w-4 h-4 text-amber-500" />,
        'Nublado': <CloudSun className="w-4 h-4 text-blue-400" />,
        'Chuva': <CloudRain className="w-4 h-4 text-indigo-400" />,
        'Claro': <Sun className="w-4 h-4 text-amber-500" />,
        'Chuva Leve': <CloudRain className="w-4 h-4 text-blue-300" />,
        'Chuva Forte': <CloudRain className="w-4 h-4 text-indigo-600" />,
        'Instável': <CloudSun className="w-4 h-4 text-purple-400" />
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="h-full flex flex-col space-y-4 bg-gray-50/50 p-4 md:p-6">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 print:hidden">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-500"
                        title="Voltar"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                            <FileText className="w-6 h-6 text-indigo-600" />
                            Relatório de Diário de Obras
                        </h1>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            {settings.name} • {entries.length} Registros
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
                    >
                        <Printer className="w-4 h-4" />
                        Imprimir / PDF
                    </button>
                </div>
            </div>

            {/* Preview Area */}
            <div className="flex-1 overflow-y-auto flex justify-center pb-20 print:p-0 print:overflow-visible print:bg-white">
                <div className="w-full max-w-[210mm] min-h-[297mm] bg-white shadow-2xl shadow-indigo-100/20 p-[15mm] flex flex-col print:shadow-none print:p-0">

                    {/* Header */}
                    <div className="border-b-2 border-gray-900 pb-6 mb-8 flex justify-between items-start">
                        <div className="flex items-center gap-6">
                            {selectedOrganization?.logoUrl && (
                                <img src={selectedOrganization.logoUrl} className="h-16 w-auto object-contain" alt="Logo" />
                            )}
                            <div>
                                <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
                                    {selectedOrganization?.name || 'OrçaCloud'}
                                </h2>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">
                                    Relatório Consolidado de Diário de Obras
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Emitido em</div>
                            <div className="text-sm font-black text-gray-900">{new Date().toLocaleDateString('pt-BR')}</div>
                        </div>
                    </div>

                    {/* Project Info Grid */}
                    <div className="grid grid-cols-2 gap-8 mb-10 text-xs">
                        <div className="space-y-3">
                            <h3 className="font-black text-gray-900 uppercase tracking-widest border-b border-gray-100 pb-1 flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-indigo-600" />
                                Dados do Projeto
                            </h3>
                            <div className="grid grid-cols-[100px_1fr] gap-y-2">
                                <span className="font-bold text-gray-400 uppercase">Obra:</span>
                                <span className="font-bold text-gray-800 uppercase">{settings.name}</span>

                                <span className="font-bold text-gray-400 uppercase">Cliente:</span>
                                <span className="font-bold text-gray-800 uppercase">{settings.client || '—'}</span>

                                <span className="font-bold text-gray-400 uppercase">Local:</span>
                                <span className="font-bold text-gray-800 uppercase">
                                    {[settings.city, settings.state].filter(Boolean).join(' - ') || '—'}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h3 className="font-black text-gray-900 uppercase tracking-widest border-b border-gray-100 pb-1 flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-indigo-600" />
                                Período do Relatório
                            </h3>
                            <div className="grid grid-cols-[100px_1fr] gap-y-2">
                                <span className="font-bold text-gray-400 uppercase">Início:</span>
                                <span className="font-bold text-gray-800">
                                    {entries.length > 0 ? new Date(entries[0].date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                                </span>

                                <span className="font-bold text-gray-400 uppercase">Término:</span>
                                <span className="font-bold text-gray-800">
                                    {entries.length > 0 ? new Date(entries[entries.length - 1].date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                                </span>

                                <span className="font-bold text-gray-400 uppercase">Registros:</span>
                                <span className="font-bold text-gray-800 uppercase">{entries.length} dias reportados</span>
                            </div>
                        </div>
                    </div>

                    {/* Entries List */}
                    <div className="space-y-12">
                        {entries.map((entry, index) => (
                            <div key={entry.id} className="break-inside-avoid">
                                {/* Entry Header */}
                                <div className="flex items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-indigo-600 rounded-xl flex flex-col items-center justify-center text-white shadow-lg shadow-indigo-100">
                                            <span className="text-lg font-black leading-none">{new Date(entry.date + 'T12:00:00').getDate()}</span>
                                            <span className="text-[10px] font-bold uppercase">{new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(entry.date + 'T12:00:00')).replace('.', '')}</span>
                                        </div>
                                        <div>
                                            <div className="text-sm font-black text-gray-900 uppercase">Diário de Obras #{entries.length - index}</div>
                                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(new Date(entry.date + 'T12:00:00'))}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-100 shadow-sm">
                                            {weatherIcons[entry.weather || 'Ensolarado']}
                                            <span className="text-[10px] font-bold text-gray-700 uppercase tracking-widest">{entry.weather}</span>
                                            {entry.temperature && <span className="text-[10px] font-black text-indigo-600 border-l border-gray-100 pl-2">{entry.temperature}</span>}
                                        </div>
                                        <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${entry.status === 'Aprovado' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                entry.status === 'Recusado' ? 'bg-red-50 text-red-600 border-red-100' :
                                                    'bg-amber-50 text-amber-600 border-amber-100'
                                            }`}>
                                            {entry.status || 'Rascunho'}
                                        </div>
                                    </div>
                                </div>

                                {/* Entry Body */}
                                <div className="grid grid-cols-1 gap-8 px-2">
                                    {/* Description */}
                                    {entry.description && (
                                        <div className="space-y-2">
                                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                <MessageSquare className="w-3.5 h-3.5" />
                                                Relato do Dia
                                            </h4>
                                            <p className="text-xs text-gray-700 leading-relaxed italic border-l-2 border-indigo-100 pl-4 py-1">
                                                "{entry.description}"
                                            </p>
                                        </div>
                                    )}

                                    {/* Activities and Labor Grid */}
                                    <div className="grid grid-cols-2 gap-8">
                                        {/* Activities */}
                                        <div className="space-y-3">
                                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                Atividades Realizadas
                                            </h4>
                                            {entry.activities && entry.activities.length > 0 ? (
                                                <div className="space-y-2">
                                                    {entry.activities.map((act, i) => (
                                                        <div key={i} className="flex items-center justify-between text-[11px] p-2 bg-gray-50/50 rounded-lg border border-gray-100">
                                                            <span className="font-bold text-gray-700 truncate flex-1 mr-2">{act.description}</span>
                                                            <span className="font-black text-indigo-600">{act.evolution}%</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-[10px] text-gray-400 italic">Nenhuma atividade registrada.</p>
                                            )}
                                        </div>

                                        {/* Manpower */}
                                        <div className="space-y-3">
                                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                <Users className="w-3.5 h-3.5" />
                                                Efetivo / Mão de Obra
                                            </h4>
                                            {entry.labor && entry.labor.length > 0 ? (
                                                <div className="grid grid-cols-1 gap-1">
                                                    {entry.labor.map((lab, i) => (
                                                        <div key={i} className="flex items-center justify-between text-[11px] py-1 border-b border-gray-50 last:border-0 px-1">
                                                            <span className="font-medium text-gray-600 truncate mr-2">{lab.category}</span>
                                                            <div className="flex items-center gap-2">
                                                                {lab.hours && <span className="text-[9px] text-gray-400 font-bold uppercase whitespace-nowrap">{lab.hours}h</span>}
                                                                <span className="font-black text-gray-900 bg-gray-100 px-2 rounded-md min-w-[24px] text-center">{lab.quantity}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-[10px] text-gray-400 italic">Nenhum efetivo registrado.</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Impediments */}
                                    {entry.impediments && (
                                        <div className="p-4 bg-red-50/30 rounded-xl border border-red-100">
                                            <h4 className="text-[10px] font-black text-red-600 uppercase tracking-widest flex items-center gap-2 mb-2">
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                Impedimentos / Paralisações
                                            </h4>
                                            <p className="text-xs text-red-700 leading-relaxed">
                                                {entry.impediments}
                                            </p>
                                        </div>
                                    )}

                                    {/* Photos Grid */}
                                    {entry.images && entry.images.length > 0 && (
                                        <div className="space-y-3">
                                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                <ImageIcon className="w-3.5 h-3.5" />
                                                Registro Fotográfico ({entry.images.length})
                                            </h4>
                                            <div className="grid grid-cols-4 gap-2">
                                                {entry.images.map((img, i) => (
                                                    <div key={i} className="aspect-square rounded-xl border border-gray-100 overflow-hidden bg-gray-50">
                                                        <img src={img} className="w-full h-full object-cover" alt={`Diário ${entry.date} - ${i}`} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Signature Block if last entry on page (approximated) */}
                                {index === entries.length - 1 && (
                                    <div className="mt-20 grid grid-cols-2 gap-20 px-10">
                                        <div className="flex flex-col items-center">
                                            <div className="w-full border-t border-gray-300 pt-2 text-center">
                                                <div className="text-[10px] font-bold text-gray-900 uppercase">Assinatura do Responsável</div>
                                                <div className="text-[8px] text-gray-400 uppercase">Engenheiro / Encarregado</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <div className="w-full border-t border-gray-300 pt-2 text-center">
                                                <div className="text-[10px] font-bold text-gray-900 uppercase">Fiscalização / Cliente</div>
                                                <div className="text-[8px] text-gray-400 uppercase">Visto de Conferência</div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Page separator for print */}
                                {index < entries.length - 1 && (
                                    <div className="h-px bg-gray-100 my-12 print:hidden" />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="mt-auto pt-10 text-[8px] font-bold text-gray-300 uppercase tracking-[0.3em] flex justify-between items-center border-t border-gray-50 print:pb-4">
                        <span>Gerado via OrçaCloud • CRM & ERP para Engenharia</span>
                        <span>Emitido em {new Date().toLocaleDateString('pt-BR')}</span>
                    </div>
                </div>
            </div>

            {/* Print Styles */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    @page {
                        margin: 10mm;
                        size: A4;
                    }
                    body {
                        background: white;
                    }
                    .print\\:hidden {
                        display: none !important;
                    }
                }
            `}} />
        </div>
    );
};

export default DiaryReportViewer;
