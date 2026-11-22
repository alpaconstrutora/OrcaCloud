
import React from 'react';
import {
    X,
    Building2,
    MapPin,
    Calendar,
    TrendingUp,
    DollarSign,
    PieChart,
    FileText,
    CheckCircle2,
    Camera
} from 'lucide-react';
import { formatCurrency, formatPercent } from '../utils/financialMath';
import { Wallet, ShieldCheck, ExternalLink } from 'lucide-react';
import ProjectGallery from './ProjectGallery';
import ObraTimeline from './investor/ObraTimeline';

interface AssetDetailModalProps {
    project: any;
    onClose: () => void;
    projectId?: string;
    organizationId?: string;
    isAdmin?: boolean;
    diaryImages?: string[];
}

const AssetDetailModal: React.FC<AssetDetailModalProps> = ({ project, onClose, projectId, organizationId, isAdmin, diaryImages }) => {
    if (!project) return null;

    // --- Derived Data from Project ---
    const purchaseDate = project.purchaseDate || null;
    const purchasePrice = project.invested ?? 0;
    // null = sem participação registrada ou sem valor do empreendimento (utils/investidorCarteira):
    // "—", nunca R$ 0 com "valorização" negativa.
    const currentValue: number | null = project.currentValue ?? project.equity ?? null;
    const totalAppreciation = currentValue != null ? currentValue - purchasePrice : null;
    const appreciationPercent = totalAppreciation != null && purchasePrice > 0 ? (totalAppreciation / purchasePrice) * 100 : 0;
    const status = project.status || 'Em Execução';
    const progress = project.progress || 0; // já em escala 0-100
    const yoc = project.yoc ? (project.yoc * 100).toFixed(1) + '%' : '—';

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-12 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full h-full flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden border border-gray-200">
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Header Image/Gradient */}
                    <div className="h-48 bg-gradient-to-r from-blue-900 to-indigo-900 relative overflow-hidden">
                        {project.coverUrl && (
                            <div className="absolute inset-0 bg-cover bg-center opacity-20 mix-blend-overlay" style={{ backgroundImage: `url(${project.coverUrl})` }} />
                        )}
                        <button
                            onClick={onClose}
                            className="absolute top-6 right-6 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors backdrop-blur-md"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="absolute bottom-6 left-8 text-white">
                            <div className="flex items-center gap-2 mb-2 opacity-80">
                                <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold backdrop-blur-md border border-white/10">
                                    {status}
                                </span>
                                <span className="flex items-center gap-1 text-xs font-medium">
                                    <MapPin className="w-3 h-3" />
                                    {project.location || 'Localização não informada'}
                                </span>
                            </div>
                            <h2 className="text-4xl font-black tracking-tight">{project.name}</h2>
                        </div>
                    </div>

                    <div className="p-8 space-y-8">
                        {/* Financial Overview Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                                <p className="text-xs font-bold text-gray-400 mb-1">Investimento Inicial</p>
                                <p className="text-xl font-black text-gray-900">{formatCurrency(purchasePrice)}</p>
                                {purchaseDate && (
                                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                        <Calendar className="w-3 h-3" /> {purchaseDate}
                                    </p>
                                )}
                            </div>
                            <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
                                <p className="text-xs font-bold text-blue-400 mb-1">Valor Atual</p>
                                <p className="text-xl font-black text-blue-700">{currentValue != null ? formatCurrency(currentValue) : '—'}</p>
                                <p className="text-xs text-blue-400 mt-1">{currentValue != null ? (project.origemDoPatrimonio ?? 'Patrimônio estimado') : (project.semPatrimonio ?? 'Não calculado')}</p>
                            </div>
                            <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100">
                                <p className="text-xs font-bold text-emerald-500 mb-1">Valorização Total</p>
                                <div className="flex items-baseline gap-2">
                                    <p className="text-xl font-black text-emerald-700">{totalAppreciation != null ? formatCurrency(totalAppreciation) : '—'}</p>
                                    {totalAppreciation != null && <span className="text-sm font-bold text-emerald-600">({appreciationPercent.toFixed(1)}%)</span>}
                                </div>
                                <p className="text-xs text-emerald-500 mt-1 flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3" /> Desde o início
                                </p>
                            </div>
                            <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100">
                                <p className="text-xs font-bold text-indigo-400 mb-1">Yield on Cost (Proj.)</p>
                                <p className="text-xl font-black text-indigo-700">{yoc}</p>
                                <p className="text-xs text-indigo-400 mt-1">Retorno anual est.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Timeline & Progress */}
                            <div className="lg:col-span-2 space-y-6">
                                <div className="bg-white border border-gray-100 rounded-2xl p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-sm font-bold text-gray-500">Progresso Físico</span>
                                        <span className="text-sm font-black text-blue-600">{progress.toFixed(0)}%</span>
                                    </div>
                                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-1000 ease-out rounded-full"
                                            style={{ width: `${progress}%` }}
                                        ></div>
                                    </div>
                                </div>

                                <ObraTimeline
                                    projectId={projectId}
                                    organizationId={organizationId}
                                    isAdmin={isAdmin}
                                />
                            </div>

                            {/* Visual Evolution (New Gallery Section) */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Camera className="w-5 h-5 text-gray-400" />
                                    Evolução Visual (Mural & Live)
                                </h3>
                                <ProjectGallery images={diaryImages || []} allowFallback={false} />
                            </div>
                        </div>

                        {/* Documents & Info */}
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-gray-400" />
                                Documentos e Info
                            </h3>

                            <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                                {(project.documents || []).length === 0 ? (
                                    <p className="text-sm text-gray-400 text-center py-4">Nenhum documento disponível.</p>
                                ) : (project.documents as { name: string; url?: string; size?: string }[]).map((doc, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100 hover:border-blue-200 transition-colors cursor-pointer group"
                                        onClick={() => doc.url && window.open(doc.url, '_blank')}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-50 text-blue-500 rounded-lg group-hover:bg-blue-100 transition-colors">
                                                <FileText className="w-4 h-4" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-gray-900">{doc.name}</span>
                                                {doc.size && <span className="text-xs text-gray-400">{doc.size}</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* VIP Financial & Compliance Section */}
                            <div className="bg-white border text-gray-900 border-gray-100 rounded-[2rem] p-6 space-y-4 shadow-sm">
                                <h4 className="text-xs font-black text-gray-400 flex items-center gap-2">
                                    <Wallet className="w-4 h-4" /> Gestão VIP
                                </h4>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
                                        <div>
                                            <p className="text-xs font-bold text-indigo-400 uppercase">Status de Pagamento</p>
                                            <p className="text-sm font-bold text-indigo-900 italic font-serif">
                                                {project.paymentStatus || '—'}
                                            </p>
                                        </div>
                                    </div>

                                    {project.pendingSignature && (
                                        <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100 animate-pulse group/sign transition-all hover:bg-amber-100">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-amber-100 text-amber-600 rounded-lg group-hover/sign:scale-110 transition-transform">
                                                    <ShieldCheck className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-amber-900">Assinatura Pendente</p>
                                                    <p className="text-xs text-amber-700">{project.pendingSignature}</p>
                                                </div>
                                            </div>
                                            {project.signatureUrl && (
                                                <button
                                                    onClick={() => window.open(project.signatureUrl, '_blank')}
                                                    className="p-2 bg-amber-600 text-white rounded-lg shadow-sm hover:bg-amber-700"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100">
                            <h4 className="text-sm font-bold text-indigo-900 mb-2">Contato do Gestor</h4>
                            <p className="text-xs text-indigo-700 mb-4">
                                Precisa de informações específicas sobre esta obra?
                            </p>
                            <button className="w-full py-2 bg-indigo-600 text-white rounded-xl text-button font-bold hover:bg-indigo-700 transition-colors">
                                Entrar em Contato
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AssetDetailModal;
