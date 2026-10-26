export interface ReconcileSchedulerLogger {
  warn(data: Record<string, unknown>, message: string): void;
}

export interface ReconcileSchedulerDeps {
  reconcile: () => Promise<number>;
  logger: ReconcileSchedulerLogger;
  intervalMs: number;
}

export interface ReconcileScheduler {
  stop(): void;
  runNow(): Promise<void>;
}

export function startReconcileScheduler(deps: ReconcileSchedulerDeps): ReconcileScheduler {
  let running = false;

  async function runNow(): Promise<void> {
    if (running) {
      return;
    }

    running = true;

    try {
      await deps.reconcile();
    } catch (error) {
      // Un fallo de reconciliación no debe tumbar el worker ni detener la cola.
      deps.logger.warn({ err: error }, 'falló la reconciliación de avisos');
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => {
    void runNow();
  }, deps.intervalMs);

  // Con temporizadores falsos en tests `unref` puede no existir.
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  void runNow();

  return {
    stop(): void {
      clearInterval(timer);
    },
    runNow,
  };
}
