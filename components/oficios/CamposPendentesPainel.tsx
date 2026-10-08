import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { DestinatarioTipo } from '../../types/docGen';
import type { Pendencia } from '../../services/docGen/validarDocumento';
import { colunaNoCadastro, ROTULO_TIPO } from '../../services/docGen/destinatario';

/**
 * Validação do documento + correção no lugar (item 4 do pedido: "Campos pendentes").
 *
 * Para cada variável vazia, duas saídas:
 *   - "Só neste documento" — grava o valor em `valores` do ofício (override);
 *   - "Gravar no cadastro" — grava na ficha de origem (fornecedor, cliente,
 *     colaborador) e o documento acompanha. Só aparece quando há UMA coluna
 *     de destino (ver `COLUNA_NO_CADASTRO`).
 * Pendências que não são variável (assunto, destinatário, signatário, campo
 * livre) levam ao campo do formulário.
 */
interface Props {
    pendencias: Pendencia[];
    calculando: boolean;
    destinatarioTipo: DestinatarioTipo | null;
    destinatarioTemCadastro: boolean;
    somenteLeitura?: boolean;
    onSoNesteDocumento: (chave: string, valor: string) => void;
    onGravarNoCadastro: (chave: string, valor: string) => Promise<void>;
    onIrPara: (chave: string) => void;
}

export default function CamposPendentesPainel({
    pendencias, calculando, destinatarioTipo, destinatarioTemCadastro, somenteLeitura, onSoNesteDocumento, onGravarNoCadastro, onIrPara,
}: Props) {
    const [rascunhos, setRascunhos] = React.useState<Record<string, string>>({});
    const [gravando, setGravando] = React.useState<string | null>(null);
    const [erro, setErro] = React.useState<{ chave: string; msg: string } | null>(null);

    const bloqueantes = pendencias.filter(p => p.severidade === 'bloqueante').length;
    const avisos = pendencias.length - bloqueantes;

    const gravar = async (chave: string) => {
        const valor = (rascunhos[chave] ?? '').trim();
        if (!valor) return;
        setGravando(chave);
        setErro(null);
        try {
            await onGravarNoCadastro(chave, valor);
            setRascunhos(r => ({ ...r, [chave]: '' }));
        } catch (e) {
            setErro({ chave, msg: e instanceof Error ? e.message : 'Falha ao gravar no cadastro.' });
        } finally {
            setGravando(null);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
                {calculando ? (
                    <span className="flex items-center gap-1.5 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Conferindo os dados…</span>
                ) : pendencias.length === 0 ? (
                    <span className="flex items-center gap-1.5 text-green-700"><CheckCircle2 className="w-4 h-4" /> Tudo preenchido — o documento está pronto para emitir.</span>
                ) : (
                    <span className="flex items-center gap-1.5 text-gray-700">
                        {bloqueantes > 0 && <span className="text-red-600">{bloqueantes} impede{bloqueantes > 1 ? 'm' : ''} a emissão</span>}
                        {bloqueantes > 0 && avisos > 0 && <span className="text-gray-300">·</span>}
                        {avisos > 0 && <span className="text-amber-700">{avisos} aviso{avisos > 1 ? 's' : ''}</span>}
                    </span>
                )}
            </div>

            {pendencias.length > 0 && (
                <ul className="divide-y divide-gray-100 rounded-[10px] border border-gray-100">
                    {pendencias.map(p => {
                        const coluna = p.variavel && destinatarioTemCadastro ? colunaNoCadastro(destinatarioTipo, p.chave) : null;
                        const valor = rascunhos[p.chave] ?? '';
                        return (
                            <li key={p.chave} className="px-4 py-3 space-y-2">
                                <div className="flex items-start gap-2">
                                    {p.severidade === 'bloqueante'
                                        ? <XCircle className="w-4 h-4 mt-0.5 text-red-500 shrink-0" />
                                        : <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />}
                                    <div className="min-w-0 flex-1">
                                        <p className={`text-sm ${p.severidade === 'bloqueante' ? 'text-red-700' : 'text-amber-800'}`}>{p.mensagem}</p>
                                        {p.variavel && <p className="text-[11px] text-gray-400">{`{{${p.chave}}}`}</p>}
                                    </div>
                                    {!p.variavel && !somenteLeitura && (
                                        <button type="button" onClick={() => onIrPara(p.chave)}
                                            className="h-8 px-3 text-sm font-medium text-blue-700 bg-blue-50 rounded-[6px] hover:bg-blue-100 shrink-0">
                                            Preencher
                                        </button>
                                    )}
                                </div>
                                {p.variavel && !somenteLeitura && (
                                    <div className="flex flex-wrap items-center gap-2 pl-6">
                                        <input value={valor} onChange={e => setRascunhos(r => ({ ...r, [p.chave]: e.target.value }))}
                                            placeholder={`Valor para ${p.rotulo}`}
                                            className="flex-1 min-w-[220px] h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                                        <button type="button" disabled={!valor.trim()}
                                            title={!valor.trim() ? 'Digite o valor primeiro' : 'Usa o valor só neste documento; o cadastro não muda'}
                                            onClick={() => { onSoNesteDocumento(p.chave, valor.trim()); setRascunhos(r => ({ ...r, [p.chave]: '' })); }}
                                            className="h-9 px-3 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-[6px] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                                            Só neste documento
                                        </button>
                                        {coluna && (
                                            <button type="button" disabled={!valor.trim() || gravando === p.chave}
                                                title={!valor.trim() ? 'Digite o valor primeiro' : `Grava no cadastro de ${ROTULO_TIPO[destinatarioTipo!]} e o documento acompanha`}
                                                onClick={() => gravar(p.chave)}
                                                className="flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-white bg-blue-600 rounded-[6px] hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                                {gravando === p.chave && <Loader2 className="w-4 h-4 animate-spin" />}
                                                Atualizar cadastro
                                            </button>
                                        )}
                                    </div>
                                )}
                                {erro?.chave === p.chave && <p className="pl-6 text-sm text-red-600">{erro.msg}</p>}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
