
import React from 'react';
import { Sparkles, ArrowRight, BrainCircuit } from 'lucide-react';

interface AIInsightCardProps {
    title: string;
    content: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    onAction?: () => void;
    loading?: boolean;
}

const AIInsightCard: React.FC<AIInsightCardProps> = ({
    title,
    content,
    type = 'info',
    onAction,
    loading = false
}) => {
    const typeStyles = {
        info: 'bg-blue-50 border-blue-100 text-blue-700',
        success: 'bg-emerald-50 border-emerald-100 text-emerald-700',
        warning: 'bg-amber-50 border-amber-100 text-amber-700',
        error: 'bg-red-50 border-red-100 text-red-700',
    };

    const iconStyles = {
        info: 'text-blue-500',
        success: 'text-emerald-500',
        warning: 'text-amber-500',
        error: 'text-red-500',
    };

    if (loading) {
        return (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-xl"></div>
                    <div className="h-4 bg-gray-100 rounded-full w-1/3"></div>
                </div>
                <div className="space-y-2">
                    <div className="h-3 bg-gray-100 rounded-full w-full"></div>
                    <div className="h-3 bg-gray-100 rounded-full w-5/6"></div>
                </div>
            </div>
        );
    }

    return (
        <div className={`relative overflow-hidden border rounded-3xl p-6 transition-all hover:shadow-lg group ${typeStyles[type]}`}>
            {/* Background Brain Icon for decoration */}
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                <BrainCircuit size={120} />
            </div>

            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 rounded-xl bg-white shadow-sm ${iconStyles[type]}`}>
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <h4 className="font-black text-sm uppercase tracking-wider">{title}</h4>
                </div>

                <p className="text-sm font-medium leading-relaxed mb-6 opacity-80">
                    {content}
                </p>

                {onAction && (
                    <button
                        onClick={onAction}
                        className="flex items-center gap-2 text-xs font-black uppercase tracking-widest group/btn"
                    >
                        Saber mais
                        <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                    </button>
                )}
            </div>
        </div>
    );
};

export default AIInsightCard;
