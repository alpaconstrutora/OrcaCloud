import React from 'react';
import { Plus } from 'lucide-react';
import { masterDataService, MasterUnit } from '../../services/masterDataService';
import { CATEGORIAS_DE_UNIDADE, motivoNovaUnidadeInvalida, simboloLimpo } from '../../lib/unidadeDeMedida';

/**
 * UNIDADE DE MEDIDA NOVA (21/11/2026) — "implemente opção para criação de nova unidade
 * de medida". Grava no cadastro GLOBAL `master_units_of_measure` (só o superadministrador;
 * a RLS confere). Usado no cadastro de equivalência do item (Composições › Ver detalhes)
 * e em Dados Mestres › Unidades. Plano: docs/planos/2026-11-21-unidade-de-medida-nova.md.
 */
interface Props {
    /** Códigos que já existem (`catalogoDeUnidades`) — o apelido conta: "Barra" é o BR. */
    existentes: readonly string[];
    simboloInicial?: string;
    onCriada: (unidade: MasterUnit) => void;
    onCancelar: () => void;
    notify: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ROTULO = 'block text-xs font-semibold text-slate-500';
const CAMPO = 'h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

export const NovaUnidadeForm: React.FC<Props> = ({ existentes, simboloInicial = '', onCriada, onCancelar, notify }) => {
    const [simbolo, setSimbolo] = React.useState(simboloInicial);
    const [nome, setNome] = React.useState('');
    const [categoria, setCategoria] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const motivo = motivoNovaUnidadeInvalida({ simbolo, nome, categoria }, existentes);

    const criar = async () => {
        if (motivo) return;
        setSalvando(true);
        try {
            const u = await masterDataService.addUnit({ symbol: simboloLimpo(simbolo), name: nome, category: categoria });
            notify(`Unidade ${u.symbol} cadastrada.`, 'success');
            onCriada(u);
        } catch (e) {
            notify(`Erro ao cadastrar a unidade: ${e instanceof Error ? e.message : 'erro desconhecido'}`, 'error');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="rounded-[10px] border border-blue-100 bg-blue-50/40 p-4 space-y-3">
            <div>
                <h5 className="text-sm font-semibold text-gray-900">Nova unidade de medida</h5>
                <p className="text-xs text-gray-500 mt-0.5">Fica disponível para todas as organizações. Depois de criada, não se altera nem se apaga.</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                    <label className={ROTULO} htmlFor="nova-unidade-simbolo">Símbolo</label>
                    <input id="nova-unidade-simbolo" value={simbolo} onChange={e => setSimbolo(e.target.value)} maxLength={12} placeholder="Ex.: TB" className={`${CAMPO} w-28`} />
                </div>
                <div className="space-y-1.5 flex-1 min-w-[180px]">
                    <label className={ROTULO} htmlFor="nova-unidade-nome">Nome</label>
                    <input id="nova-unidade-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Tubo" className={`${CAMPO} w-full`} />
                </div>
                <div className="space-y-1.5">
                    <label className={ROTULO} htmlFor="nova-unidade-grandeza">Grandeza</label>
                    <select id="nova-unidade-grandeza" value={categoria} onChange={e => setCategoria(e.target.value)} className={`${CAMPO} w-40`}>
                        <option value="">Escolha</option>
                        {CATEGORIAS_DE_UNIDADE.map(c => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
                    </select>
                </div>
                <div className="flex items-center gap-1.5">
                    <button type="button" onClick={onCancelar} className="h-9 px-3 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100">
                        Cancelar
                    </button>
                    <span className="inline-flex" title={motivo ?? undefined}>
                        <button
                            type="button"
                            onClick={criar}
                            disabled={!!motivo || salvando}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <Plus className="w-[15px] h-[15px]" />
                            {salvando ? 'Criando…' : 'Criar unidade'}
                        </button>
                    </span>
                </div>
            </div>
            {motivo && (simbolo || nome) && <p className="text-xs text-amber-700">{motivo}</p>}
        </div>
    );
};

export default NovaUnidadeForm;
