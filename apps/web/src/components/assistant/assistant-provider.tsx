'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  ApiError,
  AttachmentUploadError,
  confirmProposal as confirmProposalRequest,
  deleteAttachment,
  deleteConversation,
  discardProposal as discardProposalRequest,
  getAssistantStatus,
  getConversation,
  listConversations,
  streamChat,
  updateAttachmentText,
  uploadAttachment,
  type Attachment,
  type ConversationSummary,
  type Proposal,
} from '@/lib/assistant';
import {
  FALLBACK_LIMITS,
  rejectedTitle,
  validateAttachmentFile,
  type AttachmentLimitsView,
  type AttachmentStatus,
} from '@/lib/assistant-attachments';
import { MAX_MESSAGE_LENGTH, capitalize, type ToolView } from '@/lib/assistant-format';

/** Mensaje de la persona en el hilo. */
export interface UserMessageView {
  id: string;
  role: 'user';
  text: string;
  /** Archivos que acompañaron al mensaje (con el texto que leyó el asistente). */
  attachments: Attachment[];
}

/** Adjunto en el compositor, antes de enviarse. */
export interface AttachmentItem {
  localId: string;
  name: string;
  size: number;
  status: AttachmentStatus;
  /** Avance de la subida (0 a 100) o null si no se puede medir. */
  progress: number | null;
  /** Datos del servidor cuando ya está listo. */
  attachment: Attachment | null;
  /** La persona corrigió el texto extraído. */
  edited: boolean;
  error: string | null;
  retryable: boolean;
  file: File;
}

/** Aviso de límites al adjuntar (tipo no permitido, demasiados archivos...). */
export interface AttachmentNotice {
  id: string;
  tone: 'danger' | 'warning';
  title: string;
  message: string;
  /** Detalle por archivo cuando se rechazaron varios. */
  items?: string[];
}

/** Turno del asistente en el hilo. */
export interface AssistantMessageView {
  id: string;
  role: 'assistant';
  text: string;
  tools: ToolView[];
  /** Acciones que el asistente propone; solo se ejecutan al confirmarlas la persona. */
  proposals: Proposal[];
  status: 'streaming' | 'done' | 'stopped' | 'error';
  errorMessage?: string;
}

export type ChatMessageView = UserMessageView | AssistantMessageView;

/** Estado de disponibilidad del asistente. */
export type AssistantAvailability =
  | { state: 'loading'; reason: null }
  | { state: 'available'; reason: null }
  | { state: 'unavailable'; reason: string | null }
  | { state: 'error'; reason: null };

/** Fallo del último envío (se muestra bajo el hilo). */
export interface TurnError {
  tone: 'danger' | 'warning';
  title: string;
  message: string;
  canRetry: boolean;
}

export type AssistantPanelView = 'chat' | 'history';

export interface AssistantHistory {
  items: ConversationSummary[];
  loading: boolean;
  error: boolean;
  reload: () => void;
  remove: (id: string) => Promise<void>;
}

export interface AssistantContextValue {
  availability: AssistantAvailability;
  refreshAvailability: () => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  view: AssistantPanelView;
  setView: (view: AssistantPanelView) => void;
  conversationId: string | null;
  title: string | null;
  messages: ChatMessageView[];
  loadingConversation: boolean;
  loadFailure: 'not-found' | 'error' | null;
  streaming: boolean;
  turnError: TurnError | null;
  draft: string;
  setDraft: (value: string) => void;
  send: (text: string) => void;
  attachments: AttachmentItem[];
  attachmentLimits: AttachmentLimitsView;
  attachmentNotices: AttachmentNotice[];
  dismissAttachmentNotices: () => void;
  addFiles: (files: File[]) => void;
  removeAttachment: (localId: string) => void;
  retryAttachment: (localId: string) => void;
  saveAttachmentText: (localId: string, text: string) => Promise<void>;
  confirmProposal: (id: string) => void;
  discardProposal: (id: string) => void;
  stop: () => void;
  retry: () => void;
  newConversation: () => void;
  openConversation: (id: string) => void;
  history: AssistantHistory;
  liveMessage: string;
  announce: (message: string) => void;
}

const AssistantContext = React.createContext<AssistantContextValue | null>(null);

export function useAssistant(): AssistantContextValue {
  const value = React.useContext(AssistantContext);
  if (!value) {
    throw new Error('useAssistant debe usarse dentro de AssistantProvider.');
  }
  return value;
}

let localId = 0;
function nextLocalId(prefix: string): string {
  localId += 1;
  return `${prefix}-${localId}`;
}

/** Fallo previo al flujo -> aviso entendible (qué pasó, qué hacer, cómo seguir). */
function turnErrorFor(error: unknown): TurnError {
  const status = error instanceof ApiError ? error.status : undefined;
  if (status === 429) {
    return {
      tone: 'warning',
      title: 'Vas muy rápido',
      message: 'Espera unos segundos antes de enviar otra pregunta.',
      canRetry: false,
    };
  }
  if (status === 409) {
    return {
      tone: 'warning',
      title: 'El asistente no está disponible',
      message:
        error instanceof ApiError ? error.message : 'Inténtalo de nuevo más tarde.',
      canRetry: false,
    };
  }
  if (status !== undefined && status >= 500) {
    return {
      tone: 'danger',
      title: 'No se pudo enviar tu mensaje',
      message:
        'El servicio no respondió. Inténtalo de nuevo en un momento. Si el problema continúa, contacta al administrador del portal.',
      canRetry: true,
    };
  }
  return {
    tone: 'danger',
    title: 'No se pudo enviar tu mensaje',
    message: 'Revisa tu conexión e inténtalo de nuevo.',
    canRetry: true,
  };
}

/**
 * Estado compartido del asistente (BL-032 F2): disponibilidad, conversación
 * activa, stream en curso e historial. Panel y página son dos vistas de este
 * mismo estado, por eso una conversación es la misma en ambos y el borrador se
 * conserva al cerrar el panel o navegar.
 */
export function AssistantProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [availability, setAvailability] = React.useState<AssistantAvailability>({
    state: 'loading',
    reason: null,
  });
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [view, setView] = React.useState<AssistantPanelView>('chat');
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessageView[]>([]);
  const [loadingConversation, setLoadingConversation] = React.useState(false);
  const [loadFailure, setLoadFailure] = React.useState<'not-found' | 'error' | null>(null);
  const [streaming, setStreaming] = React.useState(false);
  const [turnError, setTurnError] = React.useState<TurnError | null>(null);
  const [draft, setDraft] = React.useState('');
  const [liveMessage, setLiveMessage] = React.useState('');

  const [historyItems, setHistoryItems] = React.useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historyError, setHistoryError] = React.useState(false);

  // Adjuntos del compositor. El ref es la fuente de verdad (lectura inmediata
  // al enviar o al añadir varios seguidos); el estado solo refleja para renderizar.
  const [attachments, setAttachments] = React.useState<AttachmentItem[]>([]);
  const [attachmentLimits, setAttachmentLimits] =
    React.useState<AttachmentLimitsView>(FALLBACK_LIMITS);
  const [attachmentNotices, setAttachmentNotices] = React.useState<AttachmentNotice[]>([]);
  const attachmentsRef = React.useRef<AttachmentItem[]>([]);
  const limitsRef = React.useRef<AttachmentLimitsView>(FALLBACK_LIMITS);
  const uploadControllers = React.useRef(new Map<string, AbortController>());
  /** Adjuntos de un envío que falló antes de abrir el flujo: el reintento los reutiliza. */
  const pendingRetryRef = React.useRef<Attachment[] | null>(null);

  const abortRef = React.useRef<AbortController | null>(null);
  const conversationRef = React.useRef<string | null>(null);
  const bufferRef = React.useRef('');
  const frameRef = React.useRef<number | null>(null);
  const loadSeq = React.useRef(0);

  React.useEffect(() => {
    conversationRef.current = conversationId;
  }, [conversationId]);

  const announce = React.useCallback((message: string) => setLiveMessage(message), []);

  // ----------------------------------------------------------- disponibilidad

  const refreshAvailability = React.useCallback(() => {
    getAssistantStatus()
      .then((status) => {
        // Los límites de los adjuntos los define la API; sin ellos, los de respaldo.
        const limits = status.attachments ?? FALLBACK_LIMITS;
        limitsRef.current = limits;
        setAttachmentLimits(limits);
        setAvailability(
          status.available
            ? { state: 'available', reason: null }
            : { state: 'unavailable', reason: status.reason },
        );
      })
      // Error de red al consultarlo: botón normal (optimista); si el chat falla, lo dirá el chat.
      .catch(() => setAvailability({ state: 'error', reason: null }));
  }, []);

  React.useEffect(() => {
    refreshAvailability();
  }, [refreshAvailability]);

  // ---------------------------------------------------------------- historial

  const reloadHistory = React.useCallback(() => {
    setHistoryLoading(true);
    setHistoryError(false);
    listConversations()
      .then(setHistoryItems)
      .catch(() => setHistoryError(true))
      .finally(() => setHistoryLoading(false));
  }, []);

  // ----------------------------------------------------------------- adjuntos

  const commitAttachments = React.useCallback((next: AttachmentItem[]) => {
    attachmentsRef.current = next;
    setAttachments(next);
  }, []);

  const patchAttachment = React.useCallback(
    (localId: string, patch: Partial<AttachmentItem>) => {
      commitAttachments(
        attachmentsRef.current.map((item) =>
          item.localId === localId ? { ...item, ...patch } : item,
        ),
      );
    },
    [commitAttachments],
  );

  /** Sube el archivo y sigue su avance: subiendo -> extrayendo -> listo | error. */
  const startUpload = React.useCallback(
    (localId: string, file: File) => {
      const controller = new AbortController();
      uploadControllers.current.set(localId, controller);
      patchAttachment(localId, { status: 'subiendo', progress: 0, error: null });
      uploadAttachment(file, {
        signal: controller.signal,
        onProgress: (percent) => patchAttachment(localId, { progress: percent }),
        onUploaded: () => patchAttachment(localId, { status: 'extrayendo', progress: null }),
      })
        .then((saved) => {
          patchAttachment(localId, {
            status: 'listo',
            progress: null,
            attachment: saved,
            error: null,
          });
          announce(`${file.name} está listo.`);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const retryable = error instanceof AttachmentUploadError ? error.retryable : true;
          patchAttachment(localId, {
            status: 'error',
            progress: null,
            error:
              error instanceof Error
                ? error.message
                : `No se pudo subir ${file.name}. Inténtalo de nuevo.`,
            retryable,
          });
          announce(`No se pudo leer ${file.name}.`);
        })
        .finally(() => {
          uploadControllers.current.delete(localId);
        });
    },
    [announce, patchAttachment],
  );

  const addFiles = React.useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const limits = limitsRef.current;
      let room = limits.maxFiles - attachmentsRef.current.length;
      const accepted: File[] = [];
      const rejected: Array<{ name: string; reason: string }> = [];
      const overflow: string[] = [];
      for (const file of files) {
        const reason = validateAttachmentFile(file, limits);
        if (reason) rejected.push({ name: file.name, reason });
        else if (room <= 0) overflow.push(file.name);
        else {
          accepted.push(file);
          room -= 1;
        }
      }

      const notices: AttachmentNotice[] = [];
      if (rejected.length > 0) {
        notices.push(
          rejected.length === 1
            ? {
                id: nextLocalId('n'),
                tone: 'danger',
                title: rejectedTitle(1, rejected[0].name),
                message: rejected[0].reason,
              }
            : {
                id: nextLocalId('n'),
                tone: 'danger',
                title: rejectedTitle(rejected.length, rejected[0].name),
                message: 'Revisa el tipo y el tamaño de cada archivo.',
                items: rejected.map((r) => `${r.name}: ${r.reason}`),
              },
        );
      }
      if (overflow.length > 0) {
        notices.push({
          id: nextLocalId('n'),
          tone: 'warning',
          title: `Máximo ${limits.maxFiles} archivos por mensaje`,
          message:
            accepted.length > 0
              ? `Solo se adjuntaron los primeros ${accepted.length}. Quita alguno para añadir más.`
              : 'Quita alguno para añadir más.',
        });
      }
      // Los avisos se limpian solos al añadir archivos válidos sin rechazos.
      setAttachmentNotices(notices);
      if (notices.length > 0) {
        announce(notices[0].title);
      }

      if (accepted.length === 0) return;
      const items: AttachmentItem[] = accepted.map((file) => ({
        localId: nextLocalId('att'),
        name: file.name,
        size: file.size,
        status: 'subiendo',
        progress: 0,
        attachment: null,
        edited: false,
        error: null,
        retryable: true,
        file,
      }));
      commitAttachments([...attachmentsRef.current, ...items]);
      announce(
        items.length === 1 ? `Subiendo ${items[0].name}.` : `Subiendo ${items.length} archivos.`,
      );
      for (const item of items) startUpload(item.localId, item.file);
    },
    [announce, commitAttachments, startUpload],
  );

  const removeAttachment = React.useCallback(
    (localId: string) => {
      const item = attachmentsRef.current.find((i) => i.localId === localId);
      if (!item) return;
      uploadControllers.current.get(localId)?.abort();
      uploadControllers.current.delete(localId);
      commitAttachments(attachmentsRef.current.filter((i) => i.localId !== localId));
      if (item.attachment) {
        // El archivo ya estaba guardado: se borra (si falla, el servidor lo purga solo).
        deleteAttachment(item.attachment.id).catch(() => undefined);
      }
      announce(`Se quitó ${item.name}.`);
    },
    [announce, commitAttachments],
  );

  const retryAttachment = React.useCallback(
    (localId: string) => {
      const item = attachmentsRef.current.find((i) => i.localId === localId);
      if (!item || item.status !== 'error' || !item.retryable) return;
      announce(`Subiendo ${item.name} otra vez.`);
      startUpload(localId, item.file);
    },
    [announce, startUpload],
  );

  const saveAttachmentText = React.useCallback(
    async (localId: string, text: string) => {
      const item = attachmentsRef.current.find((i) => i.localId === localId);
      if (!item?.attachment) return;
      const saved = await updateAttachmentText(item.attachment.id, text);
      patchAttachment(localId, { attachment: saved, edited: true });
    },
    [patchAttachment],
  );

  const dismissAttachmentNotices = React.useCallback(() => setAttachmentNotices([]), []);

  // ------------------------------------------------------------------- stream

  const flush = React.useCallback(() => {
    frameRef.current = null;
    const pending = bufferRef.current;
    if (pending === '') return;
    bufferRef.current = '';
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant') return prev;
      return [...prev.slice(0, -1), { ...last, text: last.text + pending }];
    });
  }, []);

  const scheduleFlush = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(flush);
  }, [flush]);

  const patchAssistant = React.useCallback(
    (patch: (message: AssistantMessageView) => AssistantMessageView) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== 'assistant') return prev;
        return [...prev.slice(0, -1), patch(last)];
      });
    },
    [],
  );

  const send = React.useCallback(
    (raw: string, reuse?: Attachment[]) => {
      const text = raw.trim();
      // Los adjuntos del compositor deben estar todos listos; un reintento reutiliza
      // los que ya iban con el mensaje que falló antes de abrir el flujo.
      const composerItems = attachmentsRef.current;
      if (!reuse && composerItems.some((i) => i.status !== 'listo' || !i.attachment)) return;
      const sentAttachments: Attachment[] =
        reuse ??
        composerItems.flatMap((i) => (i.attachment ? [i.attachment] : []));
      if (
        (text === '' && sentAttachments.length === 0) ||
        text.length > MAX_MESSAGE_LENGTH ||
        abortRef.current
      ) {
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      setTurnError(null);
      setDraft('');
      pendingRetryRef.current = null;
      if (!reuse) commitAttachments([]);
      setMessages((prev) => [
        ...prev,
        { id: nextLocalId('u'), role: 'user', text, attachments: sentAttachments },
        {
          id: nextLocalId('a'),
          role: 'assistant',
          text: '',
          tools: [],
          proposals: [],
          status: 'streaming',
        },
      ]);
      announce('Mensaje enviado. El asistente está pensando.');
      let announcedTool = false;
      let announcedText = false;
      let opened = false;

      streamChat({
        message: text,
        attachmentIds: sentAttachments.map((a) => a.id),
        conversationId: conversationRef.current,
        signal: controller.signal,
        onEvent: (event) => {
          opened = true;
          switch (event.event) {
            case 'conversation':
              conversationRef.current = event.data.conversationId;
              setConversationId(event.data.conversationId);
              setTitle((current) => current ?? event.data.title);
              break;
            case 'tool': {
              const { id, name, status } = event.data;
              const label = event.data.label;
              if (!announcedTool && status === 'running') {
                announcedTool = true;
                announce(`Consultando ${label}.`);
              }
              patchAssistant((m) => {
                const exists = m.tools.some((t) => t.id === id);
                const tools = exists
                  ? m.tools.map((t) => (t.id === id ? { ...t, status } : t))
                  : [...m.tools, { id, name, label, status }];
                return { ...m, tools };
              });
              break;
            }
            case 'proposal':
              announce('El asistente preparó una acción para que la confirmes.');
              patchAssistant((m) => ({ ...m, proposals: [...m.proposals, event.data] }));
              break;
            case 'text':
              if (!announcedText) {
                announcedText = true;
                announce('El asistente está respondiendo.');
              }
              bufferRef.current += event.data.delta;
              scheduleFlush();
              break;
            case 'done':
              break;
            case 'error':
              if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
              }
              flush();
              patchAssistant((m) => ({
                ...m,
                status: 'error',
                errorMessage: event.data.message,
              }));
              break;
          }
        },
      })
        .then(() => {
          if (frameRef.current !== null) {
            window.cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
          }
          flush();
          patchAssistant((m) => {
            if (m.status === 'error') return m;
            const count = m.tools.length;
            announce(
              count > 0
                ? `El asistente terminó de responder. Consultó ${count} ${count === 1 ? 'fuente' : 'fuentes'}.`
                : 'El asistente terminó de responder.',
            );
            return { ...m, status: 'done' };
          });
          reloadHistory();
        })
        .catch((error: unknown) => {
          if (frameRef.current !== null) {
            window.cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
          }
          flush();
          if (controller.signal.aborted) {
            announce('Respuesta detenida.');
            patchAssistant((m) => ({ ...m, status: 'stopped' }));
            return;
          }
          if (!opened) {
            // Falló antes de abrir el flujo: se quita el turno vacío del asistente.
            // Los adjuntos siguen sin enviarse en el servidor: el reintento los reutiliza.
            pendingRetryRef.current = sentAttachments.length > 0 ? sentAttachments : null;
            setMessages((prev) => prev.slice(0, -1));
            setTurnError(turnErrorFor(error));
            if (error instanceof ApiError && error.status === 409) refreshAvailability();
            return;
          }
          // Corte a mitad del flujo: se conserva lo recibido.
          patchAssistant((m) => ({
            ...m,
            status: 'error',
            errorMessage: 'Recibimos solo una parte. Puedes reintentar.',
          }));
        })
        .finally(() => {
          abortRef.current = null;
          setStreaming(false);
        });
    },
    [
      announce,
      commitAttachments,
      flush,
      patchAssistant,
      refreshAvailability,
      reloadHistory,
      scheduleFlush,
    ],
  );

  /** Reemplaza una propuesta por id en cualquier mensaje del hilo. */
  const replaceProposal = React.useCallback((id: string, next: (p: Proposal) => Proposal) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.role === 'assistant' && m.proposals.some((p) => p.id === id)
          ? { ...m, proposals: m.proposals.map((p) => (p.id === id ? next(p) : p)) }
          : m,
      ),
    );
  }, []);

  const confirmProposal = React.useCallback(
    (id: string) => {
      replaceProposal(id, (p) => ({ ...p, status: 'EJECUTANDO' }));
      announce('Ejecutando la acción.');
      confirmProposalRequest(id)
        .then((saved) => {
          replaceProposal(id, () => saved);
          announce(
            saved.status === 'CONFIRMADA'
              ? 'Acción realizada.'
              : 'La acción no se pudo realizar.',
          );
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status !== undefined) {
            // El servidor respondió (venció, ya resuelta...): se muestra su motivo.
            replaceProposal(id, (p) => ({ ...p, status: 'FALLIDA', error: error.message }));
            announce('La acción no se pudo realizar.');
          } else {
            replaceProposal(id, (p) => ({ ...p, status: 'PENDIENTE' }));
            toast.error('No se pudo confirmar. Revisa tu conexión e inténtalo de nuevo.');
          }
        });
    },
    [announce, replaceProposal],
  );

  const discardProposal = React.useCallback(
    (id: string) => {
      discardProposalRequest(id)
        .then((saved) => {
          replaceProposal(id, () => saved);
          announce('Propuesta descartada.');
        })
        .catch(() => {
          toast.error('No se pudo descartar. Inténtalo de nuevo.');
        });
    },
    [announce, replaceProposal],
  );

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retry = React.useCallback(() => {
    if (abortRef.current) return;
    const snapshot = messages;
    const lastUserIndex = [...snapshot].reverse().findIndex((m) => m.role === 'user');
    if (lastUserIndex === -1) return;
    const index = snapshot.length - 1 - lastUserIndex;
    const lastUser = snapshot[index];
    if (lastUser.role !== 'user') return;
    // Quita el último intercambio fallido y lo vuelve a enviar. Si falló antes de
    // abrir el flujo, los adjuntos siguen disponibles y viajan otra vez; si no,
    // ya quedaron en la conversación y el asistente los ve en el historial.
    const reuse = pendingRetryRef.current ?? undefined;
    setMessages(snapshot.slice(0, index));
    setTurnError(null);
    send(lastUser.text, reuse);
  }, [messages, send]);

  const resetThread = React.useCallback(() => {
    abortRef.current?.abort();
    loadSeq.current += 1;
    bufferRef.current = '';
    conversationRef.current = null;
    setConversationId(null);
    setTitle(null);
    setMessages([]);
    setTurnError(null);
    setLoadFailure(null);
    setLoadingConversation(false);
  }, []);

  const newConversation = React.useCallback(() => {
    resetThread();
    setView('chat');
    announce('Conversación.');
  }, [announce, resetThread]);

  const openConversation = React.useCallback(
    (id: string) => {
      if (id === conversationRef.current && messages.length > 0) {
        setView('chat');
        return;
      }
      resetThread();
      conversationRef.current = id;
      setConversationId(id);
      setView('chat');
      setLoadingConversation(true);
      const seq = loadSeq.current;
      getConversation(id)
        .then((conversation) => {
          if (seq !== loadSeq.current) return;
          setTitle(conversation.title);
          setMessages(
            conversation.messages.map((m): ChatMessageView =>
              m.role === 'user'
                ? { id: m.id, role: 'user', text: m.text, attachments: m.attachments ?? [] }
                : {
                    id: m.id,
                    role: 'assistant',
                    text: m.text,
                    status: 'done',
                    proposals: m.proposals,
                    tools: m.tools.map((t) => ({
                      name: t.name,
                      label: t.label,
                      status: t.status,
                    })),
                  },
            ),
          );
        })
        .catch((error: unknown) => {
          if (seq !== loadSeq.current) return;
          setLoadFailure(
            error instanceof ApiError && error.status === 404 ? 'not-found' : 'error',
          );
        })
        .finally(() => {
          if (seq === loadSeq.current) setLoadingConversation(false);
        });
    },
    [messages.length, resetThread],
  );

  const removeConversation = React.useCallback(
    async (id: string) => {
      await deleteConversation(id);
      setHistoryItems((prev) => prev.filter((c) => c.id !== id));
      if (conversationRef.current === id) newConversation();
    },
    [newConversation],
  );

  // Cierra sesión / desmonta: corta cualquier stream abierto.
  React.useEffect(() => {
    const controllers = uploadControllers.current;
    return () => {
      abortRef.current?.abort();
      for (const controller of controllers.values()) controller.abort();
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const value = React.useMemo<AssistantContextValue>(
    () => ({
      availability,
      refreshAvailability,
      panelOpen,
      setPanelOpen,
      view,
      setView,
      conversationId,
      title,
      messages,
      loadingConversation,
      loadFailure,
      streaming,
      turnError,
      draft,
      setDraft,
      send,
      attachments,
      attachmentLimits,
      attachmentNotices,
      dismissAttachmentNotices,
      addFiles,
      removeAttachment,
      retryAttachment,
      saveAttachmentText,
      confirmProposal,
      discardProposal,
      stop,
      retry,
      newConversation,
      openConversation,
      history: {
        items: historyItems,
        loading: historyLoading,
        error: historyError,
        reload: reloadHistory,
        remove: removeConversation,
      },
      liveMessage,
      announce,
    }),
    [
      availability,
      refreshAvailability,
      panelOpen,
      view,
      conversationId,
      title,
      messages,
      loadingConversation,
      loadFailure,
      streaming,
      turnError,
      draft,
      send,
      attachments,
      attachmentLimits,
      attachmentNotices,
      dismissAttachmentNotices,
      addFiles,
      removeAttachment,
      retryAttachment,
      saveAttachmentText,
      confirmProposal,
      discardProposal,
      stop,
      retry,
      newConversation,
      openConversation,
      historyItems,
      historyLoading,
      historyError,
      reloadHistory,
      removeConversation,
      liveMessage,
      announce,
    ],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

/** Etiqueta de una herramienta para la lista de fuentes: «solicitudes» -> «Solicitudes». */
export function toolDisplayLabel(tool: ToolView): string {
  return capitalize(tool.label);
}
