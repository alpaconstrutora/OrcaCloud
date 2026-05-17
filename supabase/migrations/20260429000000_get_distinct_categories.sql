-- Create RPC to get distinct categories from both sinapi_items and custom_items
CREATE OR REPLACE FUNCTION get_distinct_categories()
RETURNS TABLE (category text) AS $$
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
$$ LANGUAGE plpgsql;
