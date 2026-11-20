-- Preferências do Imovib (plano docs/planos/2026-11-20-imovib-preferencias-estudo.md): libera chaves imovib.*
-- na tabela preferencias (escopo USUARIO), como foi feito para diretoria.* (aplicar_20271117980000).
-- Reverter: recriar o CHECK sem 'imovib.%' (apagar antes as linhas imovib.*).
ALTER TABLE public.preferencias DROP CONSTRAINT preferencias_chave_sanidade;
ALTER TABLE public.preferencias ADD CONSTRAINT preferencias_chave_sanidade
    CHECK ((chave LIKE 'planta.%' OR chave LIKE 'suprimentos.%' OR chave LIKE 'diretoria.%' OR chave LIKE 'imovib.%') AND length(chave) <= 100);
