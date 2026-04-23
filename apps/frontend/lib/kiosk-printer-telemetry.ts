import { unitsApi } from '@/lib/api';
import { logger } from '@/lib/logger';

/**
 * Best-effort report for supervisor WebSocket (no user-visible UI on the kiosk).
 */
export function reportKioskPrinterTelemetry(
  unitId: string,
  kind: 'print_error' | 'agent_error' | 'paper_out',
  message: string
) {
  if (!unitId) {
    return;
  }
  void unitsApi
    .postKioskPrinterTelemetry(unitId, { kind, message })
    .catch((err: unknown) => {
      logger.error('Kiosk printer telemetry request failed', {
        err,
        unitId,
        kind
      });
    });
}
