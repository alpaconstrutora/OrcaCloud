-- Distância entre torres no Empreendimento (28/10/2026).
--
-- Pedido: "quando um empreendimento tem mais de uma torre a distância entre torres deve ser informada. implemente campo
-- com esse objetivo em incorporação > empreendimento > aba torres e unidades. Essa informação deve ser considerada em
-- incorporação > planta inteligente". Decisão do usuário: UMA POR PAR de torres; a Planta confere os blocos, o Gerar
-- massa usa e o "Ajustar ao Empreendimento" afasta as torres.
-- Plano: docs/planos/2026-10-28-distancia-entre-torres.md.
--
-- Lista jsonb de { torre_a, torre_b, distancia_m } no empreendimento (o par em ordem; lido por `lerDistancias`, que
-- ignora o par de torre apagada). Uma coluna, sem tabela nova: o RLS de `empreendimentos` vale para ela sem nada a
-- fazer. Só coluna nova com padrão '[]': nenhuma linha muda de sentido. Idempotente (IF NOT EXISTS). Aplicar com
-- `npx supabase db query --linked -f` — nunca `db push`.

ALTER TABLE public.empreendimentos
  ADD COLUMN IF NOT EXISTS distancias_entre_torres jsonb NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT empreendimentos_distancias_entre_torres_lista CHECK (jsonb_typeof(distancias_entre_torres) = 'array');

COMMENT ON COLUMN public.empreendimentos.distancias_entre_torres IS
  'Distância mínima entre cada par de torres, em metros: [{ "torre_a": uuid, "torre_b": uuid, "distancia_m": number }]. A Planta Inteligente confere e o Gerar massa usa.';

NOTIFY pgrst, 'reload schema';
