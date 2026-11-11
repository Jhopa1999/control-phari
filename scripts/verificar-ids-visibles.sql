-- Verificación posterior a la migración 20261113120000_visible_ids.
-- Uso:  psql -d <base> -v ON_ERROR_STOP=1 -f verificar-migracion.sql
-- Cada fila devuelve (comprobacion, violaciones). TODAS deben ser 0.
-- El recálculo de los números usa un método independiente del de la migración
-- (conteo de filas anteriores con subconsultas correlacionadas, no ROW_NUMBER).
WITH
sin_nulos AS (
  SELECT 'sin_nulos: requests.number/code' AS c,
         count(*) FILTER (WHERE number IS NULL OR code IS NULL) AS v FROM requests
  UNION ALL SELECT 'sin_nulos: plan_phases.code', count(*) FILTER (WHERE code IS NULL) FROM plan_phases
  UNION ALL SELECT 'sin_nulos: tasks.code', count(*) FILTER (WHERE code IS NULL) FROM tasks
),
duplicados AS (
  SELECT 'duplicados: requests.number' AS c, count(*) AS v FROM (SELECT number FROM requests GROUP BY number HAVING count(*) > 1) d
  UNION ALL SELECT 'duplicados: requests.code', count(*) FROM (SELECT code FROM requests GROUP BY code HAVING count(*) > 1) d
  UNION ALL SELECT 'duplicados: plan_phases.code', count(*) FROM (SELECT code FROM plan_phases GROUP BY code HAVING count(*) > 1) d
  UNION ALL SELECT 'duplicados: tasks.code', count(*) FROM (SELECT code FROM tasks GROUP BY code HAVING count(*) > 1) d
),
formato AS (
  SELECT 'formato: requests.code = PRY-<number 4 dígitos mínimo>' AS c,
         count(*) FILTER (WHERE code <> 'PRY-' || LPAD(number::text, GREATEST(LENGTH(number::text), 4), '0')) AS v FROM requests
  UNION ALL
  SELECT 'formato: fase = <código solicitud>-F<n>',
         count(*) FILTER (WHERE ph.code !~ ('^' || r.code || '-F[1-9][0-9]*$'))
  FROM plan_phases ph JOIN plans p ON p.id = ph.plan_id JOIN requests r ON r.id = p.request_id
  UNION ALL
  SELECT 'formato: tarea = <código solicitud>-T<nn> (2 dígitos mínimo)',
         count(*) FILTER (WHERE t.code !~ ('^' || r.code || '-T([0-9][0-9]|[1-9][0-9]{2,})$'))
  FROM tasks t JOIN plan_phases ph ON ph.id = t.phase_id
       JOIN plans p ON p.id = ph.plan_id JOIN requests r ON r.id = p.request_id
),
orden_solicitudes AS (
  -- número esperado = 1 + solicitudes que van antes por (registered_at, created_at, id)
  SELECT 'orden: requests.number' AS c,
         count(*) FILTER (WHERE r.number <> 1 + (
           SELECT count(*) FROM requests o
           WHERE (o.registered_at, o.created_at, o.id) < (r.registered_at, r.created_at, r.id))) AS v
  FROM requests r
),
orden_fases AS (
  SELECT 'orden: fases por ("order", id) dentro del plan' AS c,
         count(*) FILTER (WHERE substring(ph.code FROM '-F([0-9]+)$')::int <> 1 + (
           SELECT count(*) FROM plan_phases o
           WHERE o.plan_id = ph.plan_id AND (o."order", o.id) < (ph."order", ph.id))) AS v
  FROM plan_phases ph
),
orden_tareas AS (
  SELECT 'orden: tareas por (fase.order, created_at, id) dentro del plan' AS c,
         count(*) FILTER (WHERE substring(t.code FROM '-T([0-9]+)$')::int <> 1 + (
           SELECT count(*)
           FROM tasks o JOIN plan_phases oph ON oph.id = o.phase_id
           WHERE oph.plan_id = ph.plan_id
             AND (oph."order", o.created_at, o.id) < (ph."order", t.created_at, t.id))) AS v
  FROM tasks t JOIN plan_phases ph ON ph.id = t.phase_id
),
contadores AS (
  SELECT 'contadores: plans.phase_seq_next = máx(F)+1 (1 si no hay fases)' AS c,
         count(*) FILTER (WHERE p.phase_seq_next <> 1 + COALESCE((
           SELECT max(substring(ph.code FROM '-F([0-9]+)$')::int) FROM plan_phases ph WHERE ph.plan_id = p.id), 0)) AS v
  FROM plans p
  UNION ALL
  SELECT 'contadores: plans.task_seq_next = máx(T)+1 (1 si no hay tareas)',
         count(*) FILTER (WHERE p.task_seq_next <> 1 + COALESCE((
           SELECT max(substring(t.code FROM '-T([0-9]+)$')::int)
           FROM tasks t JOIN plan_phases ph ON ph.id = t.phase_id WHERE ph.plan_id = p.id), 0))
  FROM plans p
),
secuencia AS (
  -- La siguiente solicitud debe recibir MAX(number)+1 (o 1 si no hay ninguna).
  SELECT 'secuencia: requests_number_seq apunta a máx(number)+1' AS c,
         CASE WHEN (SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END FROM requests_number_seq)
                   = COALESCE((SELECT max(number) FROM requests), 0) + 1
              THEN 0 ELSE 1 END AS v
),
restricciones AS (
  SELECT 'restricciones: NOT NULL + UNIQUE presentes' AS c,
         4 - (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname IN
                ('requests_number_key', 'requests_code_key', 'plan_phases_code_key', 'tasks_code_key')) AS v
  UNION ALL
  SELECT 'restricciones: columnas NOT NULL',
         6 - (SELECT count(*) FROM information_schema.columns
              WHERE table_schema = 'public' AND is_nullable = 'NO'
                AND (table_name, column_name) IN (('requests','number'),('requests','code'),('plan_phases','code'),('tasks','code'),('plans','phase_seq_next'),('plans','task_seq_next')))
)
SELECT * FROM sin_nulos UNION ALL SELECT * FROM duplicados UNION ALL SELECT * FROM formato
UNION ALL SELECT * FROM orden_solicitudes UNION ALL SELECT * FROM orden_fases UNION ALL SELECT * FROM orden_tareas
UNION ALL SELECT * FROM contadores UNION ALL SELECT * FROM secuencia UNION ALL SELECT * FROM restricciones;
