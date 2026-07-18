-- ─────────────────────────────────────────────────────────────────────────────
-- Empreendimento: eixo de LOCAÇÃO independente do eixo de VENDA
-- ─────────────────────────────────────────────────────────────────────────────
-- `empreendimento_units.status` (DISPONIVEL/RESERVADO/VENDIDO/PERMUTADO) é o eixo
-- de VENDA e continua intocado. A ocupação de aluguel não cabia nele — por isso
-- não existia pull de status vindo do módulo de Locações.
--
-- Em vez de estender o CHECK de `status` (o que faria os dois eixos disputarem um
-- único slot: o pull de Vendas sobrescreveria o LOCADO trazido pelo pull de
-- Locações, e vice-versa), cria-se uma coluna própria. Isso preserva o princípio
-- já escrito em 20270717000002: uma unidade pode estar publicada em Vendas E em
-- Locações ao mesmo tempo, sem um status contaminar o outro.
--
-- `rental_price` = aluguel-alvo definido no Empreendimento (NÃO é o VGV de
-- `price`, que é preço de venda). Publicar em Locações passa a herdar este valor
-- em vez de R$ 0, permitindo detectar divergência de aluguel como Vendas faz.
--
-- Sem backfill de ocupação: tudo nasce DISPONIVEL e o primeiro "Sync de Locações"
-- corrige a partir da fonte real — não inventar ocupação sem ler o módulo.
--
-- RLS herdada de `empreendimento_units` (nenhuma policy nova).
-- Aplicar MANUALMENTE no Supabase (nunca `supabase db push`). Idempotente.

ALTER TABLE public.empreendimento_units
    ADD COLUMN IF NOT EXISTS rental_status TEXT NOT NULL DEFAULT 'DISPONIVEL';

-- CHECK em statement separado (padrão do módulo: evita janela de deadlock)
ALTER TABLE public.empreendimento_units
    DROP CONSTRAINT IF EXISTS empreendimento_units_rental_status_check;

ALTER TABLE public.empreendimento_units
    ADD CONSTRAINT empreendimento_units_rental_status_check
    CHECK (rental_status IN ('DISPONIVEL', 'RESERVADO', 'LOCADO', 'MANUTENCAO'));

ALTER TABLE public.empreendimento_units
    ADD COLUMN IF NOT EXISTS rental_price NUMERIC;
