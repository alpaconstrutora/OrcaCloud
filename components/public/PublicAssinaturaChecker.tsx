import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, FileCheck2, FileX2, Loader2, ShieldOff, XCircle } from 'lucide-react';
import { sha256DeArquivo } from '../../services/docGen/envio';
import { ROTULO_PAPEL, validarAssinaturaPublica, type ValidacaoDeAssinatura } from '../../services/assinaturaInternaService';

/**
 * Validação pública da assinatura interna — destino do QR do manifesto.
 * Mesmo molde da validação de ofício (`PublicDocumentoChecker`): roda SEM
 * sessão, a RPC `assinatura_validar` é grantada a anon e recortada pelo id do
 * envelope (UUID aleatório), e devolve só o que autentica — nunca arquivo,
 * caminho, e-mail, IP nem CPF inteiro. "Conferir um PDF" calcula o SHA-256 no
 * navegador e compara com o assinado (e com o original, para dizer "é o
 * documento, mas sem as assinaturas").
 * Plano: docs/planos/2026-11-21-assinatura-eletronica-interna.md (F3).
 */

const fmtDataHora = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const Linha: React.FC<{ label: string; valor?: React.ReactNode }> = ({ label, valor }) => (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0">
        <span className="text-sm font-normal text-gray-500 shrink-0">{label}</span>
        <span className="text-sm font-normal text-gray-900 text-right break-all">{valor ?? '—'}</span>
    </div>
);

type Conferencia = { nome: string; resultado: 'assinado' | 'original' | 'diferente' };

export function PublicAssinaturaChecker() {
    const [dados, setDados] = useState<ValidacaoDeAssinatura | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [conferencia, setConferencia] = useState<Conferencia | null>(null);
    const [conferindo, setConferindo] = useState(false);
    const arquivoRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        const id = window.location.pathname.match(/\/publico\/validar-assinatura\/([0-9a-f-]{36})/i)?.[1];
        if (!id) { setErro('Código do documento ausente no endereço.'); setCarregando(false); return; }
        validarAssinaturaPublica(id)
            .then(setDados)
            .catch(() => setErro('Não foi possível consultar o documento.'))
            .finally(() => setCarregando(false));
    }, []);

    const conferir = async (arquivo: File | undefined) => {
        if (!arquivo || !dados) return;
        setConferindo(true);
        try {
            const hash = await sha256DeArquivo(arquivo);
            setConferencia({
                nome: arquivo.name,
                resultado: hash === dados.final_sha256 ? 'assinado' : hash === dados.original_sha256 ? 'original' : 'diferente',
            });
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
                    <p className="text-sm text-gray-500">{erro || 'O código informado não corresponde a nenhum documento assinado por aqui.'}</p>
                </div>
            );
        }
        const visual = dados.situacao === 'CONCLUIDO'
            ? { Icone: CheckCircle2, cor: 'text-emerald-500', titulo: 'Documento assinado por todos' }
            : dados.situacao === 'CANCELADO' || dados.situacao === 'EXPIRADO'
                ? { Icone: ShieldOff, cor: 'text-rose-500', titulo: dados.situacao === 'CANCELADO' ? 'Assinatura cancelada pelo emitente' : 'Prazo de assinatura vencido' }
                : { Icone: Clock, cor: 'text-amber-500', titulo: 'Assinatura em andamento' };
        return (
            <>
                <div className="text-center py-8 border-b border-gray-100 px-6">
                    <visual.Icone className={`w-12 h-12 ${visual.cor} mx-auto mb-4`} />
                    <h2 className="text-lg font-bold text-gray-900">{visual.titulo}</h2>
                    <p className="text-sm text-gray-500 mt-1">{dados.titulo}</p>
                </div>
                <div className="p-6">
                    <Linha label="Emitente" valor={dados.emitente} />
                    <Linha label="Enviado para assinatura" valor={fmtDataHora(dados.enviado_em)} />
                    <Linha label="Concluído em" valor={fmtDataHora(dados.concluido_em)} />
                    <Linha label="Páginas do original" valor={dados.paginas ?? '—'} />
                </div>
                <div className="px-6 pb-6">
                    <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3 mb-1">Signatários</h3>
                    <ul className="divide-y divide-gray-100">
                        {(dados.signatarios ?? []).map((s, i) => (
                            <li key={i} className="py-2.5 flex items-start justify-between gap-4 text-sm">
                                <span className="text-gray-900">
                                    {s.nome}{s.representa ? ` (por ${s.representa})` : ''}
                                    <span className="block text-xs text-gray-500">{ROTULO_PAPEL[s.papel]} · CPF {s.cpf}</span>
                                </span>
                                {s.situacao === 'ASSINADO'
                                    ? <span className="text-emerald-700 text-right shrink-0">Assinou em {fmtDataHora(s.assinado_em)}</span>
                                    : <span className="text-amber-700 shrink-0">Pendente</span>}
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="px-6 pb-6">
                    <Linha label="SHA-256 do PDF assinado" valor={<span className="font-mono text-xs">{dados.final_sha256 ?? '—'}</span>} />
                    <Linha label="SHA-256 do original" valor={<span className="font-mono text-xs">{dados.original_sha256 ?? '—'}</span>} />
                </div>
                <div className="px-6 pb-6 space-y-3">
                    <p className="text-xs font-semibold text-slate-500">Conferir o PDF que você recebeu</p>
                    {/* Input escondido + botão: o seletor nativo muda de idioma conforme o navegador. */}
                    <input ref={arquivoRef} id="conferir-pdf-assinado" type="file" accept="application/pdf" className="hidden"
                        onChange={e => void conferir(e.target.files?.[0])} />
                    <button type="button" onClick={() => arquivoRef.current?.click()}
                        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50">
                        <FileCheck2 className="w-[15px] h-[15px]" /> Escolher PDF
                    </button>
                    {conferindo && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Calculando o hash…</p>}
                    {conferencia && !conferindo && (
                        conferencia.resultado === 'assinado' ? (
                            <p className="flex items-start gap-2 text-sm text-emerald-700"><FileCheck2 className="w-4 h-4 mt-0.5 shrink-0" /> "{conferencia.nome}" é idêntico à via assinada.</p>
                        ) : conferencia.resultado === 'original' ? (
                            <p className="flex items-start gap-2 text-sm text-amber-700"><FileCheck2 className="w-4 h-4 mt-0.5 shrink-0" /> "{conferencia.nome}" é o documento enviado para assinatura, mas sem a página de assinaturas.</p>
                        ) : (
                            <p className="flex items-start gap-2 text-sm text-rose-700"><FileX2 className="w-4 h-4 mt-0.5 shrink-0" /> "{conferencia.nome}" NÃO é este documento — o conteúdo é diferente.</p>
                        )
                    )}
                    <p className="text-xs text-gray-500">O arquivo é conferido no seu navegador; ele não é enviado a lugar nenhum.</p>
                </div>
            </>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 py-12">
            <div className="w-full max-w-lg">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">Assinatura eletrônica</h1>
                    <p className="text-gray-500 text-sm mt-1.5">Validação de documento assinado</p>
                </div>
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    {conteudo()}
                </div>
                <p className="text-xs text-gray-500 text-center mt-6">
                    Assinatura eletrônica avançada sem certificado ICP-Brasil (MP 2.200-2/2001, art. 10, § 2º; Lei 14.063/2020).
                </p>
            </div>
        </div>
    );
}

export default PublicAssinaturaChecker;
