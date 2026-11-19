// components/ImovibFaixaEdicaoDeVersao.tsx
//
// Faixa do estudo enquanto uma versão está em edição (plano
// docs/planos/2026-11-19-imovib-versoes-editar-excluir.md). Quem abriu a edição salva na versão ou
// descarta; os outros só leem (o motivo da leitura vem do useImovibEdicao); um administrador pode
// descartar uma edição esquecida.
import React from 'react';
import { History, Loader2 } from 'lucide-react';
import type { EdicaoDaVersao } from '../utils/imovibVersoes';

interface Props {
    edicao: EdicaoDaVersao;
    souEu: boolean;
    podeDescartar: boolean;
    salvando: boolean;
    onSalvar: () => void;
    onDescartar: () => void;
}

// Botões compactos (§17): h-9, rounded-[6px], sentence case.
const BASE = 'flex items-center gap-1.5 h-9 px-3.5 text-[13px] font-medium rounded-[6px] transition-all disabled:opacity-50 disabled:cursor-not-allowed';
const PRIMARIO = `${BASE} bg-blue-600 text-white hover:bg-blue-700`;
const SECUNDARIO = `${BASE} border border-gray-200 bg-white text-slate-700 hover:bg-gray-50`;

const ImovibFaixaEdicaoDeVersao: React.FC<Props> = ({ edicao, souEu, podeDescartar, salvando, onSalvar, onDescartar }) => {
    const ocupado = salvando ? 'Gravando a versão — aguarde.' : undefined;
    return (
        <div role="status" className="flex flex-col md:flex-row md:items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-[10px]">
            <History className="w-4 h-4 text-blue-700 shrink-0 hidden md:block" />
            <p className="text-sm text-blue-900 flex-1 min-w-0">
                {souEu
                    ? <>Editando a versão <strong>«{edicao.version_label}»</strong> — o estudo mostra os números dela até você salvar na versão ou descartar.</>
                    : <>«{edicao.started_by_name || 'Outra pessoa'}» está editando a versão <strong>«{edicao.version_label}»</strong>.</>}
            </p>
            <div className="flex items-center gap-2 shrink-0">
                {souEu && (
                    <button type="button" className={PRIMARIO} onClick={onSalvar} disabled={salvando} title={ocupado ?? 'Regravar a versão com o estudo como está e devolver o estudo ao que era antes'}>
                        {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                        {salvando ? 'Salvando…' : 'Salvar na versão'}
                    </button>
                )}
                {(souEu || podeDescartar) && (
                    <button type="button" className={SECUNDARIO} onClick={onDescartar} disabled={salvando} title={ocupado ?? 'Voltar o estudo ao que era antes; a versão não muda'}>
                        {souEu ? 'Descartar' : 'Descartar a edição'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default ImovibFaixaEdicaoDeVersao;

/**
 * Aviso para telas que LEEM o estudo (Acompanhamento, Central de Sincronização do empreendimento):
 * durante a edição de uma versão, o estudo mostra os números dela.
 */
export const AvisoEstudoEmEdicao: React.FC<{ versionLabel: string; startedByName: string | null }> = ({ versionLabel, startedByName }) => (
    <div role="status" className="flex items-start gap-2 rounded-[10px] bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-900">
        <History className="w-4 h-4 mt-0.5 shrink-0" />
        Estudo em edição da versão «{versionLabel}» por «{startedByName || 'outra pessoa'}» — os números do estudo são os dessa versão até a edição terminar.
    </div>
);
