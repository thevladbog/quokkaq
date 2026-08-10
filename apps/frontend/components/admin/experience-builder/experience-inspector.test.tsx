import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type {
  ExperienceLayoutVariant,
  ExperienceWidget
} from '@quokkaq/shared-types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    String(values?.default ?? key)
}));

import { ExperienceInspector } from './experience-inspector';

afterEach(cleanup);

const variant: ExperienceLayoutVariant = {
  id: 'portrait',
  profile: {
    id: 'ipad-10-9-portrait',
    name: 'iPad 10.9 portrait',
    width: 820,
    height: 1180,
    interactionMode: 'touch',
    viewingDistance: 'near',
    safeArea: { top: 24, right: 24, bottom: 24, left: 24 }
  },
  grid: { columns: 12, rows: 18 }
};

const widget: ExperienceWidget = {
  id: 'services',
  type: 'service-picker',
  config: { title: 'Choose service' },
  actions: []
};

describe('ExperienceInspector', () => {
  it('labels inherited controls and keeps shared and active-variant mutations separate', () => {
    const onSharedChange = vi.fn();
    const onPlacementChange = vi.fn();
    const onTypographyScaleChange = vi.fn();
    render(
      <ExperienceInspector
        pageId='services-page'
        widget={widget}
        variant={variant}
        placement={{ col: 1, row: 1, colSpan: 4, rowSpan: 3 }}
        typographyScale={1.15}
        onSharedChange={onSharedChange}
        onPlacementChange={onPlacementChange}
        onTypographyScaleChange={onTypographyScaleChange}
      />
    );

    expect(
      screen.getAllByText(/shared across variants/i).length
    ).toBeGreaterThan(1);
    expect(screen.getAllByText(/iPad 10.9 portrait/i).length).toBeGreaterThan(
      0
    );

    fireEvent.change(screen.getByLabelText(/widget title/i), {
      target: { value: 'Employee services' }
    });
    expect(onSharedChange).toHaveBeenCalledWith({
      config: { title: 'Employee services' }
    });
    expect(onPlacementChange).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/column/i), {
      target: { value: '2' }
    });
    expect(onPlacementChange).toHaveBeenCalledWith({
      col: 2,
      row: 1,
      colSpan: 4,
      rowSpan: 3
    });
    expect(screen.getByLabelText(/typography scale/i)).toHaveValue(1.15);
    fireEvent.change(screen.getByLabelText(/typography scale/i), {
      target: { value: '1.2' }
    });
    expect(onTypographyScaleChange).toHaveBeenCalledWith(1.2);
  });

  it('makes service-owned behavior read-only with a service settings deep link', () => {
    render(
      <ExperienceInspector
        pageId='services-page'
        widget={widget}
        variant={variant}
        placement={{ col: 1, row: 1, colSpan: 4, rowSpan: 3 }}
        serviceSettingsHref='/admin/services/services'
      />
    );
    expect(
      screen.getAllByText(/service-owned behavior/i).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('link', { name: /open service settings/i })
    ).toHaveAttribute('href', '/admin/services/services');
  });

  it('retains a forward-incompatible saved condition during unrelated shared edits', () => {
    const incompatibleWidget = {
      ...widget,
      access: {
        when: {
          kind: 'rule',
          field: 'identity.department',
          operator: 'eq',
          value: 'operations'
        },
        whenFalse: 'lock'
      }
    } as unknown as ExperienceWidget;

    function Harness() {
      const [current, setCurrent] = useState(incompatibleWidget);
      return (
        <ExperienceInspector
          pageId='services-page'
          widget={current}
          variant={variant}
          placement={{ col: 1, row: 1, colSpan: 4, rowSpan: 3 }}
          onSharedChange={(changes) =>
            setCurrent((previous) => ({ ...previous, ...changes }))
          }
        />
      );
    }

    render(<Harness />);
    expect(screen.getByText('identity.department')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/widget title/i), {
      target: { value: 'Employee services' }
    });

    expect(screen.getByText('identity.department')).toBeInTheDocument();
    expect(screen.getByLabelText(/widget title/i)).toHaveValue(
      'Employee services'
    );
  });
});
