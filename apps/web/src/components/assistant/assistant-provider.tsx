'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  ApiError,
  confirmProposal as confirmProposalRequest,
  deleteConversation,
  discardProposal as discardProposalRequest,
  getAssistantStatus,
  getConversation,
  listConversations,
  streamChat,
  type ConversationSummary,
  type Proposal,
} from '@/lib/assistant';
import { MAX_MESSAGE_LENGTH, capitalize, type ToolView } from '@/lib/assistant-format';

/** Mensaje de la persona en el hilo. */
export interface UserMessageView {
  id: string;
  role: 'user';
  text: string;
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
      .then((status) =>
        setAvailability(
          status.available
            ? { state: 'available', reason: null }
            : { state: 'unavailable', reason: status.reason },
        ),
      )
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
    (raw: string) => {
      const text = raw.trim();
      if (text === '' || text.length > MAX_MESSAGE_LENGTH || abortRef.current) return;

      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      setTurnError(null);
      setDraft('');
      setMessages((prev) => [
        ...prev,
        { id: nextLocalId('u'), role: 'user', text },
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
    [announce, flush, patchAssistant, refreshAvailability, reloadHistory, scheduleFlush],
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
    // Quita el último intercambio fallido y lo vuelve a enviar.
    setMessages(snapshot.slice(0, index));
    setTurnError(null);
    send(lastUser.text);
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
                ? { id: m.id, role: 'user', text: m.text }
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
    return () => {
      abortRef.current?.abort();
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
