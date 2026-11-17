/**
 * Diretoria (ÒPURA CEO) — formulário de determinação, o mesmo nas três visões e na gaveta
 * "Virar determinação". Plano: docs/planos/2026-11-17-opura-ceo.md (decisão 7).
 *
 * Organização (REGRA #5): quem abre decide e passa em `orgId`.
 *  - vinda de uma exceção: a organização DO GRUPO (não se pergunta);
 *  - criada à mão com organização no topo: a do topo (não se pergunta);
 *  - criada à mão em "Todas": `orgId` null — a casca pergunta ao gravar (`useOrgWriteTarget`,
 *    modo `single`: determinação é de uma organização por natureza).
 * O responsável sai das pessoas da organização (em "Todas", de todas; a casca confere se a
 * pessoa é membro da organização escolhida antes de gravar).
 *
 * Malha §30: rótulo→campo 6px, campos 16px, campos curtos (responsável, prazo) lado a lado.
 */
import React from 'react';
import { Gavel } from 'lucide-react';
import { nomeDe } from '../../utils/diretoria';
import { MOTIVO_SEM_EDICAO_DIRETORIA } from '../../utils/permissaoDiretoria';
import { useDiretoria } from './DiretoriaContexto';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, COM_ERRO, ROTULO, somarDias } from './diretoriaUi';

export interface InicialDeterminacao {
    titulo?: string;
    responsavelId?: string | null;
    origem?: string | null;
    excecaoChave?: string | null;
}

interface Props {
    /** Organização da determinação; null = "Todas" (perguntada ao gravar). */
    orgId: string | null;
    inicial?: InicialDeterminacao;
    /** Visão por responsável: a pessoa já está escolhida na árvore. */
    responsavelFixo?: string;
    onGravado?: () => void;
    onCancelar?: () => void;
    /** Rótulo do botão de gravar. */
    rotuloGravar?: string;
}

type Erros = Partial<Record<'titulo' | 'responsavel' | 'prazo', string>>;

export const DeterminacaoForm: React.FC<Props> = ({ orgId, inicial, responsavelFixo, onGravado, onCancelar, rotuloGravar = 'Determinar' }) => {
    const d = useDiretoria();
    const hoje = d.painel.hoje;
    const id = React.useId();
    const [titulo, setTitulo] = React.useState(inicial?.titulo ?? '');
    const [responsavel, setResponsavel] = React.useState(responsavelFixo ?? inicial?.responsavelId ?? '');
    const [prazo, setPrazo] = React.useState(() => somarDias(hoje, 7));
    const [origem, setOrigem] = React.useState(inicial?.origem ?? '');
    const [erros, setErros] = React.useState<Erros>({});
    const [gravando, setGravando] = React.useState(false);

    React.useEffect(() => { if (responsavelFixo) setResponsavel(responsavelFixo); }, [responsavelFixo]);

    const pessoas = React.useMemo(() => d.painel.pessoas
        .filter(p => !orgId || (p.orgs ?? []).includes(orgId))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [d.painel.pessoas, orgId]);

    const podeGravar = orgId ? d.podeEditarOrg(orgId) : d.podeEditarAlguma;
    const motivo = podeGravar ? null : MOTIVO_SEM_EDICAO_DIRETORIA;

    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (motivo) return;
        const novos: Erros = {};
        if (!titulo.trim()) novos.titulo = 'Escreva o que foi decidido.';
        if (!responsavel) novos.responsavel = 'Escolha quem responde.';
        if (!prazo) novos.prazo = 'Escolha o prazo.';
        else if (prazo < hoje) novos.prazo = 'O prazo não pode ser antes de hoje.';
        setErros(novos);
        if (Object.keys(novos).length) {
            const primeiro = Object.keys(novos)[0];
            document.getElementById(`${id}-${primeiro}`)?.focus();
            return;
        }
        setGravando(true);
        try {
            const ok = await d.determinar({
                orgId, titulo: titulo.trim().slice(0, 300), responsavelId: responsavel, prazo,
                origem: origem.trim() || null, excecaoChave: inicial?.excecaoChave ?? null,
            });
            if (!ok) return;
            setTitulo('');
            setOrigem('');
            setPrazo(somarDias(hoje, 7));
            if (!responsavelFixo) setResponsavel('');
            onGravado?.();
        } finally {
            setGravando(false);
        }
    };

    const descricao = (campo: keyof Erros) => (erros[campo] ? `${id}-${campo}-erro` : undefined);

    return (
        <form onSubmit={e => void enviar(e)} noValidate className="space-y-4">
            <div className="space-y-1.5">
                <label htmlFor={`${id}-titulo`} className={ROTULO}>Título</label>
                <input id={`${id}-titulo`} type="text" value={titulo} maxLength={300}
                    onChange={e => { setTitulo(e.target.value); setErros(x => ({ ...x, titulo: undefined })); }}
                    placeholder="O que foi decidido?" aria-invalid={!!erros.titulo} aria-describedby={descricao('titulo')}
                    className={`${CAMPO} ${erros.titulo ? COM_ERRO : ''}`} />
                {erros.titulo && <p id={`${id}-titulo-erro`} className="text-xs text-red-600">{erros.titulo}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div className="space-y-1.5 min-w-0">
                    {responsavelFixo ? (
                        <>
                            <span className={ROTULO}>Responsável</span>
                            <p className="h-9 flex items-center text-sm text-gray-900 truncate">{nomeDe(responsavelFixo, d.painel.pessoas)}</p>
                        </>
                    ) : (
                        <>
                            <label htmlFor={`${id}-responsavel`} className={ROTULO}>Responsável</label>
                            <select id={`${id}-responsavel`} value={responsavel}
                                onChange={e => { setResponsavel(e.target.value); setErros(x => ({ ...x, responsavel: undefined })); }}
                                aria-invalid={!!erros.responsavel} aria-describedby={descricao('responsavel')}
                                className={`${CAMPO} ${erros.responsavel ? COM_ERRO : ''}`}>
                                <option value="">Escolha…</option>
                                {pessoas.map(p => <option key={p.user_id} value={p.user_id}>{p.nome}</option>)}
                            </select>
                            {erros.responsavel && <p id={`${id}-responsavel-erro`} className="text-xs text-red-600">{erros.responsavel}</p>}
                        </>
                    )}
                </div>
                <div className="space-y-1.5 min-w-0">
                    <label htmlFor={`${id}-prazo`} className={ROTULO}>Prazo</label>
                    <input id={`${id}-prazo`} type="date" value={prazo} min={hoje}
                        onChange={e => { setPrazo(e.target.value); setErros(x => ({ ...x, prazo: undefined })); }}
                        aria-invalid={!!erros.prazo} aria-describedby={descricao('prazo')}
                        className={`${CAMPO} ${erros.prazo ? COM_ERRO : ''}`} />
                    {erros.prazo && <p id={`${id}-prazo-erro`} className="text-xs text-red-600">{erros.prazo}</p>}
                </div>
            </div>

            <div className="space-y-1.5">
                <label htmlFor={`${id}-origem`} className={ROTULO}>Origem (opcional)</label>
                <input id={`${id}-origem`} type="text" value={origem} maxLength={200} onChange={e => setOrigem(e.target.value)}
                    placeholder="Ex.: reunião de diretoria de 17/11" className={CAMPO} />
            </div>

            <p className="text-xs text-gray-500">
                {orgId
                    ? <>Organização: <span className="text-gray-700">{d.nomeDaOrg(orgId)}</span>. </>
                    : <>O topo está em "Todas as organizações": a organização é perguntada ao gravar. </>}
                A determinação vira uma tarefa na agenda de quem responde.
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2">
                {onCancelar && <button type="button" onClick={onCancelar} className={BOTAO_SECUNDARIO}>Cancelar</button>}
                <span className="inline-flex" title={motivo ?? undefined}>
                    <button type="submit" disabled={!!motivo || gravando} className={BOTAO_PRIMARIO}>
                        <Gavel className="w-[15px] h-[15px]" aria-hidden="true" /> {gravando ? 'Gravando…' : rotuloGravar}
                    </button>
                </span>
            </div>
        </form>
    );
};

export default DeterminacaoForm;
