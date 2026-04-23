import { describe, it, expect } from 'vitest';
import { widgetSchematicKey, widgetBuilderKey } from './widget-display-name';

describe('widgetSchematicKey', () => {
  it('maps called-tickets to tickets', () => {
    expect(widgetSchematicKey('called-tickets')).toBe('tickets');
  });

  it('maps screen-header to clock', () => {
    expect(widgetSchematicKey('screen-header')).toBe('clock');
  });

  it('maps screen-footer-qr to queueStats', () => {
    expect(widgetSchematicKey('screen-footer-qr')).toBe('queueStats');
  });

  it('maps queue-ticker to queueTicker', () => {
    expect(widgetSchematicKey('queue-ticker')).toBe('queueTicker');
  });

  it('maps custom-html to customHtml', () => {
    expect(widgetSchematicKey('custom-html')).toBe('customHtml');
  });

  it('maps content-player to content', () => {
    expect(widgetSchematicKey('content-player')).toBe('content');
  });

  it('maps join-queue-qr to joinQueueQr', () => {
    expect(widgetSchematicKey('join-queue-qr')).toBe('joinQueueQr');
  });

  it('handles unknown types by returning tickets', () => {
    expect(widgetSchematicKey('unknown-type')).toBe('tickets');
  });
});

describe('widgetBuilderKey', () => {
  it('maps called-tickets to calledTickets', () => {
    expect(widgetBuilderKey('called-tickets')).toBe('calledTickets');
  });

  it('maps screen-header to screenHeader', () => {
    expect(widgetBuilderKey('screen-header')).toBe('screenHeader');
  });

  it('maps clock to clock', () => {
    expect(widgetBuilderKey('clock')).toBe('clock');
  });

  it('maps screen-footer-qr to screenFooterQr', () => {
    expect(widgetBuilderKey('screen-footer-qr')).toBe('screenFooterQr');
  });

  it('maps queue-ticker to ticker', () => {
    expect(widgetBuilderKey('queue-ticker')).toBe('ticker');
  });

  it('maps custom-html to customHtml', () => {
    expect(widgetBuilderKey('custom-html')).toBe('customHtml');
  });

  it('maps eta-display to eta', () => {
    expect(widgetBuilderKey('eta-display')).toBe('eta');
  });

  it('handles unknown types by returning unknown', () => {
    expect(widgetBuilderKey('unknown-type')).toBe('unknown');
  });
});
