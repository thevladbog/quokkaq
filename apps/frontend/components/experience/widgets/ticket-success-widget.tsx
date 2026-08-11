'use client';

import {
  KioskTicketSuccessOverlay,
  type KioskTicketSuccessOverlayProps
} from '@/components/kiosk/kiosk-ticket-success-overlay';

export type TicketSuccess = Pick<
  KioskTicketSuccessOverlayProps,
  | 'serviceName'
  | 'queueNumber'
  | 'successEtaMinutes'
  | 'successPeopleAhead'
  | 'serviceZoneName'
  | 'qrValue'
>;

export function TicketSuccessWidget({
  success,
  onReset
}: {
  success: TicketSuccess;
  onReset: () => void;
}) {
  return (
    <KioskTicketSuccessOverlay
      open
      onClose={onReset}
      a11yLive={`Ticket ${success.queueNumber} created`}
      showTicketHeader={false}
      showTicketFooter={false}
      highContrast={false}
      bodyBackground='#ffffff'
      smsBlocking={false}
      closeButtonLabel='Start over'
      {...success}
    />
  );
}
