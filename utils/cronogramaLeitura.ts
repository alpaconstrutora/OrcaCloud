/**
 * Leitores de cronograma para a importação em Engenharia › Planejamento (item 2b de
 * docs/planos/2026-11-14-planejamento-lista-critica.md): MS Project em XML (MSPDI, "Salvar como
 * → XML") e o modelo Excel do app. Funções puras: recebem o arquivo e devolvem a MESMA estrutura,
 * para a prévia de casamento (2c/2d) não saber de que formato veio. Não gravam nada.
 *
 * Decisões do usuário que valem aqui: as datas entram COMO ESTÃO no arquivo (o motor do cronograma
 * não recalcula na importação); o .mpp fica para depois (2e).
 */
import { lerXml, filho, filhos, type ElementoXml } from './xmlLeve';

export type TipoVinculo = 'FS' | 'SS' | 'FF' | 'SF';

export interface PredecessoraImportada {
    /** `chave` da tarefa predecessora no mesmo arquivo. */
    chave: string;
    tipo: TipoVinculo;
    /** Defasagem em dias úteis (negativa = antecipação). */
    defasagemDias: number;
}

export interface TarefaImportada {
    /** Identidade no arquivo: UID do Project, ou a EAP no modelo Excel. */
    chave: string;
    /** Número da EAP como o arquivo traz (WBS do Project; sem ele, o OutlineNumber). */
    eap: string;
    nome: string;
    /** 1 = primeiro nível abaixo do projeto. */
    nivel: number;
    /** Tem tarefas filhas — as datas dela vêm das filhas, não se casa com item. */
    resumo: boolean;
    marco: boolean;
    /** AAAA-MM-DD ('' se o arquivo não trouxer). `termino` = último dia trabalhado (convenção do
     *  MS Project — o app usa início + duração; a conversão é da montagem, não do leitor). */
    inicio: string;
    termino: string;
    /** Dias de trabalho como o arquivo diz (Duration do Project / coluna "Duração"); null se não trouxer. */
    duracaoDias: number | null;
    /** 0–100. */
    percentual: number;
    predecessoras: PredecessoraImportada[];
}

export interface CronogramaImportado {
    formato: 'msproject-xml' | 'excel';
    titulo: string;
    tarefas: TarefaImportada[];
    /** O que foi lido com ressalva (vínculo para tarefa que não existe, data faltando…). */
    avisos: string[];
}

/** Erro de leitura com mensagem para a pessoa (diz o que se esperava). */
export class ErroDeLeituraDeCronograma extends Error {
    constructor(mensagem: string) {
        super(mensagem);
        this.name = 'ErroDeLeituraDeCronograma';
    }
}

const soDia = (v: string | undefined | null): string => {
    const m = (v ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
};
const limitar = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// ── MS Project XML (MSPDI) ───────────────────────────────────────────────────────────────

/** MSPDI <Type> do PredecessorLink: 0 = FF, 1 = FS, 2 = SF, 3 = SS. */
const TIPO_MSPDI: Record<string, TipoVinculo> = { '0': 'FF', '1': 'FS', '2': 'SF', '3': 'SS' };

const texto = (el: ElementoXml | null, nome: string): string => (el ? (filho(el, nome)?.texto ?? '').trim() : '');

/** "PT64H0M0S" (ISO 8601, horas de trabalho) → dias, pelo MinutesPerDay do projeto. */
const duracaoIso = (v: string, minutosPorDia: number): number | null => {
    const m = v.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
    if (!m) return null;
    const minutos = Number(m[1] ?? 0) * minutosPorDia + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Number(m[4] ?? 0) / 60;
    return Math.round((minutos / minutosPorDia) * 100) / 100;
};

export function lerMsProjectXml(conteudo: string): CronogramaImportado {
    let raiz: ElementoXml;
    try {
        raiz = lerXml(conteudo);
    } catch {
        throw new ErroDeLeituraDeCronograma('O arquivo não é um XML válido. No MS Project, use Arquivo › Salvar como › XML.');
    }
    const nomeRaiz = raiz.nome.slice(raiz.nome.indexOf(':') + 1);
    const tarefasEl = filho(raiz, 'Tasks');
    if (nomeRaiz !== 'Project' || !tarefasEl) {
        throw new ErroDeLeituraDeCronograma('Este XML não é um cronograma do MS Project (falta a lista de tarefas). No MS Project, use Arquivo › Salvar como › XML.');
    }
    const minutosPorDia = Number(texto(raiz, 'MinutesPerDay')) || 480;
    const avisos: string[] = [];
    const tarefas: TarefaImportada[] = [];
    for (const t of filhos(tarefasEl, 'Task')) {
        const uid = texto(t, 'UID');
        const nivel = Number(texto(t, 'OutlineLevel') || '0');
        // UID 0 / nível 0 = tarefa-resumo do projeto inteiro; tarefa "nula" = linha em branco.
        if (uid === '' || uid === '0' || nivel === 0 || texto(t, 'IsNull') === '1') continue;
        const nome = texto(t, 'Name');
        if (!nome) continue;
        const preds: PredecessoraImportada[] = filhos(t, 'PredecessorLink').map(l => {
            const formato = texto(l, 'LagFormat');
            const lag = Number(texto(l, 'LinkLag') || '0');
            // LinkLag vem em décimos de minuto; formatos 19/20 (%) não têm dias — viram 0 com aviso.
            let dias = lag / (minutosPorDia * 10);
            if (formato === '19' || formato === '20') {
                avisos.push(`"${nome}": defasagem em porcentagem não é suportada — entrou como 0 dia.`);
                dias = 0;
            }
            return {
                chave: texto(l, 'PredecessorUID'),
                tipo: TIPO_MSPDI[texto(l, 'Type')] ?? 'FS',
                defasagemDias: Math.round(dias * 100) / 100,
            };
        });
        const pct = texto(t, 'PercentComplete');
        tarefas.push({
            chave: uid,
            eap: texto(t, 'WBS') || texto(t, 'OutlineNumber'),
            nome,
            nivel,
            resumo: texto(t, 'Summary') === '1',
            marco: texto(t, 'Milestone') === '1',
            inicio: soDia(texto(t, 'Start')),
            termino: soDia(texto(t, 'Finish')),
            duracaoDias: texto(t, 'Duration') ? duracaoIso(texto(t, 'Duration'), minutosPorDia) : null,
            percentual: pct === '' ? 0 : limitar(Number(pct)),
            predecessoras: preds,
        });
    }
    validarVinculos(tarefas, avisos);
    return { formato: 'msproject-xml', titulo: texto(raiz, 'Title') || texto(raiz, 'Name'), tarefas, avisos };
}

// ── Modelo Excel do app ──────────────────────────────────────────────────────────────────

const normalizar = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Cabeçalhos aceitos (sem acento, sem caixa). A 1ª forma é a do modelo. */
const CABECALHOS: Record<'eap' | 'tarefa' | 'inicio' | 'termino' | 'predecessoras' | 'percentual' | 'marco' | 'duracao', string[]> = {
    eap: ['eap', 'wbs', 'item'],
    tarefa: ['tarefa', 'nome', 'nome da tarefa', 'descricao'],
    inicio: ['inicio', 'data de inicio'],
    termino: ['termino', 'fim', 'data de termino'],
    predecessoras: ['predecessoras', 'predecessora'],
    percentual: ['% concluido', '% concluida', 'percentual concluido', 'avanco', '% completo'],
    marco: ['marco'],
    duracao: ['duracao (dias uteis)', 'duracao', 'duracao (dias)', 'dias uteis'],
};
const OBRIGATORIOS = ['eap', 'tarefa', 'inicio', 'termino'] as const;

/** Tipo do vínculo em português (como o Project em pt-BR escreve) ou em inglês. */
const TIPO_TEXTO: Record<string, TipoVinculo> = { TI: 'FS', II: 'SS', TT: 'FF', IT: 'SF', FS: 'FS', SS: 'SS', FF: 'FF', SF: 'SF' };

/** "04.02.01 TI+2d; 04.03.01 II" → vínculos. Tipo ausente = TI (término→início). */
export function lerPredecessorasDoTexto(textoPred: string): { eap: string; tipo: TipoVinculo; defasagemDias: number }[] {
    return textoPred.split(/[;\n]/).map(s => s.trim()).filter(Boolean).map(parte => {
        const m = parte.match(/^([\w.]+)\s*(TI|II|TT|IT|FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+(?:[.,]\d+)?)\s*(?:d|dias?)?)?$/i);
        if (!m) return { eap: parte, tipo: 'FS' as TipoVinculo, defasagemDias: Number.NaN };
        const dias = m[4] ? Number(m[4].replace(',', '.')) * (m[3] === '-' ? -1 : 1) : 0;
        return { eap: m[1], tipo: TIPO_TEXTO[(m[2] ?? 'TI').toUpperCase()], defasagemDias: dias };
    });
}

const dataDaCelula = (v: unknown): string => {
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
        // Excel guarda data sem fuso; o ExcelJS devolve meia-noite UTC — o dia é o UTC.
        return v.toISOString().slice(0, 10);
    }
    const s = String(v ?? '').trim();
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
    return soDia(s);
};
const percentualDaCelula = (v: unknown): number => {
    if (typeof v === 'number') return limitar(v <= 1 ? v * 100 : v);
    const s = String(v ?? '').replace('%', '').replace(',', '.').trim();
    if (!s) return 0;
    const n = Number(s);
    return Number.isNaN(n) ? 0 : limitar(n);
};
const valorDaCelula = (c: unknown): unknown => {
    // Célula de fórmula (ExcelJS: { formula, result }) e rich text ({ richText: [...] }).
    if (c && typeof c === 'object' && !(c instanceof Date)) {
        const o = c as { result?: unknown; richText?: { text: string }[]; text?: string };
        if ('result' in o) return o.result;
        if (o.richText) return o.richText.map(r => r.text).join('');
        if (o.text !== undefined) return o.text;
    }
    return c;
};

/** Linhas já extraídas da planilha (1ª linha = cabeçalho). Separado do ExcelJS para testar sem arquivo. */
export function lerLinhasDoModelo(linhas: unknown[][], titulo = ''): CronogramaImportado {
    const cab = (linhas[0] ?? []).map(normalizar);
    const col = {} as Record<keyof typeof CABECALHOS, number>;
    (Object.keys(CABECALHOS) as (keyof typeof CABECALHOS)[]).forEach(k => {
        col[k] = cab.findIndex(h => CABECALHOS[k].includes(h));
    });
    const faltam = OBRIGATORIOS.filter(k => col[k] < 0);
    if (faltam.length) {
        const nomes = { eap: 'EAP', tarefa: 'Tarefa', inicio: 'Início', termino: 'Término' } as const;
        throw new ErroDeLeituraDeCronograma(`A planilha não tem a(s) coluna(s) ${faltam.map(k => `"${nomes[k]}"`).join(', ')} na primeira linha. Baixe o modelo de cronograma e use os mesmos cabeçalhos.`);
    }
    const avisos: string[] = [];
    const brutas = linhas.slice(1)
        .map(l => l.map(valorDaCelula))
        .filter(l => String(l[col.eap] ?? '').trim() || String(l[col.tarefa] ?? '').trim());
    const eaps = brutas.map(l => String(l[col.eap] ?? '').trim());
    const tarefas: TarefaImportada[] = brutas.map((l, i) => {
        const eap = eaps[i];
        const nome = String(l[col.tarefa] ?? '').trim();
        if (!eap) avisos.push(`Linha ${i + 2} ("${nome}") sem EAP — não dá para montar a hierarquia nem apontar predecessoras para ela.`);
        const inicio = dataDaCelula(l[col.inicio]);
        const termino = dataDaCelula(l[col.termino]);
        if (!inicio || !termino) avisos.push(`"${nome}" (${eap || `linha ${i + 2}`}) sem ${!inicio ? 'início' : 'término'} — entra sem datas.`);
        const marcoTxt = col.marco >= 0 ? normalizar(l[col.marco]) : '';
        const preds = col.predecessoras >= 0 ? lerPredecessorasDoTexto(String(l[col.predecessoras] ?? '')) : [];
        preds.filter(p => Number.isNaN(p.defasagemDias)).forEach(p => avisos.push(`"${nome}": predecessora "${p.eap}" não foi entendida — use, por exemplo, "04.02.01 TI+2d".`));
        return {
            chave: eap || `linha-${i + 2}`,
            eap,
            nome,
            nivel: eap ? eap.split('.').length : 1,
            resumo: !!eap && eaps.some(outra => outra.startsWith(eap + '.')),
            marco: ['sim', 's', 'x', '1', 'true'].includes(marcoTxt),
            inicio,
            termino,
            duracaoDias: (() => {
                if (col.duracao < 0) return null;
                const v = l[col.duracao];
                const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.').trim());
                return String(v ?? '').trim() === '' || Number.isNaN(n) ? null : n;
            })(),
            percentual: col.percentual >= 0 ? percentualDaCelula(l[col.percentual]) : 0,
            predecessoras: preds.filter(p => !Number.isNaN(p.defasagemDias)).map(p => ({ chave: p.eap, tipo: p.tipo, defasagemDias: p.defasagemDias })),
        };
    });
    validarVinculos(tarefas, avisos);
    return { formato: 'excel', titulo, tarefas, avisos };
}

/** Lê o .xlsx (aba "Cronograma", ou a primeira). `exceljs` é carregado só quando usado. */
export async function lerModeloExcel(arquivo: ArrayBuffer | Uint8Array, titulo = ''): Promise<CronogramaImportado> {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    try {
        await wb.xlsx.load(arquivo as ArrayBuffer);
    } catch {
        throw new ErroDeLeituraDeCronograma('Não foi possível abrir a planilha. Use um arquivo .xlsx (Excel), de preferência a partir do modelo de cronograma.');
    }
    const ws = wb.getWorksheet('Cronograma') ?? wb.worksheets[0];
    if (!ws) throw new ErroDeLeituraDeCronograma('A planilha está vazia.');
    const linhas: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, row => {
        const v = row.values as unknown[];
        linhas.push(Array.isArray(v) ? v.slice(1) : []);
    });
    return lerLinhasDoModelo(linhas, titulo);
}

// ── Comum ────────────────────────────────────────────────────────────────────────────────

/** Vínculo para tarefa que não está no arquivo: sai, com aviso (não derruba a leitura). */
function validarVinculos(tarefas: TarefaImportada[], avisos: string[]) {
    const chaves = new Set(tarefas.map(t => t.chave));
    for (const t of tarefas) {
        const validas = t.predecessoras.filter(p => chaves.has(p.chave));
        if (validas.length !== t.predecessoras.length) {
            t.predecessoras.filter(p => !chaves.has(p.chave)).forEach(p =>
                avisos.push(`"${t.nome}": a predecessora "${p.chave}" não está no arquivo — o vínculo foi ignorado.`));
            t.predecessoras = validas;
        }
    }
    if (tarefas.length === 0) throw new ErroDeLeituraDeCronograma('O arquivo não tem nenhuma tarefa.');
}
