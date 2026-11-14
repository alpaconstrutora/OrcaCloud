-- ÒPURA Pro — cidade do profissional (14/11/2026, passo 5 da crítica de design).
-- Plano: docs/planos/2026-11-14-opura-pro-critica.md
--
-- O BR Code do Pix tem o campo 60 (cidade do recebedor) OBRIGATÓRIO. Sem a cidade no
-- cadastro, o app gravava "BRASILIA" para todo profissional. Agora o profissional
-- informa em Ajustes; vazio continua caindo no padrão (os bancos não conferem o campo
-- com a chave, mas o comprovante do pagador mostra).
--
-- Sem policy nova: as policies de pro_config (dono = auth.uid()) já cobrem a coluna.
-- Idempotente. Aplicar com: npx supabase db query --linked -f <este arquivo>   (nunca db push)

ALTER TABLE public.pro_config
  ADD COLUMN IF NOT EXISTS cidade text;

COMMENT ON COLUMN public.pro_config.cidade IS
  'Cidade do profissional (ÒPURA Pro): vai no campo 60 do Pix Copia e Cola. Vazio = padrão do app.';
