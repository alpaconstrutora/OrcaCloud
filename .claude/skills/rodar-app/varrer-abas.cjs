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

const OUT = process.env.OUT || 'c:/tmp/pwtest/';
const ORG = process.env.ORG;          // uuid de uma organização real
const EMPRESA = process.env.EMPRESA;  // uuid de uma empresa dessa organização
const EMAIL = process.env.PW_EMAIL || 'agente-leitura@alpaconstrutora.com.br';

const SECOES = (process.env.SECOES || [
  'labor-dashboard', 'labor-employees', 'labor-teams', 'labor-allocations',
  'labor-payroll', 'labor-absences', 'labor-sst', 'labor-esocial',
].join(',')).split(',');

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
  await p.goto('http://localhost:3100/', { waitUntil: 'networkidle' });
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
    await p.goto('http://localhost:3100/#/' + SECOES[0], { waitUntil: 'domcontentloaded' });
    await p.reload({ waitUntil: 'domcontentloaded' });
    await semOverlay();
    await p.waitForTimeout(3000);
  };

  const varrer = async fase => {
    console.log(`\n######## ${fase} — topo: "${await rotulo()}" ########`);
    let ruins = 0;
    for (const sec of SECOES) {
      bucket = [];
      await p.goto('http://localhost:3100/#/' + sec, { waitUntil: 'domcontentloaded' });
      await semOverlay();
      await p.waitForTimeout(2300);
      const txt = (await p.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
      const erroNaTela = SUSPEITO.test(txt);
      const vazio = txt.trim().length < 200;
      const ruim = bucket.length || erroNaTela || vazio;
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
})().catch(e => { console.error('FATAL', e); process.exit(1); });
