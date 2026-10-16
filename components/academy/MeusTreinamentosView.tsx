import React, { useMemo, useState } from 'react';
import { BookOpen, Loader2, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import AcademyPlayerView from './AcademyPlayerView';
import { createAppChannel } from './academyChannel';
import TabsBar from '../ui/TabsBar';
import { usePersistedState } from '../ui/TableUtils';
import { useOrgContext } from '../../hooks/useOrgContext';
import { academyKeys } from '../../lib/queryKeys';
import { academyTraineeService } from '../../services/academyTraineeService';
import MeusTreinamentosCursos from './meus/MeusTreinamentosCursos';
import MeusTreinamentosCatalogo from './meus/MeusTreinamentosCatalogo';
import MeusTreinamentosCertificados from './meus/MeusTreinamentosCertificados';
import MeusTreinamentosHistorico from './meus/MeusTreinamentosHistorico';
import {
    recortarPorOrg, variasOrganizacoes,
    useMinhasMatriculas, useMeuCatalogo, useMeusCertificados, useMeuHistorico, useTenhoFicha,
} from './meus/meusTreinamentosDados';
import type { AcademyTraineeEnrollment } from '../../types/academy';

/**
 * Meus Treinamentos — área PESSOAL do colaborador logado no app.
 *
 * Fica fora da gestão de propósito: quem precisa FAZER treinamento normalmente
 * não tem permissão de gerenciar. Item pessoal na sidebar, sem guarda de
 * módulo, no padrão de "Minhas Tarefas".
 *
 * 16/10/2026 (docs/planos/2026-10-16-treinamentos-fora-do-rh-e-meus-treinamentos.md):
 *   • ganhou as MESMAS quatro abas do Portal de Treinamentos — Meus treinamentos,
 *     Catálogo (com inscrição), Certificados e Histórico — lidas pelas mesmas
 *     RPCs; o colaborador interno vê o que o terceirizado vê no portal;
 *   • até aqui a lista vinha SEMPRE vazia: a consulta antiga pedia um join com
 *     `employees` que o PostgREST recusa (PGRST200) e o erro era engolido.
 *
 * Vocabulário do app (§24 do guia: o kit do portal não vale dentro do app).
 * Assistir aula é TELA (troca in-flow), com o player do app (canal APP).
 */

type Aba = 'treinamentos' | 'catalogo' | 'certificados' | 'historico';

const ABAS: Array<{ id: Aba; label: string }> = [
    { id: 'treinamentos', label: 'Meus treinamentos' },
    { id: 'catalogo',     label: 'Catálogo' },
    { id: 'certificados', label: 'Certificados' },
    { id: 'historico',    label: 'Histórico' },
];

// O <h1> muda com a aba — senão o título mente (§19.1).
const CABECALHO: Record<Aba, { titulo: string; subtitulo: string }> = {
    treinamentos: { titulo: 'Meus treinamentos',      subtitulo: 'Treinamentos atribuídos a você, com progresso, prazo e certificados.' },
    catalogo:     { titulo: 'Catálogo de treinamentos', subtitulo: 'Treinamentos abertos para inscrição. Ao se inscrever, ele passa a aparecer em Meus treinamentos.' },
    certificados: { titulo: 'Meus certificados',      subtitulo: 'Certificados dos treinamentos concluídos, com link público de validação.' },
    historico:    { titulo: 'Histórico e vencimentos', subtitulo: 'Tudo o que foi registrado para você: presencial e EAD, com validade.' },
};

interface Props {
    /** Ignorada: a organização vem do seletor do topo (REGRA #5, `useOrgContext`). */
    orgId?: string | null;
}

const MeusTreinamentosView: React.FC<Props> = () => {
    const qc = useQueryClient();
    const { orgId } = useOrgContext();
    const [abaSalva, setAba] = usePersistedState<string>('meusTreinamentos:aba', 'treinamentos');
    // Aba salva que deixou de existir cai na primeira (o valor persistido sobrevive a mudanças da tela).
    const aba: Aba = ABAS.some(a => a.id === abaSalva) ? (abaSalva as Aba) : 'treinamentos';
    const [aulaAberta, setAulaAberta] = useState<AcademyTraineeEnrollment | null>(null);
    const channel = useMemo(() => createAppChannel(), []);

    const ficha = useTenhoFicha();
    const matriculasQ = useMinhasMatriculas();
    const catalogoQ = useMeuCatalogo();
    const certificadosQ = useMeusCertificados();
    const historicoQ = useMeuHistorico();

    const matriculas = recortarPorOrg(matriculasQ.data ?? [], orgId);
    const catalogo = recortarPorOrg(catalogoQ.data ?? [], orgId);
    const certificados = recortarPorOrg(certificadosQ.data ?? [], orgId);
    const historico = recortarPorOrg(historicoQ.data ?? [], orgId);

    const abrirPorId = async (enrollmentId: string) => {
        const lista = await qc.fetchQuery({
            queryKey: academyKeys.traineeEnrollments(),
            queryFn: () => academyTraineeService.listEnrollments(),
            staleTime: 0,
        });
        const m = lista.find(x => x.id === enrollmentId);
        if (m) { setAba('treinamentos'); setAulaAberta(m); }
    };

    const voltarDaAula = () => {
        setAulaAberta(null);
        // Progresso, certificado e histórico podem ter mudado na sala.
        qc.invalidateQueries({ queryKey: academyKeys.traineeEnrollments() });
        qc.invalidateQueries({ queryKey: academyKeys.traineeCertificates() });
        qc.invalidateQueries({ queryKey: academyKeys.traineeHistory() });
        qc.invalidateQueries({ queryKey: academyKeys.traineeCatalog() });
    };

    // TELA: assistir troca o conteúdo in-flow (seta de voltar + <h1>, sem overlay).
    if (aulaAberta) {
        return (
            <AcademyPlayerView
                enrollmentId={aulaAberta.id}
                titulo={aulaAberta.curso || 'Treinamento'}
                subtitulo={aulaAberta.nr_referencia}
                channel={channel}
                onVoltar={voltarDaAula}
            />
        );
    }

    const cab = CABECALHO[aba];
    const consultaDaAba = { treinamentos: matriculasQ, catalogo: catalogoQ, certificados: certificadosQ, historico: historicoQ }[aba];
    const erro = consultaDaAba.error as Error | null;

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{cab.titulo}</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">{cab.subtitulo}</p>
            </div>

            <div>
                <TabsBar<Aba>
                    tabs={ABAS.map(a => ({
                        ...a,
                        badge: a.id === 'treinamentos' && matriculas.length ? matriculas.length
                            : a.id === 'catalogo' && catalogo.length ? catalogo.length
                            : undefined,
                    }))}
                    value={aba}
                    onChange={setAba}
                />

                {ficha.data === false ? (
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm text-center py-12">
                        <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Seu usuário não está vinculado a um colaborador</h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                            Os treinamentos são atribuídos ao cadastro de colaborador, não ao login.
                            Peça ao RH para abrir sua ficha em Recursos Humanos › Colaboradores e
                            preencher o campo <span className="font-medium text-gray-700">Usuário do sistema</span>.
                        </p>
                    </div>
                ) : consultaDaAba.isLoading ? (
                    <div className="text-center py-12">
                        <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : erro ? (
                    // O defeito que existia aqui era exatamente o erro engolido virando
                    // "Nenhum treinamento atribuído". Erro agora é dito como erro.
                    <div className="bg-white rounded-[10px] border border-rose-100 shadow-sm text-center py-12">
                        <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Não foi possível carregar</h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">{erro.message}</p>
                    </div>
                ) : aba === 'treinamentos' ? (
                    <MeusTreinamentosCursos matriculas={matriculas} mostrarOrganizacao={variasOrganizacoes(matriculas)} onAbrir={setAulaAberta} />
                ) : aba === 'catalogo' ? (
                    <MeusTreinamentosCatalogo cursos={catalogo} mostrarOrganizacao={variasOrganizacoes(catalogo)} onAbrirMatricula={abrirPorId} />
                ) : aba === 'certificados' ? (
                    <MeusTreinamentosCertificados certificados={certificados} mostrarOrganizacao={variasOrganizacoes(certificados)} carregando={false} />
                ) : (
                    <MeusTreinamentosHistorico itens={historico} mostrarOrganizacao={variasOrganizacoes(historico)} carregando={false} />
                )}
            </div>
        </div>
    );
};

export default MeusTreinamentosView;
