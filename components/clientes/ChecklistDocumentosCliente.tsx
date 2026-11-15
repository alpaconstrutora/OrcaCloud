// components/clientes/ChecklistDocumentosCliente.tsx
// Checklist de documentos de UM comprador/locatário na negociação (DealModal ›
// aba Cliente), ligado a Meus Clientes (15/11/2026).
// Plano: docs/planos/2026-11-15-cliente-aba-documentos.md
//
// Um item está ATENDIDO quando:
//  - o cliente tem em Meus Clientes um documento daquele tipo (metadados.
//    documento_cliente = chave do item) — o ✓ vem sozinho e o clique abre o
//    arquivo; ou
//  - alguém marcou à mão (commercial_deals.doc_checklist), para quem só
//    conferiu o papel.
// O primeiro é derivado na LEITURA: nada grava doc_checklist sozinho.
//
// "Enviar" grava o arquivo no cliente (opura_documents.client_id), nunca na
// negociação — o comercial só usa.
import React from 'react';
import { Check, FileText, Paperclip, Upload } from 'lucide-react';
import type { OpuraDocument } from '../../types/documents';
import { TIPOS_DOCUMENTO_CLIENTE, documentoDoItem, situacaoDaValidade } from '../../types/clienteDocumentos';
import DocumentosClienteTabela, {
    EnviarDocumentoClienteSheet, abrirDocumentoCliente, rotuloDaValidade, useMotivoSemEscrita,
    type ClienteDosDocumentos,
} from './DocumentosCliente';

interface Props {
    pessoa: ClienteDosDocumentos;
    /** Negociação com um comprador só: chaves legadas `<doc>`; com vários, `<client_id>::<doc>`. */
    soUm: boolean;
    /** É o `client_id` da negociação (quem herdou as chaves legadas ao ganhar companhia). */
    ehClientePrincipal: boolean;
    checked: Record<string, boolean>;
    onToggle: (chave: string, valor: boolean) => void;
    /** Documentos DESTE cliente. */
    documentos: OpuraDocument[];
    carregando: boolean;
    onDocumentosChange: (upd: (atual: OpuraDocument[]) => OpuraDocument[]) => void;
    onNotificar: (msg: string, tipo?: 'success' | 'error') => void;
}

const ChecklistDocumentosCliente: React.FC<Props> = ({
    pessoa, soUm, ehClientePrincipal, checked, onToggle, documentos, carregando, onDocumentosChange, onNotificar,
}) => {
    const isPJ = pessoa.type === 'PJ';
    const items = TIPOS_DOCUMENTO_CLIENTE[isPJ ? 'PJ' : 'PF'];
    const motivoSemEscrita = useMotivoSemEscrita(pessoa);
    const [envioTipo, setEnvioTipo] = React.useState<string | null>(null);

    const keyOf = (docKey: string) => (soUm ? docKey : `${pessoa.id}::${docKey}`);
    // Um comprador que era único (chaves legadas) e ganhou companhia continua
    // vendo o que já marcou.
    const marcadoAMao = (docKey: string) =>
        !!(checked[keyOf(docKey)] ?? (ehClientePrincipal ? checked[docKey] : false));

    const linhas = items.map(item => ({
        item,
        doc: documentoDoItem(documentos, pessoa.id, item.key) as OpuraDocument | null,
        manual: marcadoAMao(item.key),
    }));
    const atendidos = linhas.filter(l => l.doc || l.manual).length;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-semibold text-gray-900">
                        Documentos — {isPJ ? 'Pessoa Jurídica' : 'Pessoa Física'}
                        {!soUm && pessoa.name && <span className="font-normal text-gray-500"> · {pessoa.name}</span>}
                    </h3>
                </div>
                <span className="text-sm font-normal text-blue-600">{atendidos}/{items.length}</span>
            </div>
            <p className="text-xs text-gray-500 -mt-1">
                Com arquivo em Meus Clientes o item se marca sozinho. Sem arquivo, marque à mão o que você conferiu.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {linhas.map(({ item, doc, manual }) => {
                    if (doc) {
                        const venc = situacaoDaValidade(doc).situacao;
                        const vencido = venc === 'vencido';
                        const validade = rotuloDaValidade(doc);
                        return (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => abrirDocumentoCliente(doc, msg => onNotificar(msg, 'error'))}
                                title={`Abrir ${doc.nome}`}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-[10px] border text-left transition-all ${
                                    vencido ? 'bg-amber-50 border-amber-200 hover:border-amber-300' : 'bg-emerald-50 border-emerald-200 hover:border-emerald-300'
                                }`}
                            >
                                <span className={`w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0 border text-white ${
                                    vencido ? 'bg-amber-500 border-amber-500' : 'bg-emerald-500 border-emerald-500'
                                }`}>
                                    <Paperclip className="w-3.5 h-3.5" />
                                </span>
                                <span className="min-w-0">
                                    <span className={`block text-sm font-bold ${vencido ? 'text-amber-800' : 'text-emerald-800'}`}>{item.label}</span>
                                    <span className={`block text-xs truncate ${vencido ? 'text-amber-700' : 'text-emerald-700'}`}>
                                        {vencido ? validade.texto : venc === 'sem_validade' ? 'Arquivo em Meus Clientes' : `Arquivo · ${validade.texto}`}
                                    </span>
                                </span>
                            </button>
                        );
                    }
                    return (
                        <div
                            key={item.key}
                            className={`flex items-center gap-2 pr-2 rounded-[10px] border transition-all ${
                                manual ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200 hover:border-blue-300'
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => onToggle(keyOf(item.key), !manual)}
                                aria-pressed={manual}
                                className="flex-1 min-w-0 flex items-center gap-3 pl-4 py-3 text-left"
                            >
                                <span className={`w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0 border transition-all ${
                                    manual ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-gray-300 text-transparent'
                                }`}>
                                    <Check className="w-4 h-4" />
                                </span>
                                <span className="min-w-0">
                                    <span className={`block text-sm font-bold ${manual ? 'text-emerald-800' : 'text-gray-700'}`}>{item.label}</span>
                                    {manual && <span className="block text-xs text-emerald-700">Conferido, sem arquivo</span>}
                                </span>
                            </button>
                            <span className="inline-flex shrink-0" title={motivoSemEscrita ?? `Enviar ${item.label} para Meus Clientes`}>
                                <button
                                    type="button"
                                    onClick={() => setEnvioTipo(item.key)}
                                    disabled={!!motivoSemEscrita || carregando}
                                    className="flex items-center gap-1 h-7 px-2 rounded-[6px] text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                                >
                                    <Upload className="w-3.5 h-3.5" />
                                    Enviar
                                </button>
                            </span>
                        </div>
                    );
                })}
            </div>

            <div className="space-y-2">
                <p className="text-xs text-gray-500">
                    Todos os documentos {pessoa.name ? `de ${pessoa.name}` : 'do cliente'} — gravados em Meus Clientes.
                </p>
                <DocumentosClienteTabela
                    cliente={pessoa}
                    documentos={documentos}
                    onDocumentosChange={onDocumentosChange}
                    loading={carregando}
                    onNotificar={onNotificar}
                    storageKey="negociacao:documentos-cliente"
                />
            </div>

            <EnviarDocumentoClienteSheet
                open={!!envioTipo}
                onClose={() => setEnvioTipo(null)}
                cliente={pessoa}
                tipoInicial={envioTipo ?? undefined}
                onErro={msg => onNotificar(msg, 'error')}
                onSalvo={doc => {
                    onDocumentosChange(prev => [doc, ...prev]);
                    setEnvioTipo(null);
                    onNotificar('Documento enviado para Meus Clientes.');
                }}
            />
        </div>
    );
};

export default ChecklistDocumentosCliente;
