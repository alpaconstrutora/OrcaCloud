-- Aumenta o limite de tamanho do bucket broker-materials para 60 MB
-- 60 * 1024 * 1024 = 62914560 bytes
UPDATE storage.buckets
SET file_size_limit = 62914560
WHERE id = 'broker-materials';
