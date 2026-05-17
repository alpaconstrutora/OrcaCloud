import React, { useState } from 'react';
import { BookOpen, Video, FileText, Award, CheckCircle2, Clock, Lock, ChevronRight, Play, Star } from 'lucide-react';
import type { BrokerTrainingModule } from '../../types';

interface BrokerTrainingProps {
    brokerEmail: string;
}

const TYPE_CONFIG: Record<BrokerTrainingModule['type'], { icon: any; color: string; bg: string; label: string }> = {
    VIDEO: { icon: Video, color: 'text-red-600', bg: 'bg-red-50', label: 'Vídeo' },
    DOCUMENTO: { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Documento' },
    QUIZ: { icon: Star, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Quiz' },
};

const generateDemoModules = (): BrokerTrainingModule[] => [
    { id: 't1', organization_id: 'demo', project_name: 'Residencial Parque Verde', title: 'Apresentação do Empreendimento', description: 'Conheça em detalhes o Residencial Parque Verde, suas diferenciais e argumentos de venda.', type: 'VIDEO', duration_minutes: 15, is_required: true, progress_pct: 100, is_completed: true, completed_at: '2026-02-15', certificate_url: '#', questions: [] },
    { id: 't2', organization_id: 'demo', project_name: 'Residencial Parque Verde', title: 'Tipologias e Plantas Baixas', description: 'Estudo detalhado de cada tipologia: metragem, configurações e pontos fortes.', type: 'DOCUMENTO', duration_minutes: 20, is_required: true, progress_pct: 100, is_completed: true, completed_at: '2026-02-18', questions: [] },
    {
        id: 't3', organization_id: 'demo', project_name: 'Residencial Parque Verde', title: 'Quiz: Argumentação de Vendas', description: 'Teste seus conhecimentos sobre o empreendimento e técnicas de vendas.', type: 'QUIZ', duration_minutes: 10, is_required: true, progress_pct: 60, is_completed: false, questions: [
            { question: 'Qual a metragem da tipologia 3Q Suite?', options: ['82m²', '95m²', '68m²', '58m²'], correct_index: 1 },
            { question: 'Quantas torres tem o empreendimento?', options: ['1', '2', '3', '4'], correct_index: 1 },
            { question: 'Qual o índice de reajuste?', options: ['IPCA', 'INCC', 'IGP-M', 'SELIC'], correct_index: 1 },
        ]
    },
    { id: 't4', organization_id: 'demo', project_name: 'Residencial Parque Verde', title: 'Técnicas de Negociação Imobiliária', description: 'Aprenda as melhores práticas para conduzir negociações e fechar vendas.', type: 'VIDEO', duration_minutes: 25, is_required: false, progress_pct: 0, is_completed: false, questions: [] },
    { id: 't5', organization_id: 'demo', project_name: 'Residencial Parque Verde', title: 'Legislação e Documentação', description: 'Entenda os aspectos legais e documentais de uma venda imobiliária.', type: 'DOCUMENTO', duration_minutes: 30, is_required: false, progress_pct: 0, is_completed: false, questions: [] },
];

const BrokerTraining: React.FC<BrokerTrainingProps> = ({ brokerEmail }) => {
    const [modules, setModules] = useState<BrokerTrainingModule[]>(generateDemoModules);
    const [activeQuiz, setActiveQuiz] = useState<string | null>(null);
    const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
    const [quizSubmitted, setQuizSubmitted] = useState(false);

    const completedCount = modules.filter(m => m.is_completed).length;
    const requiredCount = modules.filter(m => m.is_required).length;
    const requiredCompleted = modules.filter(m => m.is_required && m.is_completed).length;
    const isCertified = requiredCompleted === requiredCount;
    const overallProgress = modules.length > 0 ? Math.round(modules.reduce((a, m) => a + m.progress_pct, 0) / modules.length) : 0;

    const handleStartModule = (mod: BrokerTrainingModule) => {
        if (mod.type === 'QUIZ') {
            setActiveQuiz(mod.id);
            setQuizAnswers({});
            setQuizSubmitted(false);
        } else {
            setModules(prev => prev.map(m => m.id === mod.id ? { ...m, progress_pct: 100, is_completed: true, completed_at: new Date().toISOString() } : m));
        }
    };

    const handleSubmitQuiz = (modId: string) => {
        const mod = modules.find(m => m.id === modId);
        if (!mod?.questions) return;
        const correct = mod.questions.filter((q, i) => quizAnswers[i] === q.correct_index).length;
        const passed = correct / mod.questions.length >= 0.7;
        setQuizSubmitted(true);
        if (passed) {
            setModules(prev => prev.map(m => m.id === modId ? { ...m, progress_pct: 100, is_completed: true, completed_at: new Date().toISOString() } : m));
        }
    };

    return (
        <div className="space-y-6">
            {/* Progress Header */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-700 rounded-2xl p-6 text-white shadow-xl shadow-purple-500/20">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <p className="text-purple-200 text-xs font-bold uppercase tracking-widest">Progresso Geral</p>
                        <p className="text-4xl font-black mt-1">{overallProgress}%</p>
                    </div>
                    <div className={`p-4 rounded-2xl ${isCertified ? 'bg-emerald-500/20' : 'bg-white/10'}`}>
                        {isCertified ? <Award className="w-8 h-8 text-emerald-300" /> : <BookOpen className="w-8 h-8 text-purple-200" />}
                    </div>
                </div>
                <div className="bg-white/20 rounded-full h-3 mb-3">
                    <div className="bg-white rounded-full h-3 transition-all" style={{ width: `${overallProgress}%` }} />
                </div>
                <div className="flex items-center justify-between text-sm">
                    <span className="text-purple-200 font-medium">{completedCount} de {modules.length} módulos concluídos</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${isCertified ? 'bg-emerald-500/30 text-emerald-200' : 'bg-amber-500/30 text-amber-200'}`}>
                        {isCertified ? '✓ Certificado' : `${requiredCompleted}/${requiredCount} obrigatórios`}
                    </span>
                </div>
            </div>

            {/* Module List */}
            <div className="space-y-3">
                {modules.map(mod => {
                    const cfg = TYPE_CONFIG[mod.type];
                    const Icon = cfg.icon;
                    const isQuizActive = activeQuiz === mod.id;

                    return (
                        <div key={mod.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className={`flex items-center justify-between p-5 ${isQuizActive ? 'border-b border-gray-100' : ''}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-xl ${cfg.bg}`}>
                                        <Icon className={`w-5 h-5 ${cfg.color}`} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-bold text-gray-900">{mod.title}</h4>
                                            {mod.is_required && <span className="px-2 py-0.5 bg-red-50 text-red-500 text-[9px] font-black uppercase tracking-wider rounded-full">Obrigatório</span>}
                                        </div>
                                        <p className="text-xs text-gray-400 mt-0.5">{mod.description}</p>
                                        <div className="flex items-center gap-3 mt-1.5">
                                            <span className="text-[10px] text-gray-400 font-bold flex items-center gap-1"><Clock className="w-3 h-3" />{mod.duration_minutes} min</span>
                                            <span className={`text-[10px] font-bold flex items-center gap-1 ${cfg.color}`}><Icon className="w-3 h-3" />{cfg.label}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {mod.is_completed ? (
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                            <span className="text-xs font-bold text-emerald-600">Concluído</span>
                                        </div>
                                    ) : (
                                        <>
                                            {mod.progress_pct > 0 && mod.progress_pct < 100 && (
                                                <div className="w-20 bg-gray-100 rounded-full h-2">
                                                    <div className="bg-indigo-500 rounded-full h-2" style={{ width: `${mod.progress_pct}%` }} />
                                                </div>
                                            )}
                                            <button onClick={() => handleStartModule(mod)}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95">
                                                {mod.type === 'QUIZ' ? <Star className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                                {mod.progress_pct > 0 ? 'Continuar' : 'Iniciar'}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Inline Quiz */}
                            {isQuizActive && mod.questions && (
                                <div className="p-5 bg-gray-50 space-y-4 animate-in slide-in-from-top-2 duration-200">
                                    {mod.questions.map((q, qi) => (
                                        <div key={qi} className="bg-white rounded-xl p-4 border border-gray-100">
                                            <p className="text-sm font-bold text-gray-900 mb-3">{qi + 1}. {q.question}</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                {q.options.map((opt, oi) => {
                                                    const selected = quizAnswers[qi] === oi;
                                                    const isCorrect = quizSubmitted && oi === q.correct_index;
                                                    const isWrong = quizSubmitted && selected && oi !== q.correct_index;
                                                    return (
                                                        <button key={oi} onClick={() => !quizSubmitted && setQuizAnswers(p => ({ ...p, [qi]: oi }))}
                                                            disabled={quizSubmitted}
                                                            className={`p-3 rounded-lg text-xs font-bold text-left border-2 transition-all ${isCorrect ? 'border-emerald-400 bg-emerald-50 text-emerald-700' :
                                                                isWrong ? 'border-red-400 bg-red-50 text-red-700' :
                                                                    selected ? 'border-indigo-400 bg-indigo-50 text-indigo-700' :
                                                                        'border-gray-200 hover:border-gray-300 text-gray-700'}`}>
                                                            {opt}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                    <div className="flex justify-end gap-3">
                                        <button onClick={() => { setActiveQuiz(null); setQuizSubmitted(false); }}
                                            className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-200 transition-all">
                                            Fechar
                                        </button>
                                        {!quizSubmitted && (
                                            <button onClick={() => handleSubmitQuiz(mod.id)}
                                                disabled={Object.keys(quizAnswers).length < (mod.questions?.length || 0)}
                                                className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20">
                                                Enviar Respostas
                                            </button>
                                        )}
                                        {quizSubmitted && (
                                            <span className={`px-4 py-2 rounded-xl text-xs font-black ${modules.find(m => m.id === mod.id)?.is_completed ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                                {modules.find(m => m.id === mod.id)?.is_completed ? '✓ Aprovado!' : '✗ Tente novamente (mínimo 70%)'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default BrokerTraining;
