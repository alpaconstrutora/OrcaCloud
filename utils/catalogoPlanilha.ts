// utils/catalogoPlanilha.ts — Marcas e Modelos ⇄ planilha (regras puras)
//
// Plano: docs/planos/2026-10-13-marcas-e-modelos.md (Fase 3). Sem Excel e sem
// banco aqui: a leitura/escrita do .xlsx mora em catalogoPlanilhaExcel.ts e a
// gravação em brandModelService.aplicarImportacao. Tudo que decide "o que esta
// linha vai fazer" está neste arquivo, para ser testado sem jsdom nem rede.
//
// Formato: UMA linha por modelo; marca sem modelo = linha com Modelo vazio.
// As colunas são achadas pelo CABEÇALHO (ignorando caixa/acento/asterisco),
// não pela posição — quem reordena ou apaga colunas não quebra a importação.
//
// Regras de importação:
//   - marca e modelo existentes são reconhecidos pelo nome ignorando caixa e
//     ACENTO (mesma regra do campo do formulário, utils/catalogoNome);
//   - célula vazia NÃO apaga: só o que veio preenchido atualiza;
//   - "Situação" vale para o modelo quando a linha tem modelo, senão para a marca;
//   - a coluna "Organização" (exportada em "Todas") é só informativa: a
//     importação grava na organização escolhida.
import type { AssetCategory } from '../types/assets';
import type { ProductBrand, ProductItemType, ProductModel } from '../types/brandModel';
import { ITEM_TYPE_LABELS, ITEM_TYPES } from '../types/brandModel';
import { ASSET_CATEGORY_LABELS } from './assetToStockItemRow';
import { acharPorNome, chaveBusca, NOME_CATALOGO_MAX } from './catalogoNome';

export type CampoPlanilha =
    | 'marca' | 'modelo' | 'tipo' | 'codigo' | 'categoria' | 'vida' | 'ficha' | 'especificacao' | 'situacao' | 'organizacao';

/** Ordem e títulos da planilha exportada (e do modelo para preencher). */
export const COLUNAS_PLANILHA: { campo: CampoPlanilha; titulo: string; largura: number }[] = [
    { campo: 'marca', titulo: 'Marca *', largura: 24 },
    { campo: 'modelo', titulo: 'Modelo', largura: 24 },
    { campo: 'tipo', titulo: 'Tipo de item', largura: 16 },
    { campo: 'codigo', titulo: 'Código do fabricante', largura: 22 },
    { campo: 'categoria', titulo: 'Categoria padrão do ativo', largura: 24 },
    { campo: 'vida', titulo: 'Vida útil padrão (meses)', largura: 22 },
    { campo: 'ficha', titulo: 'Ficha técnica (link)', largura: 36 },
    { campo: 'especificacao', titulo: 'Especificação técnica', largura: 44 },
    { campo: 'situacao', titulo: 'Situação', largura: 12 },
    { campo: 'organizacao', titulo: 'Organização', largura: 30 },
];

// Títulos aceitos na leitura (além do oficial), já em chaveBusca.
const APELIDOS: Record<CampoPlanilha, string[]> = {
    marca: ['marca', 'fabricante', 'brand'],
    modelo: ['modelo', 'model'],
    tipo: ['tipo de item', 'tipo', 'item type'],
    codigo: ['codigo do fabricante', 'codigo', 'part number', 'referencia'],
    categoria: ['categoria padrao do ativo', 'categoria padrao', 'categoria do ativo', 'categoria'],
    vida: ['vida util padrao (meses)', 'vida util padrao', 'vida util (meses)', 'vida util'],
    ficha: ['ficha tecnica (link)', 'ficha tecnica', 'datasheet', 'link'],
    especificacao: ['especificacao tecnica', 'especificacao'],
    situacao: ['situacao', 'status', 'ativo'],
    organizacao: ['organizacao'],
};

const chaveCabecalho = (t: string) => chaveBusca(t.replace(/\*/g, ''));

/** Índice de cada campo na linha de cabeçalho. Sem "Marca" → erro (é o único obrigatório). */
export function mapearCabecalho(cabecalho: string[]): { indices: Partial<Record<CampoPlanilha, number>>; erro?: string } {
    const indices: Partial<Record<CampoPlanilha, number>> = {};
    cabecalho.forEach((titulo, i) => {
        const k = chaveCabecalho(titulo ?? '');
        if (!k) return;
        for (const campo of Object.keys(APELIDOS) as CampoPlanilha[]) {
            if (indices[campo] === undefined && APELIDOS[campo].includes(k)) { indices[campo] = i; return; }
        }
    });
    if (indices.marca === undefined) {
        return { indices, erro: 'A planilha não tem a coluna "Marca" na primeira linha. Use a planilha modelo (botão "Baixar modelo").' };
    }
    return { indices };
}

// ── Valores conhecidos: aceita a chave ou o rótulo, sem caixa/acento ──────
const TIPO_POR_TEXTO = new Map<string, ProductItemType>(
    ITEM_TYPES.flatMap(t => [[chaveBusca(t), t], [chaveBusca(ITEM_TYPE_LABELS[t]), t]] as [string, ProductItemType][]),
);
const CATEGORIAS = Object.keys(ASSET_CATEGORY_LABELS) as AssetCategory[];
const CATEGORIA_POR_TEXTO = new Map<string, AssetCategory>(
    CATEGORIAS.flatMap(c => [[chaveBusca(c), c], [chaveBusca(ASSET_CATEGORY_LABELS[c]), c]] as [string, AssetCategory][]),
);
const SITUACAO_POR_TEXTO = new Map<string, boolean>([
    ['ativo', true], ['ativa', true], ['sim', true], ['s', true],
    ['inativo', false], ['inativa', false], ['nao', false], ['n', false],
]);

export const ROTULOS_TIPO = ITEM_TYPES.map(t => ITEM_TYPE_LABELS[t]);
export const ROTULOS_CATEGORIA = CATEGORIAS.map(c => ASSET_CATEGORY_LABELS[c]);
export const ROTULOS_SITUACAO = ['Ativo', 'Inativo'];

/** Uma linha lida: só os campos PREENCHIDOS aparecem (undefined = não mexer). */
export interface LinhaLida {
    numero: number;            // nº da linha na planilha (para a pessoa achar)
    marca: string;
    modelo?: string;
    tipo?: ProductItemType;
    codigo?: string;
    categoria?: AssetCategory;
    vida?: number;
    ficha?: string;
    especificacao?: string;
    ativo?: boolean;
    erros: string[];
}

const limpa = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Interpreta uma linha crua (valores já em texto) usando o mapa do cabeçalho. */
export function lerLinha(celulas: string[], indices: Partial<Record<CampoPlanilha, number>>, numero: number): LinhaLida | null {
    const v = (c: CampoPlanilha) => (indices[c] === undefined ? '' : limpa(celulas[indices[c]!]));
    const textoLongo = (c: CampoPlanilha) => (indices[c] === undefined ? '' : String(celulas[indices[c]!] ?? '').trim());
    const linha: LinhaLida = { numero, marca: v('marca'), erros: [] };

    const campos: CampoPlanilha[] = ['modelo', 'tipo', 'codigo', 'categoria', 'vida', 'ficha', 'especificacao', 'situacao'];
    if (!linha.marca && campos.every(c => !v(c))) return null;   // linha em branco: ignora
    if (!linha.marca) linha.erros.push('Marca em branco — todo modelo pertence a uma marca.');
    if (linha.marca.length > NOME_CATALOGO_MAX) linha.erros.push(`Marca com mais de ${NOME_CATALOGO_MAX} caracteres.`);

    const modelo = v('modelo');
    if (modelo) {
        if (modelo.length > NOME_CATALOGO_MAX) linha.erros.push(`Modelo com mais de ${NOME_CATALOGO_MAX} caracteres.`);
        linha.modelo = modelo;
    }
    const tipo = v('tipo');
    if (tipo) {
        const t = TIPO_POR_TEXTO.get(chaveBusca(tipo));
        if (t) linha.tipo = t;
        else linha.erros.push(`Tipo de item "${tipo}" não existe (use: ${ROTULOS_TIPO.join(', ')}).`);
    }
    const codigo = v('codigo');
    if (codigo) {
        if (codigo.length > 100) linha.erros.push('Código do fabricante com mais de 100 caracteres.');
        linha.codigo = codigo;
    }
    const categoria = v('categoria');
    if (categoria) {
        const c = CATEGORIA_POR_TEXTO.get(chaveBusca(categoria));
        if (c) linha.categoria = c;
        else linha.erros.push(`Categoria "${categoria}" não existe (use: ${ROTULOS_CATEGORIA.join(', ')}).`);
    }
    const vida = v('vida');
    if (vida) {
        const n = Number(vida.replace(',', '.'));
        if (Number.isInteger(n) && n >= 1 && n <= 1200) linha.vida = n;
        else linha.erros.push(`Vida útil "${vida}" inválida — meses inteiros entre 1 e 1200.`);
    }
    const ficha = v('ficha');
    if (ficha) {
        if (/^https?:\/\//i.test(ficha) && ficha.length <= 2000) linha.ficha = ficha;
        else linha.erros.push('Ficha técnica precisa ser um link que comece com http:// ou https://.');
    }
    const espec = textoLongo('especificacao');
    if (espec) {
        if (espec.length > 4000) linha.erros.push('Especificação técnica com mais de 4000 caracteres.');
        linha.especificacao = espec;
    }
    const situacao = v('situacao');
    if (situacao) {
        const s = SITUACAO_POR_TEXTO.get(chaveBusca(situacao));
        if (s !== undefined) linha.ativo = s;
        else linha.erros.push(`Situação "${situacao}" inválida (use Ativo ou Inativo).`);
    }
    // Campo de modelo sem modelo: não há onde gravar — avisa em vez de engolir.
    if (!linha.modelo && (linha.tipo || linha.codigo || linha.categoria || linha.vida || linha.ficha || linha.especificacao)) {
        linha.erros.push('Há dados de modelo (tipo, código, padrões ou ficha) sem o nome do Modelo.');
    }
    return linha;
}

// ── Plano: o que cada linha vai fazer no catálogo de UMA organização ──────
export type AcaoLinha = 'nova-marca' | 'novo-modelo' | 'nova-marca-e-modelo' | 'atualiza' | 'sem-mudanca' | 'erro';

export const ROTULO_ACAO: Record<AcaoLinha, string> = {
    'nova-marca': 'Nova marca',
    'novo-modelo': 'Novo modelo',
    'nova-marca-e-modelo': 'Nova marca e modelo',
    atualiza: 'Atualiza',
    'sem-mudanca': 'Sem mudança',
    erro: 'Erro',
};

export interface LinhaPlanejada {
    linha: LinhaLida;
    acao: AcaoLinha;
    /** Marca existente (id) — ausente = criar com `linha.marca`. */
    marcaId?: string;
    /** Modelo existente (id) — ausente com `linha.modelo` = criar. */
    modeloId?: string;
    /** Campos do modelo que mudam (só os preenchidos e diferentes). */
    patchModelo?: Partial<Pick<ProductModel, 'item_type' | 'manufacturer_code' | 'default_asset_category' |
        'default_useful_life_months' | 'datasheet_url' | 'technical_spec' | 'is_active'>>;
    /** Situação da marca que muda (linha sem modelo). */
    marcaAtiva?: boolean;
    /** O que muda, em palavras, para a prévia. */
    detalhe: string;
}

const NOMES_CAMPO: Record<string, string> = {
    item_type: 'tipo', manufacturer_code: 'código', default_asset_category: 'categoria padrão',
    default_useful_life_months: 'vida útil', datasheet_url: 'ficha técnica', technical_spec: 'especificação', is_active: 'situação',
};

/**
 * Decide a ação de cada linha contra o catálogo de UMA organização. Linhas
 * repetidas na própria planilha (mesma marca+modelo) viram erro a partir da 2ª.
 */
export function planejarImportacao(linhas: LinhaLida[], marcas: ProductBrand[], modelos: ProductModel[]): LinhaPlanejada[] {
    const vistos = new Map<string, number>();
    // marcas que esta planilha vai criar — a 2ª linha da mesma marca nova é "novo modelo"
    const marcasNovas = new Set<string>();
    return linhas.map(linha => {
        if (linha.erros.length) return { linha, acao: 'erro', detalhe: linha.erros.join(' ') };

        const chave = `${chaveBusca(linha.marca)}|${chaveBusca(linha.modelo)}`;
        const anterior = vistos.get(chave);
        if (anterior !== undefined) {
            return { linha, acao: 'erro', detalhe: `Repetida na planilha (igual à linha ${anterior}).` };
        }
        vistos.set(chave, linha.numero);

        const marca = acharPorNome(marcas, linha.marca);
        if (!marca) {
            const jaNova = marcasNovas.has(chaveBusca(linha.marca));
            marcasNovas.add(chaveBusca(linha.marca));
            if (!linha.modelo) {
                return jaNova
                    ? { linha, acao: 'sem-mudanca', detalhe: 'Marca já criada por outra linha desta planilha.' }
                    : { linha, acao: 'nova-marca', detalhe: linha.ativo === false ? 'Cria a marca (inativa).' : 'Cria a marca.' };
            }
            return {
                linha, acao: jaNova ? 'novo-modelo' : 'nova-marca-e-modelo',
                detalhe: jaNova ? 'Cria o modelo na marca nova desta planilha.' : 'Cria a marca e o modelo.',
            };
        }

        if (!linha.modelo) {
            if (linha.ativo !== undefined && linha.ativo !== marca.is_active) {
                return { linha, acao: 'atualiza', marcaId: marca.id, marcaAtiva: linha.ativo, detalhe: `Marca passa a ${linha.ativo ? 'ativa' : 'inativa'}.` };
            }
            return { linha, acao: 'sem-mudanca', marcaId: marca.id, detalhe: 'Marca já cadastrada.' };
        }

        const modelo = acharPorNome(modelos.filter(m => m.brand_id === marca.id), linha.modelo);
        if (!modelo) return { linha, acao: 'novo-modelo', marcaId: marca.id, detalhe: 'Cria o modelo na marca existente.' };

        const patch: NonNullable<LinhaPlanejada['patchModelo']> = {};
        if (linha.tipo !== undefined && linha.tipo !== modelo.item_type) patch.item_type = linha.tipo;
        if (linha.codigo !== undefined && linha.codigo !== (modelo.manufacturer_code ?? '')) patch.manufacturer_code = linha.codigo;
        if (linha.categoria !== undefined && linha.categoria !== modelo.default_asset_category) patch.default_asset_category = linha.categoria;
        if (linha.vida !== undefined && linha.vida !== modelo.default_useful_life_months) patch.default_useful_life_months = linha.vida;
        if (linha.ficha !== undefined && linha.ficha !== (modelo.datasheet_url ?? '')) patch.datasheet_url = linha.ficha;
        if (linha.especificacao !== undefined && linha.especificacao !== (modelo.technical_spec ?? '')) patch.technical_spec = linha.especificacao;
        if (linha.ativo !== undefined && linha.ativo !== modelo.is_active) patch.is_active = linha.ativo;
        const mudou = Object.keys(patch);
        if (mudou.length === 0) return { linha, acao: 'sem-mudanca', marcaId: marca.id, modeloId: modelo.id, detalhe: 'Modelo já está igual.' };
        return {
            linha, acao: 'atualiza', marcaId: marca.id, modeloId: modelo.id, patchModelo: patch,
            detalhe: `Atualiza ${mudou.map(k => NOMES_CAMPO[k]).join(', ')}.`,
        };
    });
}

/** Resumo para a prévia: quantas linhas de cada ação. */
export function resumirPlano(plano: LinhaPlanejada[]): Record<AcaoLinha, number> {
    const r: Record<AcaoLinha, number> = { 'nova-marca': 0, 'novo-modelo': 0, 'nova-marca-e-modelo': 0, atualiza: 0, 'sem-mudanca': 0, erro: 0 };
    plano.forEach(p => { r[p.acao]++; });
    return r;
}

/** Linhas que gravam alguma coisa. */
export const linhasQueGravam = (plano: LinhaPlanejada[]) => plano.filter(p => p.acao !== 'erro' && p.acao !== 'sem-mudanca');

// ── Exportação ────────────────────────────────────────────────────────────
/** Linhas da planilha exportada: um modelo por linha; marca sem modelo vira uma linha só com a marca. */
export function linhasParaExportar(
    marcas: ProductBrand[],
    modelos: ProductModel[],
    nomeDaOrg?: (orgId: string) => string,
): Record<CampoPlanilha, string | number>[] {
    const linhas: Record<CampoPlanilha, string | number>[] = [];
    const ordenadas = [...marcas].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')
        || (nomeDaOrg ? nomeDaOrg(a.organization_id).localeCompare(nomeDaOrg(b.organization_id), 'pt-BR') : 0));
    for (const b of ordenadas) {
        const org = nomeDaOrg ? nomeDaOrg(b.organization_id) : '';
        const dela = modelos.filter(m => m.brand_id === b.id).sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'));
        if (dela.length === 0) {
            linhas.push({
                marca: b.name, modelo: '', tipo: '', codigo: '', categoria: '', vida: '', ficha: '', especificacao: '',
                situacao: b.is_active ? 'Ativo' : 'Inativo', organizacao: org,
            });
            continue;
        }
        for (const m of dela) {
            linhas.push({
                marca: b.name,
                modelo: m.name,
                tipo: ITEM_TYPE_LABELS[m.item_type],
                codigo: m.manufacturer_code ?? '',
                categoria: m.default_asset_category ? ASSET_CATEGORY_LABELS[m.default_asset_category] : '',
                vida: m.default_useful_life_months ?? '',
                ficha: m.datasheet_url ?? '',
                especificacao: m.technical_spec ?? '',
                situacao: m.is_active ? 'Ativo' : 'Inativo',
                organizacao: org,
            });
        }
    }
    return linhas;
}
