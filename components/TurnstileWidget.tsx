"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

declare global {
  interface Window {
    turnstile: any;
  }
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
}

export interface TurnstileRef {
  execute: () => void;
  reset: () => void;
}

export const TurnstileWidget = forwardRef<TurnstileRef, TurnstileWidgetProps>(
  ({ onVerify, onError, onExpire }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const isReadyRef = useRef(false);

    // Expose execute and reset methods to parent
    useImperativeHandle(ref, () => ({
      execute: () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.execute(widgetIdRef.current);
        }
      },
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
    }));

    useEffect(() => {
      // Load Turnstile script if not already loaded
      if (!document.querySelector('script[src*="turnstile"]')) {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);

        script.onload = () => {
          renderTurnstile();
        };
      } else if (window.turnstile) {
        renderTurnstile();
      }

      return () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
        }
      };
    }, []);

    const renderTurnstile = () => {
      if (!containerRef.current || !window.turnstile) return;

      // Destroy existing widget if any
      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!,
        callback: (token: string) => {
          onVerify(token);
        },
        "error-callback": () => {
          if (onError) onError();
        },
        "expired-callback": () => {
          if (onExpire) onExpire();
        },
        theme: "dark",
        size: "normal",
        execution: "execute",
      });

      isReadyRef.current = true;
    };

    return <div ref={containerRef} />;
  }
);

TurnstileWidget.displayName = "TurnstileWidget";