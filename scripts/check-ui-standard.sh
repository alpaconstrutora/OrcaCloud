#!/usr/bin/env bash
# Autoverificação mecânica do docs/ui_ux_guia_unificado.md (ver CLAUDE.md,
# REGRA OBRIGATÓRIA #1). Roda 4 checagens binárias — sem exceção "opcional",
# sem julgamento humano no meio do caminho. Exit 1 se achar qualquer violação.
#
# Uso:
#   scripts/check-ui-standard.sh components/ClientList.tsx [outro.tsx ...]
#
# As 4 checagens (todas com base direta no guia, nada inventado):
#   1) font-bold / font-black / font-mono dentro de <td>...</td>           (§7, §7.1)
#   2) rounded-full + uppercase no MESMO className (badge/pílula)          (§8)
#   3) confirm()/window.confirm() nativo (arg string), não useConfirm()    (§14)
#   4) useState(...) para uma variável de busca, em vez de usePersistedState (§3)
#
# + 1 checagem de AVISO (não conta para o exit code — dívida de migração
#   incremental, não bloqueio):
#   5) botão-ícone hand-rolled com a assinatura antiga deprecada pelo §9.2
#      (`p-2.5 ... border-slate-200 ... rounded-xl ... active:scale-95`) em
#      vez de `<ActionIconButton>`. É aviso, não erro, porque a migração de
#      ~156 arquivos é incremental por lote (PLANO_PADRONIZACAO_BOTOES_ACAO.md),
#      não é pra travar edição não relacionada num arquivo ainda não migrado.
#
# Isso NÃO substitui a auditoria seção-por-seção do CHECKLIST DE AUDITORIA
# COMPLETA (que cobre decisões de design, não só padrões de texto) — é só a
# parte que dá pra travar sem julgamento humano.

set -u

if [ "$#" -eq 0 ]; then
  echo "Uso: $0 <arquivo.tsx> [arquivo2.tsx ...]" >&2
  exit 2
fi

violations=0

check_file() {
  local file="$1"

  if [ ! -f "$file" ]; then
    echo "❌ Arquivo não encontrado: $file" >&2
    violations=$((violations + 1))
    return
  fi

  echo "── Verificando: $file"

  # 1) font-bold/font-black/font-mono dentro de <td>...</td>
  #    Estado simples por linha: entra em modo "dentro de TD" ao ver <td,
  #    sai ao ver </td>. Não cobre <td> que abre e fecha aninhado em múltiplas
  #    linhas com outro <td> no meio (padrão não usado neste projeto).
  #    Exceção: <td colSpan=...> é a linha de empty-state (§12) — o título/botão
  #    dentro dela usa font-bold legitimamente (mesmo padrão do snippet oficial
  #    do §12), não é uma célula de dado.
  local td_hits
  # A máquina de estado tinha DOIS jeitos de ficar presa aberta, e os dois
  # produziam enxurrada de falso positivo em <h1>/<h3>/<p> que nunca estiveram
  # dentro de célula:
  #
  #   1. `<td />` SELF-CLOSING (espaçador do §6.1.1) abria o estado e nunca
  #      fechava, porque não existe `</td>` correspondente. Foi o que fez
  #      ContractDetailView.tsx acusar dois empty states 100 linhas abaixo.
  #   2. A tag literal dentro de COMENTÁRIO ligava o estado — em DealModal.tsx
  #      um comentário mencionando a tag deixava ~2000 linhas sob suspeita.
  #      Chegou-se a evitar escrever a tag em comentário por causa disso, o que
  #      é a ferramenta ditando como se comenta o código.
  #
  # Um verificador que grita lobo é ignorado, e aí não verifica nada.
  td_hits=$(awk '
    # linha que é SÓ comentário não conta como marcação
    /^[[:space:]]*(\/\/|\*|\/\*|\{\/\*)/ { next }
    /<td[ >]/ && /colSpan/ { next }
    # self-closing não abre estado; pode fechar um que já estava aberto
    /<td[^>]*\/>/ { next }
    /<td[ >]/ { in_td = 1 }
    in_td && /font-bold|font-black|font-mono/ {
      print NR": "$0
    }
    /<\/td>/ { in_td = 0 }
  ' "$file")

  if [ -n "$td_hits" ]; then
    echo "  ❌ [§7] font-bold/font-black/font-mono dentro de <td> (proibido — só font-medium é permitido, e só para valor financeiro):"
    echo "$td_hits" | sed 's/^/       linha /'
    violations=$((violations + 1))
  fi

  # 2) rounded-full + uppercase no mesmo className (pílula de badge — §8)
  local badge_hits
  badge_hits=$(grep -nE 'className=\{?`?[^}]*rounded-full[^}]*uppercase|className=\{?`?[^}]*uppercase[^}]*rounded-full' "$file" || true)
  if [ -n "$badge_hits" ]; then
    echo "  ❌ [§8] rounded-full + uppercase no mesmo className (pílula de badge proibida — texto simples colorido, sem fundo/pílula/uppercase):"
    echo "$badge_hits" | sed 's/^/       /'
    violations=$((violations + 1))
  fi

  # 3) confirm()/window.confirm() nativo — argumento string/template, não objeto
  #    useConfirm() retorna uma função chamada com objeto: confirm({ title: ... })
  #    confirm nativo é chamado com string: confirm('...') ou confirm(`...`)
  local confirm_hits
  confirm_hits=$(grep -nE '(^|[^.a-zA-Z])(window\.)?confirm\(\s*[`'"'"'"]' "$file" || true)
  if [ -n "$confirm_hits" ]; then
    echo "  ❌ [§14] confirm()/window.confirm() nativo com string (proibido — usar useConfirm() de ./ui/confirm com objeto {title, message, variant}):"
    echo "$confirm_hits" | sed 's/^/       /'
    violations=$((violations + 1))
  fi

  # 4) useState para variável de busca (deveria ser usePersistedState — §3)
  #    Cobre "search" antes OU depois de useState na mesma linha
  #    (ex: const [search, setSearch] = React.useState('') também conta).
  local search_hits
  search_hits=$(grep -niE 'useState' "$file" | grep -iE 'search' || true)
  if [ -n "$search_hits" ]; then
    echo "  ❌ [§3] useState usado para campo de busca (deveria ser usePersistedState — filtro precisa sobreviver a navegação/reload):"
    echo "$search_hits" | sed 's/^/       /'
    violations=$((violations + 1))
  fi

  # 5) AVISO — botão-ícone hand-rolled com a assinatura antiga (§9.2, deprecada
  #    em 2026-07-14). Não conta para o exit code: é dívida de migração
  #    incremental, não bloqueio de PR.
  local old_icon_button_hits
  old_icon_button_hits=$(grep -nE 'p-2\.5[^"'"'"'`]*border-slate-200[^"'"'"'`]*rounded-xl|rounded-xl[^"'"'"'`]*border-slate-200[^"'"'"'`]*p-2\.5' "$file" || true)
  if [ -n "$old_icon_button_hits" ]; then
    echo "  ⚠️  [§9.2] botão-ícone com estilo antigo deprecado (migrar para <ActionIconButton> de ./ui/ActionIconButton — não conta como violação, é aviso de dívida):"
    echo "$old_icon_button_hits" | sed 's/^/       /'
  fi
}

for f in "$@"; do
  check_file "$f"
done

echo "──"
if [ "$violations" -eq 0 ]; then
  echo "✅ Nenhuma violação mecânica encontrada."
  exit 0
else
  echo "❌ $violations verificação(ões) com violação. Corrija antes de reportar a tarefa como concluída."
  echo "   (Exceções documentadas no guia devem ser justificadas manualmente, não silenciadas aqui.)"
  exit 1
fi
