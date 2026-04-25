import { describe, expect, it } from 'vitest';
import {
  getDocumentsDataPreviewString,
  shouldShowUserDataInQueueList,
  ticketHasDocumentsData
} from './ticket-user-data-visibility';
import {
  KIOSK_ID_DOCUMENT_OCR_KEY,
  KIOSK_ID_DOCUMENT_OCR_FAILED_KEY
} from '@quokkaq/shared-types';
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
  it('is false without permission', () => {
    expect(
      ticketHasDocumentsData(
        { documentsData: { k: 1 } } as Pick<Ticket, 'documentsData'>,
        false
      )
    ).toBe(false);
  });

  it('is false for empty or missing', () => {
    expect(
      ticketHasDocumentsData(
        tick({ id: '1', serviceId: 's' }) as Pick<Ticket, 'documentsData'>,
        true
      )
    ).toBe(false);
    expect(
      ticketHasDocumentsData(
        { documentsData: {} } as Pick<Ticket, 'documentsData'>,
        true
      )
    ).toBe(false);
  });
  it('is true for non-empty object with permission', () => {
    expect(
      ticketHasDocumentsData(
        { documentsData: { k: 1 } } as Pick<Ticket, 'documentsData'>,
        true
      )
    ).toBe(true);
  });
});

describe('shouldShowUserDataInQueueList', () => {
  it('hides when canRead is false', () => {
    const t = tick({
      id: '1',
      serviceId: 'a',
      documentsData: { a: 1 }
    });
    const get = () => svc({ id: 'a', identificationMode: 'document' });
    expect(shouldShowUserDataInQueueList(t, get, false)).toBe(false);
  });

  it('hides when no documentsData', () => {
    const get = (id: string | undefined) =>
      id ? svc({ id, identificationMode: 'document' }) : undefined;
    expect(
      shouldShowUserDataInQueueList(
        tick({ id: '1', serviceId: 'a' }) as Parameters<
          typeof shouldShowUserDataInQueueList
        >[0],
        get,
        true
      )
    ).toBe(false);
  });

  it('shows for document mode when getService returns document', () => {
    const t = tick({
      id: '1',
      serviceId: 's1',
      documentsData: { [KIOSK_ID_DOCUMENT_OCR_KEY]: 'x' }
    });
    const get = () => svc({ id: 's1', identificationMode: 'document' });
    expect(shouldShowUserDataInQueueList(t, get, true)).toBe(true);
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
    expect(shouldShowUserDataInQueueList(t, get, true)).toBe(true);
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
    expect(shouldShowUserDataInQueueList(t, get, true)).toBe(false);
  });

  it('hides when getService is undefined', () => {
    const t = tick({
      id: '1',
      serviceId: 's1',
      documentsData: { a: 1 }
    });
    expect(shouldShowUserDataInQueueList(t, () => undefined, true)).toBe(false);
  });
});

describe('getDocumentsDataPreviewString', () => {
  it('returns empty without permission', () => {
    const s = getDocumentsDataPreviewString(
      { documentsData: { k: 'v' } } as Pick<Ticket, 'documentsData'>,
      10,
      false
    );
    expect(s).toBe('');
  });

  it('truncates long line', () => {
    const long = 'a'.repeat(200);
    const s = getDocumentsDataPreviewString(
      {
        documentsData: { k: long }
      } as Pick<Ticket, 'documentsData'>,
      10,
      true
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
      true,
      { ocrFailed: 'OCR fail msg', customSkipped: 'Skip msg' }
    );
    expect(s).toBe('OCR fail msg');
  });

  it('with flag labels uses friendly OCR line', () => {
    const s = getDocumentsDataPreviewString(
      {
        documentsData: { [KIOSK_ID_DOCUMENT_OCR_KEY]: 'abc' }
      } as Pick<Ticket, 'documentsData'>,
      200,
      true,
      {
        ocrFailed: 'x',
        customSkipped: 'y',
        idDocumentOcr: 'OCR line'
      }
    );
    expect(s).toBe('OCR line: abc');
  });
});
