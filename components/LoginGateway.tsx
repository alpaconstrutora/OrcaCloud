import React from 'react';
import {
    User,
    Building2,
    TrendingUp,
    Code,
    ChevronRight,
    ShieldCheck,
    Cloud,
    Truck,
    Briefcase
} from 'lucide-react';
import { ProfileGroup } from '../types';

interface LoginGatewayProps {
    onSelectGroup: (group: ProfileGroup) => void;
}

const LoginGateway: React.FC<LoginGatewayProps> = ({ onSelectGroup }) => {
    const portals = [
        {
            id: ProfileGroup.USER,
            title: 'Portal do Colaborador',
            desc: 'Acesso para administradores, engenheiros e equipe interna.',
            icon: User,
            color: 'blue',
            theme: 'bg-blue-600'
        },
        {
            id: ProfileGroup.CLIENT,
            title: 'Portal do Cliente',
            desc: 'Acompanhe sua obra, pagamentos e documentos do contrato.',
            icon: Building2,
            color: 'emerald',
            theme: 'bg-emerald-600'
        },
        {
            id: ProfileGroup.INVESTOR,
            title: 'Portal do Investidor',
            desc: 'Gestão de patrimônio, cotas e novos empreendimentos.',
            icon: TrendingUp,
            color: 'purple',
            theme: 'bg-purple-600'
        },
        {
            id: ProfileGroup.DEVELOPER,
            title: 'Área do Desenvolvedor',
            desc: 'Acesso técnico completo ao ecossistema do sistema.',
            icon: Code,
            color: 'slate',
            theme: 'bg-slate-800'
        },
        {
            id: ProfileGroup.SUPPLIER,
            title: 'Portal do Fornecedor',
            desc: 'Gerencie suas negociações, lances e pedidos de compra.',
            icon: Truck,
            color: 'amber',
            theme: 'bg-amber-600'
        },
        {
            id: ProfileGroup.BROKER,
            title: 'Portal do Corretor',
            desc: 'Estoque, propostas e comissões do empreendimento.',
            icon: Briefcase,
            color: 'indigo',
            theme: 'bg-indigo-600'
        }
    ];

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
                <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-200 rounded-full blur-3xl"></div>
                <div className="absolute top-1/2 -right-24 w-96 h-96 bg-purple-200 rounded-full blur-3xl"></div>
            </div>

            <div className="w-full max-w-5xl relative z-10">
                <div className="text-center mb-12">
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-xl shadow-blue-900/10">
                            <Cloud className="w-8 h-8" />
                        </div>
                        <h1 className="text-4xl font-black text-slate-900 tracking-tight">OrçaCloud <span className="text-blue-600">SaaS</span></h1>
                    </div>
                    <p className="text-slate-500 font-medium">Selecione o portal de acesso para continuar</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {portals.map((portal) => (
                        <button
                            key={portal.id}
                            onClick={() => onSelectGroup(portal.id)}
                            className="group relative bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-blue-900/5 hover:-translate-y-2 transition-all duration-300 text-left overflow-hidden"
                        >
                            <div className={`p-4 rounded-2xl ${portal.theme} text-white mb-6 w-fit shadow-lg shadow-${portal.color}-900/10 group-hover:scale-110 transition-transform`}>
                                <portal.icon className="w-6 h-6" />
                            </div>

                            <h3 className="text-xl font-bold text-slate-900 mb-2">{portal.title}</h3>
                            <p className="text-sm text-slate-500 leading-relaxed mb-6">{portal.desc}</p>

                            <div className="flex items-center gap-2 text-xs font-black text-blue-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 translate-x-[-10px] group-hover:translate-x-0 transition-all">
                                Acessar Portal
                                <ChevronRight className="w-4 h-4" />
                            </div>
                        </button>
                    ))}
                </div>

                <div className="mt-16 text-center flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Acesso Seguro e Protegido
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginGateway;
