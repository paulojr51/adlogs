/**
 * Saúde do coletor — dois indicadores que respondem perguntas diferentes.
 *
 *   isRunning    — o processo está vivo? (deriva do heartbeat)
 *   isCollecting — está entregando eventos? (deriva do último evento recebido)
 *
 * A separação existe por causa de uma falha real: o heartbeat é enviado a cada
 * ciclo independentemente do resultado da coleta, então um coletor com a
 * leitura do Event Log travada continuou "verde" no dashboard por semanas
 * enquanto nenhum evento entrava no banco.
 *
 * Compartilhado entre CollectorService e DashboardService para que as duas
 * telas nunca discordem sobre o estado do mesmo servidor.
 */

/** Heartbeat mais antigo que isto e o coletor é considerado offline. */
export const MINUTOS_ATE_COLETOR_OFFLINE = 10;

/**
 * Sem eventos entregues por mais que isto, com o coletor vivo, a coleta é
 * considerada parada.
 */
export const HORAS_ATE_COLETA_PARADA = 24;

export interface CollectorHealth {
  isRunning: boolean;
  /** `null` = desconhecido (coletor offline ou versão que não reporta o campo). */
  isCollecting: boolean | null;
}

export interface CollectorHealthInput {
  lastSeenAt: Date;
  lastEventAt?: Date | null;
}

export function computeCollectorHealth(
  status: CollectorHealthInput,
  now: number = Date.now(),
): CollectorHealth {
  const isRunning =
    status.lastSeenAt > new Date(now - MINUTOS_ATE_COLETOR_OFFLINE * 60 * 1000);

  // Coletor offline já é um alarme por si só — não sobrepor um segundo.
  // Sem lastEventAt não há como afirmar nada: fica desconhecido, nunca "falha".
  if (!isRunning || !status.lastEventAt) {
    return { isRunning, isCollecting: null };
  }

  const limite = new Date(now - HORAS_ATE_COLETA_PARADA * 60 * 60 * 1000);
  return { isRunning, isCollecting: status.lastEventAt > limite };
}

export function withCollectorHealth<T extends CollectorHealthInput>(
  status: T,
  now?: number,
): T & CollectorHealth {
  return { ...status, ...computeCollectorHealth(status, now) };
}
