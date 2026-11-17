// components/ui/CreatableCombobox.tsx — campo com busca que escolhe um item de uma lista
//
// Dois usos (docs/ui_ux_guia_unificado.md):
//  - §7.1.2 catálogo PEQUENO e criável (marca, modelo), COM `onCreate`: oferece
//    "Cadastrar 'X'" — não é entidade com drawer próprio (§7.1.1: cliente/
//    fornecedor/CC/plano de contas);
//  - §7.1.3 aproveitar um registro que já existe (colaborador do RH no convite
//    de Usuários), SEM `onCreate`: não cadastra nada; `getDisabledReason` mostra
//    desligada, com o motivo, a opção que não pode ser escolhida; `avisoSemVinculo`
//    e `vazio` dizem o que o texto solto e a lista vazia significam naquele formulário.
//
// Regras que o componente garante sozinho:
//  - nunca bloqueia: o texto digitado fica no campo mesmo sem escolher nada
//    (`onTextChange`); quem salva transforma em cadastro (resolverMarcaModelo);
//  - não oferece cadastrar o que já existe, ignorando maiúsculas E acento;
//  - sair do campo com um texto igual a UM item existente vincula o item (com
//    homônimos, não adivinha; opção desligada nunca é vinculada);
//  - Enter nunca envia o formulário em volta: escolhe a opção ativa ou não faz nada;
//  - a opção ativa no teclado é anunciada (`aria-activedescendant`) e destacada,
//    inclusive a desligada — senão o leitor de tela e o olho ficam sem saber onde estão;
//  - a lista sai por PORTAL em `document.body` com `position: fixed` — dentro
//    do SheetPanel (rolável, com transform) um `absolute` seria cortado;
//  - Escape fecha SÓ a lista (stopPropagation): o Sheet em volta escuta
//    `keydown` em `document` e fecharia junto.
//
// A busca é estado transitório (guia §3.1): filtra o seletor, não a tela.
import React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2, Plus } from 'lucide-react';
import { chaveBusca, deveOferecerCadastro, filtrarPorNome, normalizarNome } from '../../utils/catalogoNome';

export interface CreatableComboboxProps<T extends { id: string; name: string }> {
    /** Texto atual do campo (nome escolhido ou digitado). */
    value: string;
    /** Id vinculado — sem ele o texto é "digitado, ainda não cadastrado". */
    selectedId: string | null;
    options: readonly T[];
    onSelect: (item: T) => void;
    /** Digitar desvincula: o pai guarda o texto com id null. */
    onTextChange: (texto: string) => void;
    /** Sem `onCreate`, não há opção de cadastrar (o texto continua livre). */
    onCreate?: (texto: string) => Promise<void> | void;
    /** Linha secundária de cada opção (ex.: part number, tipo). */
    getHint?: (item: T) => string | undefined;
    placeholder?: string;
    disabled?: boolean;
    /** Motivo do campo desligado — vira o placeholder e o `title` (botão desligado sempre diz por quê). */
    disabledReason?: string;
    inputClassName?: string;
    id?: string;
    ariaLabel?: string;
    /** Aviso sob o campo quando há texto ainda não cadastrado (ex.: "Marca nova — será cadastrada ao salvar."). */
    avisoNovo?: string;
    /** Sem `onCreate`: aviso sob o campo quando o texto não está vinculado a nenhum item. */
    avisoSemVinculo?: string;
    /**
     * Motivo de a opção não poder ser escolhida (ex.: "Já é usuário desta organização").
     * Com motivo, a opção aparece desligada, mostra o motivo no lugar do hint e não é
     * escolhida por clique, Enter nem pelo vínculo automático ao sair do campo.
     */
    getDisabledReason?: (item: T) => string | undefined;
    /** Sem `onCreate`: texto da lista quando não há nenhuma opção (padrão "Nada cadastrado."). */
    vazio?: string;
}

const INPUT_PADRAO =
    'w-full h-9 pl-3 pr-8 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-normal text-gray-900 ' +
    'focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all ' +
    'disabled:opacity-60 disabled:cursor-not-allowed';

export function CreatableCombobox<T extends { id: string; name: string }>({
    value, selectedId, options, onSelect, onTextChange, onCreate, getHint, placeholder,
    disabled, disabledReason, inputClassName = INPUT_PADRAO, id, ariaLabel, avisoNovo = 'Novo no catálogo — será cadastrado ao salvar.',
    avisoSemVinculo = 'Não vinculado ao catálogo.', getDisabledReason, vazio = 'Nada cadastrado.',
}: CreatableComboboxProps<T>) {
    const idBase = React.useId();
    const idDaOpcao = (i: number) => `${idBase}-opcao-${i}`;
    const inputRef = React.useRef<HTMLInputElement>(null);
    const panelRef = React.useRef<HTMLDivElement>(null);
    const [open, setOpen] = React.useState(false);
    const [focado, setFocado] = React.useState(false);
    const [ativo, setAtivo] = React.useState(0);
    const [criando, setCriando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [posicao, setPosicao] = React.useState<{ top: number; left: number; width: number } | null>(null);

    // Com um item escolhido, abrir a lista mostra tudo (não só o próprio item).
    const termo = selectedId ? '' : value;
    const resultados = React.useMemo(() => filtrarPorNome(options, termo, o => o.name), [options, termo]);
    const podeCadastrar = !!onCreate && !selectedId && deveOferecerCadastro(options, value);
    const total = resultados.length + (podeCadastrar ? 1 : 0);

    const atualizarPosicao = React.useCallback(() => {
        const r = inputRef.current?.getBoundingClientRect();
        if (r) setPosicao({ top: r.bottom + 4, left: r.left, width: r.width });
    }, []);

    React.useLayoutEffect(() => {
        if (!open) return;
        atualizarPosicao();
        const fora = (e: MouseEvent) => {
            const alvo = e.target as Node;
            if (inputRef.current?.contains(alvo) || panelRef.current?.contains(alvo)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', fora);
        window.addEventListener('resize', atualizarPosicao);
        window.addEventListener('scroll', atualizarPosicao, true);
        return () => {
            document.removeEventListener('mousedown', fora);
            window.removeEventListener('resize', atualizarPosicao);
            window.removeEventListener('scroll', atualizarPosicao, true);
        };
    }, [open, atualizarPosicao]);

    React.useEffect(() => { setAtivo(0); }, [termo, open]);

    const escolher = (item: T) => {
        if (getDisabledReason?.(item)) return;
        onSelect(item);
        setOpen(false);
        setErro(null);
    };

    const cadastrar = async () => {
        if (!onCreate || criando) return;
        const texto = normalizarNome(value);
        if (!texto) return;
        setCriando(true);
        setErro(null);
        try {
            await onCreate(texto);
            setOpen(false);
        } catch (e) {
            // O texto fica no campo: o salvar ainda tenta cadastrar (nunca bloqueia).
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setCriando(false);
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            if (open) { e.stopPropagation(); setOpen(false); }
            return;
        }
        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setAtivo(i => Math.min(i + 1, Math.max(total - 1, 0))); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(i => Math.max(i - 1, 0)); return; }
        if (e.key === 'Enter') {
            // Nunca envia o formulário em volta (no convite de Usuários, enviar = mandar
            // e-mail de verdade): com a lista aberta escolhe a opção ativa; senão, nada.
            e.preventDefault();
            if (!open || total === 0) return;
            if (ativo < resultados.length) escolher(resultados[ativo]);
            else void cadastrar();
        }
    };

    const onBlur = () => {
        setFocado(false);
        // Tab para o próximo campo fecha a lista (verificado na tela em 13/10: ela
        // ficava aberta por cima do formulário). Clicar numa opção não passa por
        // aqui — o painel faz preventDefault no mousedown e o foco fica no input.
        setOpen(false);
        // Texto idêntico a UM item existente (ignorando caixa/acento) vincula sozinho. Com dois
        // ou mais itens de mesmo nome (homônimos, ex.: dois "José da Silva"), não adivinha.
        if (!selectedId && value.trim()) {
            const alvo = chaveBusca(value);
            const iguais = options.filter(o => chaveBusca(o.name) === alvo);
            if (iguais.length === 1 && !getDisabledReason?.(iguais[0])) onSelect(iguais[0]);
        }
    };

    const naoCadastrado = !focado && !selectedId && value.trim() !== '' && !disabled;

    return (
        <div className="relative">
            <input
                ref={inputRef}
                id={id}
                type="text"
                role="combobox"
                aria-expanded={open}
                aria-autocomplete="list"
                aria-activedescendant={open && total > 0 ? idDaOpcao(Math.min(ativo, total - 1)) : undefined}
                aria-label={ariaLabel}
                autoComplete="off"
                value={value}
                disabled={disabled}
                title={disabled ? disabledReason : undefined}
                placeholder={disabled && disabledReason ? disabledReason : placeholder}
                onChange={e => { onTextChange(e.target.value); setOpen(true); setErro(null); }}
                onFocus={() => { setFocado(true); setOpen(true); }}
                onClick={() => setOpen(true)}
                onBlur={onBlur}
                onKeyDown={onKeyDown}
                className={inputClassName}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                {criando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
            </span>
            {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
            {!erro && naoCadastrado && (
                <p className="mt-1 text-xs text-gray-400">
                    {onCreate ? avisoNovo : avisoSemVinculo}
                </p>
            )}

            {open && !disabled && createPortal(
                <div
                    ref={panelRef}
                    role="listbox"
                    style={{ position: 'fixed', top: posicao?.top ?? -9999, left: posicao?.left ?? -9999, width: posicao?.width }}
                    className="bg-white rounded-[10px] border border-gray-200 shadow-lg p-1.5 z-[10000] max-h-64 overflow-y-auto min-w-[200px]"
                    // não roubar o foco do input ao clicar numa opção
                    onMouseDown={e => e.preventDefault()}
                >
                    {resultados.map((o, i) => {
                        const motivoDesligada = getDisabledReason?.(o);
                        const hint = motivoDesligada ?? getHint?.(o);
                        const escolhido = o.id === selectedId;
                        return (
                            <button
                                key={o.id}
                                id={idDaOpcao(i)}
                                type="button"
                                role="option"
                                aria-selected={escolhido}
                                aria-disabled={motivoDesligada ? true : undefined}
                                title={motivoDesligada}
                                onClick={() => escolher(o)}
                                onMouseEnter={() => setAtivo(i)}
                                className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 min-h-9 rounded-[6px] text-sm text-left transition-colors ${
                                    motivoDesligada
                                        ? `text-gray-500 cursor-not-allowed ${i === ativo ? 'bg-gray-100' : ''}`
                                        : i === ativo ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                <span className="min-w-0">
                                    <span className="block truncate font-medium">{o.name}</span>
                                    {hint && <span className={`block truncate text-xs ${motivoDesligada ? 'text-gray-500' : 'text-gray-400'}`}>{hint}</span>}
                                </span>
                                {escolhido && <Check className="w-4 h-4 shrink-0" />}
                            </button>
                        );
                    })}
                    {resultados.length === 0 && !podeCadastrar && (
                        <p className="px-3 py-2 text-sm text-gray-400">
                            {options.length > 0 ? 'Nenhum resultado.'
                                : onCreate ? 'Nada cadastrado ainda — digite para cadastrar.' : vazio}
                        </p>
                    )}
                    {podeCadastrar && (
                        <button
                            id={idDaOpcao(resultados.length)}
                            type="button"
                            onClick={() => void cadastrar()}
                            onMouseEnter={() => setAtivo(resultados.length)}
                            disabled={criando}
                            className={`w-full flex items-center gap-2 px-3 h-9 rounded-[6px] text-sm font-medium text-left text-blue-600 transition-colors ${
                                ativo === resultados.length ? 'bg-blue-50' : 'hover:bg-blue-50'
                            } ${resultados.length > 0 ? 'mt-1 border-t border-gray-100' : ''}`}
                        >
                            <Plus className="w-4 h-4 shrink-0" />
                            <span className="truncate">Cadastrar “{normalizarNome(value)}”</span>
                        </button>
                    )}
                </div>,
                document.body,
            )}
        </div>
    );
}

export default CreatableCombobox;
