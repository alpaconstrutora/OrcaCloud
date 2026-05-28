import React from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, Shield } from 'lucide-react';

interface Props {
    validade?: string;  // ISO date string YYYY-MM-DD
    className?: string;
}

const CertificateExpiryWarning: React.FC<Props> = ({ validade, className = '' }) => {
    if (!validade) return null;

    const hoje = new Date();
    const vencimento = new Date(validade + 'T00:00:00');
    const diffMs = vencimento.getTime() - hoje.getTime();
    const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    const dataFormatada = vencimento.toLocaleDateString('pt-BR');

    if (diffDias < 0) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-black ${className}`}>
                <ShieldX className="w-4 h-4 flex-shrink-0" />
                Certificado vencido em {dataFormatada} (há {Math.abs(diffDias)} dias)
            </div>
        );
    }

    if (diffDias <= 30) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-black ${className}`}>
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                Certificado vence em {diffDias} dia{diffDias !== 1 ? 's' : ''} ({dataFormatada}) — renove urgente
            </div>
        );
    }

    if (diffDias <= 60) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs font-black ${className}`}>
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                Certificado vence em {diffDias} dias ({dataFormatada})
            </div>
        );
    }

    return (
        <div className={`flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-green-700 text-xs font-black ${className}`}>
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            Certificado válido até {dataFormatada} ({diffDias} dias)
        </div>
    );
};

export default CertificateExpiryWarning;

// Versão badge inline (para usar em cards da lista)
export const CertificateBadge: React.FC<{ validade?: string }> = ({ validade }) => {
    if (!validade) return (
        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
            <Shield className="w-3 h-3" /> Sem cert.
        </span>
    );

    const diffDias = Math.ceil((new Date(validade + 'T00:00:00').getTime() - Date.now()) / 86400000);

    if (diffDias < 0) return (
        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-600">
            <ShieldX className="w-3 h-3" /> Cert. vencido
        </span>
    );

    if (diffDias <= 30) return (
        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-600">
            <ShieldAlert className="w-3 h-3" /> Vence em {diffDias}d
        </span>
    );

    if (diffDias <= 60) return (
        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            <ShieldAlert className="w-3 h-3" /> Vence em {diffDias}d
        </span>
    );

    return (
        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            <ShieldCheck className="w-3 h-3" /> Cert. OK
        </span>
    );
};
