import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Trava: `select('*')` NOVO em tabela que guarda credencial, documento pessoal
 * ou remuneração.
 *
 * POR QUE ESTA TRAVA EXISTE, E POR QUE ELA NÃO É UMA VARREDURA
 * O levantamento de 2026-09-03 achou 205 `select('*')` em 59 arquivos de
 * `services/`. O número assusta e engana: **a RLS deste projeto recorta LINHA,
 * não COLUNA**. Um `select('*')` entrega colunas a quem já tinha direito de ler
 * aquela linha — é excesso de dado, não vazamento entre tenants.
 *
 * Cruzando as 139 tabelas lidas com `*` contra as que têm coluna sensível,
 * sobraram CINCO call sites. Revisados um a um, só um era defeito de fato
 * (`commercialService.deleteDeal`, que usava dois campos e trazia
 * `signature_token` junto). Os outros quatro estão na lista de exceções abaixo,
 * cada um com o motivo.
 *
 * Trocar os 200 restantes seria mecânico e arriscado: exige saber quais campos
 * cada consumidor usa, e errar produz `undefined` em runtime que teste nenhum
 * pega. Muito risco para ganho quase nulo. Daí a decisão: **catraca, não
 * campanha** — o que existe fica, o que nasce não passa.
 *
 * A LISTA É ESCRITA À MÃO DE PROPÓSITO
 * O CI não tem credencial do banco e não deve ter. Esta lista foi gerada do
 * schema real em 2026-09-03 e revisada: saiu `master_banks.pix_enabled`, que é
 * um booleano de capacidade, não um segredo. Tabela nova com coluna sensível
 * precisa ser acrescentada aqui — e é justamente esse acréscimo manual que
 * força alguém a olhar.
 */

// tabela → a coluna que a torna sensível (documentada para quem for ler a falha)
const TABELAS_SENSIVEIS: Record<string, string> = {
    boletos:                       'qr_pix',
    broker_portal_leads:           'cpf',
    broker_portal_proposals:       'buyer_cpf, share_token',
    broker_portal_tokens:          'token',
    broker_profiles:               'cpf',
    broker_webhook_configs:        'secret_hint',
    candidates:                    'cpf',
    client_charges:                'pix_payload',
    client_portal_tokens:          'token',
    commercial_deals:              'signature_token',
    company_bank_accounts:         'pix_chave',
    company_partners:              'pix_chave',
    condomino_portal_access:       'token',
    contract_addendums:            'signature_token',
    contract_document_versions:    'signature_token',
    contract_labor_questionnaires: 'q_salario_fixo',
    contractors:                   'banco_pix, cpf',
    contracts:                     'signature_token',
    employee_salary_history:       'new_salary, previous_salary',
    employees:                     'banco_pix, base_salary, cpf',
    hr_turnover_events:            'salario_entrada, salario_saida',
    investor_portal_tokens:        'token',
    job_openings:                  'salario_max, salario_min',
    // `org_roles` saiu desta lista em 2026-09-03: as duas colunas de faixa
    // migraram para a tabela abaixo (aplicar_20270918000025). O cargo em si não
    // tem nada sensível.
    org_role_salary_bands:         'salario_maximo, salario_minimo',
    partner_portal_tokens:         'token',
    portal_tokens:                 'token',
    pro_config:                    'pix_key',
    purchase_orders:               'share_token',
    qr_codes_obra:                 'token',
    reconciliation_aliases:        'alias_token',
    supplier_bank_accounts:        'pix_key',
    supplier_payments:             'pix_key',
    supplier_portal_tokens:        'token',
    whatsapp_config:               'api_key_ref',
};

/**
 * Exceções revisadas em 2026-09-03, uma a uma. Não é "lista para fazer passar":
 * cada linha é uma decisão com motivo. Só cresce com revisão do mesmo tipo —
 * e encolher é sempre bem-vindo.
 */
const EXCECOES: Record<string, string> = {
    'services/brokerPortalService.ts::broker_portal_tokens':
        'getTokenForBroker(brokerId): admin buscando o token de UM corretor para montar o link do portal. ' +
        'O token é o payload da função — estreitar não protege nada.',

    'services/contractLaborQuestionnaireService.ts::contract_labor_questionnaires':
        'get(contractId) devolve o questionário inteiro, tipado como ContractLaborQuestionnaire. ' +
        'q_salario_fixo é uma RESPOSTA do questionário: é o conteúdo do registro, não um campo carona.',

    'services/proService.ts::pro_config':
        'getConfig(userId) com .eq(user_id, userId): o usuário lendo a PRÓPRIA configuração, ' +
        'chave PIX dele inclusive.',

    // A quarta exceção era `orgGovernanceService.ts::org_roles`, com a ressalva
    // "quem pode ver faixa salarial de cargo é decisão de produto em aberto".
    // O dono respondeu "só RH" em 2026-09-03, e a resposta não cabia numa
    // exceção: a RLS recorta linha, não coluna, então a faixa saiu de
    // `org_roles` para `org_role_salary_bands`, com policy de admin
    // (aplicar_20270918000025). A exceção deixou de existir junto com o motivo.
};

function arquivosTs(dir: string): string[] {
    const saida: string[] = [];
    for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) saida.push(...arquivosTs(caminho));
        else if (nome.endsWith('.ts') && !nome.endsWith('.d.ts')) saida.push(caminho);
    }
    return saida;
}

/**
 * Acha `.from('tabela')` seguido de `.select('*')` dentro do MESMO encadeamento.
 * O corte é o próximo `.from(`: sem isso, um `select('*')` de outra query logo
 * abaixo seria atribuído à tabela errada.
 */
function ocorrencias(fonte: string): { tabela: string; linha: number }[] {
    const achados: { tabela: string; linha: number }[] = [];
    const re = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)/g;
    let m: RegExpExecArray | null;

    while ((m = re.exec(fonte)) !== null) {
        const tabela = m[1];
        if (!(tabela in TABELAS_SENSIVEIS)) continue;

        const inicio = m.index + m[0].length;
        const proximoFrom = fonte.slice(inicio).search(/\.from\(\s*['"]/);
        const fim = proximoFrom === -1 ? fonte.length : inicio + proximoFrom;

        if (/\.select\(\s*['"]\*['"]\s*\)/.test(fonte.slice(inicio, fim))) {
            achados.push({ tabela, linha: fonte.slice(0, m.index).split('\n').length });
        }
    }
    return achados;
}

describe('select(*) em tabela sensível', () => {
    const raiz = join(__dirname, '..');

    it('não introduz leitura nova de coluna sensível por select(*)', () => {
        const violacoes: string[] = [];

        for (const caminho of arquivosTs(join(raiz, 'services'))) {
            const rel = relative(raiz, caminho).replace(/\\/g, '/');
            const fonte = readFileSync(caminho, 'utf8');

            for (const { tabela, linha } of ocorrencias(fonte)) {
                if (`${rel}::${tabela}` in EXCECOES) continue;
                violacoes.push(
                    `${rel}:${linha} — select('*') em '${tabela}' (sensível por: ${TABELAS_SENSIVEIS[tabela]})`,
                );
            }
        }

        expect(
            violacoes,
            violacoes.length === 0
                ? ''
                : '\n\nselect(\'*\') em tabela com credencial, documento pessoal ou remuneração:\n\n' +
                  violacoes.map((v) => `  • ${v}`).join('\n') +
                  '\n\nListe as colunas que a função realmente usa. Se a coluna sensível FOR o ' +
                  'objetivo da leitura (o admin que precisa do token para montar um link, o usuário ' +
                  'lendo a própria configuração), acrescente uma entrada em EXCECOES com o motivo ' +
                  'escrito — a lista é de decisões revisadas, não de itens tolerados.\n',
        ).toEqual([]);
    });

    it('as exceções continuam existindo (lista não vira letra morta)', () => {
        // Exceção que sobrevive ao arquivo que a justificava é ruído, e ruído em
        // lista de segurança é o que faz a próxima pessoa parar de ler a lista.
        const orfas: string[] = [];

        for (const chave of Object.keys(EXCECOES)) {
            const [rel, tabela] = chave.split('::');
            let fonte: string;
            try {
                fonte = readFileSync(join(raiz, rel), 'utf8');
            } catch {
                orfas.push(`${chave} — arquivo não existe mais`);
                continue;
            }
            if (!ocorrencias(fonte).some((o) => o.tabela === tabela)) {
                orfas.push(`${chave} — o select('*') foi removido; apague esta exceção`);
            }
        }

        expect(orfas, orfas.length ? `\n\nExceções órfãs:\n${orfas.map((o) => `  • ${o}`).join('\n')}\n` : '')
            .toEqual([]);
    });
});
