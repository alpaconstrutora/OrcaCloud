/**
 * Dossiê do Comitê de Investimentos, a partir do ESTUDO (item 1.5 do plano
 * docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md). Substitui
 * services/opportunityDossierService.ts, que lia a DD e os riscos da Oportunidade
 * (vazios) e os números digitados nela.
 *
 * `secoesDoDossie` é puro (testado em __tests__/imovibDossieDoComite.test.ts);
 * `baixarDossieDoComite` só desenha as seções no PDF.
 */
import type { ImovibStudy, ImovibRisk, ImovibLandChecklistItem } from '../types';
import type { ImovibStudyVersion } from './imovibVersoes';
import { ROTULO_DO_GATE, ROTULO_DA_DECISAO, type DecisaoDoGate, type GateDoComite } from './imovibComite';
import { rotuloDaCategoria, rotuloDaSituacao, severidade, riscoQueTrava } from '../constants/imovibRiscos';
import { itemDaDueDiligenceQueTrava } from './imovibDueDiligenceMatricula';
import { ROTULO_DA_AQUISICAO, type ResultadoDoModelo, type TipoDeAquisicao } from './imovibModelosDeAquisicao';
import { ROTULO_DO_PARECER } from './imovibParecer';

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const pct = (v: number | null | undefined) => (v == null ? 'sem TIR' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% a.a.`);
const dia = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

export interface DadosDoDossie {
    study: Pick<ImovibStudy, 'name' | 'recommendation' | 'recommendation_notes' | 'recommended_by' | 'recommended_at'>;
    versao: Pick<ImovibStudyVersion, 'label' | 'created_at' | 'results'> | null;
    dueDiligence: Pick<ImovibLandChecklistItem, 'label' | 'status' | 'criticidade' | 'notes'>[];
    riscos: Pick<ImovibRisk, 'category' | 'description' | 'probability' | 'impact' | 'status' | 'mitigation'>[];
    modelos: { name: string; deal_type: TipoDeAquisicao; r: Omit<ResultadoDoModelo, 'premissas'> }[];
    decisoes: DecisaoDoGate[];
    gateAtual: GateDoComite | 7;
    hoje?: Date;
}

export interface SecaoDoDossie { titulo: string; linhas: string[] }

export function secoesDoDossie(d: DadosDoDossie): SecaoDoDossie[] {
    const r = d.versao?.results;
    const ddTravando = d.dueDiligence.filter(i => itemDaDueDiligenceQueTrava({ criticidade: i.criticidade ?? 'media', status: i.status }));
    const riscosTravando = d.riscos.filter(riscoQueTrava);
    const parecer = d.study.recommendation ? ROTULO_DO_PARECER[d.study.recommendation] : null;
    return [
        {
            titulo: d.study.name,
            linhas: [
                `Gate atual: ${d.gateAtual === 7 ? 'todos os gates aprovados' : ROTULO_DO_GATE[d.gateAtual]} · Emitido em ${(d.hoje ?? new Date()).toLocaleDateString('pt-BR')}`,
            ],
        },
        {
            titulo: 'Versão avaliada',
            linhas: d.versao && r
                ? [
                    `${d.versao.label} (congelada em ${dia(d.versao.created_at)})`,
                    `VGV ${brl(r.vgv)} · VPL ${brl(r.vpl)} · TIR ${pct(r.tirAnual)}`,
                    `Exposição máxima ${brl(r.exposicaoMaxima)} · Lucro líquido ${brl(r.lucroLiquido)} · Prazo ${r.duracao} meses`,
                ]
                : ['Nenhuma versão congelada: congele uma na aba Versões antes de levar ao comitê.'],
        },
        {
            titulo: 'Parecer do analista',
            linhas: parecer
                ? [`${parecer}${d.study.recommended_by ? ` — ${d.study.recommended_by}` : ''}${d.study.recommended_at ? `, ${dia(d.study.recommended_at)}` : ''}`, ...(d.study.recommendation_notes ? [d.study.recommendation_notes] : [])]
                : ['Sem parecer registrado (Resumo Executivo).'],
        },
        {
            titulo: 'Due diligence — o que trava',
            linhas: [
                `${d.dueDiligence.length} itens · ${ddTravando.length} de criticidade alta/crítica sem ok`,
                ...ddTravando.map(i => `${i.label} — ${i.criticidade === 'critica' ? 'crítica' : 'alta'}, ${i.status === 'problema' ? 'com problema' : 'pendente'}${i.notes ? `: ${i.notes.split('\n')[0]}` : ''}`),
            ],
        },
        {
            titulo: 'Riscos — o que trava',
            linhas: [
                `${d.riscos.length} riscos · ${riscosTravando.length} alto/crítico em aberto`,
                ...riscosTravando.map(x => `[${rotuloDaCategoria(x.category)}] ${x.description} — severidade ${severidade(x)}, ${rotuloDaSituacao(x.status).toLowerCase()}${x.mitigation ? `. Mitigação: ${x.mitigation}` : ''}`),
            ],
        },
        {
            titulo: 'Modelos de aquisição do terreno',
            linhas: d.modelos.length
                ? d.modelos.map(m => `${m.name} (${ROTULO_DA_AQUISICAO[m.deal_type]}) — VPL ${brl(m.r.vpl)}, TIR ${pct(m.r.tirAnual)}, exposição ${brl(m.r.exposicaoMaxima)}, terreno em caixa ${brl(m.r.caixaDoTerreno)}`)
                : ['Nenhum modelo cadastrado (Premissas › Terreno).'],
        },
        {
            titulo: 'Decisões do comitê',
            linhas: d.decisoes.length
                ? [...d.decisoes].sort((a, b) => a.gate - b.gate).map(x =>
                    [`${ROTULO_DO_GATE[x.gate]}: ${ROTULO_DA_DECISAO[x.decision]}`, x.decided_by_nome, dia(x.decided_at), x.condicionantes ? `condicionantes: ${x.condicionantes}` : null]
                        .filter(Boolean).join(' — '))
                : ['Nenhuma decisão registrada.'],
        },
    ];
}

/** Desenha as seções num PDF A4 e baixa. jsPDF carregado só aqui (import dinâmico). */
export async function baixarDossieDoComite(d: DadosDoDossie): Promise<void> {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const X = 20;
    const LARGURA = 170;
    const ALTURA = doc.internal.pageSize.getHeight();
    let y = 22;
    const quebra = (precisa: number) => { if (y + precisa > ALTURA - 18) { doc.addPage(); y = 22; } };
    const secoes = secoesDoDossie(d);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Dossiê do Comitê de Investimentos', X, y);
    y += 9;
    secoes.forEach((s, i) => {
        quebra(14);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(i === 0 ? 13 : 11);
        doc.setTextColor(30, 41, 59);
        doc.text(s.titulo, X, y);
        y += 6;
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        for (const linha of s.linhas) {
            const partes = doc.splitTextToSize(linha, LARGURA) as string[];
            quebra(partes.length * 4.5);
            doc.text(partes, X, y);
            y += partes.length * 4.5 + 1;
        }
        y += 4;
    });
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
        doc.setPage(p);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Dossiê do Comitê — confidencial · página ${p} de ${total}`, X, ALTURA - 10);
    }
    doc.save(`Dossie_Comite_${d.study.name.replace(/[^\w-]+/g, '_').slice(0, 60)}.pdf`);
}
