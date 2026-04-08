export type OnboardingInvite = {
  id: string;
  email: string;
  role: string;
};

export type OnboardingState = {
  unit: {
    name: string;
    code: string;
    timezone: string;
  } | null;
  services: Array<{
    name: string;
    description: string;
  }>;
  invites: OnboardingInvite[];
};

/** Props passed to every onboarding step from `OnboardingWizard`. */
export type OnboardingWizardStepProps = {
  state: OnboardingState;
  onNext: (data?: Partial<OnboardingState>) => void;
  onBack?: () => void;
  onSkip?: () => void;
  onComplete?: () => void;
  isPending?: boolean;
};

export function normalizeInviteRows(
  rows: Array<{ email: string; role: string; id?: string }>
): OnboardingInvite[] {
  return rows.map((r) => ({
    id: r.id ?? crypto.randomUUID(),
    email: r.email,
    role: r.role
  }));
}

export function newInviteRow(): OnboardingInvite {
  return { id: crypto.randomUUID(), email: '', role: 'staff' };
}
