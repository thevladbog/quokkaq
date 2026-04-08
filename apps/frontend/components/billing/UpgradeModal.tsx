'use client';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TrendingUp, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface UpgradeModalProps {
  isOpen: boolean;
  feature: string;
  currentUsage?: number;
  limit?: number;
  onClose: () => void;
  onUpgrade: () => void;
}

export function UpgradeModal({ 
  isOpen, 
  feature, 
  currentUsage,
  limit,
  onClose, 
  onUpgrade 
}: UpgradeModalProps) {
  const t = useTranslations('billing.upgradeModal');
  const tMetrics = useTranslations('organization.usage.metrics');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-full">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
            <DialogTitle className="text-2xl">{t('title')}</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            {t('description', { feature: tMetrics(feature) })}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {currentUsage !== undefined && limit !== undefined && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">{t('currentUsage')}</span>
                <span className="text-lg font-bold">
                  {currentUsage} / {limit}
                </span>
              </div>
            </div>
          )}

          <p className="text-sm text-gray-600 mb-4">
            {t(`descriptions.${feature}`)}
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-blue-900 mb-1">
                  {t('upgradeTitle')}
                </p>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• {t('benefits.increased')}</li>
                  <li>• {t('benefits.features')}</li>
                  <li>• {t('benefits.support')}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-3">
          <Button onClick={onClose} variant="outline" className="flex-1">
            {t('later')}
          </Button>
          <Button onClick={onUpgrade} className="flex-1">
            <TrendingUp className="mr-2 h-4 w-4" />
            {t('upgrade')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
