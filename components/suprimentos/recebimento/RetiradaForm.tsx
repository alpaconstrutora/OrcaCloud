import React from 'react';
import { Loader2 } from 'lucide-react';
import { CreatableCombobox } from '../../ui/CreatableCombobox';
import type { FonteRecebimento, PedidoAberto, ResultadoDaRetirada } from '../../../services/recebimentoFonte';
import { Cabecalho } from './RecebimentoDetalhe';

/**
 * Retirada de pedido FOB no celular: quem retirou (colaborador do RH da organização do
 * pedido — §7.1.3, sem cadastrar daqui; autorizados a retirar primeiro) e quando. Grava
 * pela Edge `pedido-recebimento` (núcleo `_pedido_retirada_core`).
 */

interface Props {
    fonte: FonteRecebimento;
    pedido: PedidoAberto;
    onCancelar: () => void;
    onGravado: (r: ResultadoDaRetirada) => void;
}

const hojeLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const RetiradaForm: React.FC<Props> = ({ fonte, pedido, onCancelar, onGravado }) => {
    const opcoes = React.useMemo(() => pedido.colaboradores.map(c => ({ id: c.id, name: c.nome, cargo: c.cargo, autorizado: c.autorizado })), [pedido.colaboradores]);
    const [texto, setTexto] = React.useState('');
    const [escolhido, setEscolhido] = React.useState<string | null>(null);
    const [data, setData] = React.useState(hojeLocal);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    const motivo = !escolhido ? 'Escolha quem retirou.' : !data ? 'Informe a data da retirada.' : data > hojeLocal() ? 'A data da retirada não pode ser futura.' : null;

    const salvar = async () => {
        if (motivo || !escolhido) return;
        setSalvando(true);
        setErro(null);
        try {
            onGravado(await fonte.registrarRetirada({ orderId: pedido.id, versao: pedido.versao, data, employeeId: escolhido }));
        } catch (e) {
            setErro(e instanceof Error && e.message ? e.message : 'Não foi possível registrar a retirada.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="space-y-6 pb-6">
            <Cabecalho titulo="Registrar retirada" subtitulo={[pedido.numero, pedido.fornecedor].filter(Boolean).join(' · ')} onVoltar={onCancelar} />

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-4">
                <div className="space-y-1.5">
                    <span className="block text-xs font-semibold text-slate-500">Retirado por</span>
                    <CreatableCombobox
                        ariaLabel="Retirado por"
                        value={texto}
                        selectedId={escolhido}
                        options={opcoes}
                        onSelect={o => { setEscolhido(o.id); setTexto(o.name); }}
                        onTextChange={t => { setTexto(t); setEscolhido(null); }}
                        getHint={o => [o.autorizado ? 'autorizado a retirar' : null, o.cargo].filter(Boolean).join(' · ') || undefined}
                        avisoSemVinculo="Escolha um colaborador da lista."
                        vazio="Nenhum colaborador ativo nesta organização."
                        placeholder="Nome do colaborador"
                    />
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="retirada-data" className="block text-xs font-semibold text-slate-500">Data da retirada</label>
                    <input id="retirada-data" type="date" value={data} max={hojeLocal()} onChange={e => setData(e.target.value)}
                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900" />
                </div>
            </div>

            {erro && <p role="alert" className="text-sm font-medium text-red-700 bg-red-50 rounded-[6px] px-3 py-2">{erro}</p>}

            <span className="block" title={motivo ?? (salvando ? 'Registrando…' : undefined)}>
                <button type="button" onClick={salvar} disabled={!!motivo || salvando}
                    className="w-full flex items-center justify-center gap-2 h-11 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-sm active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none">
                    {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                    Registrar retirada
                </button>
            </span>
            {motivo && <p className="text-xs text-gray-600">{motivo}</p>}
        </div>
    );
};

export default RetiradaForm;
