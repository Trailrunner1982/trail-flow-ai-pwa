
-- Restringir leitura dos buckets a autenticados (evita listagem pública anónima)
DROP POLICY IF EXISTS "public read gpx" ON storage.objects;
DROP POLICY IF EXISTS "public read content media" ON storage.objects;

CREATE POLICY "auth read gpx"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'gpx-files');

CREATE POLICY "auth read content media"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'content-media');

-- Revogar execute público de funções de trigger internas (não devem ser chamadas por clientes)
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
