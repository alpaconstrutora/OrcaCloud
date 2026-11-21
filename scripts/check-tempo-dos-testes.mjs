#!/usr/bin/env node
/**
 * Reprova arquivo de teste do projeto `leves` que passou do teto de tempo.
 *
 * ── Por que existe (20/11/2026) ───────────────────────────────────────────────
 * A CI chegou a 40–45 min em QUALQUER PR porque testes que geram a casa e o
 * prédio inteiros entraram, um por fase, na suíte que roda sempre. Cada fase
 * acrescentou alguns minutos e ninguém olhou o total: o tempo da CI não tinha
 * dono. Esses testes viraram o projeto `pesados` (`TESTES_PESADOS` em
 * `vite.config.ts`), que no PR só roda quando o PR mexe no que eles importam.
 *
 * Esta trava é o dono que faltava: um teste pesado NOVO que nascer fora da
 * lista cai em `leves`, passa do teto e a CI diz o que fazer — em vez de a CI
 * voltar a engordar calada.
 *
 * ── O teto ───────────────────────────────────────────────────────────────────
 * 60 s por ARQUIVO (soma dos testes dele, sem import/ambiente). Em 20/11 o
 * arquivo mais lento de `leves` levava 15,7 s na CI, com a suíte inteira
 * disputando as CPUs; os pesados, de 23 s a 24,6 min. Folga de 4× para a
 * variação do runner não virar CI vermelha à toa.
 *
 * Uso (a CI gera o JSON com `--reporter=json --outputFile.json=<arquivo>`):
 *   node scripts/check-tempo-dos-testes.mjs <relatorio.json> [teto_em_segundos]
 */
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

const [arquivo, tetoArg] = process.argv.slice(2);
if (!arquivo) {
  console.error('Uso: node scripts/check-tempo-dos-testes.mjs <relatorio.json> [teto_em_segundos]');
  process.exit(2);
}
const tetoS = Number(tetoArg ?? 60);
const relatorio = JSON.parse(readFileSync(arquivo, 'utf8'));

const tempos = relatorio.testResults
  .map((r) => ({ nome: relative(process.cwd(), r.name).replaceAll('\\', '/'), s: (r.endTime - r.startTime) / 1000 }))
  .sort((a, b) => b.s - a.s);

console.log(`Os 5 arquivos mais lentos de ${tempos.length} (teto ${tetoS} s):`);
for (const t of tempos.slice(0, 5)) console.log(`  ${t.s.toFixed(1).padStart(7)} s  ${t.nome}`);

const acima = tempos.filter((t) => t.s > tetoS);
if (acima.length) {
  console.error(`\n❌ ${acima.length} arquivo(s) de teste passaram de ${tetoS} s na suíte que roda em TODO PR:`);
  for (const t of acima) console.error(`  ${t.s.toFixed(1)} s  ${t.nome}`);
  console.error(
    '\nSe o teste gera casa/prédio inteiro (ou é pesado por natureza), acrescente-o a TESTES_PESADOS em vite.config.ts:' +
      '\nele passa a rodar no PR só quando o PR mexe no que ele importa, e sempre no push em main.' +
      '\nSe não deveria ser lento, o tempo é o sintoma — investigue antes de mover.',
  );
  process.exit(1);
}
console.log('\n✅ nenhum arquivo acima do teto.');
