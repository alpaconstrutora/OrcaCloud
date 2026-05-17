
import React from 'react';
import { Check, Info, Palette, Shovel, Trees } from 'lucide-react';

interface FinishOption {
    id: string;
    name: string;
    description: string;
    image: string;
    priceDelta?: number;
    category: string;
}

const FINISH_OPTIONS: FinishOption[] = [
    {
        id: 'floor-1',
        name: 'Porcelanato Calacata Gold',
        description: 'Elegância clássica com veios dourados e brilho intenso.',
        image: 'https://images.unsplash.com/photo-1600566752355-3979ff69a3ec?auto=format&fit=crop&q=80&w=400',
        category: 'Pisos'
    },
    {
        id: 'floor-2',
        name: 'Piso Vinílico Carvalho Natural',
        description: 'Conforto térmico e acústico com visual amadeirado aconchegante.',
        image: 'https://images.unsplash.com/photo-1581850518616-bcb81881443e?auto=format&fit=crop&q=80&w=400',
        category: 'Pisos'
    },
    {
        id: 'paint-1',
        name: 'Cinza Crômio Premium',
        description: 'Minimalismo moderno que combina com qualquer decoração.',
        image: 'https://images.unsplash.com/photo-1544111242-998f0927e163?auto=format&fit=crop&q=80&w=400',
        category: 'Pintura'
    }
];

const FinishSelection: React.FC = () => {
    const [selections, setSelections] = React.useState<Record<string, string>>({});

    const handleSelect = (category: string, id: string) => {
        setSelections(prev => ({ ...prev, [category]: id }));
    };

    const categories = Array.from(new Set(FINISH_OPTIONS.map(o => o.category)));

    return (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-[2.5rem] p-10 text-white relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20" />
                <div className="relative z-10 max-w-2xl">
                    <div className="flex items-center gap-3 mb-6">
                        <Palette className="w-8 h-8" />
                        <h2 className="text-3xl font-black uppercase tracking-tight">Studio de Personalização</h2>
                    </div>
                    <p className="text-indigo-100 text-lg font-medium leading-relaxed">
                        Deixe seu lar com a sua cara. Escolha os acabamentos que mais combinam com seu estilo de vida. Nossos especialistas farão a mágica acontecer.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-16">
                {categories.map(cat => (
                    <section key={cat} className="space-y-8">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                                <h3 className="text-xl font-black text-gray-900 tracking-tight uppercase">{cat}</h3>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-4 py-2 rounded-full">
                                <Info className="w-4 h-4" />
                                Escolha uma opção
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {FINISH_OPTIONS.filter(o => o.category === cat).map(option => (
                                <div
                                    key={option.id}
                                    onClick={() => handleSelect(cat, option.id)}
                                    className={`group relative bg-white rounded-[2rem] border-2 transition-all duration-500 cursor-pointer overflow-hidden
                    ${selections[cat] === option.id
                                            ? 'border-indigo-600 shadow-2xl shadow-indigo-100'
                                            : 'border-transparent shadow-sm hover:shadow-xl hover:border-gray-200'}
                  `}
                                >
                                    <div className="aspect-square relative overflow-hidden">
                                        <img src={option.image} alt={option.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                        {selections[cat] === option.id && (
                                            <div className="absolute inset-0 bg-indigo-600/20 backdrop-blur-[2px] flex items-center justify-center animate-in fade-in duration-300">
                                                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-indigo-600 shadow-xl">
                                                    <Check className="w-8 h-8 stroke-[3]" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-8">
                                        <h4 className="text-lg font-black text-gray-900 mb-2 uppercase tracking-tight">{option.name}</h4>
                                        <p className="text-sm text-gray-500 font-medium leading-relaxed">{option.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                ))}
            </div>

            <div className="bg-gray-50 p-10 rounded-[2.5rem] border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-indigo-600 shadow-sm border border-gray-100">
                        <Check className="w-8 h-8" />
                    </div>
                    <div>
                        <h4 className="text-xl font-black text-gray-900 uppercase tracking-tight">Finalizar Escolhas</h4>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Você selecionou {Object.keys(selections).length} de {categories.length} categorias.</p>
                    </div>
                </div>
                <button
                    disabled={Object.keys(selections).length === 0}
                    className={`px-10 py-5 rounded-[1.5rem] text-xs font-black uppercase tracking-[0.2em] transition-all
            ${Object.keys(selections).length > 0
                            ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 hover:scale-105 active:scale-95'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
          `}
                >
                    Confirmar Seleções
                </button>
            </div>
        </div>
    );
};

export default FinishSelection;
