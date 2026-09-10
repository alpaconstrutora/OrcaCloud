# `fechar-frente.sh` — a testemunha media a pasta que ela mesma apagava

## Pedido original

Sessão de 2026-09-09. Depois de três frentes fechadas em sequência, todas
terminando com `❌ O node_modules do repositório ENCOLHEU: 102 → 0` enquanto o
repositório estava intacto, ofereci corrigir o script. O usuário respondeu:

> vamos corrigir

## O defeito

`scripts/fechar-frente.sh` protege contra um acidente real: `git worktree remove
--force` desce por junção do Windows e apaga o conteúdo do **alvo** — em
23/08/2026 comeu o `node_modules` do repositório inteiro, duas vezes. A defesa é
uma testemunha: conta `node_modules/.bin` antes e depois, e falha se cair.

A testemunha media o lugar errado:

```bash
cd "$(dirname "$0")/.."
RAIZ="$(pwd)"
```

`dirname $0/..` é a pasta de onde o script **foi chamado** — e quem fecha uma
frente chama de dentro dela (`cd frente && bash scripts/fechar-frente.sh`, que é
o que o `nova-frente.sh` sugere). `RAIZ` virava a própria frente. O §4 então
contava o `node_modules` da pasta que o §3 tinha acabado de apagar, dava 0, e o
script gritava.

Dois agravantes que explicam por que ninguém pegou antes:

1. A frente tem `node_modules` **próprio**, com a mesma contagem do repositório
   (o `nova-frente.sh` instala de verdade). O "ANTES: 102" saía plausível.
2. Como o `rm -rf` acontecia com o CWD dentro da pasta, o `git worktree prune`
   morria com `fatal: Unable to read current working directory` — e o script
   seguia adiante imprimindo `✅ worktree removida` mesmo assim.

**Por que isso é sério e não cosmético:** alarme que dispara sempre é alarme que
se aprende a ignorar. O dia em que a junção comesse o alvo de verdade, o `❌`
seria idêntico aos três falsos anteriores.

## O que muda — `scripts/fechar-frente.sh`

### 1. `RAIZ` vem do git, não de `$0`

`git rev-parse --path-format=absolute --git-common-dir` aponta para o `.git` da
worktree **principal** mesmo chamado de dentro de uma secundária. O script faz
`cd` para lá antes de qualquer medição — o que, de quebra, tira o CWD de dentro
da pasta condenada e faz o `git worktree remove --force` voltar a funcionar
(sem cair no `rm -rf`).

**Pronto quando:** fechar uma frente de dentro dela imprime a contagem do
repositório de integração, não a da frente.

### 2. Trava: não fechar o próprio checkout de integração

O §3 termina em `rm -rf "$ALVO"`. Se alguém passar por caminho o repositório, o
script apagaria o repositório. Agora compara o alvo resolvido com `RAIZ` e
recusa.

### 3. O `✅ worktree removida` deixa de mentir

Passa a ser condicional à pasta ter sumido de fato. Se resistir (Windows segura
a pasta enquanto um terminal estiver dentro dela), o script tenta o
`Remove-Item` do PowerShell e, se ainda assim ficar, diz isso em vez de declarar
sucesso.

## O que NÃO muda

A trava continua valendo inteira: a detecção de junção, a remoção pelo
PowerShell e a testemunha antes/depois seguem como estavam. **Isto não é
silenciar o alarme — é fazer ele medir a coisa certa.**

## Prova (executada, não inferida)

| Cenário | Script antigo | Script corrigido |
|---|---|---|
| Fechar frente normal, chamado de dentro dela | `repositório real: 5` (mediu a frente), `❌ ENCOLHEU 5 → 0`, exit 1 | `repositório real: 102`, `✅ intacto (102)`, exit 0, pasta removida |
| Worktree com junção de verdade para um alvo | — | junção detectada e removida, alvo intacto (3 arquivos), exit 0 |
| Mesma junção, com a remoção desativada (mutação) | — | `git worktree remove --force` esvaziou o alvo (3 → 0) e a testemunha pegou: `❌ ENCOLHEU 3 → 0`, exit 1 |

A terceira linha é a que importa: **o alarme continua disparando no desastre
real**, reproduzido em sandbox (`/c/tmp/testrepo`, descartado depois), sem tocar
no repositório de verdade.

## Trava contra a volta — `__tests__/fecharFrente.test.ts`

Quatro asserções sobre o texto do script: origem de `RAIZ` no `--git-common-dir`,
ausência do padrão exato que causou o bug, presença da guarda alvo≠raiz e o `✅`
condicional.

Verificado nos dois sentidos: **4 passam** no script corrigido e **4 falham** no
script de `origin/main`. Teste que não falha no código defeituoso não é trava.

## Verificação

```bash
npx vitest run __tests__/fecharFrente.test.ts
npx vitest run
```
