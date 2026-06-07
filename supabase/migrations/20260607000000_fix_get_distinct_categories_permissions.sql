-- Recriar RPC com SECURITY DEFINER e fallback resiliente
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
EXCEPTION WHEN OTHERS THEN
  -- Se custom_items falhar, retorna apenas sinapi_items
  RETURN QUERY
  SELECT DISTINCT si.category
  FROM sinapi_items si
  WHERE si.category IS NOT NULL AND si.category <> ''
  ORDER BY si.category;
END;
$$;

GRANT EXECUTE ON FUNCTION get_distinct_categories() TO authenticated, anon;
