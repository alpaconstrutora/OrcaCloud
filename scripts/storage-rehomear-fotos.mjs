/**
 * storage-rehomear-fotos.mjs — foto de colaborador e de ativo para a pasta DO REGISTRO.
 *
 * Por quê: o bucket `organization-assets` vira privado e a policy passa a liberar
 * cada arquivo pelo REGISTRO cujo id está no caminho, sob a RLS da tabela dele
 * (supabase/migrations/aplicar_20271118914000_storage_organization_assets_por_registro.sql):
 *
 *     labor-photos/<org>/<colaborador>/<arquivo>   (employees.avatar_url)
 *     asset-photos/<org>/<ativo>/<arquivo>         (opura_assets.image_url)
 *
 * As fotos antigas estão em `labor-photos/<org>/<arquivo>` e
 * `asset-photos/<org>/<arquivo>` — sem o registro no caminho, ninguém as abriria
 * depois da migration. Este script copia cada uma para a pasta do registro, troca
 * a coluna e só então apaga a original. A org da pasta é a ATUAL do registro
 * (o ativo que mudou de org vai para a pasta da org nova).
 *
 * Os outros layouts do bucket já são por registro e não mudam:
 * `labor-documents/<colaborador>/`, `labor-salary-history/<colaborador>/`,
 * `absences/<org>/<ausência>.<ext>`, `trainings/<org>/<registro>.<ext>` — o script
 * só CONFERE que o caminho gravado bate com o registro e avisa se não bater.
 *
 * Uso (PowerShell), na pasta do repositório atualizado:
 *   $env:SUPABASE_SERVICE_ROLE_KEY = Read-Host "Cole a service_role (sb_secret_...)"
 *   node scripts/storage-rehomear-fotos.mjs --ensaio    # só lista o que faria
 *   node scripts/storage-rehomear-fotos.mjs             # faz
 *
 * ORDEM: depois do merge do front (que já sobe foto na pasta do registro) e ANTES
 * da migration aplicar_20271118914000 — ela aborta se ainda houver foto no layout
 * antigo. Idempotente: rodar de novo não faz nada no que já está no lugar; se
 * uma rodada parou no meio (copiou e não trocou a coluna), a seguinte só troca.
 * Arquivo antigo sem dono (órfão) é LISTADO, nunca apagado.
 *
 * Usa a service_role (ignora RLS): a chave vem da variável de ambiente, nunca de
 * arquivo; a URL do projeto vem do .env (VITE_SUPABASE_URL).
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUCKET = 'organization-assets';

export const ALVOS = [
    { tabela: 'employees', coluna: 'avatar_url', colunaOrg: 'org_id', prefixo: 'labor-photos', rotulo: 'foto de colaborador' },
    { tabela: 'opura_assets', coluna: 'image_url', colunaOrg: 'organization_id', prefixo: 'asset-photos', rotulo: 'foto de ativo' },
];

/** Conferência só de leitura: pastas que já são por registro. */
export const CONFERIR = [
    { tabela: 'employee_documents', coluna: 'file_url', prefixo: 'labor-documents', chave: l => l.employee_id, posicao: 1 },
    { tabela: 'employee_salary_history', coluna: 'file_url', prefixo: 'labor-salary-history', chave: l => l.employee_id, posicao: 1 },
    { tabela: 'absences', coluna: 'atestado_url', prefixo: 'absences', chave: l => l.id, posicao: 'arquivo' },
    { tabela: 'employee_trainings', coluna: 'certificado_url', prefixo: 'trainings', chave: l => l.id, posicao: 'arquivo' },
];

const URL_DO_STORAGE = /\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/([^/]+)\/([^?#]+)/;

/** Valor gravado → caminho no bucket. Aceita a URL pública antiga (mesma regra de caminhoNoBucket.ts). */
export function caminhoGravado(valor) {
    if (typeof valor !== 'string') return null;
    const v = valor.trim();
    if (!v) return null;
    let caminho = v;
    if (/^https?:\/\//i.test(v)) {
        const m = URL_DO_STORAGE.exec(v);
        if (!m || m[1] !== BUCKET) return null;
        try {
            caminho = m[2].split('/').map(decodeURIComponent).join('/');
        } catch {
            return null;
        }
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
        if (!v.startsWith(`${BUCKET}:`)) return null;
        caminho = v.slice(BUCKET.length + 1);
    }
    caminho = caminho.replace(/^\/+/, '');
    if (!caminho || caminho.split('/').some(s => s === '' || s === '.' || s === '..')) return null;
    return caminho;
}

/**
 * Para onde vai a foto desta linha.
 *   ok             → já está em <prefixo>/<org>/<id>/<arquivo> e a coluna guarda o caminho
 *   fora           → não é deste bucket/prefixo (URL externa, outro layout) — não mexe
 *   mover          → `destino` calculado
 */
export function destinoDe(alvo, linha) {
    const valor = linha[alvo.coluna];
    const atual = caminhoGravado(valor);
    if (!atual || !atual.startsWith(`${alvo.prefixo}/`)) return { situacao: 'fora', atual };
    const partes = atual.split('/');
    if (partes.length === 4 && partes[2] === linha.id && valor === atual) return { situacao: 'ok', atual };
    const arquivo = partes[partes.length - 1];
    const org = linha[alvo.colunaOrg] || 'sem-organizacao';
    return { situacao: 'mover', atual, destino: `${alvo.prefixo}/${org}/${linha.id}/${arquivo}` };
}

/** Agrupa por arquivo de ORIGEM: duplicata antiga de ativo aponta para o mesmo arquivo. */
export function planejar(alvo, linhas) {
    const grupos = new Map(); // origem → [{ id, valorAntigo, destino }]
    const ok = [];
    const fora = [];
    for (const linha of linhas) {
        const d = destinoDe(alvo, linha);
        if (d.situacao === 'ok') ok.push(linha.id);
        else if (d.situacao === 'fora') fora.push({ id: linha.id, valor: linha[alvo.coluna] });
        else {
            if (!grupos.has(d.atual)) grupos.set(d.atual, []);
            grupos.get(d.atual).push({ id: linha.id, valorAntigo: linha[alvo.coluna], destino: d.destino });
        }
    }
    return { grupos, ok, fora };
}

/** Caminho gravado numa pasta que já é por registro: o id do caminho bate com o registro? */
export function conferirCaminho(conf, linha) {
    const caminho = caminhoGravado(linha[conf.coluna]);
    if (!caminho || !caminho.startsWith(`${conf.prefixo}/`)) return null; // outro bucket (ex.: certificado da Academia)
    const partes = caminho.split('/');
    const noCaminho = conf.posicao === 'arquivo'
        ? (partes[partes.length - 1] || '').split('.')[0]
        : partes[conf.posicao];
    const esperado = String(conf.chave(linha) ?? '');
    return noCaminho === esperado ? null : { id: linha.id, caminho, esperado };
}

// ─────────────────────────────────────────────────────────────────────────────

function lerEnv(raiz) {
    const arquivo = path.join(raiz, '.env');
    const env = {};
    if (!fs.existsSync(arquivo)) return env;
    for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
        const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
        if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return env;
}

async function todasAsLinhas(admin, tabela, colunas, coluna) {
    const saida = [];
    for (let de = 0; ; de += 1000) {
        const { data, error } = await admin.from(tabela).select(colunas)
            .not(coluna, 'is', null).neq(coluna, '')
            .order('id').range(de, de + 999);
        if (error) throw new Error(`${tabela}: ${error.message}`);
        saida.push(...(data ?? []));
        if (!data || data.length < 1000) return saida;
    }
}

async function existe(admin, caminho) {
    const i = caminho.lastIndexOf('/');
    const pasta = caminho.slice(0, i);
    const nome = caminho.slice(i + 1);
    const { data, error } = await admin.storage.from(BUCKET).list(pasta, { limit: 1000, search: nome });
    if (error) throw new Error(`listar ${pasta}: ${error.message}`);
    return (data ?? []).some(o => o.name === nome && o.id);
}

/** Arquivos soltos direto em <prefixo>/<pasta>/ (o layout antigo). */
async function arquivosNoLayoutAntigo(admin, prefixo) {
    const { data: pastas, error } = await admin.storage.from(BUCKET).list(prefixo, { limit: 1000 });
    if (error) throw new Error(`listar ${prefixo}: ${error.message}`);
    const saida = [];
    for (const p of pastas ?? []) {
        if (p.id) continue; // arquivo direto no prefixo (não é o layout antigo nem o novo)
        const { data: itens, error: e2 } = await admin.storage.from(BUCKET).list(`${prefixo}/${p.name}`, { limit: 1000 });
        if (e2) throw new Error(`listar ${prefixo}/${p.name}: ${e2.message}`);
        for (const it of itens ?? []) if (it.id) saida.push(`${prefixo}/${p.name}/${it.name}`);
    }
    return saida;
}

async function main() {
    const ENSAIO = process.argv.includes('--ensaio');
    const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
    const url = process.env.SUPABASE_URL || lerEnv(raiz).VITE_SUPABASE_URL;
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) throw new Error('URL do projeto ausente (VITE_SUPABASE_URL no .env, ou SUPABASE_URL).');
    if (!chave) throw new Error('Defina SUPABASE_SERVICE_ROLE_KEY (PowerShell: $env:SUPABASE_SERVICE_ROLE_KEY = Read-Host "Cole a service_role").');

    const admin = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
    console.log(`${ENSAIO ? 'ENSAIO (nada é alterado)' : 'EXECUÇÃO'} — bucket ${BUCKET} — ${url}\n`);

    let movidos = 0, atualizados = 0, falhas = 0;

    for (const alvo of ALVOS) {
        const linhas = await todasAsLinhas(admin, alvo.tabela, `id, ${alvo.coluna}, ${alvo.colunaOrg}`, alvo.coluna);
        const { grupos, ok, fora } = planejar(alvo, linhas);
        console.log(`■ ${alvo.rotulo} (${alvo.tabela}.${alvo.coluna}): ${linhas.length} com foto — ${ok.length} já no lugar, ${grupos.size} arquivo(s) a mover, ${fora.length} fora deste bucket`);
        for (const f of fora) console.log(`    · fora (não mexe): ${alvo.tabela} ${f.id} = ${f.valor}`);

        const referenciados = new Set(linhas.map(l => caminhoGravado(l[alvo.coluna])).filter(Boolean));

        for (const [origem, membros] of grupos) {
            const origemExiste = await existe(admin, origem);
            let todosOk = true;
            for (const m of membros) {
                if (m.destino !== origem && !(await existe(admin, m.destino))) {
                    if (!origemExiste) {
                        console.log(`    ✗ ${alvo.tabela} ${m.id}: arquivo ${origem} não existe no bucket — coluna fica como está`);
                        falhas++; todosOk = false;
                        continue;
                    }
                    console.log(`    ${ENSAIO ? '→ copiaria' : '→ copiando'} ${origem}\n          para ${m.destino}`);
                    if (!ENSAIO) {
                        const { error } = await admin.storage.from(BUCKET).copy(origem, m.destino);
                        if (error) { console.log(`    ✗ cópia falhou: ${error.message}`); falhas++; todosOk = false; continue; }
                    }
                    movidos++;
                }
                console.log(`    ${ENSAIO ? '→ atualizaria' : '→ atualizando'} ${alvo.tabela} ${m.id}.${alvo.coluna}`);
                if (!ENSAIO) {
                    // Só troca se a coluna ainda guarda o valor lido (alguém pode ter trocado a foto no meio).
                    const { data, error } = await admin.from(alvo.tabela)
                        .update({ [alvo.coluna]: m.destino })
                        .eq('id', m.id).eq(alvo.coluna, m.valorAntigo)
                        .select('id');
                    if (error || !data?.length) {
                        console.log(`    ✗ não atualizou ${alvo.tabela} ${m.id}: ${error?.message ?? 'a coluna mudou desde a leitura'}`);
                        falhas++; todosOk = false;
                        continue;
                    }
                }
                atualizados++;
            }
            // A original sai só quando todas as linhas que apontavam para ela foram trocadas.
            if (origemExiste && todosOk && !membros.some(m => m.destino === origem)) {
                console.log(`    ${ENSAIO ? '→ apagaria' : '→ apagando'} a original ${origem}`);
                if (!ENSAIO) {
                    const { error } = await admin.storage.from(BUCKET).remove([origem]);
                    if (error) console.log(`    ! original ficou (apagar à mão depois): ${error.message}`);
                }
            }
        }

        const antigos = await arquivosNoLayoutAntigo(admin, alvo.prefixo);
        const orfaos = antigos.filter(c => !referenciados.has(c));
        if (orfaos.length) {
            console.log(`    órfão(s) no layout antigo, sem registro que aponte para eles (NÃO apagados; depois da migration só a service_role os lê):`);
            for (const o of orfaos) console.log(`      · ${o}`);
        }
        console.log('');
    }

    console.log('■ Conferência das pastas que já são por registro (só leitura)');
    for (const conf of CONFERIR) {
        const colunas = conf.tabela === 'absences' || conf.tabela === 'employee_trainings'
            ? `id, ${conf.coluna}` : `id, employee_id, ${conf.coluna}`;
        const linhas = await todasAsLinhas(admin, conf.tabela, colunas, conf.coluna);
        const errados = linhas.map(l => conferirCaminho(conf, l)).filter(Boolean);
        console.log(`    ${conf.tabela}.${conf.coluna}: ${linhas.length} com arquivo, ${errados.length} com caminho que não bate com o registro`);
        for (const e of errados) console.log(`      ! ${e.id}: ${e.caminho} (esperado ${e.esperado} no caminho) — ficará inalcançável; corrigir à mão`);
    }

    console.log(`\n${ENSAIO ? 'Ensaio' : 'Feito'}: ${movidos} arquivo(s) ${ENSAIO ? 'a copiar' : 'copiado(s)'}, ${atualizados} linha(s) ${ENSAIO ? 'a atualizar' : 'atualizada(s)'}, ${falhas} falha(s).`);
    if (!ENSAIO && falhas === 0) {
        console.log('Próximo passo: npx supabase db query --linked -f supabase/migrations/aplicar_20271118914000_storage_organization_assets_por_registro.sql');
    }
    if (falhas > 0) process.exitCode = 1;
}

const executadoDireto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executadoDireto) {
    main().catch(err => {
        console.error(`\n✗ ${err.message ?? err}`);
        process.exit(1);
    });
}
