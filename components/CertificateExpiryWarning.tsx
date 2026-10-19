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
            <div className={`flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-[6px] text-red-700 text-sm font-medium ${className}`}>
                <ShieldX className="w-4 h-4 flex-shrink-0" />
                Certificado vencido em {dataFormatada} (há {Math.abs(diffDias)} dias)
            </div>
        );
    }

    if (diffDias <= 30) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-[6px] text-red-700 text-sm font-medium ${className}`}>
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                Certificado vence em {diffDias} dia{diffDias !== 1 ? 's' : ''} ({dataFormatada}) — renove urgente
            </div>
        );
    }

    if (diffDias <= 60) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-[6px] text-amber-700 text-sm font-medium ${className}`}>
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                Certificado vence em {diffDias} dias ({dataFormatada})
            </div>
        );
    }

    return (
        <div className={`flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-[6px] text-green-700 text-sm font-medium ${className}`}>
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            Certificado válido até {dataFormatada} ({diffDias} dias)
        </div>
    );
};

export default CertificateExpiryWarning;

// Versão badge inline (para usar em cards da lista) — §8: texto colorido, sem pílula
export const CertificateBadge: React.FC<{ validade?: string }> = ({ validade }) => {
    if (!validade) return (
        <span className="flex items-center gap-1 text-sm font-normal text-gray-500">
            <Shield className="w-3 h-3" /> Sem cert.
        </span>
    );

    const diffDias = Math.ceil((new Date(validade + 'T00:00:00').getTime() - Date.now()) / 86400000);

    if (diffDias < 0) return (
        <span className="flex items-center gap-1 text-sm font-normal text-red-600">
            <ShieldX className="w-3 h-3" /> Cert. vencido
        </span>
    );

    if (diffDias <= 30) return (
        <span className="flex items-center gap-1 text-sm font-normal text-red-600">
            <ShieldAlert className="w-3 h-3" /> Vence em {diffDias}d
        </span>
    );

    if (diffDias <= 60) return (
        <span className="flex items-center gap-1 text-sm font-normal text-amber-700">
            <ShieldAlert className="w-3 h-3" /> Vence em {diffDias}d
        </span>
    );

    return (
        <span className="flex items-center gap-1 text-sm font-normal text-green-700">
            <ShieldCheck className="w-3 h-3" /> Cert. OK
        </span>
    );
};
