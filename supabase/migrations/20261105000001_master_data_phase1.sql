-- =============================================================================
-- Dados Mestres — Fase 1
-- =============================================================================
-- Núcleo de cadastros globais reutilizáveis pelos módulos do ORÇACLOUD.
-- Tabelas globais (sem organization_id): leitura pública, escrita só por
-- service_role. Manutenção via migrations / jobs de seed.
--
-- Escopo Fase 1:
--   - master_countries
--   - master_states
--   - master_cities         (estrutura + seed de capitais; full IBGE em script à parte)
--   - master_banks          (lista BACEN curada)
--   - master_units_of_measure (construção civil)
--
-- Regra: registros system_default=true são read-only mesmo para admins de org;
-- customizações por empresa ficam para Fase 2 (overrides em master_items).
-- =============================================================================

-- Extensão necessária para busca textual em cidades
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------
-- 1. PAÍSES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_countries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iso2            CHAR(2) NOT NULL UNIQUE,
  iso3            CHAR(3) NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  name_pt         TEXT NOT NULL,
  ddi             TEXT,
  currency_code   CHAR(3),
  language        TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  system_default  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_master_countries_active ON public.master_countries(is_active) WHERE is_active;

-- -----------------------------------------------------------------------------
-- 2. ESTADOS (UFs)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_states (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id      UUID NOT NULL REFERENCES public.master_countries(id) ON DELETE RESTRICT,
  code            TEXT NOT NULL,            -- UF: 'SP', 'RJ'...
  name            TEXT NOT NULL,
  ibge_code       INTEGER UNIQUE,           -- código IBGE do estado (Brasil)
  region          TEXT,                     -- Norte/Nordeste/Sul/Sudeste/Centro-Oeste
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  system_default  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (country_id, code)
);

CREATE INDEX IF NOT EXISTS idx_master_states_country ON public.master_states(country_id);

-- -----------------------------------------------------------------------------
-- 3. CIDADES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_cities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id        UUID NOT NULL REFERENCES public.master_states(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL,
  ibge_code       INTEGER UNIQUE,           -- código IBGE de 7 dígitos
  latitude        NUMERIC(10,7),
  longitude       NUMERIC(10,7),
  is_capital      BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  system_default  BOOLEAN NOT NULL DEFAULT TRUE,
  source_version  TEXT,                     -- ex: 'IBGE-2024'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_master_cities_state ON public.master_cities(state_id);
CREATE INDEX IF NOT EXISTS idx_master_cities_name_trgm ON public.master_cities USING GIN (name gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- 4. BANCOS (lista BACEN)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_banks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,     -- código COMPE: '001', '341', '237', '260'...
  ispb            CHAR(8) UNIQUE,           -- ISPB para PIX (8 dígitos)
  name            TEXT NOT NULL,
  short_name      TEXT,
  pix_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  system_default  BOOLEAN NOT NULL DEFAULT TRUE,
  source_version  TEXT,                     -- ex: 'BACEN-2024-11'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_master_banks_active ON public.master_banks(is_active) WHERE is_active;

-- -----------------------------------------------------------------------------
-- 5. UNIDADES DE MEDIDA
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_units_of_measure (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol          TEXT NOT NULL UNIQUE,     -- 'm²', 'kg', 'sc', 'un'
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,            -- 'comprimento'|'area'|'volume'|'massa'|'tempo'|'embalagem'|'contagem'|'energia'|'outro'
  base_factor     NUMERIC,                  -- fator para unidade base (kg→1000g) — opcional
  base_symbol     TEXT,                     -- símbolo da unidade base
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  system_default  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_master_units_category ON public.master_units_of_measure(category);

-- =============================================================================
-- RLS — leitura pública (authenticated), escrita só service_role
-- =============================================================================
ALTER TABLE public.master_countries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_states           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_cities           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_banks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_units_of_measure ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'master_countries','master_states','master_cities','master_banks','master_units_of_measure'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (true)',
      t, t
    );
  END LOOP;
END$$;

-- Sem políticas de INSERT/UPDATE/DELETE: bloqueia tudo exceto service_role.

-- =============================================================================
-- SEEDS
-- =============================================================================

-- PAÍSES — Brasil + vizinhos imediatos
INSERT INTO public.master_countries (iso2, iso3, name, name_pt, ddi, currency_code, language) VALUES
  ('BR','BRA','Brazil','Brasil','55','BRL','pt-BR'),
  ('AR','ARG','Argentina','Argentina','54','ARS','es'),
  ('UY','URY','Uruguay','Uruguai','598','UYU','es'),
  ('PY','PRY','Paraguay','Paraguai','595','PYG','es'),
  ('US','USA','United States','Estados Unidos','1','USD','en'),
  ('PT','PRT','Portugal','Portugal','351','EUR','pt-PT')
ON CONFLICT (iso2) DO NOTHING;

-- ESTADOS BR — 27 UFs
WITH br AS (SELECT id FROM public.master_countries WHERE iso2='BR')
INSERT INTO public.master_states (country_id, code, name, ibge_code, region)
SELECT br.id, v.code, v.name, v.ibge, v.region FROM br, (VALUES
  ('AC','Acre',                 12, 'Norte'),
  ('AL','Alagoas',              27, 'Nordeste'),
  ('AP','Amapá',                16, 'Norte'),
  ('AM','Amazonas',             13, 'Norte'),
  ('BA','Bahia',                29, 'Nordeste'),
  ('CE','Ceará',                23, 'Nordeste'),
  ('DF','Distrito Federal',     53, 'Centro-Oeste'),
  ('ES','Espírito Santo',       32, 'Sudeste'),
  ('GO','Goiás',                52, 'Centro-Oeste'),
  ('MA','Maranhão',             21, 'Nordeste'),
  ('MT','Mato Grosso',          51, 'Centro-Oeste'),
  ('MS','Mato Grosso do Sul',   50, 'Centro-Oeste'),
  ('MG','Minas Gerais',         31, 'Sudeste'),
  ('PA','Pará',                 15, 'Norte'),
  ('PB','Paraíba',              25, 'Nordeste'),
  ('PR','Paraná',               41, 'Sul'),
  ('PE','Pernambuco',           26, 'Nordeste'),
  ('PI','Piauí',                22, 'Nordeste'),
  ('RJ','Rio de Janeiro',       33, 'Sudeste'),
  ('RN','Rio Grande do Norte',  24, 'Nordeste'),
  ('RS','Rio Grande do Sul',    43, 'Sul'),
  ('RO','Rondônia',             11, 'Norte'),
  ('RR','Roraima',              14, 'Norte'),
  ('SC','Santa Catarina',       42, 'Sul'),
  ('SP','São Paulo',            35, 'Sudeste'),
  ('SE','Sergipe',              28, 'Nordeste'),
  ('TO','Tocantins',            17, 'Norte')
) AS v(code,name,ibge,region)
ON CONFLICT (country_id, code) DO NOTHING;

-- CIDADES — capitais (full IBGE será carregada por script separado)
INSERT INTO public.master_cities (state_id, name, ibge_code, latitude, longitude, is_capital, source_version)
SELECT s.id, v.name, v.ibge, v.lat, v.lon, TRUE, 'IBGE-2024-seed'
FROM public.master_states s
JOIN (VALUES
  ('AC','Rio Branco',          1200401,  -9.97499, -67.8243),
  ('AL','Maceió',              2704302,  -9.66599, -35.7350),
  ('AP','Macapá',              1600303,   0.03889, -51.0664),
  ('AM','Manaus',              1302603,  -3.11900, -60.0212),
  ('BA','Salvador',            2927408, -12.97304, -38.5023),
  ('CE','Fortaleza',            2304400,  -3.71722, -38.5433),
  ('DF','Brasília',            5300108, -15.77972, -47.9292),
  ('ES','Vitória',             3205309, -20.31550, -40.3128),
  ('GO','Goiânia',             5208707, -16.68691, -49.2648),
  ('MA','São Luís',            2111300,  -2.53073, -44.3068),
  ('MT','Cuiabá',              5103403, -15.59611, -56.0967),
  ('MS','Campo Grande',        5002704, -20.46970, -54.6201),
  ('MG','Belo Horizonte',      3106200, -19.91667, -43.9345),
  ('PA','Belém',               1501402,  -1.45583, -48.5039),
  ('PB','João Pessoa',         2507507,  -7.11532, -34.8641),
  ('PR','Curitiba',            4106902, -25.42950, -49.2710),
  ('PE','Recife',              2611606,  -8.04756, -34.8770),
  ('PI','Teresina',            2211001,  -5.08919, -42.8016),
  ('RJ','Rio de Janeiro',      3304557, -22.90685, -43.1729),
  ('RN','Natal',               2408102,  -5.79448, -35.2110),
  ('RS','Porto Alegre',        4314902, -30.03460, -51.2177),
  ('RO','Porto Velho',         1100205,  -8.76183, -63.9020),
  ('RR','Boa Vista',           1400100,   2.81972, -60.6733),
  ('SC','Florianópolis',       4205407, -27.59450, -48.5477),
  ('SP','São Paulo',           3550308, -23.55052, -46.6333),
  ('SE','Aracaju',             2800308, -10.94720, -37.0731),
  ('TO','Palmas',              1721000, -10.18496, -48.3338)
) AS v(uf,name,ibge,lat,lon) ON v.uf = s.code
ON CONFLICT (ibge_code) DO NOTHING;

-- BANCOS — principais bancos BACEN (curado)
INSERT INTO public.master_banks (code, ispb, name, short_name, source_version) VALUES
  ('001','00000000','Banco do Brasil S.A.','BB','BACEN-2024'),
  ('033','90400888','Banco Santander (Brasil) S.A.','Santander','BACEN-2024'),
  ('041','92702067','Banco do Estado do Rio Grande do Sul S.A.','Banrisul','BACEN-2024'),
  ('070','00000208','BRB - Banco de Brasília S.A.','BRB','BACEN-2024'),
  ('077','00416968','Banco Inter S.A.','Inter','BACEN-2024'),
  ('104','00360305','Caixa Econômica Federal','CEF','BACEN-2024'),
  ('208','58160789','Banco BTG Pactual S.A.','BTG','BACEN-2024'),
  ('212','92894922','Banco Original S.A.','Original','BACEN-2024'),
  ('218','71027866','Banco BS2 S.A.','BS2','BACEN-2024'),
  ('237','60746948','Banco Bradesco S.A.','Bradesco','BACEN-2024'),
  ('246','28195667','Banco ABC Brasil S.A.','ABC','BACEN-2024'),
  ('260','18236120','Nu Pagamentos S.A.','Nubank','BACEN-2024'),
  ('290','08561701','PagSeguro Internet S.A.','PagBank','BACEN-2024'),
  ('323','18188384','Mercado Pago','MercadoPago','BACEN-2024'),
  ('336','31872495','Banco C6 S.A.','C6','BACEN-2024'),
  ('341','60701190','Itaú Unibanco S.A.','Itaú','BACEN-2024'),
  ('364','13140088','Gerencianet S.A.','Gerencianet','BACEN-2024'),
  ('380','22896431','PicPay Servicos S.A.','PicPay','BACEN-2024'),
  ('389','61024352','Banco Mercantil do Brasil S.A.','Mercantil','BACEN-2024'),
  ('399','33172537','HSBC Bank Brasil','HSBC','BACEN-2024'),
  ('422','58616418','Banco Safra S.A.','Safra','BACEN-2024'),
  ('453','73622748','Banco Rural S.A.','Rural','BACEN-2024'),
  ('633','68900810','Banco Rendimento S.A.','Rendimento','BACEN-2024'),
  ('652','60872504','Itaú Unibanco Holding','Itaú Holding','BACEN-2024'),
  ('655','59588111','Banco Votorantim S.A.','BV','BACEN-2024'),
  ('745','33042151','Banco Citibank S.A.','Citibank','BACEN-2024'),
  ('756','02038232','Sicoob','Sicoob','BACEN-2024'),
  ('748','01181521','Sicredi','Sicredi','BACEN-2024'),
  ('085','05463212','Cooperativa Central AILOS','AILOS','BACEN-2024'),
  ('025','03323840','Banco Alfa S.A.','Alfa','BACEN-2024'),
  ('021','28127603','Banestes S.A.','Banestes','BACEN-2024'),
  ('047','13009717','Banco do Estado de Sergipe S.A.','Banese','BACEN-2024'),
  ('707','62232889','Banco Daycoval S.A.','Daycoval','BACEN-2024'),
  ('739','01522368','Banco Cetelem S.A.','Cetelem','BACEN-2024')
ON CONFLICT (code) DO NOTHING;

-- UNIDADES DE MEDIDA — construção civil
INSERT INTO public.master_units_of_measure (symbol, name, category, base_factor, base_symbol) VALUES
  -- comprimento
  ('mm','Milímetro','comprimento',0.001,'m'),
  ('cm','Centímetro','comprimento',0.01,'m'),
  ('m','Metro','comprimento',1,'m'),
  ('km','Quilômetro','comprimento',1000,'m'),
  ('br','Barra','comprimento',NULL,NULL),
  -- area
  ('cm²','Centímetro quadrado','area',0.0001,'m²'),
  ('m²','Metro quadrado','area',1,'m²'),
  ('ha','Hectare','area',10000,'m²'),
  -- volume
  ('cm³','Centímetro cúbico','volume',0.000001,'m³'),
  ('L','Litro','volume',0.001,'m³'),
  ('m³','Metro cúbico','volume',1,'m³'),
  -- massa
  ('g','Grama','massa',0.001,'kg'),
  ('kg','Quilograma','massa',1,'kg'),
  ('t','Tonelada','massa',1000,'kg'),
  -- embalagem / construção
  ('sc','Saco','embalagem',NULL,NULL),
  ('cx','Caixa','embalagem',NULL,NULL),
  ('rl','Rolo','embalagem',NULL,NULL),
  ('lt','Lata','embalagem',NULL,NULL),
  ('gl','Galão','embalagem',NULL,NULL),
  ('pç','Peça','embalagem',NULL,NULL),
  ('pct','Pacote','embalagem',NULL,NULL),
  ('mlh','Milheiro','embalagem',1000,'un'),
  -- contagem
  ('un','Unidade','contagem',1,'un'),
  ('dz','Dúzia','contagem',12,'un'),
  ('par','Par','contagem',2,'un'),
  ('jg','Jogo','contagem',NULL,NULL),
  ('cj','Conjunto','contagem',NULL,NULL),
  -- tempo
  ('h','Hora','tempo',3600,'s'),
  ('dia','Dia','tempo',86400,'s'),
  ('mês','Mês','tempo',NULL,NULL),
  -- mão de obra
  ('hh','Homem-hora','tempo',NULL,NULL),
  ('hd','Homem-dia','tempo',NULL,NULL),
  -- energia
  ('kWh','Quilowatt-hora','energia',1,'kWh'),
  -- serviço
  ('vb','Verba','outro',NULL,NULL),
  ('serv','Serviço','outro',NULL,NULL)
ON CONFLICT (symbol) DO NOTHING;

-- =============================================================================
-- COMENTÁRIOS
-- =============================================================================
COMMENT ON TABLE public.master_countries IS 'Países (dado mestre global). Escrita só por service_role.';
COMMENT ON TABLE public.master_states IS 'Estados/UFs (dado mestre global).';
COMMENT ON TABLE public.master_cities IS 'Cidades. Fase 1: somente capitais seed. Full IBGE via script de carga.';
COMMENT ON TABLE public.master_banks IS 'Bancos BACEN. Atualizar via job que consulta a API do BACEN.';
COMMENT ON TABLE public.master_units_of_measure IS 'Unidades de medida da construção civil.';
COMMENT ON COLUMN public.master_units_of_measure.base_factor IS 'Multiplicador para converter para a unidade base (base_symbol). NULL = não conversível.';
