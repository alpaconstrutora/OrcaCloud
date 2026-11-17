/**
 * Monta o resumo semanal da Diretoria (ÒPURA CEO) — assunto, HTML e texto — a partir do que
 * `fn_diretoria_resumo_dados(p_user)` devolve. Puro (sem rede, sem Deno): testado no Vitest
 * (__tests__/diretoriaResumoEmail.test.ts). Plano: docs/planos/2026-11-17-opura-ceo.md.
 *
 * É a mesma "Reunião da semana" da tela: 1. pede decisão · 2. determinações · 3. melhorou ×
 * piorou · 4. o resto em números. Os tipos que a pessoa marcou como barulho ficam fora de tudo.
 */
import {
    TIPOS, tituloDoGrupo, detalheDoGrupo, dataBr, diasAte, semanaDe, compararSemanas, comparacaoIncompleta, type TipoExcecao,
} from '../_shared/diretoriaCatalogo.ts';
import { escapeHtml, escapeAttr } from '../_shared/html.ts';

export interface GrupoResumo {
    chave: string;
    tipo: TipoExcecao;
    org_id: string;
    grupo: string | null;
    severidade: 'critico' | 'atencao' | 'acompanhar';
    origem_responsavel: string;
    responsaveis: string[];
    quantidade: number;
    valor: number | null;
    dias: number | null;
    data_ref: string | null;
    itens: unknown[];
}

export interface DeterminacaoResumo {
    id: string; organization_id: string; titulo: string; responsavel_user_id: string;
    prazo: string; status: 'aberta' | 'andamento' | 'concluida';
}

export interface DadosDoResumo {
    hoje: string;
    orgs: { id: string; nome: string }[];
    excecoes: GrupoResumo[];
    determinacoes: DeterminacaoResumo[];
    pessoas: { user_id: string; nome: string }[];
    /** Valor cru da preferência diretoria.silenciados ("a,b") — ou nulo. */
    silenciados: unknown;
    semana_anterior: null | {
        semana: string;
        orgs?: number;
        por_tipo: Record<string, { quantidade: number; valor: number | null }>;
        determinacoes_vencidas: number;
    };
    destinatario: { email: string; nome: string };
}

const MAX_CRITICOS = 15;

function silenciadosDe(valor: unknown): Set<string> {
    if (typeof valor !== 'string') return new Set();
    return new Set(valor.split(',').map(s => s.trim()).filter(s => s in TIPOS));
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

interface Linha { texto: string; html: string }

export function montarResumo(d: DadosDoResumo, linkDoApp: string): { assunto: string; html: string; texto: string } {
    const sil = silenciadosDe(d.silenciados);
    const grupos = d.excecoes.filter(g => !sil.has(g.tipo) && g.tipo in TIPOS);
    const nome = (id: string) => d.pessoas.find(p => p.user_id === id)?.nome ?? 'pessoa fora das organizações';
    const variasOrgs = d.orgs.length > 1;
    const orgDe = (id: string) => d.orgs.find(o => o.id === id)?.nome ?? '';
    const semana = semanaDe(d.hoje);

    const criticos = grupos.filter(g => g.severidade === 'critico');
    const abertas = d.determinacoes.filter(x => x.status !== 'concluida');
    const vencidas = abertas.filter(x => diasAte(x.prazo, d.hoje) < 0).sort((a, b) => a.prazo.localeCompare(b.prazo));
    const daSemana = abertas
        .filter(x => diasAte(x.prazo, d.hoje) >= 0 && x.prazo <= semana.fim)
        .sort((a, b) => a.prazo.localeCompare(b.prazo));

    // 1. Pede decisão
    const linhasCriticas: Linha[] = criticos.slice(0, MAX_CRITICOS).map(g => {
        const quem = g.responsaveis.length ? g.responsaveis.map(nome).join(', ') : 'sem responsável';
        const org = variasOrgs ? ` [${orgDe(g.org_id)}]` : '';
        const titulo = tituloDoGrupo(g);
        const detalhe = detalheDoGrupo(g);
        return {
            texto: `• ${titulo}${detalhe ? ` — ${detalhe}` : ''} (${quem})${org}`,
            html: `<li style="margin:0 0 6px">${escapeHtml(titulo)}${detalhe ? ` <span style="color:#475569">— ${escapeHtml(detalhe)}</span>` : ''}`
                + ` <span style="color:#64748b">(${escapeHtml(quem)})${escapeHtml(org)}</span></li>`,
        };
    });
    if (criticos.length > MAX_CRITICOS) {
        const resto = `e mais ${criticos.length - MAX_CRITICOS} no painel.`;
        linhasCriticas.push({ texto: `• ${resto}`, html: `<li style="color:#64748b">${escapeHtml(resto)}</li>` });
    }

    // 2. Determinações
    const linhasDet: Linha[] = [
        ...vencidas.map(x => {
            const t = `VENCIDA desde ${dataBr(x.prazo)}: ${x.titulo} — ${nome(x.responsavel_user_id)}${variasOrgs ? ` [${orgDe(x.organization_id)}]` : ''}`;
            return { texto: `• ${t}`, html: `<li style="margin:0 0 6px;color:#b91c1c">${escapeHtml(t)}</li>` };
        }),
        ...daSemana.map(x => {
            const t = `Vence ${dataBr(x.prazo)}: ${x.titulo} — ${nome(x.responsavel_user_id)}${variasOrgs ? ` [${orgDe(x.organization_id)}]` : ''}`;
            return { texto: `• ${t}`, html: `<li style="margin:0 0 6px">${escapeHtml(t)}</li>` };
        }),
    ];

    // 3. Melhorou × piorou (menos é melhor em todos os tipos) — a mesma conta da tela
    const incompleta = d.semana_anterior ? comparacaoIncompleta(d.semana_anterior, d.orgs.length) : null;
    const linhasComparacao: Linha[] = d.semana_anterior && !incompleta
        ? compararSemanas(grupos, d.semana_anterior, sil, vencidas.length).map(l => {
            const cor = l.veredito === 'melhorou' ? '#047857' : l.veredito === 'piorou' ? '#b91c1c' : '#64748b';
            return {
                texto: `• ${l.rotulo}: ${l.antes} → ${l.agora} (${l.veredito})`,
                html: `<li style="margin:0 0 4px">${escapeHtml(`${l.rotulo}: ${l.antes} → ${l.agora}`)} <span style="color:${cor}">(${l.veredito})</span></li>`,
            };
        })
        : [];

    // 4. O resto, em números
    const restoPorTipo = new Map<TipoExcecao, number>();
    for (const g of grupos) if (g.severidade !== 'critico') restoPorTipo.set(g.tipo, (restoPorTipo.get(g.tipo) ?? 0) + g.quantidade);
    const resto = [...restoPorTipo].map(([t, n]) => `${TIPOS[t].nome}: ${n}`).join(' · ');

    const pedem = criticos.length === 1 ? '1 pede decisão' : `${criticos.length} pedem decisão`;
    const assunto = `Diretoria — semana ${semana.numero} (${dataBr(semana.inicio).slice(0, 5)} a ${dataBr(semana.fim).slice(0, 5)}): `
        + `${pedem}, ${plural(vencidas.length, 'determinação vencida', 'determinações vencidas')}`;

    const semComparacao = incompleta ?? 'A comparação começa na próxima semana (a primeira foto é tirada nesta segunda).';
    const rodape = 'Para tirar um tipo deste e-mail, marque-o como barulho no painel. '
        + 'Você recebe este resumo porque ligou "Receber toda segunda" no painel da Diretoria.';

    const texto = [
        assunto, '',
        '1. Pede decisão', ...(linhasCriticas.length ? linhasCriticas.map(l => l.texto) : ['• Nada.']), '',
        '2. Determinações', ...(linhasDet.length ? linhasDet.map(l => l.texto) : ['• Nenhuma vencida nem vencendo esta semana.']), '',
        '3. Melhorou × piorou desde a semana passada', ...(linhasComparacao.length ? linhasComparacao.map(l => l.texto) : [semComparacao]), '',
        '4. O resto, em números', resto || 'Nada fora do trilho.', '',
        `Abrir o painel: ${linkDoApp}`, rodape,
    ].join('\n');

    const secao = (titulo: string, corpo: string) =>
        `<h2 style="font-size:15px;margin:22px 0 8px;color:#0f172a">${escapeHtml(titulo)}</h2>${corpo}`;
    const lista = (ls: Linha[], vazio: string) =>
        ls.length ? `<ul style="margin:0;padding-left:18px">${ls.map(l => l.html).join('')}</ul>`
                  : `<p style="margin:0;color:#64748b">${escapeHtml(vazio)}</p>`;

    const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1e293b;font-size:14px;line-height:1.5">
  <div style="padding:20px 24px;border:1px solid #e2e8f0;border-radius:10px;background:#ffffff">
    <p style="margin:0;color:#64748b;font-size:12px">ÒPURA · Diretoria · para ${escapeHtml(d.destinatario.nome)}</p>
    <h1 style="font-size:17px;margin:6px 0 0;color:#0f172a">${escapeHtml(assunto)}</h1>
    ${secao('1. Pede decisão', lista(linhasCriticas, 'Nada.'))}
    ${secao('2. Determinações', lista(linhasDet, 'Nenhuma vencida nem vencendo esta semana.'))}
    ${secao('3. Melhorou × piorou desde a semana passada', linhasComparacao.length ? lista(linhasComparacao, '') : `<p style="margin:0;color:#64748b">${escapeHtml(semComparacao)}</p>`)}
    ${secao('4. O resto, em números', `<p style="margin:0">${escapeHtml(resto || 'Nada fora do trilho.')}</p>`)}
    <p style="margin:24px 0 0"><a href="${escapeAttr(linkDoApp)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px">Abrir o painel da Diretoria</a></p>
    <p style="margin:18px 0 0;color:#94a3b8;font-size:12px">${escapeHtml(rodape)}</p>
  </div>
</div>`;

    return { assunto, html, texto };
}
