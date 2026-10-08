import React from 'react';
import { Search, Loader2, AlertCircle, Users, Check } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { TabsBar } from '../ui/TabsBar';
import type { Organization } from '../../types/users';
import type { DestinatarioSnapshot, DestinatarioTipo } from '../../types/docGen';
import { TIPOS_DESTINATARIO, snapshotDe } from '../../services/docGen/destinatario';
import { listarCandidatos, type CandidatoDestinatario } from '../../services/docGen/resolverContexto';

/**
 * Escolher o destinatário do documento — painel lateral transitório (a mesma
 * exceção de `ClientSelect`/`SupplierSelect`, UI_PATTERNS §4.4): abre, escolhe,
 * fecha. A busca é `useState` de propósito (guia §3.1): reabrir o seletor já
 * filtrado por uma busca antiga esconderia registros sem aviso.
 *
 * Prefeitura, concessionária e órgão público estão em "Fornecedor / órgão
 * público" — decisão do usuário (07/10): vêm de Meus Fornecedores.
 */
interface Props {
    open: boolean;
    onClose: () => void;
    organizationId: string;
    organizations: Organization[];
    atual: DestinatarioSnapshot | null;
    onEscolher: (snap: DestinatarioSnapshot) => void;
}

const INPUT = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
const LABEL = 'text-xs font-semibold text-slate-500';

const MANUAL_VAZIO: Record<string, string> = {
    razao_social: '', nome_fantasia: '', cpf_cnpj: '', logradouro: '', numero: '', complemento: '', bairro: '',
    cidade: '', uf: '', cep: '', contato_nome: '', contato_email: '', contato_telefone: '',
};

export default function SeletorDestinatario({ open, onClose, organizationId, organizations, atual, onEscolher }: Props) {
    const [tipo, setTipo] = React.useState<DestinatarioTipo>(atual?.tipo ?? 'FORNECEDOR');
    const [busca, setBusca] = React.useState('');
    const [candidatos, setCandidatos] = React.useState<CandidatoDestinatario[]>([]);
    const [carregando, setCarregando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [manual, setManual] = React.useState<Record<string, string>>(MANUAL_VAZIO);

    // Reabrir: volta ao tipo do destinatário atual, busca limpa.
    React.useEffect(() => {
        if (!open) return;
        setTipo(atual?.tipo ?? 'FORNECEDOR');
        setBusca('');
        if (atual?.tipo === 'MANUAL') {
            setManual(Object.fromEntries(Object.keys(MANUAL_VAZIO).map(k => [k, String((atual as unknown as Record<string, unknown>)[k] ?? '')])));
        } else {
            setManual(MANUAL_VAZIO);
        }
    }, [open, atual]);

    React.useEffect(() => {
        if (!open || tipo === 'MANUAL') return;
        let vivo = true;
        setCarregando(true);
        setErro(null);
        listarCandidatos(tipo, organizationId, organizations)
            .then(l => { if (vivo) setCandidatos(l); })
            .catch(e => { if (vivo) { setCandidatos([]); setErro(e instanceof Error ? e.message : 'Falha ao carregar a lista.'); } })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [open, tipo, organizationId, organizations]);

    const filtrados = React.useMemo(() => {
        const t = busca.trim().toLowerCase();
        if (!t) return candidatos;
        const soDigitos = t.replace(/\D/g, '');
        return candidatos.filter(c =>
            c.nome.toLowerCase().includes(t)
            || (c.detalhe ?? '').toLowerCase().includes(t)
            || (soDigitos.length >= 3 && (c.documento ?? '').replace(/\D/g, '').includes(soDigitos)));
    }, [candidatos, busca]);

    const escolher = (c: CandidatoDestinatario) => { onEscolher(snapshotDe(tipo, c.linha)); onClose(); };

    const confirmarManual = () => {
        if (!manual.razao_social.trim()) return;
        onEscolher(snapshotDe('MANUAL', manual));
        onClose();
    };

    const setM = (k: string, v: string) => setManual(m => ({ ...m, [k]: v }));
    const campo = (k: string, rotulo: string, opts?: { span?: boolean; placeholder?: string }) => (
        <div className={`space-y-1.5 ${opts?.span ? 'col-span-2' : ''}`}>
            <label className={LABEL}>{rotulo}</label>
            <input value={manual[k] ?? ''} onChange={e => setM(k, e.target.value)} placeholder={opts?.placeholder} className={INPUT} />
        </div>
    );

    return (
        <Sheet open={open} onClose={onClose} size="2xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Destinatário</SheetTitle>
                <SheetDescription>Escolha de um cadastro ou digite um destinatário só para este documento.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                <TabsBar<DestinatarioTipo>
                    bare
                    tabs={TIPOS_DESTINATARIO.map(t => ({ id: t.id, label: t.label }))}
                    value={tipo}
                    onChange={t => { setTipo(t); setBusca(''); }}
                />
                <p className="text-xs text-gray-400">{TIPOS_DESTINATARIO.find(t => t.id === tipo)?.dica}</p>

                {tipo === 'MANUAL' ? (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        {campo('razao_social', 'Razão social / nome *', { span: true, placeholder: 'Ex.: Companhia Energética de Minas Gerais' })}
                        {campo('nome_fantasia', 'Nome fantasia')}
                        {campo('cpf_cnpj', 'CPF / CNPJ')}
                        {campo('logradouro', 'Logradouro')}
                        {campo('numero', 'Número')}
                        {campo('complemento', 'Complemento')}
                        {campo('bairro', 'Bairro')}
                        {campo('cidade', 'Cidade')}
                        {campo('uf', 'UF')}
                        {campo('cep', 'CEP')}
                        {campo('contato_nome', 'A/C (contato ou setor)')}
                        {campo('contato_email', 'E-mail')}
                        {campo('contato_telefone', 'Telefone')}
                    </div>
                ) : (
                    <>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input autoFocus value={busca} onChange={e => setBusca(e.target.value)}
                                placeholder="Buscar por nome, documento ou cidade..."
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
                        </div>
                        {erro && (
                            <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                            </div>
                        )}
                        {carregando ? (
                            <div className="text-center py-12 text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /><p className="text-sm">Carregando…</p></div>
                        ) : filtrados.length === 0 ? (
                            <div className="text-center py-12">
                                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-gray-900 mb-2">{candidatos.length ? 'Nada com essa busca' : 'Nenhum cadastro deste tipo'}</h3>
                                <p className="text-sm text-gray-500">
                                    {tipo === 'FORNECEDOR' && !candidatos.length
                                        ? 'Cadastre a prefeitura ou o órgão em Minha Organização › Fornecedores, ou use "Destinatário manual".'
                                        : 'Ajuste a busca ou use "Destinatário manual".'}
                                </p>
                            </div>
                        ) : (
                            /* §6.9 — tabela dentro de painel lateral: px-3/px-4. */
                            <div className="overflow-x-auto rounded-[10px] border border-gray-100 max-h-[60vh] overflow-y-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            <th className="px-4 py-2 border-r border-gray-100">Nome</th>
                                            <th className="px-3 py-2 border-r border-gray-100">CPF / CNPJ</th>
                                            <th className="px-3 py-2">Detalhe</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {filtrados.map(c => {
                                            const escolhido = atual && atual.tipo === tipo && atual.id === c.id;
                                            return (
                                                <tr key={c.id} onClick={() => escolher(c)}
                                                    className={`hover:bg-blue-50/50 transition-colors cursor-pointer ${escolhido ? 'bg-blue-50/60' : ''}`}>
                                                    <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">
                                                        <span className="flex items-center gap-1.5 min-w-0">
                                                            {escolhido && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                                                            <span className="block truncate" title={c.nome}>{c.nome}</span>
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 whitespace-nowrap">{c.documento || '—'}</td>
                                                    <td className="px-3 py-2.5 text-sm font-normal text-gray-600"><span className="block truncate" title={c.detalhe ?? ''}>{c.detalhe || '—'}</span></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </SheetPanel>
            {tipo === 'MANUAL' && (
                <SheetFooter>
                    <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                    <button type="button" onClick={confirmarManual} disabled={!manual.razao_social.trim()}
                        title={!manual.razao_social.trim() ? 'Informe ao menos a razão social ou o nome' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                        Usar este destinatário
                    </button>
                </SheetFooter>
            )}
        </Sheet>
    );
}
