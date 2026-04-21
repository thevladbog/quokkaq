'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListUnitOperatorSkills,
  useUpsertUnitOperatorSkills,
  useDeleteUnitOperatorSkill,
  getListUnitOperatorSkillsQueryKey,
  type ModelsOperatorSkill
} from '@/lib/api/generated/units';
import { useGetUnitsUnitIdShiftActivityActors } from '@/lib/api/generated/shift';
import { useGetUnitsUnitIdServices } from '@/lib/api/generated/services';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OperatorSkillMatrixProps {
  unitId: string;
  skillBasedRoutingEnabled: boolean;
  onToggleSkillRouting?: (enabled: boolean) => void;
}

const PRIORITY_BADGE_VARIANT: Record<
  number,
  'default' | 'secondary' | 'outline'
> = {
  1: 'default',
  2: 'secondary',
  3: 'outline'
};

export function OperatorSkillMatrix({
  unitId,
  skillBasedRoutingEnabled,
  onToggleSkillRouting
}: OperatorSkillMatrixProps) {
  const t = useTranslations('admin');
  const qc = useQueryClient();

  const [newUserId, setNewUserId] = useState('');
  const [newServiceId, setNewServiceId] = useState('');
  const [newPriority, setNewPriority] = useState(1);

  const skillsQuery = useListUnitOperatorSkills(unitId, undefined, {
    query: { enabled: Boolean(unitId) }
  });
  const actorsQuery = useGetUnitsUnitIdShiftActivityActors(unitId, {
    query: { enabled: Boolean(unitId) }
  });
  const servicesQuery = useGetUnitsUnitIdServices(unitId, {
    query: { enabled: Boolean(unitId) }
  });

  const upsertMutation = useUpsertUnitOperatorSkills({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({
          queryKey: getListUnitOperatorSkillsQueryKey(unitId)
        });
        setNewUserId('');
        setNewServiceId('');
        setNewPriority(1);
        toast.success(t('operator_skills.saved'));
      },
      onError: (err: unknown) => {
        toast.error(
          typeof err === 'string'
            ? err
            : (t('operator_skills.save_error') as string)
        );
      }
    }
  });

  const deleteMutation = useDeleteUnitOperatorSkill({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({
          queryKey: getListUnitOperatorSkillsQueryKey(unitId)
        });
        toast.success(t('operator_skills.deleted'));
      }
    }
  });

  const skills = useMemo<ModelsOperatorSkill[]>(
    () =>
      skillsQuery.data?.status === 200 ? (skillsQuery.data.data ?? []) : [],
    [skillsQuery.data]
  );

  const actors = useMemo(
    () =>
      actorsQuery.data?.status === 200
        ? (actorsQuery.data.data.items ?? [])
        : [],
    [actorsQuery.data]
  );

  const services = useMemo(
    () =>
      servicesQuery.data?.status === 200 ? (servicesQuery.data.data ?? []) : [],
    [servicesQuery.data]
  );

  const actorName = useCallback(
    (uid: string) => actors.find((a) => a.userId === uid)?.name ?? uid,
    [actors]
  );
  const serviceName = useCallback(
    (sid: string) => services.find((s) => s.id === sid)?.name ?? sid,
    [services]
  );

  const groupedByUser = useMemo(() => {
    const map = new Map<string, ModelsOperatorSkill[]>();
    for (const s of skills) {
      if (!s.userId) continue;
      if (!map.has(s.userId)) map.set(s.userId, []);
      map.get(s.userId)!.push(s);
    }
    return map;
  }, [skills]);

  const handleAdd = () => {
    if (!newUserId || !newServiceId) {
      toast.error(t('operator_skills.select_user_service'));
      return;
    }
    upsertMutation.mutate({
      unitId,
      data: {
        skills: [
          { userId: newUserId, serviceId: newServiceId, priority: newPriority }
        ]
      }
    });
  };

  const handleDelete = (skillId: string) => {
    deleteMutation.mutate({ unitId, skillId });
  };

  const handlePriorityChange = (
    skill: ModelsOperatorSkill,
    priority: number
  ) => {
    if (!skill.userId || !skill.serviceId) return;
    upsertMutation.mutate({
      unitId,
      data: {
        skills: [
          {
            userId: skill.userId,
            serviceId: skill.serviceId,
            priority
          }
        ]
      }
    });
  };

  return (
    <div className='space-y-6'>
      {/* Feature flag toggle */}
      <div className='flex items-center gap-3 rounded-lg border p-4'>
        <Switch
          id='skill-routing-toggle'
          checked={skillBasedRoutingEnabled}
          onCheckedChange={onToggleSkillRouting}
        />
        <div>
          <Label htmlFor='skill-routing-toggle' className='text-sm font-medium'>
            {t('operator_skills.routing_enabled_label')}
          </Label>
          <p className='text-muted-foreground text-xs'>
            {t('operator_skills.routing_enabled_hint')}
          </p>
        </div>
      </div>

      {/* Add new mapping */}
      <div className='space-y-3 rounded-lg border p-4'>
        <p className='text-sm font-medium'>
          {t('operator_skills.add_mapping')}
        </p>
        <div className='flex flex-wrap gap-3'>
          <Select value={newUserId} onValueChange={setNewUserId}>
            <SelectTrigger className='w-48'>
              <SelectValue placeholder={t('operator_skills.select_operator')} />
            </SelectTrigger>
            <SelectContent>
              {actors.map((a) => (
                <SelectItem key={a.userId} value={a.userId ?? ''}>
                  {a.name ?? a.userId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={newServiceId} onValueChange={setNewServiceId}>
            <SelectTrigger className='w-48'>
              <SelectValue placeholder={t('operator_skills.select_service')} />
            </SelectTrigger>
            <SelectContent>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id ?? ''}>
                  {s.name ?? s.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(newPriority)}
            onValueChange={(v) => setNewPriority(Number(v))}
          >
            <SelectTrigger className='w-36'>
              <SelectValue placeholder={t('operator_skills.priority')} />
            </SelectTrigger>
            <SelectContent>
              {([1, 2, 3] as const).map((p) => (
                <SelectItem key={p} value={String(p)}>
                  {t(`operator_skills.priority_${p}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleAdd}
            disabled={upsertMutation.isPending}
            size='sm'
          >
            {t('operator_skills.add')}
          </Button>
        </div>
      </div>

      {/* Skill matrix table */}
      {groupedByUser.size === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {t('operator_skills.empty')}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('operator_skills.col_operator')}</TableHead>
              <TableHead>{t('operator_skills.col_service')}</TableHead>
              <TableHead>{t('operator_skills.col_priority')}</TableHead>
              <TableHead className='w-12' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from(groupedByUser.entries()).flatMap(
              ([userId, userSkills]) =>
                userSkills.map((skill, idx) => (
                  <TableRow key={skill.id ?? `${userId}-${idx}`}>
                    <TableCell
                      className={cn(
                        'font-medium',
                        idx > 0 && 'text-muted-foreground'
                      )}
                    >
                      {idx === 0 ? actorName(userId) : ''}
                    </TableCell>
                    <TableCell>{serviceName(skill.serviceId ?? '')}</TableCell>
                    <TableCell>
                      <Select
                        value={String(skill.priority ?? 1)}
                        onValueChange={(v) =>
                          handlePriorityChange(skill, Number(v))
                        }
                      >
                        <SelectTrigger className='h-7 w-36'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {([1, 2, 3] as const).map((p) => (
                            <SelectItem key={p} value={String(p)}>
                              <Badge variant={PRIORITY_BADGE_VARIANT[p]}>
                                {t(`operator_skills.priority_${p}`)}
                              </Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7'
                        onClick={() => skill.id && handleDelete(skill.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
