/* Sample "work" — realistic-looking source files that get typed out.
   Each entry: { name, icon, lang, code }                              */
window.CODE_FILES = [
  {
    name: "auth.service.js",
    icon: "JS",
    lang: "javascript",
    code: `import { createHash, randomBytes } from "crypto";
import { db } from "../db/client.js";
import { signToken, verifyToken } from "./jwt.js";

const SALT_ROUNDS = 12;
const TOKEN_TTL = 60 * 60 * 24; // 24h

/**
 * Hash a plaintext password with a per-user salt.
 * @param {string} password
 * @returns {{ hash: string, salt: string }}
 */
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256")
    .update(password + salt)
    .digest("hex");
  return { hash, salt };
}

export async function registerUser({ email, password }) {
  const existing = await db.users.findOne({ email });
  if (existing) {
    throw new Error("EMAIL_ALREADY_REGISTERED");
  }

  const { hash, salt } = hashPassword(password);
  const user = await db.users.insert({
    email,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: Date.now(),
    role: "member",
  });

  return { id: user.id, token: signToken({ sub: user.id }) };
}

export async function authenticate(email, password) {
  const user = await db.users.findOne({ email });
  if (!user) return null;

  const candidate = createHash("sha256")
    .update(password + user.passwordSalt)
    .digest("hex");

  if (candidate !== user.passwordHash) {
    return null;
  }
  return signToken({ sub: user.id, role: user.role }, TOKEN_TTL);
}
`,
  },
  {
    name: "useMetrics.ts",
    icon: "TS",
    lang: "typescript",
    code: `import { useEffect, useRef, useState } from "react";

interface MetricPoint {
  t: number;
  value: number;
}

interface MetricsState {
  points: MetricPoint[];
  average: number;
  peak: number;
  loading: boolean;
}

const MAX_POINTS = 120;

export function useMetrics(endpoint: string, intervalMs = 1000): MetricsState {
  const [points, setPoints] = useState<MetricPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        const data = (await res.json()) as { value: number };
        if (cancelled) return;
        setPoints((prev) => {
          const next = [...prev, { t: Date.now(), value: data.value }];
          return next.slice(-MAX_POINTS);
        });
      } finally {
        setLoading(false);
      }
    }

    poll();
    timer.current = window.setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [endpoint, intervalMs]);

  const average = points.length
    ? points.reduce((s, p) => s + p.value, 0) / points.length
    : 0;
  const peak = points.reduce((m, p) => Math.max(m, p.value), 0);

  return { points, average, peak, loading };
}
`,
  },
  {
    name: "pipeline.py",
    icon: "PY",
    lang: "python",
    code: `import asyncio
import logging
from dataclasses import dataclass, field
from typing import Awaitable, Callable

log = logging.getLogger("pipeline")


@dataclass
class Job:
    id: str
    payload: dict
    attempts: int = 0
    max_retries: int = 3
    tags: list[str] = field(default_factory=list)


class Pipeline:
    """A small async worker pool with retry + backoff."""

    def __init__(self, concurrency: int = 8) -> None:
        self._queue: asyncio.Queue[Job] = asyncio.Queue()
        self._concurrency = concurrency
        self._handlers: dict[str, Callable[[Job], Awaitable[None]]] = {}

    def handler(self, name: str):
        def register(fn: Callable[[Job], Awaitable[None]]):
            self._handlers[name] = fn
            return fn
        return register

    async def submit(self, job: Job) -> None:
        await self._queue.put(job)

    async def _worker(self, wid: int) -> None:
        while True:
            job = await self._queue.get()
            try:
                handler = self._handlers[job.payload["type"]]
                await handler(job)
                log.info("worker=%d done job=%s", wid, job.id)
            except Exception as exc:  # noqa: BLE001
                job.attempts += 1
                if job.attempts <= job.max_retries:
                    delay = 2 ** job.attempts
                    log.warning("retry job=%s in %ds (%s)", job.id, delay, exc)
                    await asyncio.sleep(delay)
                    await self._queue.put(job)
                else:
                    log.error("dead-letter job=%s after %d tries", job.id, job.attempts)
            finally:
                self._queue.task_done()

    async def run(self) -> None:
        workers = [asyncio.create_task(self._worker(i)) for i in range(self._concurrency)]
        await self._queue.join()
        for w in workers:
            w.cancel()
`,
  },
  {
    name: "Button.tsx",
    icon: "TS",
    lang: "typescript",
    code: `import { forwardRef, type ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", loading, icon, children, className, disabled, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(styles.btn, styles[variant], styles[size], className)}
        {...rest}
      >
        {loading ? <span className={styles.spinner} aria-hidden /> : icon}
        <span>{children}</span>
      </button>
    );
  },
);
`,
  },
  {
    name: "rateLimiter.go",
    icon: "GO",
    lang: "go",
    code: `package middleware

import (
	"net/http"
	"sync"
	"time"
)

// TokenBucket implements a simple per-key rate limiter.
type TokenBucket struct {
	mu       sync.Mutex
	tokens   float64
	capacity float64
	refill   float64
	last     time.Time
}

func NewTokenBucket(capacity, refillPerSec float64) *TokenBucket {
	return &TokenBucket{
		tokens:   capacity,
		capacity: capacity,
		refill:   refillPerSec,
		last:     time.Now(),
	}
}

func (b *TokenBucket) Allow() bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(b.last).Seconds()
	b.last = now
	b.tokens = min(b.capacity, b.tokens+elapsed*b.refill)

	if b.tokens >= 1 {
		b.tokens--
		return true
	}
	return false
}

func RateLimit(next http.Handler, rps float64) http.Handler {
	bucket := NewTokenBucket(rps*2, rps)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !bucket.Allow() {
			http.Error(w, "too many requests", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}
`,
  },
];
