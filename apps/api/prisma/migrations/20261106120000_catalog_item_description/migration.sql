-- Descripcion opcional de cada opcion de maestra: explica al usuario que significa
-- y cuando elegirla (se muestra en los desplegables del triage). Aditivo y nulo
-- por defecto. Se precargan las maestras del triage solo donde aun no hay texto,
-- para no pisar lo que el administrador ya haya escrito.
ALTER TABLE "catalog_items" ADD COLUMN "description" TEXT;

UPDATE "catalog_items" SET "description" = 'Cambio puntual y acotado, de un solo equipo y sin dependencias. Se resuelve rápido.' WHERE "catalog" = 'TRIAGE_SIZE' AND "code" = 'S' AND "description" IS NULL;
UPDATE "catalog_items" SET "description" = 'Alcance claro con algunas piezas por construir o ajustar; puede requerir coordinar con otra persona o área.' WHERE "catalog" = 'TRIAGE_SIZE' AND "code" = 'M' AND "description" IS NULL;
UPDATE "catalog_items" SET "description" = 'Varias piezas o fuentes de datos, dependencias entre equipos y pruebas con usuarios. Necesita un plan por fases.' WHERE "catalog" = 'TRIAGE_SIZE' AND "code" = 'L' AND "description" IS NULL;
UPDATE "catalog_items" SET "description" = 'Iniciativa de varios procesos o áreas, con alto riesgo o incertidumbre. Conviene dividirla en partes antes de priorizarla.' WHERE "catalog" = 'TRIAGE_SIZE' AND "code" = 'XL' AND "description" IS NULL;

UPDATE "catalog_items" SET "description" = 'No afecta la operación; puede esperar sin consecuencias.' WHERE "catalog" = 'CRITICALITY' AND "code" = 'BAJA' AND "description" IS NULL;
UPDATE "catalog_items" SET "description" = 'Afecta a un grupo reducido o tiene alternativa manual; se atiende en el ciclo normal.' WHERE "catalog" = 'CRITICALITY' AND "code" = 'MEDIA' AND "description" IS NULL;
UPDATE "catalog_items" SET "description" = 'Afecta decisiones o procesos importantes y no hay buena alternativa; debe atenderse pronto.' WHERE "catalog" = 'CRITICALITY' AND "code" = 'ALTA' AND "description" IS NULL;
UPDATE "catalog_items" SET "description" = 'Detiene la operación o genera un riesgo legal, financiero o de seguridad; atención inmediata.' WHERE "catalog" = 'CRITICALITY' AND "code" = 'CRITICA' AND "description" IS NULL;

UPDATE "catalog_items" SET "description" = 'Los datos necesarios ya están disponibles y se puede acceder a ellos.' WHERE "catalog" = 'DATA_AVAILABILITY' AND "code" = 'SI' AND "description" IS NULL;
UPDATE "catalog_items" SET "description" = 'Hay parte de los datos, o falta depurarlos, completarlos o conseguir el acceso.' WHERE "catalog" = 'DATA_AVAILABILITY' AND "code" = 'PARCIAL' AND "description" IS NULL;
UPDATE "catalog_items" SET "description" = 'Los datos no existen o no hay acceso a ellos; hay que conseguirlos antes de empezar.' WHERE "catalog" = 'DATA_AVAILABILITY' AND "code" = 'NO' AND "description" IS NULL;

UPDATE "catalog_items" SET "description" = 'Reportes, tableros y modelos de datos para análisis.' WHERE "catalog" = 'TRIAGE_ROUTE' AND "code" = 'BI' AND "description" IS NULL;
UPDATE "catalog_items" SET "description" = 'Conexión y movimiento de datos entre sistemas (APIs, cargas, pipelines).' WHERE "catalog" = 'TRIAGE_ROUTE' AND "code" = 'INTEGRACIONES' AND "description" IS NULL;
UPDATE "catalog_items" SET "description" = 'Modelos, agentes o automatizaciones con inteligencia artificial.' WHERE "catalog" = 'TRIAGE_ROUTE' AND "code" = 'IA' AND "description" IS NULL;
UPDATE "catalog_items" SET "description" = 'Requiere trabajo coordinado de dos o más de las rutas anteriores.' WHERE "catalog" = 'TRIAGE_ROUTE' AND "code" = 'MULTIPROCESO' AND "description" IS NULL;

UPDATE "catalog_items" SET "description" = 'Construir algo nuevo que hoy no existe.' WHERE "catalog" = 'DEMAND_TYPE' AND "code" = 'DESARROLLO' AND "description" IS NULL;
UPDATE "catalog_items" SET "description" = 'Mejorar o ampliar algo que ya existe.' WHERE "catalog" = 'DEMAND_TYPE' AND "code" = 'EVOLUCION' AND "description" IS NULL;
UPDATE "catalog_items" SET "description" = 'Algo que ya funcionaba falló o se comporta mal y hay que corregirlo.' WHERE "catalog" = 'DEMAND_TYPE' AND "code" = 'SOPORTE_INCIDENTE' AND "description" IS NULL;
UPDATE "catalog_items" SET "description" = 'Ordenar o rehacer lo construido para que sea más estable y fácil de mantener.' WHERE "catalog" = 'DEMAND_TYPE' AND "code" = 'DEUDA_TECNICA' AND "description" IS NULL;
UPDATE "catalog_items" SET "description" = 'Investigar si algo es viable antes de comprometerse a construirlo.' WHERE "catalog" = 'DEMAND_TYPE' AND "code" = 'EXPLORACION' AND "description" IS NULL;
