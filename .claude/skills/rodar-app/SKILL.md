---
name: rodar-app
description: Sobe o ÒPURA/ORÇACLOUD e dirige a interface com Playwright — login real, troca do contexto de organização (Todas / organização / empresa) e varredura de abas coletando erro de JS, console e 4xx/5xx do PostgREST. Use ao pedir "rodar o app", "abrir a tela", "tirar print", "verificar na interface de verdade" ou ao confirmar que uma correção funciona no app, não só nos testes.
---

# Rodar e dirigir o ÒPURA

Verificado em 2026-08-23/24 varrendo as 32 abas de RH nos três contextos de
organização. Os tempos e seletores abaixo são os que funcionaram — não são
chutes.

## 1. Subir o servidor

```bash
cd "c:/D/ORÇACLOUD/orçacloud-saas"
npm run dev          # vite, SEMPRE em http://localhost:3100
```

Suba em background e confira o log antes de dirigir. Ao terminar, **derrube o
que você subiu** (outra sessão pode estar usando o repo, mas não a sua porta):

```powershell
Get-NetTCPConnection -LocalPort 3100 -State Listen |
  Select-Object -First 1 -ExpandProperty OwningProcess |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

## 2. Playwright — o que já existe na máquina

Não instale nada. Já está posto:

- `playwright-core` em `c:/tmp/pwtest/node_modules` — rode os scripts **de dentro
  de `c:/tmp/pwtest`**, senão o `require` não resolve.
- Chrome do sistema: `C:/Program Files/Google/Chrome/Application/chrome.exe`
  (passe em `executablePath`; não há browser baixado pelo Playwright).

## 3. Login

A raiz é a **Central de Portais**, não um formulário. São dois passos:

```js
await p.goto('http://localhost:3100/', { waitUntil: 'networkidle' });
await p.locator('button', { hasText: 'Portal do Colaborador' }).first().click();
await p.locator('input[type=email]').fill('agente-leitura@alpaconstrutora.com.br');
await p.locator('input[type=password]').fill(process.env.PW_SENHA);
await p.locator('button', { hasText: 'Entrar Agora' }).click();
await p.waitForTimeout(7000);      // o boot do app é lento
```

**Credencial**: usuário de leitura dedicado, perfil Membro, não-admin — o RLS se
aplica igual a qualquer usuário logado. **A senha não fica gravada em lugar
nenhum**: peça ao usuário a cada sessão e passe por variável de ambiente
(`PW_SENHA=... node script.js`), nunca escrita dentro do arquivo.

## 4. Navegar

Rotas por hash: `http://localhost:3100/#/<secao>`. Os nomes de seção estão em
`SECTION_TO_TAB` no módulo correspondente (ex.: `components/LaborModule.tsx` →
`labor-dashboard`, `labor-allocations`, `labor-payroll`, …).

⚠️ **Espere o overlay de boot sumir antes de qualquer screenshot** — senão você
fotografa "SINCRONIZANDO ÒPURA..." e acha que a tela está quebrada:

```js
await p.waitForFunction(() => !document.body.innerText.includes('SINCRONIZANDO'),
                        { timeout: 60000 }).catch(() => {});
await p.waitForTimeout(3000);
```

## 5. Trocar o contexto de organização (o pulo do gato)

O seletor do topo só oferece **"Todas as organizações"** para quem é membro de
mais de uma org. A conta de leitura é membro de UMA — pelo menu você nunca
alcança o estado `null`. Escreva direto a chave que o store lê no boot
(`store/useStore.ts`, sentinela literal `'TODAS'`) e recarregue:

```js
const definirContexto = async (org, empresa) => {   // org: uuid ou 'TODAS'
  await p.evaluate(([o, e]) => {
    localStorage.setItem('orca_activeOrganizationId', o);
    if (e) localStorage.setItem('orca_activeEmpresaId', e);
    else localStorage.removeItem('orca_activeEmpresaId');
  }, [org, empresa]);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
};
```

Os **três** contextos que qualquer tela precisa aguentar (CLAUDE.md REGRA #5):

| Contexto | Chamada | O que esperar |
|---|---|---|
| Todas as organizações | `('TODAS', null)` **+ empresas vazias** (ver abaixo) | rótulo "Contexto atual" |
| Organização específica | `('<uuid-org>', null)` | nome da organização |
| Empresa (herda a org dela) | `('TODAS', '<uuid-empresa>')` | nome da empresa |

⚠️ **Escrever `'TODAS'` NÃO basta para alcançar `orgId === null`.** Com uma
empresa ativa, o `useOrgContext` resolve `Company.org_id` e devolve a org dela —
por projeto, não por bug (cascata #2 do hook). Com a conta de leitura, que enxerga
uma empresa só, o app acaba nesse estado sozinho e você testa "empresa"
achando que testou "Todas". Para o `null` de verdade, corte a listagem de
empresas na rede:

```js
await p.route(/supabase\.co\/rest\/v1\/companies\?/, r =>
  r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
```

**Não confie no rótulo do topo para saber em que estado você está** — durante o
boot ele mostra "Contexto atual" mesmo com org definida. As duas provas
confiáveis são `localStorage.orca_activeEmpresaId` (tem de estar `null`) e as
requisições: em "Todas" **nenhuma** URL pode conter `org_id=eq.`/`organization_id=eq.`.

O terceiro contexto é o mais esquecido e o que mais quebra.

## 6. Coletar falha de verdade

Print bonito não prova nada. Escute os três canais — o 400 do PostgREST é o que
denuncia `22P02` (org vazia em coluna uuid) e `42703` (select pedindo coluna que
não existe):

```js
p.on('pageerror', e => push('PAGEERROR ' + e));
p.on('console', m => { if (m.type() === 'error') push('CONSOLE ' + m.text()); });
p.on('response', async r => {
  if (r.status() >= 400 && /supabase\.co\/(rest|rpc)/.test(r.url()))
    push(`HTTP ${r.status()} ${r.url()} :: ${(await r.text()).slice(0, 160)}`);
});
```

E marque a tela como suspeita se o texto do `body` casar com
`/Não foi possível|Verifique sua conexão|Erro ao carregar|Selecione uma organização/`
ou vier com menos de ~200 caracteres.

**Ruído conhecido, filtre para não poluir o veredito:** as RPCs
`fn_reconciliation_divergences`, `fn_approval_pending_summary` e
`fn_approval_action_queue` devolvem 500 com `57014 statement timeout` — é a
Central de Controle, pré-existente e alheio ao módulo que você está checando.

## 7. Script pronto — e é um PORTÃO, não só um relatório

`varrer-abas.cjs`, ao lado deste arquivo, faz tudo: login → os 3 contextos → as
abas → relatório com screenshot só das que falharam → **veredito com código de
saída**. Rode **de dentro de `c:/tmp/pwtest`** (é onde está o `playwright-core`):

```bash
cd c:/tmp/pwtest
PW_SENHA='...' PRESET=amplo ORG=<uuid-org> EMPRESA=<uuid-empresa> \
  node "c:/D/ORÇACLOUD/orçacloud-saas/.claude/skills/rodar-app/varrer-abas.cjs"
echo $?     # 0 = passou · 1 = há erro de console ou HTTP 4xx/5xx
```

| Variável | Para quê |
|---|---|
| `PW_SENHA` | senha do agente-leitura. **Nunca escrita em arquivo** (§3) |
| `PRESET` | `amplo` (23 telas do miolo transacional) ou `rh` (8 de RH). Default `rh` |
| `SECOES` | lista explícita; **vence o preset** |
| `BASE` | URL do vite. Default `http://localhost:3100` |
| `ORG` / `EMPRESA` | uuids; sem eles roda só a fase "Todas" |

⚠️ **Confira a porta no log do `npm run dev`.** Com várias sessões no mesmo
repo o vite cai para 3101, 3104… e apontar para a porta errada testa o servidor
de OUTRA sessão — passando ou falhando por código que não é o seu.

### O que REPROVA, e o que não

Só conta como falha o que é objetivo: **erro de console/JS e HTTP 4xx/5xx**.
As heurísticas de texto (`erroNaTela`, `vazio`) continuam no relatório, marcadas
com `<<<`, mas **não reprovam** — em 30/08/2026 `opura-docs` renderizou inteiro
e mesmo assim casou o regex, e `fluxo-p2p` apareceu `vazio` só porque a tela
ainda não tinha pintado na janela de medição. Portão que reprova por heurística
é portão que alguém desliga.

### Por que rodar isto periodicamente

Os dois bugs achados em 30/08/2026 tinham a **mesma assinatura: erro engolido
virando número plausível.** O Extrato mostrava a coluna de origem vazia (um
`22P02` derrubava a consulta inteira, inclusive os ids válidos do lote); o
Fluxo P2P mostrava "0 cotações" (um `42703` caía no `catch`, que devolve 0).

Nenhum dos dois aparece na tela como erro. Nenhum é visível para o `tsc` nem
para os 2000+ testes — o código está sintaticamente correto, o que está errado é
a **suposição** (o formato do `reference_id`; a existência da coluna). Só a tela
real, com a rede escutada, denuncia. É a camada que falta entre o teste unitário
e o usuário reclamando.

Para descobrir os uuids, consulte `organizations` e `companies` pela API com a
mesma conta de leitura.
