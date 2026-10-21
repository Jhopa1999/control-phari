import { createApiClient } from '@plantilla-portales/api-client';
import type { components, paths } from '@plantilla-portales/api-client';
import { getAuthMode } from './auth-mode';
/**
 * Tipos del dominio derivados del contrato OpenAPI generado.
 * No se declaran interfaces manuales: la fuente es packages/api-client.
 */
export type CatalogItem = components['schemas']['CatalogItemResponseDto'];
export type CreateCatalogItem = components['schemas']['CreateCatalogItemDto'];
export type UpdateCatalogItem = components['schemas']['UpdateCatalogItemDto'];
export type MyPermissions = components['schemas']['MyPermissionsResponseDto'];
export type MyGrant = components['schemas']['MyGrantDto'];
export type DevActor = components['schemas']['DevActorResponseDto'];
export type Process = components['schemas']['ProcessResponseDto'];
export type CreateProcess = components['schemas']['CreateProcessDto'];
export type UpdateProcess = components['schemas']['UpdateProcessDto'];
export type Area = components['schemas']['AreaResponseDto'];
export type CreateArea = components['schemas']['CreateAreaDto'];
export type UpdateArea = components['schemas']['UpdateAreaDto'];
export type User = components['schemas']['UserResponseDto'];
export type CreateUser = components['schemas']['CreateUserDto'];
export type UpdateUser = components['schemas']['UpdateUserDto'];
export type Grant = components['schemas']['GrantResponseDto'];
export type CreateGrant = components['schemas']['CreateGrantDto'];
export type AuditEvent = components['schemas']['AuditEventResponseDto'];
/** Query de GET /audit-events (objectType y take), tal como la declara el contrato. */
export type AuditEventsQuery = NonNullable<
  paths['/audit-events']['get']['parameters']['query']
>;
// --- Autenticacion (login JWT): tipos derivados del contrato OpenAPI ---
/** Respuesta de POST /auth/login: { accessToken, expiresIn, user }. */
export type LoginResponse = components['schemas']['LoginResponseDto'];
/** Usuario autenticado devuelto por el login. */
export type AuthUser = components['schemas']['LoginUserDto'];
// --- Fase 2 (flujo de demanda): tipos derivados del contrato OpenAPI ---
export type Request = components['schemas']['RequestResponseDto'];
export type RequestParticipant =
  components['schemas']['RequestParticipantResponseDto'];
export type CreateRequest = components['schemas']['CreateRequestDto'];
export type UpdateRequest = components['schemas']['UpdateRequestDto'];
export type Triage = components['schemas']['TriageResponseDto'];
export type CreateTriage = components['schemas']['CreateTriageDto'];
export type AssociateAsset = components['schemas']['AssociateAssetDto'];
export type AssetRequestHistoryItem =
  components['schemas']['AssetRequestHistoryItemDto'];
export type TriageContext = components['schemas']['TriageContextResponseDto'];
export type EligibleResponsible =
  components['schemas']['EligibleResponsibleDto'];
export type PriorityEvaluation =
  components['schemas']['PriorityEvaluationResponseDto'];
export type CreatePriorityEvaluation =
  components['schemas']['CreatePriorityEvaluationDto'];
export type Approval = components['schemas']['ApprovalResponseDto'];
export type CreateApproval = components['schemas']['CreateApprovalDto'];
// --- Fase 3 (plan y ejecucion): tipos derivados del contrato OpenAPI ---
export type Plan = components['schemas']['PlanResponseDto'];
export type CreatePlan = components['schemas']['CreatePlanDto'];
export type UpdatePlan = components['schemas']['UpdatePlanDto'];
export type PlanPhase = components['schemas']['PlanPhaseResponseDto'];
export type CreatePhase = components['schemas']['CreatePhaseDto'];
export type UpdatePhase = components['schemas']['UpdatePhaseDto'];
export type ReorderPhases = components['schemas']['ReorderPhasesDto'];
export type Task = components['schemas']['TaskResponseDto'];
export type TaskPredecessor = components['schemas']['TaskPredecessorDto'];
export type CreateTask = components['schemas']['CreateTaskDto'];
export type UpdateTask = components['schemas']['UpdateTaskDto'];
export type UpdateTaskStatus = components['schemas']['UpdateTaskStatusDto'];
export type AcceptTask = components['schemas']['AcceptTaskDto'];
export type TaskDependency =
  components['schemas']['TaskDependencyResponseDto'];
export type AddDependency = components['schemas']['AddDependencyDto'];
export type PlanGuide = components['schemas']['PlanGuideDto'];
export type PlanGuidePending = components['schemas']['PlanGuidePendingDto'];
export type ReturnPlan = components['schemas']['ReturnPlanDto'];
export type MyWorkItem = components['schemas']['MyWorkItemDto'];
export type PlanDocument = components['schemas']['PlanDocumentDto'];
export type ImportPlanResult = components['schemas']['ImportPlanResultDto'];
/** Estado de una tarea (TaskStatus del backend, design 1.3). */
export type TaskStatus = UpdateTaskStatus['status'];
// --- Fase 4 (capacidad y asignaciones): tipos derivados del contrato OpenAPI ---
export type Availability = components['schemas']['AvailabilityResponseDto'];
export type CreateAvailability =
  components['schemas']['CreateAvailabilityDto'];
export type UpdateAvailability =
  components['schemas']['UpdateAvailabilityDto'];
export type Assignment = components['schemas']['AssignmentResponseDto'];
export type CreateAssignment = components['schemas']['CreateAssignmentDto'];
export type UpdateAssignment = components['schemas']['UpdateAssignmentDto'];
export type CapacityPerson = components['schemas']['CapacityPersonDto'];
export type CapacitySummaryRow =
  components['schemas']['CapacitySummaryRowDto'];
// --- Fase 5 (trabajo y coordinacion): tipos derivados del contrato OpenAPI ---
export type CoordinationPerson =
  components['schemas']['CoordinationPersonDto'];
export type DailyLog = components['schemas']['DailyLogResponseDto'];
export type DailyLogActivity = components['schemas']['ActivityResponseDto'];
export type CreateDailyLog = components['schemas']['CreateDailyLogDto'];
export type UpdateDailyLog = components['schemas']['UpdateDailyLogDto'];
export type CreateActivity = components['schemas']['CreateActivityDto'];
export type UpdateActivity = components['schemas']['UpdateActivityDto'];
/** Clasificacion de una actividad del diario (maestra ACTIVITY_CLASS). */
export type ActivityClass = CreateActivity['classificationCode'];
export type WeeklyReport = components['schemas']['WeeklyReportResponseDto'];
export type WeeklyConsolidation =
  components['schemas']['WeeklyConsolidationDto'];
export type CreateWeeklyReport =
  components['schemas']['CreateWeeklyReportDto'];
export type UpdateWeeklyReport =
  components['schemas']['UpdateWeeklyReportDto'];
export type Issue = components['schemas']['IssueResponseDto'];
export type CreateIssue = components['schemas']['CreateIssueDto'];
export type UpdateIssue = components['schemas']['UpdateIssueDto'];
/** Tipo de novedad (maestra ISSUE_TYPE). */
export type IssueType = CreateIssue['typeCode'];
export type Meeting = components['schemas']['MeetingResponseDto'];
export type CreateMeeting = components['schemas']['CreateMeetingDto'];
export type UpdateMeeting = components['schemas']['UpdateMeetingDto'];
export type Commitment = components['schemas']['CommitmentResponseDto'];
export type CreateCommitment = components['schemas']['CreateCommitmentDto'];
export type UpdateCommitment = components['schemas']['UpdateCommitmentDto'];
/** Cuerpo de una transicion de estado (Issue/Commitment). */
export type Transition = components['schemas']['TransitionDto'];
/** Estado destino valido de una transicion (maestra RECORD_STATE). */
export type RecordState = Transition['toState'];
// --- Fase 6 (activos y documentos): tipos derivados del contrato OpenAPI ---
export type Asset = components['schemas']['AssetResponseDto'];
export type CreateAsset = components['schemas']['CreateAssetDto'];
export type UpdateAsset = components['schemas']['UpdateAssetDto'];
export type ChangeAssetStatus =
  components['schemas']['ChangeAssetStatusDto'];
/** Estado destino valido de un activo (AssetStatus). */
export type AssetStatus = ChangeAssetStatus['targetStatus'];
export type Document = components['schemas']['DocumentResponseDto'];
export type CreateDocument = components['schemas']['CreateDocumentDto'];
export type UpdateDocument = components['schemas']['UpdateDocumentDto'];
export type CreateDocumentVersion =
  components['schemas']['CreateDocumentVersionDto'];
export type DocumentVersion =
  components['schemas']['DocumentVersionResponseDto'];
export type DocumentContent =
  components['schemas']['DocumentContentResponseDto'];
export type ChangeDocumentStatus =
  components['schemas']['ChangeDocumentStatusDto'];
/** Estado destino valido de un documento (DocStatus). */
export type DocumentStatus = ChangeDocumentStatus['targetStatus'];
// --- Administracion de sistema (rol ADMIN + SMTP en runtime) ---
export type SmtpConfig = components['schemas']['SmtpConfigResponseDto'];
export type UpdateSmtpConfig = components['schemas']['UpdateSmtpConfigDto'];
export type SmtpTestRequest = components['schemas']['SmtpTestRequestDto'];
export type SmtpTestResult = components['schemas']['SmtpTestResultDto'];
export type AdminUser = components['schemas']['AdminUserResponseDto'];
export type SetAdminFlag = components['schemas']['SetAdminFlagDto'];
/** Fuente efectiva de la configuracion SMTP (db | env | none). */
export type SmtpConfigSource = SmtpConfig['source'];
/**
 * Clave de localStorage donde el selector de usuario (dev) guarda el
 * identifier del actor actual. Mecanismo exclusivo de desarrollo (design 3.2).
 */
export const ACTOR_STORAGE_KEY = 'actorId';
/**
 * Clave de localStorage donde se guarda el JWT de la sesion en modo 'jwt'.
 * No es un secreto de configuracion: es el token emitido por el backend para
 * la sesion del navegador. Coherente con el patron de ACTOR_STORAGE_KEY.
 */
export const TOKEN_STORAGE_KEY = 'authToken';
/**
 * URL base de la API, leida de la configuracion publica del frontend.
 * No es un secreto (no contiene credenciales). Si falta, se produce un error
 * entendible en lugar de usar un valor hardcodeado.
 */
const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
if (!baseUrl) {
  throw new Error(
    'Falta la configuracion NEXT_PUBLIC_API_BASE_URL. Define la URL de la API ' +
      'en apps/web/.env.local (ver apps/web/.env.example).',
  );
}
/**
 * Instancia reutilizable del cliente tipado generado desde OpenAPI.
 */
export const api = createApiClient({ baseUrl });
/**
 * Middleware de request: inyecta UNA sola cabecera de identidad segun el modo
 * de autenticacion, nunca ambas. Solo corre en el navegador; en el servidor
 * localStorage no existe y no se anade cabecera.
 *
 * - modo 'jwt': si hay token guardado -> Authorization: Bearer <token>. Sin
 *   token no se anade cabecera (el backend respondera 401 y el guard de rutas
 *   lo gestiona).
 * - modo 'dev-header': se mantiene el comportamiento historico de X-Actor-Id
 *   leyendo el actor seleccionado en el selector dev (design 5.3).
 */
api.use({
  onRequest({ request }) {
    if (typeof window === 'undefined') return request;
    if (getAuthMode() === 'jwt') {
      const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`);
      }
      return request;
    }
    const actorId = window.localStorage.getItem(ACTOR_STORAGE_KEY);
    if (actorId) {
      request.headers.set('X-Actor-Id', actorId);
    }
    return request;
  },
});
