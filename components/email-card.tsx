"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { TurnstileWidget, TurnstileRef } from "./TurnstileWidget";

const roles = ["Founder", "Designer", "Developer", "Investor"];

export function EmailCard() {
  // ===== State =====
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Designer");
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [roleStats, setRoleStats] = useState<Record<string, number> | null>(
    null
  );

  // ===== Refs =====
  const turnstileRef = useRef<TurnstileRef>(null);
  const pendingSubmitRef = useRef(false);
  const isMountedRef = useRef(true);

  // ===== Helpers =====
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // ===== Submit form =====
  const submitForm = useCallback(
    async (token: string) => {
      if (!isMountedRef.current) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            role,
            turnstileToken: token,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to submit email");
        }

        if (isMountedRef.current) {
          setSubmitted(true);
          localStorage.removeItem("pendingEmail");
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : "Unknown error");
          // Reset Turnstile for retry
          if (turnstileRef.current) {
            turnstileRef.current.reset();
          }
          setTurnstileToken(null);
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsVerifying(false);
          pendingSubmitRef.current = false;
        }
      }
    },
    [email, role]
  );

  // ===== Turnstile callbacks =====
  const handleTurnstileVerify = useCallback(
    (token: string) => {
      if (!isMountedRef.current) return;

      setTurnstileToken(token);
      setIsVerifying(false);

      // اگر درخواست ارسال در انتظار بود، حالا ارسال کن
      if (pendingSubmitRef.current) {
        pendingSubmitRef.current = false;
        submitForm(token);
      }
    },
    [submitForm]
  );

  const handleTurnstileError = useCallback(() => {
    if (!isMountedRef.current) return;
    setIsVerifying(false);
    setError("Verification failed. Please try again.");
    pendingSubmitRef.current = false;
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    if (!isMountedRef.current) return;
    setTurnstileToken(null);
    setError("Verification expired. Please try again.");
    if (turnstileRef.current) {
      turnstileRef.current.reset();
    }
  }, []);

  // ===== Form submit handler =====
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!isMountedRef.current) return;
      if (isLoading || isVerifying) return;

      // 1. Validate email
      if (!email.trim()) {
        setError("Please enter your email address");
        return;
      }

      if (!validateEmail(email)) {
        setError("Please enter a valid email address");
        return;
      }

      // 2. Clear previous errors
      setError(null);

      // 3. Check if we already have a valid token
      if (turnstileToken) {
        // Token exists, submit directly
        await submitForm(turnstileToken);
        return;
      }

      // 4. Start Turnstile verification
      setIsVerifying(true);
      pendingSubmitRef.current = true;

      // 5. Execute Turnstile
      if (turnstileRef.current) {
        turnstileRef.current.execute();

        // 6. Timeout safety (if Turnstile doesn't respond)
        setTimeout(() => {
          if (pendingSubmitRef.current && isMountedRef.current) {
            pendingSubmitRef.current = false;
            setIsVerifying(false);
            setError("Verification timed out. Please try again.");
          }
        }, 15000);
      } else {
        setIsVerifying(false);
        setError("Verification not available. Please refresh the page.");
      }
    },
    [email, turnstileToken, isLoading, isVerifying, submitForm]
  );

  // ===== Load stats =====
  useEffect(() => {
    async function loadStats() {
      try {
        const response = await fetch("/api/stats");
        if (response.ok) {
          const data = await response.json();
          if (isMountedRef.current) {
            setTotalCount(data.total);
            setRoleStats(data.roles);
          }
        }
      } catch (error) {
        console.error("Failed to load stats:", error);
      }
    }

    loadStats();

    // Load saved email from localStorage
    const savedEmail = localStorage.getItem("pendingEmail");
    if (savedEmail && isMountedRef.current) {
      setEmail(savedEmail);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ===== Save email to localStorage =====
  useEffect(() => {
    if (email) {
      localStorage.setItem("pendingEmail", email);
    }
  }, [email]);

  // ===== Reset Turnstile on error or retry =====
  useEffect(() => {
    if (error && turnstileRef.current) {
      turnstileRef.current.reset();
    }
  }, [error]);

  // ===== Render =====
  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.9, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto w-full max-w-md"
    >
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-card text-card-foreground shadow-[0_30px_80px_-20px_rgba(15,23,42,0.55)]">
        {/* Background */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: "url(/card-texture.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-card/60 via-card/80 to-card"
        />

        <div className="relative p-7 sm:p-9">
          {/* Header */}
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-primary">
            Early access
          </p>
          <h2 className="mt-3 font-heading text-3xl leading-tight tracking-tight text-balance">
            If you like, give me your email.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            Join the founding circle. Limited invitations to shape what
            we&apos;re building.
          </p>

          {/* Stats */}
          {totalCount !== null && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex flex-wrap items-center gap-3 text-xs text-white/40"
            >
              <span>✨ {totalCount} joined</span>
              {roleStats && (
                <span>
                  {Object.entries(roleStats)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(" • ")}
                </span>
              )}
            </motion.div>
          )}

          {/* Form or Success */}
          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="mt-7 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-5 py-4"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-4 w-4" strokeWidth={2} />
                </span>
                <p className="text-sm text-white/80">
                  You&apos;re on the list. We&apos;ll be in touch.
                </p>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onSubmit={handleSubmit}
                className="mt-7 flex flex-col gap-4"
              >
                {/* Email input */}
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block font-mono text-[11px] uppercase tracking-[0.2em] text-white/40"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@studio.com"
                    disabled={isLoading || isVerifying}
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-primary/60 focus:bg-white/10 disabled:opacity-50"
                  />
                </div>

                {/* Role buttons */}
                <div>
                  <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
                    I am a
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {roles.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => !isLoading && !isVerifying && setRole(r)}
                        className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
                          role === r
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-white/15 text-white/60 hover:border-white/40"
                        } ${
                          isLoading || isVerifying
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                        disabled={isLoading || isVerifying}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Turnstile widget */}
                <div className="flex justify-center">
                  <TurnstileWidget
                    ref={turnstileRef}
                    onVerify={handleTurnstileVerify}
                    onError={handleTurnstileError}
                    onExpire={handleTurnstileExpire}
                  />
                </div>

                {/* Status messages */}
                {isVerifying && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-blue-400 bg-blue-500/10 p-3 rounded-xl border border-blue-500/20 flex items-center gap-2"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying...
                  </motion.div>
                )}

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-red-400 bg-red-500/10 p-3 rounded-xl border border-red-500/20"
                  >
                    {error}
                  </motion.div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isLoading || isVerifying}
                  className="group mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : isVerifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      Claim my invite
                      <ArrowRight
                        className="h-4 w-4 transition-transform group-hover:translate-x-1"
                        strokeWidth={1.75}
                      />
                    </>
                  )}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}