/**
 * Relatório Executivo do BI — assunto e HTML do e-mail. PURO (sem rede, sem Deno):
 * usado pela Edge `send-bi-report` e pelo botão "Baixar HTML" da tela, e testado no
 * Vitest (`__tests__/sendBiReportRelatorio.test.ts`).
 *
 * ─── Por que o HTML é montado aqui, e não no navegador ───────────────────────
 *
 * Achados F11/F55 da varredura de 15/11/2026. A `send-bi-report` recebia do
 * cliente o ASSUNTO e o CORPO HTML prontos e os repassava à Resend, assinados pelo
 * domínio verificado da empresa: era um relay de e-mail com conteúdo do
 * atacante. Agora o cliente só diz QUAL relatório (organização + período + a
 * narrativa guardada) e o conteúdo sai deste molde fixo, com dados lidos no
 * servidor. Todo valor interpolado passa por `escapeHtml` — inclusive os que
 * "não têm como" trazer HTML (nome da organização, rótulo do DRE, mês da
 * tendência, texto da IA): quem decide isso é o escape, não a suposição.
 */
import { escapeHtml } from '../_shared/html.ts';

/** Teto do nome da organização no título e no assunto. */
export const MAX_NOME_ORGANIZACAO = 120;
/** A bi-narrative pede no máximo 400 tokens (~2 mil caracteres); folga larga. */
export const MAX_NARRATIVA = 6000;
const MAX_LINHAS_DRE = 20;
const MAX_ROTULO_DRE = 60;
const MAX_MES = 20;
const MESES_DA_TENDENCIA = 6;

/** O que entra no relatório. As formas espelham `fn_bi_executive` e `fn_bi_trend`. */
export interface DadosDoRelatorio {
    nomeOrganizacao: unknown;
    dateFrom: string;
    dateTo: string;
    /** Data do envio; o "Gerado em" e o assunto usam o dia civil de São Paulo. */
    geradoEm: Date;
    /** Retorno de `fn_bi_executive` (o `kpis` do BIExecutiveSummary da tela). */
    kpis: unknown;
    /** Retorno de `fn_bi_trend`. */
    tendencia?: unknown;
    /** Texto GUARDADO pela bi-narrative, reutilizado literalmente. */
    narrativa?: unknown;
}

export interface RelatorioMontado {
    assunto: string;
    html: string;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Texto de UMA linha (nome, rótulo, mês): toda sequência de espaço ou caractere
 * de controle vira um espaço — inclusive CR/LF, o que importa no ASSUNTO, que é
 * cabeçalho de e-mail. Corta em `max` sem deixar meio par substituto no fim.
 */
export function textoDeUmaLinha(v: unknown, max: number): string {
    if (typeof v !== 'string') return '';
    let s = v.replace(/[\s\p{Cc}]+/gu, ' ').trim().slice(0, max);
    const ultimo = s.charCodeAt(s.length - 1);
    if (ultimo >= 0xD800 && ultimo <= 0xDBFF) s = s.slice(0, -1);
    return s;
}

/** Texto corrido (a narrativa): mantém as quebras de linha, tira o resto do controle. */
function textoCorrido(v: unknown, max: number): string {
    if (typeof v !== 'string') return '';
    let s = v.replace(/\r\n?/g, '\n').replace(/[^\P{Cc}\n\t]/gu, '').trim().slice(0, max);
    const ultimo = s.charCodeAt(s.length - 1);
    if (ultimo >= 0xD800 && ultimo <= 0xDBFF) s = s.slice(0, -1);
    return s;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brl = (v: unknown) => { const n = numero(v); return n != null ? BRL.format(n) : '—'; };
const pct = (v: unknown) => { const n = numero(v); return n != null ? `${n.toFixed(1)}%` : '—'; };
const qtd = (v: unknown) => { const n = numero(v); return n != null ? String(n) : '—'; };

/** dd/mm/aaaa no fuso de São Paulo (o servidor roda em UTC). */
export function dataBrasilia(d: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(d);
}

export function montarRelatorioBI(d: DadosDoRelatorio): RelatorioMontado {
    const nome = textoDeUmaLinha(d.nomeOrganizacao, MAX_NOME_ORGANIZACAO) || 'Empresa';
    const hoje = dataBrasilia(d.geradoEm);
    const kpis = obj(d.kpis) ?? {};
    const com = obj(kpis.comercial);
    const ope = obj(kpis.operacional);
    const rh  = obj(kpis.rh);

    const dreRows = (Array.isArray(kpis.dre) ? kpis.dre : [])
        .map(obj)
        .filter((l): l is Obj => !!l && l.realizado != null)
        .slice(0, MAX_LINHAS_DRE)
        .map(l => `<tr><td>${escapeHtml(textoDeUmaLinha(l.linha, MAX_ROTULO_DRE))}</td><td style="text-align:right;font-weight:600">${escapeHtml(brl(l.realizado))}</td></tr>`)
        .join('');

    const trendRows = (Array.isArray(d.tendencia) ? d.tendencia : [])
        .map(obj)
        .filter((t): t is Obj => !!t)
        .slice(-MESES_DA_TENDENCIA)
        .map(t => `<tr><td>${escapeHtml(textoDeUmaLinha(t.mes, MAX_MES))}</td><td style="text-align:right">${escapeHtml(brl(t.receita))}</td><td style="text-align:right">${escapeHtml(brl(t.ebitda))}</td></tr>`)
        .join('');

    const narrativa = textoCorrido(d.narrativa, MAX_NARRATIVA);
    // Escapa ANTES de trocar a quebra de linha por <br> — na ordem inversa o
    // <br> seria escapado, e um "<" do texto viraria tag.
    const narrativaHtml = narrativa ? escapeHtml(narrativa).replace(/\n/g, '<br>') : '';

    const kpi = (rotulo: string, valor: string) =>
        `<div class="kpi-box"><div class="label">${escapeHtml(rotulo)}</div><div class="value">${escapeHtml(valor)}</div></div>`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 0; }
  .header { background: #1e3a5f; color: white; padding: 24px 32px; }
  .header h1 { margin: 0; font-size: 22px; }
  .header p { margin: 4px 0 0; font-size: 13px; opacity: .8; }
  .body { padding: 32px; }
  h2 { font-size: 14px; font-weight: 700; text-transform: uppercase;
       letter-spacing: .05em; color: #1e3a5f; border-bottom: 2px solid #e5e7eb;
       padding-bottom: 6px; margin: 28px 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td, th { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
  th { background: #f9fafb; font-weight: 600; text-align: left; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 8px; }
  .kpi-box { background: #f9fafb; border-radius: 8px; padding: 14px; }
  .kpi-box .label { font-size: 11px; color: #6b7280; text-transform: uppercase; }
  .kpi-box .value { font-size: 20px; font-weight: 700; color: #1e3a5f; margin-top: 4px; }
  .narrative { background: #eff6ff; border-left: 4px solid #3b82f6;
               padding: 16px 20px; border-radius: 0 8px 8px 0; font-size: 13px;
               line-height: 1.65; color: #1e3a5f; }
  .footer { padding: 16px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb;
            font-size: 11px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
<div class="header">
  <h1>${escapeHtml(nome)} — Relatório Executivo BI</h1>
  <p>Período: ${escapeHtml(d.dateFrom)} a ${escapeHtml(d.dateTo)} &nbsp;·&nbsp; Gerado em ${escapeHtml(hoje)}</p>
</div>
<div class="body">
${narrativaHtml ? `<h2>Resumo Executivo</h2><div class="narrative">${narrativaHtml}</div>` : ''}

<h2>Indicadores-Chave</h2>
<div class="kpi-grid">
  ${kpi('VGV Fechado', brl(com?.vgv_fechado))}
  ${kpi('Conversão', pct(com?.taxa_conversao_pct))}
  ${kpi('Obras Ativas', qtd(ope?.obras_ativas))}
  ${kpi('Ticket Médio', brl(com?.ticket_medio))}
  ${kpi('Turnover', pct(obj(rh?.periodo)?.turnover_pct))}
  ${kpi('Headcount Ativo', qtd(obj(rh?.headcount)?.ativos))}
</div>

${dreRows ? `<h2>DRE Consolidada</h2>
<table><thead><tr><th>Linha</th><th style="text-align:right">Realizado</th></tr></thead>
<tbody>${dreRows}</tbody></table>` : ''}

${trendRows ? `<h2>Tendência (últimos 6 meses)</h2>
<table><thead><tr><th>Mês</th><th style="text-align:right">Receita</th><th style="text-align:right">EBITDA</th></tr></thead>
<tbody>${trendRows}</tbody></table>` : ''}
</div>
<div class="footer">OPURA &nbsp;·&nbsp; Relatório gerado automaticamente &nbsp;·&nbsp; Dados sigilosos — uso interno</div>
</body>
</html>`;

    // Mesmo formato do assunto que a tela montava; sem quebra de linha (cabeçalho).
    const assunto = `Relatório Executivo — ${nome} — ${hoje}`;
    return { assunto, html };
}
