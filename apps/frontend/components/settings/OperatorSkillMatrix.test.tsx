import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

// ─── next-intl ───────────────────────────────────────────────────────────────
vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, { has: () => false })
}));

// ─── sonner ──────────────────────────────────────────────────────────────────
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}));

// ─── lucide-react ─────────────────────────────────────────────────────────────
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    Trash2: () => <span data-testid='trash-icon' />
  };
});

// ─── API hooks ───────────────────────────────────────────────────────────────
const mockSkillsData = [
  {
    id: 'sk-1',
    unitId: 'u-1',
    userId: 'op-1',
    serviceId: 'svc-1',
    priority: 1
  },
  { id: 'sk-2', unitId: 'u-1', userId: 'op-1', serviceId: 'svc-2', priority: 2 }
];

const upsertMutate = vi.fn();
const deleteMutate = vi.fn();
// useListUnitOperatorSkills is swappable for the "empty state" test
const useListUnitOperatorSkillsImpl = vi.fn(() => ({
  data: { status: 200, data: mockSkillsData },
  isLoading: false
}));

vi.mock('@/lib/api/generated/units', () => ({
  useListUnitOperatorSkills: () => useListUnitOperatorSkillsImpl(),
  useUpsertUnitOperatorSkills: () => ({
    mutate: upsertMutate,
    isPending: false
  }),
  useDeleteUnitOperatorSkill: () => ({
    mutate: deleteMutate,
    isPending: false
  }),
  getListUnitOperatorSkillsQueryKey: (unitId: string) => ['skills', unitId]
}));

vi.mock('@/lib/api/generated/shift', () => ({
  useGetUnitsUnitIdShiftActivityActors: () => ({
    data: {
      status: 200,
      data: {
        items: [
          { userId: 'op-1', name: 'Alice Smith' },
          { userId: 'op-2', name: 'Bob Jones' }
        ]
      }
    }
  })
}));

vi.mock('@/lib/api/generated/services', () => ({
  useGetUnitsUnitIdServices: () => ({
    data: {
      status: 200,
      data: [
        { id: 'svc-1', name: 'Service One' },
        { id: 'svc-2', name: 'Service Two' }
      ]
    }
  })
}));

// ─── Component ───────────────────────────────────────────────────────────────
import { OperatorSkillMatrix } from './OperatorSkillMatrix';

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

describe('OperatorSkillMatrix', () => {
  it('renders the skill routing toggle', () => {
    renderWithQuery(
      <OperatorSkillMatrix
        unitId='u-1'
        skillBasedRoutingEnabled={false}
        onToggleSkillRouting={vi.fn()}
      />
    );

    expect(screen.getByRole('switch')).toBeInTheDocument();
    // Label for the toggle
    expect(
      screen.getByText('operator_skills.routing_enabled_label')
    ).toBeInTheDocument();
  });

  it('calls onToggleSkillRouting when the switch is clicked', () => {
    const onToggle = vi.fn();
    renderWithQuery(
      <OperatorSkillMatrix
        unitId='u-1'
        skillBasedRoutingEnabled={false}
        onToggleSkillRouting={onToggle}
      />
    );

    fireEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('renders operator skill rows from mock data', () => {
    renderWithQuery(
      <OperatorSkillMatrix unitId='u-1' skillBasedRoutingEnabled={true} />
    );

    // The operator name should appear in a table cell
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    // Service names resolved from actors/services
    expect(screen.getByText('Service One')).toBeInTheDocument();
    expect(screen.getByText('Service Two')).toBeInTheDocument();
  });

  it('renders delete buttons for each skill row', () => {
    renderWithQuery(
      <OperatorSkillMatrix unitId='u-1' skillBasedRoutingEnabled={true} />
    );

    const deleteButtons = screen.getAllByRole('button', {
      name: 'operator_skills.delete_skill'
    });
    expect(deleteButtons).toHaveLength(2);
  });

  it('shows empty state when there are no skills', () => {
    useListUnitOperatorSkillsImpl.mockReturnValueOnce({
      data: { status: 200, data: [] },
      isLoading: false
    });

    renderWithQuery(
      <OperatorSkillMatrix unitId='u-1' skillBasedRoutingEnabled={true} />
    );

    expect(screen.getByText('operator_skills.empty')).toBeInTheDocument();
  });

  it('renders the add-mapping form controls', () => {
    renderWithQuery(
      <OperatorSkillMatrix unitId='u-1' skillBasedRoutingEnabled={true} />
    );

    // "Add" button
    expect(
      screen.getByRole('button', { name: 'operator_skills.add' })
    ).toBeInTheDocument();
    // Section heading
    expect(screen.getByText('operator_skills.add_mapping')).toBeInTheDocument();
  });
});
