import React, { useState } from 'react';
import { Award, AlertTriangle, Check, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { KpiCard } from '../../ui/KpiCard';
import StandardTable, { type StandardTableColumn } from '../../ui/StandardTable';
import ActionIconButton from '../../ui/ActionIconButton';
import { useToast } from '../../../hooks/useToast';
import { academyCertificadoService } from '../../../services/academyCertificadoService';
import { fmtData, fmtDataHora, VIGENCIA_LABEL, vigenciaDe } from '../../training/portal/traineeKit';
import type { AcademyTraineeCertificate } from '../../../types/academy';

/**
 * "Meus Treinamentos" › Certificados.
 *
 * No app o PDF é GERADO quando ainda não existe (`emitirEArmazenar`, o mesmo do
 * player) — diferente do portal, que só assina o arquivo que o app já gerou.
 */

const COLUMNS: StandardTableColumn[] = [
    { key: 'numero',   label: 'Número',      sortable: true, width: 150 },
    { key: 'curso',    label: 'Treinamento', sortable: true, width: 260 },
    { key: 'org',      label: 'Organização', sortable: true, width: 200 },
    { key: 'emitido',  label: 'Emitido em',  sortable: true, width: 150 },
    { key: 'validade', label: 'Validade',    sortable: true, width: 130 },
    { key: 'situacao', label: 'Situação',    sortable: true, width: 120 },
];

const situacao = (c: AcademyTraineeCertificate) =>
    c.revogado_em ? { label: 'Revogado', cor: 'text-rose-700' } : VIGENCIA_LABEL[vigenciaDe(c.data_validade)];

interface Props {
    certificados: AcademyTraineeCertificate[];
    mostrarOrganizacao: boolean;
    carregando: boolean;
}

const MeusTreinamentosCertificados: React.FC<Props> = ({ certificados, mostrarOrganizacao, carregando }) => {
    const { showToast } = useToast();
    const [abrindo, setAbrindo] = useState<string | null>(null);
    const [copiado, setCopiado] = useState<string | null>(null);

    const vig = certificados.map(c => (c.revogado_em ? 'revogado' : vigenciaDe(c.data_validade)));
    const validos = vig.filter(v => v === 'valido' || v === 'sem-validade').length;
    const vencendo = vig.filter(v => v === 'vencendo').length;
    const vencidos = vig.filter(v => v === 'vencido').length;

    const abrirPdf = async (c: AcademyTraineeCertificate) => {
        setAbrindo(c.id);
        try {
            const url = await academyCertificadoService.emitirEArmazenar(c.id);
            window.open(url, '_blank', 'noopener');
        } catch (e: any) {
            showToast(e?.message || 'Não foi possível abrir o certificado.', 'error');
        } finally {
            setAbrindo(null);
        }
    };

    const copiarValidacao = async (c: AcademyTraineeCertificate) => {
        const url = `${window.location.origin}/publico/validar-certificado/${c.codigo_validacao}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopiado(c.id);
            setTimeout(() => setCopiado(null), 2000);
        } catch {
            showToast(`Não foi possível copiar. Link: ${url}`, 'error');
        }
    };

    const colunas = mostrarOrganizacao ? COLUMNS : COLUMNS.filter(c => c.key !== 'org');

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <KpiCard label="Certificados" value={`${certificados.length}`} icon={<Award className="w-4 h-4" />} color="blue" />
                <KpiCard label="Válidos" value={`${validos}`} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" />
                <KpiCard label="Vencendo em 30 dias" value={`${vencendo}`} icon={<Clock className="w-4 h-4" />} color="amber" />
                <KpiCard label="Vencidos" value={`${vencidos}`} icon={<AlertTriangle className="w-4 h-4" />} color="rose" />
            </div>

            <StandardTable<AcademyTraineeCertificate>
                storageKey="meusTreinamentos:certificados"
                columns={colunas}
                rows={certificados}
                rowKey={c => c.id}
                loading={carregando}
                searchText={c => `${c.numero} ${c.curso} ${c.nr_referencia ?? ''} ${c.org_nome}`}
                searchPlaceholder="Buscar por número ou treinamento..."
                sortValue={(k, c) => {
                    switch (k) {
                        case 'curso': return c.curso;
                        case 'org': return c.org_nome;
                        case 'emitido': return c.emitido_em;
                        case 'validade': return c.data_validade ?? '';
                        case 'situacao': return situacao(c).label;
                        default: return c.numero;
                    }
                }}
                renderCell={(k, c) => {
                    switch (k) {
                        case 'numero': return <span className="text-sm font-normal text-gray-700">{c.numero}</span>;
                        case 'curso': return (
                            <span className="block truncate text-sm font-normal text-gray-700" title={c.curso}>
                                {c.curso}
                                <span className="text-gray-400">{c.nr_referencia ? ` · ${c.nr_referencia}` : ''} · v{c.versao ?? 1}</span>
                            </span>
                        );
                        case 'org': return <span className="block truncate text-sm font-normal text-gray-700" title={c.org_nome}>{c.org_nome}</span>;
                        case 'emitido': return <span className="text-sm font-normal text-gray-600">{fmtDataHora(c.emitido_em)}</span>;
                        case 'validade': return <span className="text-sm font-normal text-gray-600">{c.data_validade ? fmtData(c.data_validade) : 'Sem validade'}</span>;
                        case 'situacao': { const s = situacao(c); return <span className={`text-sm font-normal ${s.cor}`}>{s.label}</span>; }
                        default: return null;
                    }
                }}
                actions={{
                    width: 110,
                    render: c => (
                        <div className="flex items-center justify-end gap-1.5">
                            <ActionIconButton
                                kind="download"
                                title={abrindo === c.id ? 'Abrindo o certificado...' : 'Baixar o PDF'}
                                icon={abrindo === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
                                disabled={abrindo === c.id}
                                onClick={() => abrirPdf(c)}
                            />
                            <ActionIconButton
                                kind="share"
                                title="Copiar o link público de validação"
                                icon={copiado === c.id ? <Check className="w-4 h-4 text-emerald-600" /> : undefined}
                                onClick={() => copiarValidacao(c)}
                            />
                        </div>
                    ),
                }}
                empty={{
                    icon: <Award className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum certificado emitido ainda',
                    subtitle: 'Ao concluir um treinamento com conteúdo EAD, o certificado aparece aqui.',
                }}
            />
        </>
    );
};

export default MeusTreinamentosCertificados;
