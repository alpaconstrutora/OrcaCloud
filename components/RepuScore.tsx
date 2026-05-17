
import React from 'react';
import { Star, ShieldCheck, Trophy, Target } from 'lucide-react';

interface RepuScoreProps {
    score: number;
    ontimeRate: number;
    priceStability: number;
}

const RepuScore: React.FC<RepuScoreProps> = ({ score, ontimeRate, priceStability }) => {
    return (
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-8">
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Seu Repu-Score</span>
                    <div className="flex items-end gap-2">
                        <h3 className="text-4xl font-black text-gray-900 leading-none">{score.toFixed(1)}</h3>
                        <span className="text-sm font-bold text-gray-400 pb-1">/10</span>
                    </div>
                </div>
                <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-100">
                    <Trophy className="w-6 h-6" />
                </div>
            </div>

            <div className="space-y-6">
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-gray-400">Pontualidade na Entrega</span>
                        <span className="text-gray-900">{ontimeRate}%</span>
                    </div>
                    <div className="h-2 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${ontimeRate}%` }} />
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-gray-400">Estabilidade de Preços</span>
                        <span className="text-gray-900">{priceStability}%</span>
                    </div>
                    <div className="h-2 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${priceStability}%` }} />
                    </div>
                </div>
            </div>

            <div className="pt-6 border-t border-gray-50 flex items-center gap-3">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                    <ShieldCheck className="w-4 h-4" />
                </div>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-tight leading-tight">
                    Selo Prata: Você está no top **15%** dos fornecedores da região.
                </p>
            </div>
        </div>
    );
};

export default RepuScore;
