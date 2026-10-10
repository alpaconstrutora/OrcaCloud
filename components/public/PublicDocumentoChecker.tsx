import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldOff, XCircle, FileCheck2, FileX2 } from 'lucide-react';
import { sha256DeArquivo, validarDocumentoPublico, type ValidacaoPublica } from '../../services/docGen/envio';

/**
 * Validação pública de documento emitido (ofício) — o destino do QR Code
 * impresso no PDF. Plano: docs/planos/2026-10-07-gerador-de-oficios.md (F5).
 *
 * Roda SEM sessão (quem recebeu o ofício, fiscal, prefeitura). A RPC
 * `doc_gen_validar` é grantada a `anon` de propósito, no molde da validação de
 * certificado da Academia: o recorte vem do id do documento (UUID aleatório).
 * Devolve só o que autentica — nunca o arquivo nem o caminho dele.
 *
 * "Conferir um PDF": o visitante escolhe o arquivo que recebeu; o SHA-256 é
 * calculado AQUI, no navegador (o arquivo não sai da máquina), e comparado com
 * o hash do PDF oficial.
 */

const fmtData = (iso?: string | null) => {
    if (!iso) return '—';
    const [a, m, d] = iso.split('T')[0].split('-');
    return `${d}/${m}/${a}`;
};

const ROTULO: Record<string, string> = {
    EMITIDO: 'Emitido', ENVIADO: 'Enviado', RECEBIDO: 'Recebido pelo destinatário', RESPONDIDO: 'Respondido', ENCERRADO: 'Encerrado', CANCELADO: 'Cancelado',
};

const Linha: React.FC<{ label: string; valor?: React.ReactNode }> = ({ label, valor }) => (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0">
        <span className="text-sm font-normal text-gray-500 shrink-0">{label}</span>
        <span className="text-sm font-normal text-gray-900 text-right break-all">{valor ?? '—'}</span>
    </div>
);

export function PublicDocumentoChecker() {
    const [dados, setDados] = useState<ValidacaoPublica | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [conferencia, setConferencia] = useState<{ nome: string; confere: boolean } | null>(null);
    const [conferindo, setConferindo] = useState(false);

    useEffect(() => {
        const match = window.location.pathname.match(/\/publico\/validar-documento\/([0-9a-f-]{36})/i);
        const id = match?.[1];
        if (!id) { setErro('Código do documento ausente no endereço.'); setCarregando(false); return; }
        validarDocumentoPublico(id)
            .then(setDados)
            .catch(() => setErro('Não foi possível consultar o documento.'))
            .finally(() => setCarregando(false));
    }, []);

    const conferir = async (arquivo: File | undefined) => {
        if (!arquivo || !dados?.sha256) return;
        setConferindo(true);
        try {
            const hash = await sha256DeArquivo(arquivo);
            setConferencia({ nome: arquivo.name, confere: hash === dados.sha256 });
        } finally {
            setConferindo(false);
        }
    };

    const conteudo = () => {
        if (carregando) {
            return (
                <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                    <p className="mt-2 text-gray-500">Consultando o documento...</p>
                </div>
            );
        }
        if (erro || !dados?.encontrado) {
            return (
                <div className="text-center py-12 px-6">
                    <XCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Documento não encontrado</h3>
                    <p className="text-sm text-gray-500">{erro || 'O código informado não corresponde a nenhum documento emitido.'}</p>
                </div>
            );
        }
        const cancelado = dados.situacao === 'CANCELADO';
        const visual = cancelado
            ? { Icone: ShieldOff, cor: 'text-rose-500', titulo: 'Documento cancelado pelo emitente' }
            : { Icone: CheckCircle2, cor: 'text-emerald-500', titulo: 'Documento autêntico' };
        return (
            <>
                <div className="text-center py-8 border-b border-gray-100">
                    <visual.Icone className={`w-12 h-12 ${visual.cor} mx-auto mb-4`} />
                    <h2 className="text-lg font-bold text-gray-900">{visual.titulo}</h2>
                    <p className="text-sm text-gray-500 mt-1">{dados.tipo} nº {dados.numero}</p>
                </div>
                <div className="p-6">
                    <Linha label="Emitente" valor={dados.emitente} />
                    <Linha label="Destinatário" valor={dados.destinatario} />
                    <Linha label="Data do documento" valor={fmtData(dados.data)} />
                    <Linha label="Emitido em" valor={fmtData(dados.emitido_em)} />
                    <Linha label="Situação" valor={ROTULO[dados.situacao ?? ''] ?? dados.situacao} />
                    <Linha label="SHA-256 do PDF oficial" valor={<span className="font-mono text-xs">{dados.sha256 ?? '—'}</span>} />
                </div>
                {dados.sha256 && (
                    <div className="px-6 pb-6 space-y-3">
                        <label className="block text-xs font-semibold text-slate-500" htmlFor="conferir-pdf">Conferir o PDF que você recebeu</label>
                        <input id="conferir-pdf" type="file" accept="application/pdf" onChange={e => void conferir(e.target.files?.[0])}
                            className="block w-full text-sm text-gray-700 file:mr-3 file:h-9 file:px-3.5 file:rounded-[6px] file:border file:border-gray-200 file:bg-white file:text-[13px] file:font-medium file:text-gray-700 hover:file:bg-gray-50" />
                        {conferindo && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Calculando o hash…</p>}
                        {conferencia && !conferindo && (
                            conferencia.confere ? (
                                <p className="flex items-start gap-2 text-sm text-emerald-700"><FileCheck2 className="w-4 h-4 mt-0.5 shrink-0" /> "{conferencia.nome}" é idêntico ao PDF oficial.</p>
                            ) : (
                                <p className="flex items-start gap-2 text-sm text-rose-700"><FileX2 className="w-4 h-4 mt-0.5 shrink-0" /> "{conferencia.nome}" NÃO é o PDF oficial — o conteúdo é diferente do emitido.</p>
                            )
                        )}
                        <p className="text-[11px] text-gray-400">O arquivo é conferido no seu navegador; ele não é enviado a lugar nenhum.</p>
                    </div>
                )}
            </>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 py-12">
            <div className="w-full max-w-lg">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">ÒPURA Documentos</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Validação de documento emitido</p>
                </div>
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    {conteudo()}
                </div>
                <p className="text-xs text-gray-400 text-center mt-6">
                    Esta página confirma que o documento foi emitido pelo sistema e mostra a situação atual dele no emitente.
                </p>
            </div>
        </div>
    );
}

export default PublicDocumentoChecker;
