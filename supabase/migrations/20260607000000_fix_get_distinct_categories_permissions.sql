-- Recriar RPC com SECURITY DEFINER para que anon/authenticated possam executar
CREATE OR REPLACE FUNCTION get_distinct_categories()
RETURNS TABLE (category text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT t.category
  FROM (
    SELECT si.category FROM sinapi_items si WHERE si.category IS NOT NULL AND si.category <> ''
    UNION
    SELECT ci.category FROM custom_items ci WHERE ci.category IS NOT NULL AND ci.category <> ''
  ) t
  ORDER BY t.category;
END;
$$;

GRANT EXECUTE ON FUNCTION get_distinct_categories() TO authenticated, anon;
