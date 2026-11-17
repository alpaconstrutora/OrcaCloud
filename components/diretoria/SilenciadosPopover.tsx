/**
 * Diretoria (ÒPURA CEO) — "Silenciados (N)": os tipos que a pessoa marcou como barulho, com a
 * regra de cada um e o "Reativar". Mora na barra das visões (slot à direita do `TabsBar`).
 *
 * O painel sai por portal em `document.body` com `position: fixed` (mesmo motivo do
 * `FilterPopover`, §5.4): no celular a barra quebra em coluna e o botão fica no meio da tela —
 * um `absolute` ancorado nele sairia pela borda. Esc e clique fora fecham; rolar/redimensionar
 * também (a posição seria a de antes). Sem nada silenciado o botão fica desligado e diz por quê.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Volume2, VolumeX } from 'lucide-react';
import { TIPOS, type TipoExcecao } from '../../utils/diretoria';
import { BOTAO_SECUNDARIO, LINK_ACAO } from './diretoriaUi';

interface Props {
    silenciados: TipoExcecao[];
    onReativar: (tipo: TipoExcecao) => void;
}

const LARGURA = 352;

export const SilenciadosPopover: React.FC<Props> = ({ silenciados, onReativar }) => {
    const [pos, setPos] = React.useState<{ top: number; left: number; largura: number } | null>(null);
    const botao = React.useRef<HTMLButtonElement>(null);
    const painel = React.useRef<HTMLDivElement>(null);
    const id = React.useId();
    const aberto = pos !== null;
    const n = silenciados.length;

    const abrir = () => {
        const r = botao.current?.getBoundingClientRect();
        const vw = window.innerWidth || LARGURA + 16;
        const largura = Math.min(LARGURA, vw - 16);
        const direita = r ? r.right : largura + 8;
        setPos({ top: (r?.bottom ?? 0) + 6, left: Math.max(8, Math.min(direita - largura, vw - largura - 8)), largura });
    };

    React.useEffect(() => {
        if (!aberto) return;
        const fora = (e: MouseEvent) => {
            const alvo = e.target as Node;
            if (!painel.current?.contains(alvo) && !botao.current?.contains(alvo)) setPos(null);
        };
        const tecla = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { setPos(null); botao.current?.focus(); }
        };
        const fechar = () => setPos(null);
        document.addEventListener('mousedown', fora);
        document.addEventListener('keydown', tecla);
        window.addEventListener('resize', fechar);
        window.addEventListener('scroll', fechar, true);
        return () => {
            document.removeEventListener('mousedown', fora);
            document.removeEventListener('keydown', tecla);
            window.removeEventListener('resize', fechar);
            window.removeEventListener('scroll', fechar, true);
        };
    }, [aberto]);

    // Reativou o último: não sobra lista para mostrar.
    React.useEffect(() => { if (n === 0) setPos(null); }, [n]);

    if (n === 0) {
        return (
            <span className="inline-flex" title={'Nada silenciado. Use "É barulho" num grupo para tirar aquele tipo da sua tela.'}>
                <button type="button" disabled className={BOTAO_SECUNDARIO}>
                    <VolumeX className="w-[15px] h-[15px]" aria-hidden="true" /> Silenciados (0)
                </button>
            </span>
        );
    }

    return (
        <>
            <button ref={botao} type="button" onClick={() => (aberto ? setPos(null) : abrir())}
                aria-expanded={aberto} aria-controls={aberto ? id : undefined} aria-haspopup="dialog"
                title="Tipos que você marcou como barulho"
                className={`${BOTAO_SECUNDARIO} ${aberto ? 'border-blue-300 bg-blue-50 text-blue-700' : ''}`}>
                <VolumeX className="w-[15px] h-[15px]" aria-hidden="true" />
                {`Silenciados (${n})`}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {aberto && pos && createPortal(
                <div ref={painel} id={id} role="dialog" aria-label="Tipos silenciados"
                    style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.largura }}
                    className="z-[60] bg-white rounded-[10px] border border-gray-200 shadow-lg p-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                    <p className="px-2 py-1.5 text-xs text-gray-500">Só para você: estes tipos não aparecem na sua tela nem nos indicadores.</p>
                    <ul className="divide-y divide-gray-100">
                        {silenciados.map(t => (
                            <li key={t} className="flex items-start gap-3 px-2 py-2">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900">{TIPOS[t].nome}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{TIPOS[t].regra}</p>
                                </div>
                                <button type="button" onClick={() => onReativar(t)} aria-label={`Reativar ${TIPOS[t].nome}`} className={LINK_ACAO}>
                                    <Volume2 className="w-4 h-4" aria-hidden="true" /> Reativar
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>,
                document.body,
            )}
        </>
    );
};

export default SilenciadosPopover;
