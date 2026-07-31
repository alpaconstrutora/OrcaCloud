#!/usr/bin/env bash
# Hook PostToolUse (Edit|Write) — torna mecânico o que o CLAUDE.md descrevia só
# em texto (REGRA OBRIGATÓRIA #1 e #4). Sem isso, cada sessão dependia de
# "lembrar" de rodar os scripts/check-*.sh na mão — e isso já falhou mais de
# uma vez (ver memória do projeto: feedback_aplicacao_ui_guia_amostragem_nao_basta,
# feedback_desvio_padrao_confirmar_nao_supor).
#
# O que faz, a cada Edit/Write num components/*.tsx:
#   1) roda os 4 scripts/check-*.sh mecânicos contra o arquivo tocado
#   2) se o arquivo é *Modal.tsx / *Form.tsx / *Sheet.tsx, injeta lembrete de
#      consultar UI_PATTERNS.md §2-3 antes de fechar a decisão de layout
#      (foi o que faltou na sessão do LaborEmployeeForm.tsx, 2026-07-30)
#
# Sem jq disponível neste ambiente — usa node (já é dependência do projeto)
# para parsear stdin e montar a saída JSON do hook com segurança.

set -u

input="$(cat)"

file_path=$(node -e '
let data = "";
process.stdin.on("data", c => data += c);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(data);
    const fp = (j.tool_input && j.tool_input.file_path) || (j.tool_response && j.tool_response.filePath) || "";
    process.stdout.write(fp);
  } catch (e) { process.stdout.write(""); }
});
' <<< "$input" 2>/dev/null)

[ -z "$file_path" ] && exit 0

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_dir/../.." && pwd)"

rel_path="$file_path"
case "$file_path" in
  "$project_root"/*) rel_path="${file_path#"$project_root"/}" ;;
esac
rel_path="${rel_path//\\//}"

# Só nos importa components/**/*.tsx (é o escopo do gatilho da REGRA #1/#4 no CLAUDE.md)
case "$rel_path" in
  components/*.tsx) : ;;
  *) exit 0 ;;
esac

cd "$project_root" || exit 0

output=""
failed=0

for check in check-ui-standard.sh check-system-projects.sh check-project-classification.sh check-org-selector-guard.sh; do
  if [ -x "scripts/$check" ]; then
    result=$(bash "scripts/$check" "$rel_path" 2>&1)
    code=$?
    if [ "$code" -ne 0 ]; then
      failed=1
      output="$output"$'\n\n'"── scripts/$check (exit $code) ──"$'\n'"$result"
    fi
  fi
done

basename_file=$(basename "$rel_path")
reminder=""
case "$basename_file" in
  *Modal.tsx|*Form.tsx|*Sheet.tsx)
    reminder=$'\n\n''📐 Lembrete (REGRA OBRIGATÓRIA #4 do CLAUDE.md, UI_PATTERNS.md): antes de fechar a decisão de layout desta interação (modal central / painel lateral Sheet / página dedicada), consulte UI_PATTERNS.md §2-3 e diga explicitamente, na resposta ao usuário, qual caso da tabela do §3 se aplica e por quê.'
    ;;
esac

if [ "$failed" -eq 1 ] || [ -n "$reminder" ]; then
  if [ "$failed" -eq 1 ]; then
    header="🔴 Verificação automática de $rel_path encontrou violação(ões) mecânica(s) do CLAUDE.md:"
  else
    header="ℹ️  Verificação automática de $rel_path:"
  fi
  reason="$header$output$reminder"
  REASON="$reason" node -e '
    const reason = process.env.REASON || "";
    const out = {
      decision: "block",
      reason,
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: reason }
    };
    process.stdout.write(JSON.stringify(out));
  '
fi

exit 0
