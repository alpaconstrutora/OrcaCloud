import React from 'react';
import { CalendarDays, Plus, Search, Trash2, Users } from 'lucide-react';
import type { ItemControlado } from '../../types/qualidadeSiac';
import { qualidadeSiacService } from '../../services/qualidadeSiacService';
import { laborService, type Employee } from '../../services/laborService';
import { errorMessage } from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store/useStore';
import { useConfirm } from '../ui/confirm';
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetTitle } from '../ui/sheet';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { empreiteiraDaFicha } from '../../utils/qualidadeSiac';
import { hojeLocalISO } from '../../utils/periodoControladoria';

/**
 * Registrar treinamento em obra — módulo Qualidade (SiAC), fase 1
 * (docs/planos/2026-11-25-qualidade-siac-pbqph.md, "Telas (rascunho)", seção Treinados).
 *
 * Aberto pelo botão "Registrar treinamento em obra" do Sheet do item. Grava, numa transação só
 * (RPC `quality_registrar_treinamento_em_obra`), um registro do curso do item para cada presente:
 * colaboradores da ficha do RH (próprios e de empreiteira) e pessoa de empreiteira SEM ficha — a RPC
 * cria a ficha dela (ou reaproveita a do mesmo CPF).
 *
 * Organização (REGRA #5): a do PRÓPRIO item (`item.organization_id`), nunca perguntada. O curso,
 * as pessoas e as obras do campo Local são todos dela. Ficha disponibilizada por outra organização
 * aparece desligada com o motivo: o banco só grava em `employees` da organização dona.
 *
 * Criar fecha o Sheet (§25): `onSaved(n)` avisa o módulo (toast + recarga), e o próprio Sheet fecha.
 * Erro do banco sobe no toast, com a mensagem dele, e o Sheet fica aberto.
 *
 * A busca de pessoas é `useState` de propósito (§3.1): filtra a lista de ESCOLHA deste formulário,
 * não a lista da tela — persistida, reabriria escondendo gente sem aviso.
 */
interface Props {
    open: boolean;
    item: ItemControlado;
    onClose(): void;
    /** Quantos registros a RPC gravou. O módulo avisa e recarrega; quem fecha é o Sheet. */
    onSaved(n: number): void;
}

const ROTULO = 'block text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-700 disabled:cursor-not-allowed transition-all';
const COM_ERRO = 'border-red-300 focus:border-red-500 focus:ring-red-500/20';
const BOTAO_PRIMARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 shrink-0';
const BOTAO_SECUNDARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-white text-gray-700 border border-gray-200 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0';
const BOTAO_VOLTAR = 'h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]';
const CARTAO = 'bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4';

const MOTIVO_SEM_PRESENTES = 'Marque ao menos uma pessoa presente.';
const MOTIVO_SEM_CURSO = 'O item não tem curso vinculado: escolha o curso no Sheet do item.';
const MOTIVO_GRAVANDO = 'Aguarde: o registro está sendo gravado.';
const MOTIVO_OUTRA_ORG = 'Ficha disponibilizada por outra organização: registre o treinamento na organização dona.';

/** Ficha de empreiteira: externa ao Academy ou contrato de empreiteiro (`academy_externo` não está no tipo). */
const ehEmpreiteira = (e: Employee) =>
    (e as Employee & { academy_externo?: boolean }).academy_externo === true || e.contract_type === 'EMPREITEIRO';

interface Terceiro { chave: number; nome: string; cpf: string; empreiteira: string }
interface ErrosTerceiro { nome?: string; cpf?: string }

const ErroDoCampo: React.FC<{ id: string; erro?: string }> = ({ id, erro }) =>
    erro ? <p id={id} className="text-xs text-red-600 mt-1">{erro}</p> : null;

export const RegistrarTreinamentoSheet: React.FC<Props> = (props) => {
    const { showToast, localToast } = useToast();
    return (
        <>
            {props.open && <SheetDoRegistro key={props.item.id} {...props} showToast={showToast} />}
            {/* §13 — com o ToastProvider na raiz `localToast` vem null; sem provider (teste) aparece aqui. */}
            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {localToast.message}
                </div>
            )}
        </>
    );
};

const SheetDoRegistro: React.FC<Props & { showToast: (m: string, t?: 'success' | 'error') => void }> = ({
    item, onClose, onSaved, showToast,
}) => {
    const confirm = useConfirm();
    const org = item.organization_id;
    const organizations = useStore(s => s.organizations);
    const projects = useStore(s => s.projects);
    const nomeOrg = organizations.find(o => o.id === org)?.name ?? 'organização';
    // `useStore().projects` já é só OBRA e sem projeto de sistema (REGRAS #2/#3): só recorta a organização.
    const obras = React.useMemo(
        () => projects.filter(p => p.id && (p.organization_id ?? p.settings?.organizationId) === org)
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
        [projects, org],
    );

    const [hoje] = React.useState(() => hojeLocalISO());
    const [data, setData] = React.useState(hoje);
    const [instrutor, setInstrutor] = React.useState('');
    const [obraId, setObraId] = React.useState('');
    const [marcados, setMarcados] = React.useState<string[]>([]);
    const [terceiros, setTerceiros] = React.useState<Terceiro[]>([]);
    const proxima = React.useRef(1);
    const [busca, setBusca] = React.useState('');
    const [erroData, setErroData] = React.useState<string | undefined>();
    const [errosTerceiros, setErrosTerceiros] = React.useState<Record<number, ErrosTerceiro>>({});
    const [gravando, setGravando] = React.useState(false);

    // ── Pessoas: ativas da organização do item (a lista já traz as fichas de empreiteira) ──
    const [pessoas, setPessoas] = React.useState<Employee[] | null>(null);
    const [erroPessoas, setErroPessoas] = React.useState<string | null>(null);
    React.useEffect(() => {
        let vivo = true;
        laborService.listEmployees(org)
            .then(l => { if (vivo) setPessoas(l.filter(e => e.status === 'ATIVO')); })
            .catch(e => { if (vivo) { setPessoas([]); setErroPessoas(errorMessage(e, 'erro desconhecido')); } });
        return () => { vivo = false; };
    }, [org]);

    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    const visiveis = (pessoas ?? []).filter(e => !termo
        || e.name.toLocaleLowerCase('pt-BR').includes(termo)
        || empreiteiraDaFicha(e).toLocaleLowerCase('pt-BR').includes(termo));

    const dirty = data !== hoje || instrutor !== '' || obraId !== '' || marcados.length > 0 || terceiros.length > 0;
    const presentes = marcados.length + terceiros.length;
    const motivo = !item.training_course_id ? MOTIVO_SEM_CURSO
        : gravando ? MOTIVO_GRAVANDO
        : presentes === 0 ? MOTIVO_SEM_PRESENTES
        : undefined;

    const alternar = (id: string) => setMarcados(m => (m.includes(id) ? m.filter(x => x !== id) : [...m, id]));
    const incluirTerceiro = () => {
        const chave = proxima.current++;
        setTerceiros(t => [...t, { chave, nome: '', cpf: '', empreiteira: '' }]);
        // o foco vai para o nome da pessoa nova (o campo nasce no próximo render)
        setTimeout(() => document.getElementById(`rt-t${chave}-nome`)?.focus(), 0);
    };
    const mudarTerceiro = (chave: number, campo: keyof Omit<Terceiro, 'chave'>, valor: string) => {
        setTerceiros(t => t.map(x => (x.chave === chave ? { ...x, [campo]: valor } : x)));
        if (campo === 'nome' || campo === 'cpf') {
            setErrosTerceiros(e => (e[chave]?.[campo] ? { ...e, [chave]: { ...e[chave], [campo]: undefined } } : e));
        }
    };
    const removerTerceiro = (chave: number) => {
        setTerceiros(t => t.filter(x => x.chave !== chave));
        setErrosTerceiros(e => { const resto = { ...e }; delete resto[chave]; return resto; });
    };

    const fechar = async () => {
        if (dirty && !(await confirm({
            title: 'Sair sem salvar?',
            message: 'Há alterações não salvas. Se sair agora, elas serão perdidas.',
            variant: 'warning', confirmLabel: 'Sair e descartar', cancelLabel: 'Continuar editando',
        }))) return;
        onClose();
    };

    /** Mesmas regras da RPC, no campo: nome obrigatório; CPF vazio ou com 11 dígitos. */
    const validar = (): boolean => {
        const eData = data ? undefined : 'Informe a data do treinamento.';
        const eTerceiros: Record<number, ErrosTerceiro> = {};
        let primeiro: string | null = eData ? 'rt-data' : null;
        for (const t of terceiros) {
            const e: ErrosTerceiro = {};
            if (!t.nome.trim()) e.nome = 'Informe o nome da pessoa.';
            const digitos = t.cpf.replace(/\D/g, '');
            if (t.cpf.trim() && digitos.length !== 11) e.cpf = 'CPF inválido: informe os 11 dígitos.';
            if (e.nome || e.cpf) {
                eTerceiros[t.chave] = e;
                primeiro ??= `rt-t${t.chave}-${e.nome ? 'nome' : 'cpf'}`;
            }
        }
        setErroData(eData);
        setErrosTerceiros(eTerceiros);
        if (primeiro) document.getElementById(primeiro)?.focus();
        return primeiro === null;
    };

    const registrar = async () => {
        if (motivo || !item.training_course_id || !validar()) return;
        setGravando(true);
        try {
            const n = await qualidadeSiacService.registrarTreinamentoEmObra({
                organizationId: org,
                courseId: item.training_course_id,
                data,
                instrutor: instrutor.trim(),
                local: obras.find(o => o.id === obraId)?.name ?? '',
                employeeIds: marcados,
                novosTerceiros: terceiros.map(t => ({
                    nome: t.nome.trim(),
                    ...(t.cpf.trim() ? { cpf: t.cpf.trim() } : {}),
                    ...(t.empreiteira.trim() ? { empreiteira: t.empreiteira.trim() } : {}),
                })),
            });
            onSaved(n);
            onClose();
        } catch (e) {
            showToast(`Não foi possível registrar o treinamento: ${errorMessage(e, 'erro desconhecido')}`, 'error');
        } finally {
            setGravando(false);
        }
    };

    const resumo = [
        marcados.length > 0 ? `${marcados.length} ${marcados.length === 1 ? 'colaborador marcado' : 'colaboradores marcados'}` : null,
        terceiros.length > 0 ? `${terceiros.length} sem cadastro` : null,
    ].filter(Boolean).join(' · ');

    return (
        <Sheet open onClose={onClose} size="2xl" dirty={dirty} zIndex={60}>
            <SheetHeader onClose={() => void fechar()}>
                <SheetTitle>Registrar treinamento em obra</SheetTitle>
                <SheetDescription>{item.nome} · {nomeOrg}</SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-5">
                <fieldset disabled={gravando} className="min-w-0 space-y-5">
                    {/* ── Quando, quem deu e onde ── */}
                    <div className={CARTAO}>
                        <SecaoTitulo icon={CalendarDays} titulo="Treinamento" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="rt-data">Data</label>
                                <input id="rt-data" type="date" className={`${CAMPO} ${erroData ? COM_ERRO : ''}`} value={data}
                                    aria-invalid={!!erroData} aria-describedby={erroData ? 'rt-data-erro' : undefined}
                                    onChange={e => { setData(e.target.value); setErroData(undefined); }} />
                                <ErroDoCampo id="rt-data-erro" erro={erroData} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="rt-instrutor">Instrutor</label>
                                <input id="rt-instrutor" className={CAMPO} value={instrutor} placeholder="Quem deu o treinamento"
                                    onChange={e => setInstrutor(e.target.value)} />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                                <label className={ROTULO} htmlFor="rt-local">Local (obra)</label>
                                <select id="rt-local" className={CAMPO} value={obraId} onChange={e => setObraId(e.target.value)}>
                                    <option value="">Sem obra informada</option>
                                    {obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                                <p className="text-xs text-gray-600">Obras de {nomeOrg}. O registro guarda o nome da obra.</p>
                            </div>
                        </div>
                    </div>

                    {/* ── Presentes ── */}
                    <div className={CARTAO}>
                        <SecaoTitulo icon={Users} titulo="Presentes" />
                        <p className="text-xs text-gray-600">
                            Colaboradores próprios e pessoal de empreiteira com ficha no RH. {resumo || 'Ninguém marcado ainda.'}
                        </p>
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                            <input type="search" aria-label="Buscar pessoa" className={`${CAMPO} pl-9`} value={busca}
                                placeholder="Buscar por nome ou empreiteira" onChange={e => setBusca(e.target.value)} />
                        </div>
                        {erroPessoas && <p className="text-xs text-red-600">Não foi possível listar as pessoas do RH: {erroPessoas}</p>}
                        {pessoas === null ? (
                            <p className="text-sm text-gray-700">Carregando colaboradores…</p>
                        ) : visiveis.length === 0 ? (
                            <p className="text-sm text-gray-700">
                                {termo ? 'Ninguém com esse nome.' : 'Nenhum colaborador ativo nesta organização. Inclua abaixo a pessoa de empreiteira sem cadastro.'}
                            </p>
                        ) : (
                            <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-[8px]">
                                {visiveis.map(e => {
                                    const deOutraOrg = e.org_id !== org;
                                    const emp = ehEmpreiteira(e);
                                    const nomeEmp = empreiteiraDaFicha(e);
                                    return (
                                        <li key={e.id}>
                                            <label title={deOutraOrg ? MOTIVO_OUTRA_ORG : undefined}
                                                className={`flex items-center gap-3 px-3 py-2 text-sm ${deOutraOrg ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}>
                                                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500/20"
                                                    checked={marcados.includes(e.id)} disabled={deOutraOrg} onChange={() => alternar(e.id)} />
                                                <span className="min-w-0 flex-1 truncate text-gray-900">{e.name}</span>
                                                <span className="shrink-0 text-gray-700">
                                                    {deOutraOrg ? 'De outra organização' : emp ? `Empreiteira${nomeEmp ? ` · ${nomeEmp}` : ''}` : (e.role || 'Próprio')}
                                                </span>
                                            </label>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {/* ── Pessoa de empreiteira sem ficha: o botão fica ACIMA das linhas (§6.14) ── */}
                    <div className={CARTAO}>
                        <SecaoTitulo icon={Users} titulo="Pessoal de empreiteira sem cadastro" acoes={(
                            <button type="button" className={BOTAO_SECUNDARIO} onClick={incluirTerceiro}>
                                <Plus className="w-[15px] h-[15px]" aria-hidden="true" /> Pessoa de empreiteira sem cadastro
                            </button>
                        )} />
                        <p className="text-xs text-gray-600">
                            Quem ainda não tem ficha no RH. Ao gravar, a ficha é criada como pessoal de empreiteira; com CPF já
                            cadastrado nesta organização, o registro vai para a ficha existente.
                        </p>
                        {terceiros.length === 0 ? (
                            <p className="text-sm text-gray-700">Nenhuma pessoa sem cadastro incluída.</p>
                        ) : (
                            <ul className="space-y-4">
                                {terceiros.map((t, i) => {
                                    const e = errosTerceiros[t.chave] ?? {};
                                    const id = (c: string) => `rt-t${t.chave}-${c}`;
                                    return (
                                        <li key={t.chave} className="border border-gray-100 rounded-[8px] p-4 space-y-4">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-medium text-gray-900">Pessoa {i + 1}</span>
                                                <button type="button" className="p-1.5 rounded-[6px] text-gray-500 hover:bg-gray-100 hover:text-red-600"
                                                    aria-label={`Remover a pessoa ${i + 1}`} title={`Remover a pessoa ${i + 1}`}
                                                    onClick={() => removerTerceiro(t.chave)}>
                                                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                                                </button>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className={ROTULO} htmlFor={id('nome')}>Nome</label>
                                                <input id={id('nome')} className={`${CAMPO} ${e.nome ? COM_ERRO : ''}`} value={t.nome}
                                                    aria-invalid={!!e.nome} aria-describedby={e.nome ? id('nome-erro') : undefined}
                                                    onChange={ev => mudarTerceiro(t.chave, 'nome', ev.target.value)} />
                                                <ErroDoCampo id={id('nome-erro')} erro={e.nome} />
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                                <div className="space-y-1.5">
                                                    <label className={ROTULO} htmlFor={id('cpf')}>CPF</label>
                                                    <input id={id('cpf')} className={`${CAMPO} ${e.cpf ? COM_ERRO : ''}`} value={t.cpf}
                                                        inputMode="numeric" placeholder="Opcional — 000.000.000-00"
                                                        aria-invalid={!!e.cpf} aria-describedby={e.cpf ? id('cpf-erro') : undefined}
                                                        onChange={ev => mudarTerceiro(t.chave, 'cpf', ev.target.value)} />
                                                    <ErroDoCampo id={id('cpf-erro')} erro={e.cpf} />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className={ROTULO} htmlFor={id('empreiteira')}>Empreiteira</label>
                                                    <input id={id('empreiteira')} className={CAMPO} value={t.empreiteira} placeholder="Opcional"
                                                        onChange={ev => mudarTerceiro(t.chave, 'empreiteira', ev.target.value)} />
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </fieldset>
            </SheetPanel>

            <SheetFooter>
                {/* O motivo também fica escrito: nem todo navegador mostra a dica de botão desligado. */}
                {motivo && <span className="mr-auto text-xs text-gray-700">{motivo}</span>}
                <button type="button" onClick={() => void fechar()} className={BOTAO_VOLTAR}>Cancelar</button>
                <button type="button" className={BOTAO_PRIMARIO} disabled={motivo !== undefined} title={motivo}
                    onClick={() => void registrar()}>
                    {gravando ? 'Gravando…' : 'Registrar treinamento'}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default RegistrarTreinamentoSheet;
