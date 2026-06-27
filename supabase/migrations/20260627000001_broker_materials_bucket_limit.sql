-- Aumenta o limite de tamanho do bucket broker-materials para 100 MB
-- 100 * 1024 * 1024 = 104857600 bytes
UPDATE storage.buckets
SET file_size_limit = 104857600
WHERE id = 'broker-materials';
