import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAVA MECÂNICA — a testemunha do `fechar-frente.sh` não pode medir a pasta
 * que ela mesma acabou de apagar
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── O que aconteceu ───────────────────────────────────────────────────────
 *
 * `fechar-frente.sh` existe por causa de um acidente real: `git worktree
 * remove --force` DESCE por junção do Windows e apaga o conteúdo do ALVO. Em
 * 23/08/2026 isso comeu o `node_modules` do repositório inteiro, duas vezes. A
 * defesa é uma testemunha: conta os executáveis de `node_modules/.bin` antes e
 * depois, e falha se o número cair.
 *
 * Só que a testemunha media o lugar errado. O script fazia:
 *
 *     cd "$(dirname "$0")/.."
 *     RAIZ="$(pwd)"
 *
 * `dirname $0/..` é a pasta de onde o script FOI CHAMADO — e quem fecha uma
 * frente chama de dentro dela (`cd frente && bash scripts/fechar-frente.sh`,
 * que é o que o `nova-frente.sh` sugere). Então `RAIZ` virava a própria frente:
 * o §4 contava o `node_modules` da pasta que o §3 tinha acabado de apagar, dava
 * 0, e o script gritava ENCOLHEU com o repositório real intacto.
 *
 * Pior: a frente tem `node_modules` PRÓPRIO, com a mesma contagem do repositório
 * (o `nova-frente.sh` instala de verdade), então o "ANTES" saía plausível — mais
 * um erro engolido virando número que ninguém questiona.
 *
 * Três fechamentos seguidos em 09/09/2026 terminaram com ❌ falso. Alarme que
 * dispara sempre é alarme que se aprende a ignorar — e aí o dia em que a junção
 * comer o alvo de verdade passa batido. É por isso que o defeito era sério, e
 * não cosmético.
 *
 * ── Por que um teste, e não "tomar cuidado" ───────────────────────────────
 *
 * Mesma razão do `orgContextGuard.test.ts` e do `segurancaMigrations.test.ts`:
 * o defeito é invisível para o `tsc` (é shell), passa em toda revisão (o
 * `cd "$(dirname "$0")/.."` parece o começo canônico de qualquer script) e só
 * se manifesta na combinação "chamado de dentro da frente". Sem trava, volta.
 */

const RAIZ = path.resolve(__dirname, '..');
const script = readFileSync(path.join(RAIZ, 'scripts/fechar-frente.sh'), 'utf8');

// A parte do arquivo antes da primeira seção numerada — é onde `RAIZ` nasce.
const preambulo = script.split('# ── 0.')[0];

describe('scripts/fechar-frente.sh — a testemunha mede o repositório certo', () => {
  it('deriva a worktree principal do git, não do caminho do próprio script', () => {
    expect(
      preambulo,
      'A raiz precisa vir de `git rev-parse --git-common-dir` (que aponta para a\n' +
      'worktree PRINCIPAL mesmo chamado de dentro de uma secundária). Derivar de\n' +
      '`$0` faz a testemunha medir a frente que está sendo apagada.',
    ).toContain('--git-common-dir');
  });

  it('não define RAIZ como o `pwd` logo após o `cd` relativo ao script', () => {
    // O padrão exato que causou o bug: `cd "$(dirname "$0")/.."` e, sem nada
    // entre os dois, `RAIZ="$(pwd)"`.
    const padraoDoBug = /cd\s+"\$\(dirname\s+"\$0"\)\/\.\."[^\n]*\n\s*RAIZ="\$\(pwd\)"/;
    expect(
      padraoDoBug.test(script),
      'RAIZ="$(pwd)" imediatamente depois do `cd "$(dirname "$0")/.."` é o bug de\n' +
      '09/09/2026: com o script chamado de dentro da frente, RAIZ vira a frente.',
    ).toBe(false);
  });

  it('recusa fechar o próprio checkout de integração', () => {
    // O §3 termina em `rm -rf "$ALVO"`. Sem esta guarda, passar o caminho do
    // repositório apagaria o repositório.
    expect(
      script,
      'Falta a comparação entre o alvo resolvido e RAIZ antes do `rm -rf`.',
    ).toMatch(/ALVO_REAL[\s\S]*=\s*"\$RAIZ"/);
  });

  it('só anuncia "worktree removida" se a pasta realmente sumiu', () => {
    // Antes o ✅ saía incondicionalmente, inclusive depois de o `rm -rf` falhar
    // com "Device or resource busy" — a segunda mentira do script.
    const trecho = script.slice(script.indexOf('# ── 3.'));
    expect(
      trecho,
      'O ✅ de remoção precisa estar dentro de um teste de existência da pasta.',
    ).toMatch(/if\s+\[\s+-e\s+"\$ALVO"\s+\][\s\S]*worktree removida/);
  });
});
