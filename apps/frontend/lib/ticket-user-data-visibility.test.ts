import { describe, expect, it } from 'vitest';
import {
  getDocumentsDataPreviewString,
  shouldShowUserDataInQueueList,
  ticketHasDocumentsData
} from './ticket-user-data-visibility';
import { KIOSK_ID_DOCUMENT_OCR_FAILED_KEY } from '@quokkaq/shared-types';
import type { Service, Ticket } from '@quokkaq/shared-types';

const svc = (partial: Partial<Service> & { id: string }): Service =>
  ({
    name: 'S',
    identificationMode: 'none',
    prebook: false,
    isLeaf: true,
    offerIdentification: false,
    ...partial
  }) as Service;

const tick = (
  partial: Partial<Ticket> & { id: string; serviceId: string }
): Ticket =>
  ({
    status: 'waiting',
    createdAt: new Date().toISOString(),
    ...partial
  }) as Ticket;

describe('ticketHasDocumentsData', () => {
  it('is false for empty or missing', () => {
    expect(
      ticketHasDocumentsData(
        tick({ id: '1', serviceId: 's' }) as Pick<Ticket, 'documentsData'>
      )
    ).toBe(false);
    expect(
      ticketHasDocumentsData({
        documentsData: {}
      } as Pick<Ticket, 'documentsData'>)
    ).toBe(false);
  });
  it('is true for non-empty object', () => {
    expect(
      ticketHasDocumentsData({
        documentsData: { k: 1 }
      } as Pick<Ticket, 'documentsData'>)
    ).toBe(true);
  });
});

describe('shouldShowUserDataInQueueList', () => {
  it('hides when no documentsData', () => {
    const get = (id: string | undefined) =>
      id ? svc({ id, identificationMode: 'document' }) : undefined;
    expect(
      shouldShowUserDataInQueueList(
        tick({ id: '1', serviceId: 'a' }) as Parameters<
          typeof shouldShowUserDataInQueueList
        >[0],
        get
      )
    ).toBe(false);
  });

  it('shows for document mode when getService returns document', () => {
    const t = tick({
      id: '1',
      serviceId: 's1',
      documentsData: { idDocumentOcr: 'x' }
    });
    const get = () => svc({ id: 's1', identificationMode: 'document' });
    expect(shouldShowUserDataInQueueList(t, get)).toBe(true);
  });

  it('shows for custom with showInQueuePreview', () => {
    const t = tick({
      id: '1',
      serviceId: 's1',
      documentsData: { ref: '1' }
    });
    const get = () =>
      svc({
        id: 's1',
        identificationMode: 'custom',
        kioskIdentificationConfig: { showInQueuePreview: true } as never
      });
    expect(shouldShowUserDataInQueueList(t, get)).toBe(true);
  });

  it('hides for custom without showInQueuePreview', () => {
    const t = tick({
      id: '1',
      serviceId: 's1',
      documentsData: { ref: '1' }
    });
    const get = () =>
      svc({
        id: 's1',
        identificationMode: 'custom',
        kioskIdentificationConfig: { showInQueuePreview: false } as never
      });
    expect(shouldShowUserDataInQueueList(t, get)).toBe(false);
  });

  it('shows when getService undefined but data present', () => {
    const t = tick({
      id: '1',
      serviceId: 's1',
      documentsData: { a: 1 }
    });
    expect(shouldShowUserDataInQueueList(t, () => undefined)).toBe(true);
  });
});

describe('getDocumentsDataPreviewString', () => {
  it('truncates long line', () => {
    const long = 'a'.repeat(200);
    const s = getDocumentsDataPreviewString(
      {
        documentsData: { k: long }
      } as Pick<Ticket, 'documentsData'>,
      10
    );
    expect(s.length).toBe(10);
    expect(s.endsWith('…')).toBe(true);
  });

  it('with flag labels replaces idDocumentOcrFailed', () => {
    const s = getDocumentsDataPreviewString(
      {
        documentsData: { [KIOSK_ID_DOCUMENT_OCR_FAILED_KEY]: true }
      } as Pick<Ticket, 'documentsData'>,
      200,
      { ocrFailed: 'OCR fail msg', customSkipped: 'Skip msg' }
    );
    expect(s).toBe('OCR fail msg');
  });
});
