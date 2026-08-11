'use client';

import type { ServiceModel } from '@quokkaq/shared-types';

import { KioskEmployeeIdFlow } from '@/components/kiosk/kiosk-employee-id-flow';
import { KioskPhoneIdentificationModal } from '@/components/kiosk/kiosk-phone-identification-modal';
import { KioskCustomIdentificationDialog } from '@/components/kiosk/kiosk-custom-identification-dialog';
import { KioskIdOcrDialog } from '@/components/kiosk/kiosk-id-ocr-dialog';
import { PreRegRedemptionModal } from '@/components/kiosk/PreRegRedemptionModal';
import type { Service } from '@/lib/api';
import type { Ticket } from '@/lib/api';

/** Only identity facts allowed into the common condition evaluator. */
export type RuntimeIdentity = {
  isAuthenticated: boolean;
  isEmployee: boolean;
  groups: string[];
  userId?: string;
};

export type IdentificationAdapter = {
  unitId: string;
  locale: 'en' | 'ru';
  employeeService: Service;
  /** Resolves a user id to safe condition facts; raw credentials never leave the kiosk component. */
  resolveEmployee: (userId: string) => RuntimeIdentity;
  onDocumentData?: (data: Record<string, unknown>) => void;
  preRegistration?: {
    onSuccess: (ticket: Ticket) => void;
  };
};

export function IdentifyWidget({
  service,
  adapter,
  onIdentified,
  onBack
}: {
  service: Pick<
    ServiceModel,
    'identificationMode' | 'kioskIdentificationConfig' | 'kioskDocumentSettings'
  >;
  adapter: IdentificationAdapter;
  onIdentified: (
    identity: RuntimeIdentity,
    data?: Record<string, unknown>
  ) => void;
  onBack: () => void;
}) {
  const mode = service.identificationMode ?? 'none';
  if (mode === 'qr' && adapter.preRegistration) {
    return (
      <PreRegRedemptionModal
        isOpen
        onClose={onBack}
        unitId={adapter.unitId}
        showPhoneTab
        onSuccess={(ticket) => {
          adapter.preRegistration?.onSuccess(ticket);
          onIdentified(
            { isAuthenticated: true, isEmployee: false, groups: [] },
            { preRegistrationTicket: ticket }
          );
        }}
      />
    );
  }
  if (mode === 'qr') {
    return (
      <div
        role='alert'
        className='flex h-full items-center justify-center p-6 text-center text-lg font-semibold'
      >
        Pre-registration scanning is unavailable on this station.
      </div>
    );
  }
  if (mode === 'badge' || mode === 'login')
    return (
      <KioskEmployeeIdFlow
        unitId={adapter.unitId}
        service={adapter.employeeService}
        mode={mode}
        onBack={onBack}
        onIdentified={(userId) => onIdentified(adapter.resolveEmployee(userId))}
      />
    );
  if (mode === 'phone')
    return (
      <KioskPhoneIdentificationModal
        isOpen
        sessionKey={1}
        isPending={false}
        onSkip={onBack}
        onConfirm={(phone) =>
          onIdentified(
            { isAuthenticated: true, isEmployee: false, groups: [] },
            { phone }
          )
        }
      />
    );
  if (mode === 'custom')
    return (
      <KioskCustomIdentificationDialog
        open
        onOpenChange={(open) => {
          if (!open) onBack();
        }}
        config={service.kioskIdentificationConfig}
        locale={adapter.locale}
        unitId={adapter.unitId}
        onConfirm={(data: Record<string, unknown>) => {
          adapter.onDocumentData?.(data);
          onIdentified(
            { isAuthenticated: true, isEmployee: false, groups: [] },
            data
          );
        }}
        onSkip={onBack}
      />
    );
  if (mode === 'document')
    return (
      <KioskIdOcrDialog
        open
        onOpenChange={(open) => !open && onBack()}
        unitId={adapter.unitId}
        preferNative
        onUseText={(text) => {
          adapter.onDocumentData?.({ document: text });
          onIdentified(
            { isAuthenticated: true, isEmployee: false, groups: [] },
            { document: text }
          );
        }}
      />
    );
  return null;
}
