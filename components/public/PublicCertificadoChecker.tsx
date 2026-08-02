import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldOff, XCircle } from 'lucide-react';
import { academyService } from '../../services/academyService';
import type { AcademyCertificateValidation } from '../../types/academy';

/**
 * Validação pública do certificado da Academia — o destino do QR.
 *
 * Roda SEM sessão (aba anônima, fiscal, auditor). A RPC
 * `academy_validate_certificate` é grantada a `anon` de propósito: o recorte
 * vem do `codigo_validacao`, um UUID aleatório e não enumerável.
 *
 * O retorno nunca traz CPF, employee_id nem nota.
 */

const fmtData = (iso?: string) => {
    if (!iso) return '—';
    const [a, m, d] = iso.split('T')[0].split('-');
    return `${d}/${m}/${a}`;
};

const Linha: React.FC<{ label: string; valor?: string | number }> = ({ label, valor }) => (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0">
        <span className="text-sm font-normal text-gray-500 shrink-0">{label}</span>
        <span className="text-sm font-normal text-gray-900 text-right">{valor ?? '—'}</span>
    </div>
);

export function PublicCertificadoChecker() {
    const [dados, setDados] = useState<AcademyCertificateValidation | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        const match = window.location.pathname.match(/\/publico\/validar-certificado\/([0-9a-f-]{36})/i);
        const codigo = match?.[1];
        if (!codigo) { setErro('Código de validação ausente na URL.'); setCarregando(false); return; }

        academyService.validateCertificate(codigo)
            .then(setDados)
            .catch(() => setErro('Não foi possível consultar o certificado.'))
            .finally(() => setCarregando(false));
    }, []);

    const conteudo = () => {
        if (carregando) {
            return (
                <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                    <p className="mt-2 text-gray-500">Consultando certificado...</p>
                </div>
            );
        }

        if (erro || !dados?.valid) {
            return (
                <div className="text-center py-12">
                    <XCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Certificado não encontrado</h3>
                    <p className="text-sm text-gray-500">
                        {erro || 'O código informado não corresponde a nenhum certificado emitido.'}
                    </p>
                </div>
            );
        }

        const estado = dados.status ?? 'VALIDO';
        const visual = estado === 'VALIDO'
            ? { Icone: CheckCircle2, cor: 'text-emerald-500', titulo: 'Certificado válido' }
            : estado === 'VENCIDO'
                ? { Icone: AlertTriangle, cor: 'text-amber-500', titulo: 'Certificado vencido' }
                : { Icone: ShieldOff, cor: 'text-rose-500', titulo: 'Certificado revogado' };

        return (
            <>
                <div className="text-center py-8 border-b border-gray-100">
                    <visual.Icone className={`w-12 h-12 ${visual.cor} mx-auto mb-4`} />
                    <h2 className="text-lg font-bold text-gray-900">{visual.titulo}</h2>
                    <p className="text-sm text-gray-500 mt-1">{dados.numero}</p>
                </div>

                <div className="p-6">
                    <Linha label="Colaborador"   valor={dados.colaborador} />
                    <Linha label="Treinamento"   valor={dados.treinamento} />
                    {dados.nr_referencia && <Linha label="Norma" valor={dados.nr_referencia} />}
                    <Linha label="Carga horária" valor={dados.carga_horaria != null ? `${dados.carga_horaria} h` : undefined} />
                    <Linha label="Conclusão"     valor={fmtData(dados.data_conclusao)} />
                    <Linha label="Validade"      valor={dados.data_validade ? fmtData(dados.data_validade) : 'Sem prazo'} />
                    <Linha label="Versão do conteúdo" valor={dados.versao != null ? `v${dados.versao}` : undefined} />
                    <Linha label="Emitido por"   valor={dados.organizacao} />
                    <Linha label="Emitido em"    valor={fmtData(dados.emitido_em)} />
                </div>
            </>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 py-12">
            <div className="w-full max-w-lg">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">Academia ÒPURA</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Validação de certificado</p>
                </div>

                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    {conteudo()}
                </div>

                <p className="text-xs text-gray-400 text-center mt-6">
                    Esta página confirma a emissão do certificado no sistema. Requisitos legais
                    específicos de cada norma devem ser verificados junto ao emissor.
                </p>
            </div>
        </div>
    );
}

export default PublicCertificadoChecker;
