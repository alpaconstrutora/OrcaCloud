# Arquivos

- [Fiscal: ingestão e classificação de NF-e](ingestao-nfe.md) - O pipeline de Nota Fiscal Eletrônica — upload do XML com hash SHA-256, raw_documents idempotente por chave de acesso, processing_jobs com máquina de estados processada pela Edge Function fiscal-nfe-processor (acquire_job, persistência atômica por RPC, classificação por NCM > CFOP > palavra-chave), retry com backoff exponencial até dead letter, aprovação que gera o título e tributos a pagar.
