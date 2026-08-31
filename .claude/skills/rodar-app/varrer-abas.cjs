// Varredura de abas de um módulo nos três contextos de organização (REGRA #5).
//
// Extensão .cjs de propósito: o package.json do repo tem "type": "module",
// então um .js aqui dentro seria ESM e o require() quebraria.
//
//   cd c:/tmp/pwtest                 # onde vive o playwright-core
//   PW_SENHA='...' ORG=<uuid> EMPRESA=<uuid> \
//     node "c:/D/ORÇACLOUD/orçacloud-saas/.claude/skills/rodar-app/varrer-abas.cjs"
//
// Troque SECOES pela lista do módulo que você quer verificar (os nomes saem do
// SECTION_TO_TAB do componente, ex.: components/LaborModule.tsx).
// O `require` resolve a partir do ARQUIVO, não do cwd — e o playwright-core não
// está no repo (não é dependência do produto). Caia para a instalação avulsa.
const PW_CORE = process.env.PW_CORE || 'c:/tmp/pwtest/node_modules/playwright-core';
let chromium;
try { ({ chromium } = require('playwright-core')); }
catch { ({ chromium } = require(PW_CORE)); }

// A porta nao e fixa: com varias sessoes no mesmo repo o vite cai para 3101,
// 3104... e apontar para a porta errada testa o servidor de OUTRA sessao.
// Confira no log do `npm run dev` qual porta saiu.
const BASE = (process.env.BASE || 'http://localhost:3100').replace(/\/$/, '');
const OUT = process.env.OUT || 'c:/tmp/pwtest/';
const ORG = process.env.ORG;          // uuid de uma organização real
const EMPRESA = process.env.EMPRESA;  // uuid de uma empresa dessa organização
const EMAIL = process.env.PW_EMAIL || 'agente-leitura@alpaconstrutora.com.br';

// Presets: `SECOES=...` continua vencendo; `PRESET=amplo` cobre o miolo
// transacional do app, que é onde a classe de defeito que esta varredura pega
// costuma morar — erro engolido virando número plausível.
//
// Os dois bugs de 30/08/2026 tinham essa assinatura: o Extrato mostrava coluna
// vazia (22P02 derrubava a consulta inteira) e o P2P mostrava "0 cotações"
// (42703 caía no catch). Nenhum dos dois aparece na tela como erro, e nenhum é
// visível para o `tsc` nem para os 2000+ testes — o código está correto, a
// SUPOSIÇÃO é que estava errada. Só a tela com a rede escutada denuncia.
const PRESETS = {
  amplo: [
    // Comercial
    'condominios', 'rentals', 'gestao-vendas', 'services-commercial', 'service-contracts',
    // Financeiro
    'contas-a-pagar', 'contas-a-receber', 'extrato-bancario', 'tributos-a-pagar',
    'financial-dashboard', 'boletos-pagar',
    // Suprimentos
    'supplies-orders', 'supplies-quotations', 'supplies-contracts', 'fluxo-p2p',
    // Engenharia e Incorporação
    'eng-obras', 'eng-orcamentos', 'eng-planejamento', 'empreendimentos',
    // Corporativo
    'opura-docs', 'opura-assets', 'dividas-financiamentos',
  ],
  rh: [
    'labor-dashboard', 'labor-employees', 'labor-teams', 'labor-allocations',
    'labor-payroll', 'labor-absences', 'labor-sst', 'labor-esocial',
  ],
};

const SECOES = (process.env.SECOES || (PRESETS[process.env.PRESET] || PRESETS.rh).join(','))
  .split(',').map(s => s.trim()).filter(Boolean);

const RUIDO = ['React DevTools', 'net::ERR_', 'favicon'];
// Central de Controle: 500 com 57014 (statement timeout). Pré-existente e alheio.
const ALHEIO = /fn_reconciliation_divergences|fn_approval_pending_summary|fn_approval_action_queue|approvalService|CentralControle|57014/;
const SUSPEITO = /Não foi possível|Verifique sua conexão|Erro ao carregar|Selecione uma organização/i;

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } });

  // Sem isto a fase "TODAS" é uma farsa: o useOrgContext resolveria a org a
  // partir da empresa ativa e você testaria o contexto errado. Ver SKILL.md §5.
  let faseAtual = '';
  await p.route(/supabase\.co\/rest\/v1\/companies\?/, r =>
    faseAtual === 'TODAS'
      ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      : r.continue());

  // Em "Todas" nenhuma requisição pode carregar filtro de organização — e
  // `org_id=eq.` vazio é o 22P02 esperando para acontecer.
  let vazamentoOrg = [];
  p.on('request', r => {
    if (faseAtual === 'TODAS' && /supabase\.co\/rest\/v1\/.*[?&]org(anization)?_id=eq\./.test(r.url()))
      vazamentoOrg.push(decodeURIComponent(r.url().split('/rest/v1/')[1]).replace(/select=[^&]*/, 'select=…').slice(0, 140));
  });

  let bucket = [];
  const push = t => { if (!RUIDO.some(r => t.includes(r)) && !ALHEIO.test(t)) bucket.push(t); };
  p.on('pageerror', e => push('PAGEERROR ' + String(e).slice(0, 250)));
  p.on('console', m => { if (m.type() === 'error') push('CONSOLE ' + m.text().slice(0, 250)); });
  p.on('response', async r => {
    if (r.status() >= 400 && /supabase\.co\/(rest|rpc)/.test(r.url())) {
      let body = ''; try { body = (await r.text()).slice(0, 160); } catch {}
      push(`HTTP ${r.status()} ${(r.url().split('/rest/v1/')[1] || r.url()).split('?')[0]} :: ${body}`);
    }
  });

  // ── login (Central de Portais → Portal do Colaborador) ───────────────────
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  await p.locator('button', { hasText: 'Portal do Colaborador' }).first().click();
  await p.waitForTimeout(1200);
  await p.locator('input[type=email]').fill(EMAIL);
  await p.locator('input[type=password]').fill(process.env.PW_SENHA);
  await p.locator('button', { hasText: 'Entrar Agora' }).click();
  await p.waitForTimeout(7000);

  const semOverlay = () =>
    p.waitForFunction(() => !document.body.innerText.includes('SINCRONIZANDO'), { timeout: 60000 }).catch(() => {});
  const rotulo = async () =>
    (await p.locator('header button[aria-haspopup="menu"]').first().innerText().catch(() => '?'))
      .replace(/\s+/g, ' ').trim();

  // O menu do topo só oferece "Todas" a quem é membro de várias orgs; escrever a
  // chave do store é o único jeito de alcançar o estado null com conta de 1 org.
  const definirContexto = async (org, empresa) => {
    await p.evaluate(([o, e]) => {
      localStorage.setItem('orca_activeOrganizationId', o);
      if (e) localStorage.setItem('orca_activeEmpresaId', e);
      else localStorage.removeItem('orca_activeEmpresaId');
    }, [org, empresa]);
    await p.goto(BASE + '/#/' + SECOES[0], { waitUntil: 'domcontentloaded' });
    await p.reload({ waitUntil: 'domcontentloaded' });
    await semOverlay();
    await p.waitForTimeout(3000);
  };

  // Placar global: e o que transforma a varredura em PORTAO. Sem codigo de
  // saida, quem roda em CI/pre-deploy precisa LER o relatorio para saber se
  // passou — e ninguem le.
  const placar = { falhas: 0, telas: 0 };

  const varrer = async fase => {
    console.log(`\n######## ${fase} — topo: "${await rotulo()}" ########`);
    let ruins = 0;
    for (const sec of SECOES) {
      bucket = [];
      await p.goto(BASE + '/#/' + sec, { waitUntil: 'domcontentloaded' });
      await semOverlay();
      await p.waitForTimeout(2300);
      const txt = (await p.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
      const erroNaTela = SUSPEITO.test(txt);
      const vazio = txt.trim().length < 200;
      const ruim = bucket.length || erroNaTela || vazio;
      placar.telas++;
      // So conta como REPROVA o que e objetivo: erro de console/JS e 4xx/5xx.
      // `erroNaTela`/`vazio` sao heuristicas de texto e dao falso positivo
      // (medido em 30/08/2026: opura-docs renderiza inteiro e mesmo assim
      // casa o regex). Elas seguem no relatorio, marcadas, mas nao reprovam.
      if (bucket.length) placar.falhas += bucket.length;
      if (ruim) { ruins++; await p.screenshot({ path: `${OUT}${fase}_falha_${sec}.png` }); }
      console.log(`${sec.padEnd(30)} chars=${String(txt.length).padStart(5)} vazio=${vazio} erroNaTela=${erroNaTela} falhas=${bucket.length}${ruim ? '  <<<' : ''}`);
      for (const x of bucket) console.log('      ' + x);
    }
    console.log(`=== ${fase}: ${SECOES.length} abas, ${ruins} com problema ===`);
    if (fase === 'TODAS') {
      console.log(`    filtro de org vazando em "Todas": ${vazamentoOrg.length}`);
      for (const v of [...new Set(vazamentoOrg)].slice(0, 5)) console.log('      ' + v);
    }
  };

  faseAtual = 'TODAS';   await definirContexto('TODAS', null);    await varrer('TODAS');
  if (ORG)     { faseAtual = 'ORG';     await definirContexto(ORG, null);        await varrer('ORG'); }
  if (EMPRESA) { faseAtual = 'EMPRESA'; await definirContexto('TODAS', EMPRESA); await varrer('EMPRESA'); }

  await b.close();

  console.log(`
######## VEREDITO ########`);
  console.log(`telas visitadas: ${placar.telas}  ·  falhas objetivas: ${placar.falhas}`);
  if (placar.falhas > 0) {
    console.log('REPROVADO — ha erro de console ou HTTP 4xx/5xx. Veja as linhas com <<<.');
    process.exit(1);
  }
  console.log('OK — nenhuma tela com erro de console ou HTTP.');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
