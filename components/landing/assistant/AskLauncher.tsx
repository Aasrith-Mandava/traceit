"use client";

// The floating "Ask TraceIt" launcher (bottom-right). Light and always mounted; the chat panel
// itself is code-split and only loaded on intent (hover/focus/touch of the launcher) or on open.
// Any part of the page can open it — optionally with a question — via openAssistant().
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { motionTokens, springs } from "@/lib/motion";
import { ASK_EVENT, type AskEventDetail } from "../site";
import { ChatIcon } from "../icons";
import { usePrefersReducedMotion } from "../../motion/usePrefersReducedMotion";
import type { ChatMsg } from "./types";

const loadPanel = () => import("./AskPanel").then((m) => m.AskPanel);
const AskPanel = dynamic(loadPanel, { ssr: false });

export function AskLauncher() {
  const reduce = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [pending, setPending] = useState<string | undefined>();
  const launcherRef = useRef<HTMLButtonElement>(null);

  const show = useCallback((question?: string) => {
    setPending(question);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onAsk = (e: Event) => show((e as CustomEvent<AskEventDetail>).detail?.question);
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, [show]);

  const close = useCallback(() => {
    setOpen(false);
    // Hand focus back to the launcher once it's visible again.
    requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.div
            key="launcher"
            className="fixed right-4 bottom-4 z-[55] sm:right-6 sm:bottom-6"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: motionTokens.distance.md, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: motionTokens.duration.fast } }}
            transition={reduce ? { duration: 0 } : { ...springs.gentle, delay: 0.4 }}
          >
            <button
              ref={launcherRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls="ask-traceit"
              onClick={() => show()}
              onPointerEnter={() => void loadPanel()}
              onFocus={() => void loadPanel()}
              onTouchStart={() => void loadPanel()}
              className="group inline-flex min-h-14 items-center gap-2.5 rounded-pill bg-accent py-2 pr-5 pl-2 text-[15px] font-bold text-on-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_18px_40px_-14px_rgb(75_59_219/0.75)] transition-[background-color,box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:bg-accent-hover"
            >
              <span className="inline-flex size-10 items-center justify-center rounded-pill bg-highlight text-on-highlight">
                <ChatIcon size={20} />
              </span>
              Ask TraceIt
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <AskPanel
            key="panel"
            messages={messages}
            setMessages={setMessages}
            initialQuestion={pending}
            onConsumeInitial={() => setPending(undefined)}
            onClose={close}
          />
        )}
      </AnimatePresence>
    </>
  );
}
