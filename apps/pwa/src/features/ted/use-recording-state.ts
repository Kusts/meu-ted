"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Microphone lifecycle state machine (SPEC §17, H-08).
 *
 * `recording` is ONLY entered after getUserMedia success AND MediaRecorder
 * creation AND recorder.start() success. Permission denial / getUserMedia
 * failure / start failure land on `error`, never on `recording`.
 */
export type RecordingState = "idle" | "requesting" | "recording" | "processing" | "error";

export const RECORDING_MIC_ERROR = "Não foi possível acessar o microfone. Verifique as permissões.";

interface UseRecordingStateOptions {
  onAudioBlob?: (blob: Blob) => void;
  onError?: (message: string) => void;
}

interface UseRecordingStateApi {
  state: RecordingState;
  start: () => Promise<void>;
  /** User-initiated stop: keeps the recorded result (fires onAudioBlob). */
  stop: () => void;
  /** Single idempotent teardown: stops recorder + tracks, clears refs, discards result. */
  cleanupMedia: () => void;
}

function stopTracks(stream: MediaStream | null): void {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        /* track already ended — ignore */
      }
    });
  } catch {
    /* stream already torn down — ignore */
  }
}

export function useRecordingState(options: UseRecordingStateOptions = {}): UseRecordingStateApi {
  const [state, setState] = useState<RecordingState>("idle");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const stateRef = useRef<RecordingState>("idle");
  const suppressResultRef = useRef(false);
  const cancelRequestRef = useRef(false);
  const mountedRef = useRef(true);

  const onAudioBlobRef = useRef(options.onAudioBlob);
  const onErrorRef = useRef(options.onError);
  onAudioBlobRef.current = options.onAudioBlob;
  onErrorRef.current = options.onError;

  const setBoth = useCallback((next: RecordingState) => {
    stateRef.current = next;
    if (mountedRef.current) setState(next);
  }, []);

  const fail = useCallback(
    (stream: MediaStream | null, message: string) => {
      stopTracks(stream);
      streamRef.current = null;
      recorderRef.current = null;
      chunksRef.current = [];
      setBoth("error");
      try {
        onErrorRef.current?.(message);
      } catch {
        /* host error handler must not break teardown */
      }
    },
    [setBoth],
  );

  const finalizeRefs = useCallback(() => {
    recorderRef.current = null;
    streamRef.current = null;
    chunksRef.current = [];
  }, []);

  const handleRecorderStop = useCallback(() => {
    const chunks = chunksRef.current;
    const recorder = recorderRef.current;
    const stream = streamRef.current;
    finalizeRefs();
    if (suppressResultRef.current) {
      suppressResultRef.current = false;
      stopTracks(stream);
      setBoth("idle");
      return;
    }
    try {
      const mimeType = recorder?.mimeType || "audio/webm";
      const blob = new Blob(chunks, { type: mimeType });
      onAudioBlobRef.current?.(blob);
    } catch {
      /* blob assembly failure — result is simply dropped */
    }
    // User-initiated stop also releases the mic (previous onstop behavior).
    stopTracks(stream);
    setBoth("idle");
  }, [finalizeRefs, setBoth]);

  const start = useCallback(async () => {
    const current = stateRef.current;
    if (current === "requesting" || current === "recording" || current === "processing") return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      fail(null, RECORDING_MIC_ERROR);
      return;
    }
    suppressResultRef.current = false;
    cancelRequestRef.current = false;
    setBoth("requesting");
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      fail(null, RECORDING_MIC_ERROR);
      return;
    }
    // A teardown (stop/close/unmount/workspace change) may have happened
    // while permission was pending: release the late stream immediately.
    if (cancelRequestRef.current || stateRef.current !== "requesting") {
      stopTracks(stream);
      setBoth("idle");
      return;
    }
    streamRef.current = stream;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      fail(stream, RECORDING_MIC_ERROR);
      return;
    }
    const chunks: BlobPart[] = [];
    chunksRef.current = chunks;
    recorder.ondataavailable = (ev: BlobEvent) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };
    recorder.onstop = handleRecorderStop;
    recorderRef.current = recorder;
    try {
      recorder.start();
    } catch {
      fail(stream, RECORDING_MIC_ERROR);
      return;
    }
    setBoth("recording");
  }, [fail, handleRecorderStop, setBoth]);

  const stop = useCallback(() => {
    // Cancel a still-pending permission request.
    if (stateRef.current === "requesting") {
      cancelRequestRef.current = true;
      setBoth("idle");
      return;
    }
    const recorder = recorderRef.current;
    if (!recorder) {
      if (stateRef.current !== "idle") setBoth("idle");
      return;
    }
    suppressResultRef.current = false;
    setBoth("processing");
    try {
      if (recorder.state !== "inactive") {
        recorder.stop();
      } else {
        // Already inactive (or test double): finish without a result.
        suppressResultRef.current = true;
        handleRecorderStop();
      }
    } catch {
      finalizeRefs();
      stopTracks(streamRef.current);
      streamRef.current = null;
      setBoth("idle");
    }
  }, [finalizeRefs, handleRecorderStop, setBoth]);

  const cleanupMedia = useCallback(() => {
    // Idempotent: safe to call on every teardown trigger, any number of times.
    suppressResultRef.current = true;
    cancelRequestRef.current = true;
    const recorder = recorderRef.current;
    const stream = streamRef.current;
    recorderRef.current = null;
    streamRef.current = null;
    chunksRef.current = [];
    if (recorder) {
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        /* already stopped — ignore */
      }
    }
    stopTracks(stream);
    if (stateRef.current !== "idle") setBoth("idle");
  }, [setBoth]);

  const cleanupRef = useRef(cleanupMedia);
  cleanupRef.current = cleanupMedia;

  // Component unmount teardown (covers logout/expiry: those paths unmount
  // the chat — TedChat itself has no session signal to subscribe to).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupRef.current();
    };
  }, []);

  return { state, start, stop, cleanupMedia };
}
