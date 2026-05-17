
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
    Clock,
    Camera
} from 'lucide-react';
import { formatCurrency, formatPercent } from '../utils/financialMath';
import { aiService } from '../services/aiService';
import { Sparkles, BrainCircuit, Wallet, ShieldCheck, ExternalLink } from 'lucide-react';
import ProjectGallery from './ProjectGallery';

interface AssetDetailModalProps {
    project: any;
    onClose: () => void;
}

const AssetDetailModal: React.FC<AssetDetailModalProps> = ({ project, onClose }) => {
    if (!project) return null;

    // --- Derived Data from Project ---
    const purchaseDate = project.purchaseDate || '01/01/2024';
    const purchasePrice = project.invested || 100000;
    const currentValue = project.currentValue || project.equity || 120000;
    const totalAppreciation = currentValue - purchasePrice;
    const appreciationPercent = purchasePrice > 0 ? (totalAppreciation / purchasePrice) * 100 : 0;
    const status = project.status || 'Em Execução';
    const progress = (project.progress || 0) * 100;
    const yoc = project.yoc ? (project.yoc * 100).toFixed(1) + '%' : '12.5%';

    // Milestones (Mock for now, could be derived from Schedule)
    const milestones = [
        { name: 'Fundação', date: 'Jan 2024', status: 'completed' },
        { name: 'Estrutura', date: 'Jun 2024', status: 'completed' },
        { name: 'Alvenaria', date: 'Dez 2024', status: 'in_progress' },
        { name: 'Acabamento', date: 'Jun 2025', status: 'pending' },
    ];
    const [aiOpinion, setAiOpinion] = React.useState<string | null>(null);
    const [loadingAI, setLoadingAI] = React.useState(false);

    const handleAIAnalysis = async () => {
        setLoadingAI(true);
        try {
            const opinion = await aiService.analyzeAsset(project);
            setAiOpinion(opinion);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingAI(false);
        }
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-12 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full h-full flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden border border-gray-200">
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Header Image/Gradient */}
                    <div className="h-48 bg-gradient-to-r from-blue-900 to-indigo-900 relative overflow-hidden">
                        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
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
                                <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" /> {purchaseDate}
                                </p>
                            </div>
                            <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
                                <p className="text-xs font-bold text-blue-400 mb-1">Valor Atual</p>
                                <p className="text-xl font-black text-blue-700">{formatCurrency(currentValue)}</p>
                                <p className="text-[10px] text-blue-400 mt-1">Atualizado hoje</p>
                            </div>
                            <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100">
                                <p className="text-xs font-bold text-emerald-500 mb-1">Valorização Total</p>
                                <div className="flex items-baseline gap-2">
                                    <p className="text-xl font-black text-emerald-700">{formatCurrency(totalAppreciation)}</p>
                                    <span className="text-sm font-bold text-emerald-600">({appreciationPercent.toFixed(1)}%)</span>
                                </div>
                                <p className="text-[10px] text-emerald-500 mt-1 flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3" /> Desde o início
                                </p>
                            </div>
                            <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100">
                                <p className="text-xs font-bold text-indigo-400 mb-1">Yield on Cost (Proj.)</p>
                                <p className="text-xl font-black text-indigo-700">{yoc}</p>
                                <p className="text-[10px] text-indigo-400 mt-1">Retorno anual est.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Timeline & Progress */}
                            <div className="lg:col-span-2 space-y-6">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-gray-400" />
                                    Linha do Tempo e Evolução
                                </h3>

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

                                <div className="relative border-l-2 border-gray-100 ml-4 space-y-8 py-2">
                                    {milestones.map((milestone, idx) => (
                                        <div key={idx} className="relative pl-8">
                                            <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 ${milestone.status === 'completed' ? 'bg-emerald-500 border-emerald-500' :
                                                milestone.status === 'in_progress' ? 'bg-white border-blue-500 animate-pulse' :
                                                    'bg-white border-gray-300'
                                                }`}></div>
                                            <div>
                                                <h4 className={`text-sm font-bold ${milestone.status === 'completed' ? 'text-gray-900' :
                                                    milestone.status === 'in_progress' ? 'text-blue-600' :
                                                        'text-gray-400'
                                                    }`}>{milestone.name}</h4>
                                                <p className="text-xs text-gray-400">{milestone.date}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* AI Perspective Section */}
                            <div className="bg-gradient-to-br from-indigo-900 to-blue-900 rounded-[2rem] p-8 text-white relative overflow-hidden group/ai">
                                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover/ai:scale-110 transition-transform">
                                    <BrainCircuit size={100} />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                                            <Sparkles className="w-5 h-5 text-blue-200" />
                                        </div>
                                        <h4 className="font-black text-xs uppercase tracking-[0.2em] text-blue-200">Parecer da Inteligência Artificial</h4>
                                    </div>

                                    {loadingAI ? (
                                        <div className="space-y-3 animate-pulse">
                                            <div className="h-3 bg-white/10 rounded-full w-full"></div>
                                            <div className="h-3 bg-white/10 rounded-full w-5/6"></div>
                                            <div className="h-3 bg-white/10 rounded-full w-4/6"></div>
                                        </div>
                                    ) : aiOpinion ? (
                                        <div className="prose prose-invert prose-sm max-w-none">
                                            <p className="text-blue-50 leading-relaxed font-medium">
                                                {aiOpinion}
                                            </p>
                                        </div>
                                    ) : (
                                        <div>
                                            <p className="text-blue-100 text-sm mb-6 opacity-80">
                                                Deseja uma análise técnica preditiva sobre este empreendimento baseada em macroeconomia e dados de mercado?
                                            </p>
                                            <button
                                                onClick={handleAIAnalysis}
                                                className="px-6 py-3 bg-white text-blue-900 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-50 transition-colors"
                                            >
                                                Gerar Análise IA
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Visual Evolution (New Gallery Section) */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Camera className="w-5 h-5 text-gray-400" />
                                    Evolução Visual (Mural & Live)
                                </h3>
                                <ProjectGallery />
                            </div>
                        </div>

                        {/* Documents & Info */}
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-gray-400" />
                                Documentos e Info
                            </h3>

                            <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100 hover:border-blue-200 transition-colors cursor-pointer group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-red-50 text-red-500 rounded-lg group-hover:bg-red-100 transition-colors">
                                            <FileText className="w-4 h-4" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-900">Contrato de Compra</span>
                                            <span className="text-[10px] text-gray-400">PDF • 2.4 MB</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100 hover:border-blue-200 transition-colors cursor-pointer group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-50 text-blue-500 rounded-lg group-hover:bg-blue-100 transition-colors">
                                            <FileText className="w-4 h-4" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-900">Matrícula do Imóvel</span>
                                            <span className="text-[10px] text-gray-400">PDF • 1.1 MB</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* VIP Financial & Compliance Section */}
                            <div className="bg-white border text-gray-900 border-gray-100 rounded-[2rem] p-6 space-y-4 shadow-sm">
                                <h4 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-2">
                                    <Wallet className="w-4 h-4" /> Gestão VIP
                                </h4>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
                                        <div>
                                            <p className="text-[10px] font-bold text-indigo-400 uppercase">Status de Pagamento</p>
                                            <p className="text-sm font-bold text-indigo-900 italic font-serif">Em dia</p>
                                        </div>
                                        <button className="text-[10px] font-black text-indigo-600 uppercase hover:underline">Ver Boletos</button>
                                    </div>

                                    <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100 animate-pulse group/sign transition-all hover:bg-amber-100">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg group-hover/sign:scale-110 transition-transform">
                                                <ShieldCheck className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-amber-900">Assinatura Pendente</p>
                                                <p className="text-[10px] text-amber-700">Ata de Reunião Trimestral</p>
                                            </div>
                                        </div>
                                        <button className="p-2 bg-amber-600 text-white rounded-lg shadow-sm hover:bg-amber-700">
                                            <ExternalLink className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100">
                            <h4 className="text-sm font-bold text-indigo-900 mb-2">Contato do Gestor</h4>
                            <p className="text-xs text-indigo-700 mb-4">
                                Precisa de informações específicas sobre esta obra?
                            </p>
                            <button className="w-full py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors">
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
