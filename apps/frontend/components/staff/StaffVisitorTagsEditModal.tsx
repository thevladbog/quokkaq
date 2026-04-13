'use client';

import { Ticket } from '@/lib/api';
import { useSetVisitorTags } from '@/lib/hooks';
import { VisitorTagsPickerDialog } from '@/components/visitors/VisitorTagsPickerDialog';

type TFn = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

export interface StaffVisitorTagsEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  ticketId: string;
  client: NonNullable<Ticket['client']>;
  t: TFn;
}

function visitorTagsModalRemountKey(
  client: NonNullable<Ticket['client']>
): string {
  const defIds = [...(client.definitions ?? []).map((d) => d.id)]
    .sort()
    .join(',');
  return `${client.id}:${defIds}`;
}

/** Resets draft state when `client` or `client.definitions` change (inner remount). */
export function StaffVisitorTagsEditModal(
  props: StaffVisitorTagsEditModalProps
) {
  const k = visitorTagsModalRemountKey(props.client);
  return <StaffVisitorTagsEditModalInner key={k} {...props} />;
}

function StaffVisitorTagsEditModalInner({
  open,
  onOpenChange,
  unitId,
  ticketId,
  client,
  t
}: StaffVisitorTagsEditModalProps) {
  const setVisitorTags = useSetVisitorTags();

  return (
    <VisitorTagsPickerDialog
      open={open}
      onOpenChange={onOpenChange}
      unitId={unitId}
      initialSelectedIds={(client.definitions ?? []).map((d) => d.id)}
      auditReasonRequired
      isPending={setVisitorTags.isPending}
      t={t}
      onSave={async ({ tagDefinitionIds, operatorComment }) => {
        await setVisitorTags.mutateAsync({
          ticketId,
          tagDefinitionIds,
          operatorComment: operatorComment ?? ''
        });
      }}
    />
  );
}
