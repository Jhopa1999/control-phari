-- Verificación posterior a la migración 20261118140000_activos_documentos_codigo_visible.
-- Uso:  psql -d <base> -v ON_ERROR_STOP=1 -f scripts/verificar-ids-activos-documentos.sql
-- Cada fila devuelve (comprobacion, violaciones). TODAS deben ser 0.
-- Sirve también como consulta previa/posterior al despliegue: antes de migrar la
-- tabla no tiene la columna `number` y la consulta falla (es lo esperado).
-- El recálculo del orden usa un método independiente del de la migración
-- (conteo de filas anteriores con subconsultas correlacionadas, no ROW_NUMBER).
-- Nota: el orden por (created_at, id) solo es exacto para las filas numeradas por la
-- migración; las creadas después toman el siguiente número de la secuencia, que
-- puede no seguir ese orden si hubo inserciones concurrentes. Por eso la comprobación
-- de orden se limita a los números hasta el máximo de la base al migrar (parámetro
-- opcional :max_migrado; sin él se comprueba toda la tabla).
\if :{?max_migrado}
\else
\set max_migrado 2147483647
\endif
WITH
sin_nulos AS (
  SELECT 'sin_nulos: assets.number' AS c, count(*) FILTER (WHERE number IS NULL) AS v FROM assets
  UNION ALL SELECT 'sin_nulos: documents.number', count(*) FILTER (WHERE number IS NULL) FROM documents
),
duplicados AS (
  SELECT 'duplicados: assets.number' AS c, count(*) AS v
  FROM (SELECT number FROM assets GROUP BY number HAVING count(*) > 1) d
  UNION ALL SELECT 'duplicados: documents.number', count(*)
  FROM (SELECT number FROM documents GROUP BY number HAVING count(*) > 1) d
),
no_positivos AS (
  SELECT 'no_positivos: assets.number' AS c, count(*) FILTER (WHERE number < 1) AS v FROM assets
  UNION ALL SELECT 'no_positivos: documents.number', count(*) FILTER (WHERE number < 1) FROM documents
),
orden_activos AS (
  SELECT 'orden: assets.number' AS c,
         count(*) FILTER (WHERE a.number <= :max_migrado AND a.number <> 1 + (
           SELECT count(*) FROM assets o
           WHERE o.number <= :max_migrado
             AND (o.created_at, o.id) < (a.created_at, a.id))) AS v
  FROM assets a
),
orden_documentos AS (
  SELECT 'orden: documents.number' AS c,
         count(*) FILTER (WHERE d.number <= :max_migrado AND d.number <> 1 + (
           SELECT count(*) FROM documents o
           WHERE o.number <= :max_migrado
             AND (o.created_at, o.id) < (d.created_at, d.id))) AS v
  FROM documents d
),
secuencias AS (
  -- La siguiente numeración no puede reutilizar un número existente.
  SELECT 'secuencia: assets_number_seq por detrás del máximo' AS c,
         (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM assets_number_seq)
           < COALESCE((SELECT max(number) FROM assets), 0) AS v_bool
  UNION ALL
  SELECT 'secuencia: documents_number_seq por detrás del máximo',
         (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM documents_number_seq)
           < COALESCE((SELECT max(number) FROM documents), 0)
),
restricciones AS (
  SELECT 'restriccion: assets.number NOT NULL + DEFAULT nextval' AS c,
         count(*) FILTER (WHERE is_nullable = 'YES' OR column_default IS NULL OR column_default NOT LIKE 'nextval(%') AS v
  FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'number'
  UNION ALL
  SELECT 'restriccion: documents.number NOT NULL + DEFAULT nextval',
         count(*) FILTER (WHERE is_nullable = 'YES' OR column_default IS NULL OR column_default NOT LIKE 'nextval(%')
  FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'number'
  UNION ALL
  SELECT 'restriccion: índice único assets_number_key', CASE WHEN count(*) = 1 THEN 0 ELSE 1 END
  FROM pg_indexes WHERE indexname = 'assets_number_key'
  UNION ALL
  SELECT 'restriccion: índice único documents_number_key', CASE WHEN count(*) = 1 THEN 0 ELSE 1 END
  FROM pg_indexes WHERE indexname = 'documents_number_key'
)
SELECT c AS comprobacion, v AS violaciones FROM (
  SELECT c, v::bigint AS v FROM sin_nulos
  UNION ALL SELECT c, v::bigint FROM duplicados
  UNION ALL SELECT c, v::bigint FROM no_positivos
  UNION ALL SELECT c, v::bigint FROM orden_activos
  UNION ALL SELECT c, v::bigint FROM orden_documentos
  UNION ALL SELECT c, v_bool::int::bigint FROM secuencias
  UNION ALL SELECT c, v::bigint FROM restricciones
) t ORDER BY c;
