import React, { useState } from 'react';
import { Award, CheckCircle2, Copy, Download, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { academyTraineeService } from '../../../services/academyTraineeService';
import { academyKeys } from '../../../lib/queryKeys';
import { STALE } from '../../../lib/queryClient';
import { PortalCard, PortalEmpty, PortalLoading, Td, Th } from '../../portal/PortalKit';
import { avisarAcaoDoPortal } from '../../../utils/portalEventos';
import { fmtData, fmtDataHora, ghostBtn, SectionTitle, softBtn, VIGENCIA_LABEL, vigenciaDe } from './traineeKit';
import type { AcademyTraineeCertificate } from '../../../types/academy';

/**
 * Certificados — os emitidos pela Academia para as fichas do treinando.
 *
 * O PDF é gerado pelo app da empresa (academyCertificadoService) e guardado no
 * bucket; aqui só se assina o arquivo existente pela Edge Function. Certificado
 * sem PDF ainda mostra número e link de validação (o QR aponta para a rota
 * pública /publico/validar-certificado/:codigo).
 */

interface Props {
    mostrarOrganizacao: boolean;
    notify: (msg: string, tipo?: 'success' | 'error') => void;
}

const situacao = (c: AcademyTraineeCertificate) => {
    if (c.revogado_em) return { label: 'Revogado', cor: 'text-rose-700' };
    return VIGENCIA_LABEL[vigenciaDe(c.data_validade)];
};

const TraineeCertificatesTab: React.FC<Props> = ({ mostrarOrganizacao, notify }) => {
    const [baixando, setBaixando] = useState<string | null>(null);
    const [copiado, setCopiado] = useState<string | null>(null);

    const { data: certificados = [], isLoading, error } = useQuery({
        queryKey: academyKeys.traineeCertificates(),
        queryFn: () => academyTraineeService.listCertificates(),
        staleTime: STALE.normal,
    });

    const baixar = async (c: AcademyTraineeCertificate) => {
        setBaixando(c.id);
        try {
            const url = await academyTraineeService.getMediaUrl({ certificateId: c.id });
            window.open(url, '_blank', 'noopener');
            avisarAcaoDoPortal('baixou-certificado');
        } catch (e: any) {
            notify(e?.message || 'Não foi possível abrir o certificado.', 'error');
        } finally {
            setBaixando(null);
        }
    };

    const copiarValidacao = async (c: AcademyTraineeCertificate) => {
        const url = `${window.location.origin}/publico/validar-certificado/${c.codigo_validacao}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopiado(c.id);
            setTimeout(() => setCopiado(null), 2500);
        } catch {
            notify(url, 'error');
        }
    };

    return (
        <div className="space-y-5">
            <SectionTitle title="Certificados" subtitle="Certificados emitidos nos treinamentos que você concluiu, com link público de validação." />

            <PortalCard className="overflow-hidden" data-tour="certificados-lista">
                {isLoading ? (
                    <PortalLoading label="Carregando certificados..." />
                ) : error ? (
                    <PortalEmpty icon={<Award className="w-9 h-9" />} title="Não foi possível carregar os certificados" subtitle={(error as Error)?.message} />
                ) : certificados.length === 0 ? (
                    <PortalEmpty
                        icon={<Award className="w-9 h-9" />}
                        title="Nenhum certificado emitido ainda"
                        subtitle="Ao concluir um treinamento com conteúdo EAD, o certificado aparece aqui."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-[#ECECEF]">
                                <tr>
                                    <Th>Número</Th>
                                    <Th>Treinamento</Th>
                                    {mostrarOrganizacao && <Th>Organização</Th>}
                                    <Th>Emitido em</Th>
                                    <Th>Validade</Th>
                                    <Th>Situação</Th>
                                    <Th className="text-right">Ações</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#ECECEF]">
                                {certificados.map(c => {
                                    const s = situacao(c);
                                    return (
                                        <tr key={c.id} className="hover:bg-[#FAFAFB]">
                                            <Td className="text-[#1F2430] whitespace-nowrap">{c.numero}</Td>
                                            <Td>
                                                <p className="text-[#1F2430]">{c.curso}</p>
                                                <p className="text-xs text-gray-400">
                                                    {c.nr_referencia ? `${c.nr_referencia} · ` : ''}v{c.versao ?? 1}
                                                    {c.carga_horaria ? ` · ${c.carga_horaria}h` : ''}
                                                </p>
                                            </Td>
                                            {mostrarOrganizacao && <Td>{c.org_nome}</Td>}
                                            <Td className="whitespace-nowrap">{fmtDataHora(c.emitido_em)}</Td>
                                            <Td className="whitespace-nowrap">{c.data_validade ? fmtData(c.data_validade) : 'Sem validade'}</Td>
                                            <Td><span className={s.cor}>{s.label}</span></Td>
                                            <Td className="text-right whitespace-nowrap">
                                                <div className="inline-flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => baixar(c)}
                                                        disabled={!c.tem_pdf || baixando === c.id}
                                                        title={c.tem_pdf ? 'Baixar o PDF' : 'O PDF ainda não foi gerado pela empresa'}
                                                        className={softBtn + ' h-8 px-2.5'}
                                                    >
                                                        {baixando === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                                        PDF
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => copiarValidacao(c)}
                                                        title="Copiar o link público de validação"
                                                        className={ghostBtn + ' h-8 px-2.5'}
                                                    >
                                                        {copiado === c.id ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                                        {copiado === c.id ? 'Copiado' : 'Validação'}
                                                    </button>
                                                </div>
                                            </Td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </PortalCard>
        </div>
    );
};

export default TraineeCertificatesTab;
