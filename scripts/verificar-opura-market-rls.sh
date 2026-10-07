#!/usr/bin/env bash
#
# verificar-opura-market-rls.sh — prova, no banco remoto, que o ÒPURA Market
# não mistura organizações (Fase 1 de docs/planos/2026-10-07-opura-market-intelligence.md).
#
# Toda checagem roda dentro de BEGIN … ROLLBACK: nada fica gravado, nem os
# anúncios de teste do gatilho. Uma checagem por invocação, porque
# `supabase db query` só imprime o resultado da última instrução.
#
# Uso:
#   bash scripts/verificar-opura-market-rls.sh <email-membro>
#   bash scripts/verificar-opura-market-rls.sh <email-membro> --ensaio <migration.sql>
#
#   <email-membro>  conta real, membro da organização dona dos anúncios privados.
#   --ensaio        aplica a migration DENTRO de cada transação antes da checagem
#                   e desfaz no fim — prova a correção antes de gravá-la.
#
# O "usuário de outra organização" é simulado: um JWT com e-mail sem vínculo em
# organization_members. Para a RLS de opura_market_listings é exatamente o que
# qualquer conta de outra organização enxerga dos anúncios da primeira.
#
# Esperado (cada linha diz o critério):
#   RAIO membro     = GABARITO membro      (agrega globais + os da organização)
#   RAIO de fora    = GABARITO de fora     (agrega só globais)
#   RAIO membro    <> RAIO de fora         (enquanto existir anúncio privado no raio)
#   ANON            → permission denied (42501)
#   CRUZADOS        = 0
#   GATILHO         global≠privado sem pai · privado repetido com pai · área 0 sem erro ·
#                   anúncio que ganha coordenada depois também é deduplicado (UPDATE OF geom)

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

EMAIL="${1:-}"
[ -z "$EMAIL" ] && { echo "Uso: bash scripts/verificar-opura-market-rls.sh <email-membro> [--ensaio <migration.sql>]"; exit 2; }
ENSAIO=""
if [ "${2:-}" = "--ensaio" ]; then
    ENSAIO="${3:-}"
    [ -f "$ENSAIO" ] || { echo "❌ migration não encontrada: $ENSAIO"; exit 2; }
fi

# Ponto e raio de referência: centro de Cambuí (cidade piloto), 1 km.
LAT=-22.6122; LNG=-46.0578; RAIO=1000
FORA_EMAIL="prova-fase1-sem-vinculo@invalido.local"
FORA_SUB="00000000-0000-4000-8000-0000000f0001"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
falhas=0

rodar() {   # rodar <rótulo> <sql>
    local rotulo="$1" sql="$2" arq="$TMP/q.sql"
    {
        echo "BEGIN;"
        [ -n "$ENSAIO" ] && cat "$ENSAIO"
        echo "$sql"
        echo "ROLLBACK;"
    } > "$arq"
    local saida
    saida="$(npx supabase db query --linked -o csv -f "$arq" 2>&1 \
             | grep -v 'new version\|recommend updating\|Initialising login role\|Try rerunning\|^\s*$' | tr -d '\r')"
    SAIDA="$saida"
    if echo "$saida" | grep -qi "error\|ERROR:\|failed"; then
        echo "$saida" | sed "s/^/   $rotulo: /"
    else
        echo "$saida" | tail -n +2 | sed "s/^/   $rotulo: /"
    fi
    LAST="$(echo "$saida" | tail -n 1)"
}

como_usuario() {   # como_usuario <email> <sub>
    cat <<SQL
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','$2','role','authenticated','email','$1')::text, true);
SELECT set_config('request.jwt.claim.sub', '$2', true);
SQL
}

RPC="SELECT total_listings FROM public.get_terrain_radius_statistics($LAT, $LNG, $RAIO);"
gabarito() {   # gabarito <filtro de organização>
    echo "SELECT count(*) FROM public.opura_market_listings l
          WHERE l.listing_status='active' AND l.parent_listing_id IS NULL AND l.geom IS NOT NULL
            AND ST_DWithin(l.geom::geography, ST_SetSRID(ST_MakePoint($LNG, $LAT),4326)::geography, $RAIO)
            AND ($1);"
}

SUB="$(npx supabase db query --linked -o csv "SELECT id FROM auth.users WHERE lower(email)=lower('$EMAIL')" 2>/dev/null | tail -n 1 | tr -d '\r')"
[[ "$SUB" =~ ^[0-9a-f-]{36}$ ]] || { echo "❌ não achei a conta $EMAIL em auth.users"; exit 2; }

echo "── ÒPURA Market · RLS e deduplicação ${ENSAIO:+(ENSAIO: $ENSAIO, tudo desfeito)}"

rodar "GABARITO membro " "$(gabarito "l.organization_id IS NULL OR l.organization_id IN (SELECT om.organization_id FROM organization_members om WHERE lower(om.email)=lower('$EMAIL'))")"; G_M="$LAST"
rodar "GABARITO de fora" "$(gabarito "l.organization_id IS NULL")"; G_F="$LAST"
rodar "RAIO membro     " "$(como_usuario "$EMAIL" "$SUB") $RPC"; R_M="$LAST"
rodar "RAIO de fora    " "$(como_usuario "$FORA_EMAIL" "$FORA_SUB") $RPC"; R_F="$LAST"

[ "$R_M" = "$G_M" ] || { echo "   ❌ membro: RPC=$R_M, gabarito=$G_M"; falhas=$((falhas+1)); }
[ "$R_F" = "$G_F" ] || { echo "   ❌ de fora: RPC=$R_F, gabarito=$G_F (vazamento se maior)"; falhas=$((falhas+1)); }
[ "$G_M" != "$G_F" ] && [ "$R_M" = "$R_F" ] && { echo "   ❌ membro e de fora veem o mesmo número"; falhas=$((falhas+1)); }

rodar "ANON            " "SET LOCAL ROLE anon; $RPC"
echo "$SAIDA" | grep -qi "permission denied\|42501" || { echo "   ❌ anon não foi recusado"; falhas=$((falhas+1)); }

rodar "CRUZADOS        " "SELECT count(*) FROM public.opura_market_listings c JOIN public.opura_market_listings p ON p.id=c.parent_listing_id WHERE c.organization_id IS DISTINCT FROM p.organization_id;"
[ "$LAST" = "0" ] || { echo "   ❌ há vínculo entre organizações diferentes: $LAST"; falhas=$((falhas+1)); }

# Gatilho: cinco anúncios de teste no mesmo ponto, apagados pelo ROLLBACK.
GATILHO="
CREATE TEMP TABLE _prova(ordem int, rotulo text, id uuid) ON COMMIT DROP;
DO \$\$
DECLARE v_org uuid; v_cid uuid; v_id uuid; r record;
BEGIN
  SELECT organization_id INTO v_org FROM public.opura_market_listings WHERE organization_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_cid FROM public.opura_market_cities LIMIT 1;
  FOR r IN SELECT * FROM (VALUES
      (1, 'global',              NULL::uuid, 77.0),
      (2, 'privado_igual_global', v_org,     77.0),
      (3, 'privado_repetido',     v_org,     77.5),
      (4, 'privado_area_zero_a',  v_org,      0.0),
      (5, 'privado_area_zero_b',  v_org,      0.0)) AS t(ordem, rotulo, org, area)
  LOOP
    INSERT INTO public.opura_market_listings
      (city_id, organization_id, source, property_type, area_private, price, bedrooms,
       latitude, longitude, geom, listing_status)
    VALUES (v_cid, r.org, '__prova_fase1__', 'Apartamento', r.area, 300000, 9,
            -10.0, -10.0, ST_SetSRID(ST_MakePoint(-10.0, -10.0), 4326), 'active')
    RETURNING id INTO v_id;
    INSERT INTO _prova VALUES (r.ordem, r.rotulo, v_id);
  END LOOP;
  -- 6: nasce SEM coordenada e ganha depois (geocodificação posterior, Fase 3):
  -- o gatilho precisa rodar no UPDATE OF geom e achar o pai.
  INSERT INTO public.opura_market_listings
    (city_id, organization_id, source, property_type, area_private, price, bedrooms, listing_status)
  VALUES (v_cid, v_org, '__prova_fase1__', 'Apartamento', 77.2, 300000, 9, 'active')
  RETURNING id INTO v_id;
  INSERT INTO _prova VALUES (6, 'privado_localizado_depois', v_id);
  UPDATE public.opura_market_listings
     SET latitude = -10.0, longitude = -10.0, geom = ST_SetSRID(ST_MakePoint(-10.0, -10.0), 4326)
   WHERE id = v_id;
END \$\$;
SELECT string_agg(p.rotulo || '=' || CASE WHEN l.parent_listing_id IS NULL THEN 'sem_pai'
                                     ELSE 'pai:' || (SELECT p2.rotulo FROM _prova p2 WHERE p2.id = l.parent_listing_id) END,
                  ' ' ORDER BY p.ordem)
FROM _prova p JOIN public.opura_market_listings l ON l.id = p.id;"
rodar "GATILHO         " "$GATILHO"
ESPERADO="global=sem_pai privado_igual_global=sem_pai privado_repetido=pai:privado_igual_global privado_area_zero_a=sem_pai privado_area_zero_b=pai:privado_area_zero_a privado_localizado_depois=pai:privado_igual_global"
[ "$LAST" = "$ESPERADO" ] || [ "$LAST" = "\"$ESPERADO\"" ] || { echo "   ❌ gatilho: esperado [$ESPERADO]"; falhas=$((falhas+1)); }

echo
if [ "$falhas" -eq 0 ]; then echo "✅ todas as checagens passaram"; exit 0; fi
echo "❌ $falhas checagem(ns) falharam"; exit 1
