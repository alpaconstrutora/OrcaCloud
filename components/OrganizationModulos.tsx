// components/OrganizationModulos.tsx
//
// Ficha da organização › Módulos (27/11/2026, docs/planos/2026-11-27-modulos-por-organizacao.md).
//
// Pedido: "quando usuário estiver acessando o opura pela organização de condomínio, os
// módulos engenharia não devem estar disponíveis para ela … hoje isso pode ser feito por
// usuário … gostaria de fazer o mesmo em nível de organização."
//
// Um interruptor por módulo do menu. Desligado = some do menu, da Central e da busca, e a
// tela não abre, para TODOS que entram nesta organização pelo topo (admin e acesso total
// inclusive). A regra mora em utils/modulosPermitidos.ts; aqui só se edita o que ela lê.
// Salvar não fecha a ficha (§25); sair com pendência pergunta (OrganizationDetail).
import React, { useEffect, useMemo, useState } from 'react';
import { Briefcase, Building2, DollarSign, Gavel, HardHat, Loader2, Save, type LucideIcon } from 'lucide-react';
import type { Organization } from '../types';
import { organizationService } from '../services/organizationService';
import { useStore } from '../store/useStore';
import { temAcessoTotal } from '../lib/acessoTotal';
import { MODULOS_DA_ORGANIZACAO, type ChaveModuloDaOrganizacao } from '../utils/modulosPermitidos';
import { SecaoTitulo } from './ui/SecaoTitulo';
import TableSwitch from './ui/TableSwitch';
import SaveStatus from './ui/SaveStatus';

type Estado = Record<ChaveModuloDaOrganizacao, boolean>;

const ICONE_DO_GRUPO: Record<string, LucideIcon> = {
    Gestão: Gavel, Operação: HardHat, Financeiro: DollarSign, Comercial: Building2, Especialidades: Briefcase,
};

const GRUPOS = [...new Set(MODULOS_DA_ORGANIZACAO.map(m => m.grupo))];
const TITULO = Object.fromEntries(MODULOS_DA_ORGANIZACAO.map(m => [m.chave, m.titulo])) as Record<ChaveModuloDaOrganizacao, string>;

/** O que está gravado: chave ausente = ligado. */
export function estadoGravado(org: Pick<Organization, 'settings'>): Estado {
    const desligados = org.settings?.modulos_da_organizacao ?? {};
    return Object.fromEntries(MODULOS_DA_ORGANIZACAO.map(m => [m.chave, desligados[m.chave] !== false])) as Estado;
}

interface Props {
    organization: Organization;
    /** Avisa o pai para ele guardar a saída da ficha (§25). */
    onDirtyChange?: (dirty: boolean) => void;
}

const OrganizationModulos: React.FC<Props> = ({ organization, onDirtyChange }) => {
    const email = useStore(s => s.session)?.user?.email;
    const fetchOrganizations = useStore(s => s.fetchOrganizations);

    const gravado = useMemo(() => estadoGravado(organization), [organization]);
    const [estado, setEstado] = useState<Estado>(gravado);
    const [salvando, setSalvando] = useState(false);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [erro, setErro] = useState<string | null>(null);

    const dirty = MODULOS_DA_ORGANIZACAO.some(m => estado[m.chave] !== gravado[m.chave]);
    useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

    // Outra organização na ficha: recomeça do registro dela. A mesma org recarregada
    // (depois de um save) só substitui o estado se não houver nada pendente.
    useEffect(() => { setEstado(gravado); setErro(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [organization.id]);
    useEffect(() => { if (!dirty) setEstado(gravado); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [gravado]);

    // A RLS de `organizations` só deixa owner/admin gravar; superadmin é owner em toda org.
    const papel = organization.members?.find(m => m.email?.toLowerCase() === email?.toLowerCase())?.role;
    const podeEditar = papel === 'owner' || papel === 'admin' || temAcessoTotal(email);
    const motivoSoLeitura = 'Só o proprietário ou um administrador desta organização altera os módulos.';

    const salvar = async () => {
        if (!podeEditar || !dirty || salvando) return;
        setSalvando(true);
        setErro(null);
        try {
            await organizationService.salvarModulosDaOrganizacao(organization.id, estado);
            await fetchOrganizations();
            setSavedAt(Date.now());
        } catch (e: unknown) {
            setErro((e as Error).message || 'Não foi possível salvar os módulos.');
        } finally {
            setSalvando(false);
        }
    };

    const desligados = MODULOS_DA_ORGANIZACAO.filter(m => !estado[m.chave] || (m.dependeDe && !estado[m.dependeDe])).length;

    return (
        <div className="space-y-4">
            <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
                <p className="text-sm text-gray-500">
                    Módulo desligado some do menu, da Central e da busca, e a tela não abre, para todos que entram
                    nesta organização, administradores inclusive. Nenhum dado é apagado: ligar de novo devolve o acesso.
                    Dentro de um módulo ligado, cada usuário continua com as permissões dele (Usuários › Permissões).
                </p>

                {GRUPOS.map(grupo => {
                    const modulos = MODULOS_DA_ORGANIZACAO.filter(m => m.grupo === grupo);
                    const ligados = modulos.filter(m => estado[m.chave] && !(m.dependeDe && !estado[m.dependeDe])).length;
                    return (
                        <div key={grupo} className="space-y-4">
                            <SecaoTitulo icon={ICONE_DO_GRUPO[grupo] ?? Briefcase} titulo={grupo} resumo={`${ligados} de ${modulos.length} ligados`} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                {modulos.map(m => {
                                    const paiDesligado = !!m.dependeDe && !estado[m.dependeDe];
                                    const ligado = estado[m.chave] && !paiDesligado;
                                    const idMotivo = `modulo-${m.chave}-motivo`;
                                    const motivo = !podeEditar
                                        ? motivoSoLeitura
                                        : paiDesligado ? `Desligado junto com ${TITULO[m.dependeDe!]}. Ligue ${TITULO[m.dependeDe!]} para escolher.` : undefined;
                                    return (
                                        <div key={m.chave} className="flex items-start gap-3">
                                            <div className="pt-0.5">
                                                <TableSwitch
                                                    checked={ligado}
                                                    onChange={() => setEstado(prev => ({ ...prev, [m.chave]: !prev[m.chave] }))}
                                                    disabled={!podeEditar || paiDesligado}
                                                    title={motivo}
                                                    ariaLabel={m.titulo}
                                                    ariaDescribedBy={idMotivo}
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900">{m.titulo}</p>
                                                <p id={idMotivo} className="text-xs text-gray-500">
                                                    {paiDesligado ? `Desligado junto com ${TITULO[m.dependeDe!]}.` : m.descricao}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Rodapé §25/§30 — o mesmo da aba Organização; salvar não fecha a ficha */}
            <div className="flex items-center justify-end gap-4">
                <SaveStatus dirty={dirty} savedAt={savedAt} className="mr-auto" />
                {erro && <span role="alert" className="text-sm text-red-600">{erro}</span>}
                <span className="text-xs text-gray-500">{desligados ? `${desligados} desligado${desligados > 1 ? 's' : ''}` : 'Todos ligados'}</span>
                <button
                    type="button"
                    onClick={salvar}
                    disabled={!podeEditar || salvando || !dirty}
                    title={!podeEditar ? motivoSoLeitura : !dirty ? 'Nada a salvar: nenhuma alteração desde o último save.' : undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                    {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Save className="w-[15px] h-[15px]" />}
                    Salvar módulos
                </button>
            </div>
        </div>
    );
};

export default OrganizationModulos;
