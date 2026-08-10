'use client';

import type {
  ExperiencePage,
  ExperienceTemplate,
  ExperienceWidget
} from '@quokkaq/shared-types';
import { Layers3, LayoutPanelLeft, PlusSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExperienceWidgetCatalog } from './experience-widget-catalog';
import {
  ExperienceLayersPanel,
  type ExperienceEditorLayerState
} from './experience-layers-panel';
import { ExperiencePageRail } from './experience-page-rail';

export type ExperienceSidePanelProps = {
  template: ExperienceTemplate;
  page: ExperiencePage;
  activePageId: string;
  selectedWidgetId?: string;
  layerOrder?: readonly string[];
  activeTab: 'pages' | 'add' | 'layers';
  editorState: ExperienceEditorLayerState;
  onTabChange: (tab: 'pages' | 'add' | 'layers') => void;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onDuplicatePage: (pageId: string) => void;
  onRenamePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onMovePage: (pageId: string, direction: -1 | 1) => void;
  onAddWidget: (type: ExperienceWidget['type']) => void;
  onSelectWidget: (widgetId: string) => void;
  onMoveLayer: (widgetId: string, direction: -1 | 1) => void;
  onToggleLayerLock: (widgetId: string) => void;
  onToggleLayerHidden: (widgetId: string) => void;
};

export function ExperienceSidePanel(props: ExperienceSidePanelProps) {
  const t = useTranslations('experience.builder');
  return (
    <aside
      className='bg-card flex min-h-0 min-w-0 flex-col border-r'
      aria-label={t('sidePanel.label', { default: 'Builder navigation' })}
    >
      <Tabs
        value={props.activeTab}
        onValueChange={(value) =>
          props.onTabChange(value as 'pages' | 'add' | 'layers')
        }
        className='min-h-0 flex-1 gap-0'
      >
        <TabsList className='rounded-none border-b bg-transparent p-1'>
          <TabsTrigger
            value='pages'
            onClick={() => props.onTabChange('pages')}
            className='min-h-11 flex-1'
          >
            <LayoutPanelLeft />
            {t('tabs.pages', { default: 'Pages' })}
          </TabsTrigger>
          <TabsTrigger
            value='layers'
            onClick={() => props.onTabChange('layers')}
            className='min-h-11 flex-1'
          >
            <Layers3 />
            {t('tabs.layers', { default: 'Layers' })}
          </TabsTrigger>
          <TabsTrigger
            value='add'
            onClick={() => props.onTabChange('add')}
            className='min-h-11 flex-1'
          >
            <PlusSquare />
            {t('tabs.add', { default: 'Add' })}
          </TabsTrigger>
        </TabsList>
        <TabsContent value='pages' className='mt-0 min-h-0 flex-1'>
          <ExperiencePageRail
            template={props.template}
            activePageId={props.activePageId}
            onSelect={props.onSelectPage}
            onAdd={props.onAddPage}
            onDuplicate={props.onDuplicatePage}
            onRename={props.onRenamePage}
            onDelete={props.onDeletePage}
            onMove={props.onMovePage}
          />
        </TabsContent>
        <TabsContent value='add' className='mt-0 min-h-0 flex-1'>
          <ExperienceWidgetCatalog
            surface={props.template.surface}
            onAdd={props.onAddWidget}
          />
        </TabsContent>
        <TabsContent value='layers' className='mt-0 min-h-0 flex-1'>
          <ExperienceLayersPanel
            page={props.page}
            selectedWidgetId={props.selectedWidgetId}
            orderedWidgetIds={props.layerOrder}
            editorState={props.editorState}
            onSelect={props.onSelectWidget}
            onMove={props.onMoveLayer}
            onToggleLock={props.onToggleLayerLock}
            onToggleHidden={props.onToggleLayerHidden}
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
