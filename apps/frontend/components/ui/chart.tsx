'use client';

import * as React from 'react';
import * as RechartsPrimitive from 'recharts';

import { cn } from '@/lib/utils';

/** Tooltip/legend payload row — keep loose; Recharts 3 `Payload` is generic. */
type ChartPayloadItem = {
  dataKey?: unknown;
  name?: unknown;
  color?: string;
  fill?: string;
  stroke?: string;
  value?: unknown;
  type?: string;
  payload?: unknown;
};

const THEMES = { light: '', dark: '.dark' } as const;

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  );
};

type ChartContextValue = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextValue | null>(null);

function useChart() {
  const ctx = React.useContext(ChartContext);
  if (!ctx) {
    throw new Error('useChart must be used within a <ChartContainer />');
  }
  return ctx;
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    config: ChartConfig;
    children: React.ComponentProps<
      typeof RechartsPrimitive.ResponsiveContainer
    >['children'];
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, '')}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        ref={ref}
        data-slot='chart'
        data-chart={chartId}
        className={cn(
          '[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke="#ccc"]]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke="#ccc"]]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted/30 [&_.recharts-reference-line_[stroke="#ccc"]]:stroke-border flex h-full min-h-0 w-full justify-center text-xs [&_.recharts-dot[stroke="#fff"]]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-sector]:outline-none [&_.recharts-sector[stroke="#fff"]]:stroke-transparent [&_.recharts-surface]:outline-none',
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = 'ChartContainer';

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, item]) => item.theme || item.color
  );

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
      itemConfig.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .filter(Boolean)
  .join('\n')}
}
`
          )
          .join('\n')
      }}
    />
  );
};

const ChartTooltip = RechartsPrimitive.Tooltip;

export type ChartTooltipContentProps = Omit<
  React.ComponentProps<typeof RechartsPrimitive.Tooltip>,
  'content'
> &
  React.ComponentProps<'div'> & {
    /** Injected by Recharts when this component is used as <Tooltip content={...} /> (not on Tooltip itself in v3). */
    active?: boolean;
    payload?: ChartPayloadItem[];
    label?: unknown;
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: 'line' | 'dot' | 'dashed';
    nameKey?: string;
    /** Shown below a separator (e.g. stacked total). */
    footer?:
      | React.ReactNode
      | ((props: {
          active?: boolean;
          payload?: ChartPayloadItem[];
          label?: unknown;
        }) => React.ReactNode);
  };

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  ChartTooltipContentProps
>(
  (
    {
      active,
      payload,
      className,
      indicator = 'dot',
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      color,
      nameKey,
      footer
    },
    ref
  ) => {
    const { config } = useChart();

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel) {
        return null;
      }
      if (labelFormatter) {
        const lf = labelFormatter as (
          label: unknown,
          payload: unknown
        ) => React.ReactNode;
        return (
          <div className={cn('font-medium', labelClassName)}>
            {lf(label, payload ?? [])}
          </div>
        );
      }
      if (label == null || label === false) {
        return null;
      }
      return (
        <div className={cn('font-medium', labelClassName)}>
          {typeof label === 'string' || typeof label === 'number'
            ? String(label)
            : null}
        </div>
      );
    }, [hideLabel, label, labelFormatter, labelClassName, payload]);

    if (!active || !payload?.length) {
      return null;
    }

    const nestLabel = payload.length === 1 && indicator !== 'dot';

    const footerNode =
      typeof footer === 'function'
        ? footer({ active, payload, label })
        : footer;

    return (
      <div
        ref={ref}
        className={cn(
          'border-border/50 bg-background grid max-w-xs min-w-[10rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl',
          className
        )}
      >
        {!nestLabel ? tooltipLabel : null}
        <div className='grid gap-1.5'>
          {payload
            .filter((item) => item.type !== 'none')
            .map((item, index) => {
              const lookupKey = configLookupKeyFromPayloadItem(item, nameKey);
              const itemConfig = getPayloadConfigFromPayload(
                config,
                item,
                lookupKey
              );
              const indicatorColor = pickTooltipSwatchColor(
                item,
                config,
                color
              );

              let valueNode: React.ReactNode = null;
              if (
                formatter &&
                item.value !== undefined &&
                item.name !== undefined
              ) {
                const fmt = formatter as unknown as (
                  value: unknown,
                  name: unknown,
                  item: ChartPayloadItem,
                  index: number,
                  payload: ChartPayloadItem[] | undefined
                ) => React.ReactNode | [React.ReactNode, React.ReactNode];
                const out = fmt(
                  item.value as unknown,
                  item.name as unknown,
                  item,
                  index,
                  payload
                );
                if (out != null) {
                  valueNode = Array.isArray(out) ? out[0] : out;
                }
              } else if (item.value !== undefined && item.value !== null) {
                valueNode =
                  typeof item.value === 'number'
                    ? item.value.toLocaleString()
                    : String(item.value);
              }

              const rawLabel =
                itemConfig?.label !== undefined ? itemConfig.label : item.name;
              const labelText: React.ReactNode =
                rawLabel === '' || rawLabel === '\u200b' || rawLabel == null
                  ? null
                  : (rawLabel as React.ReactNode);

              return (
                <div
                  key={`${String(item.dataKey ?? '')}-${index}`}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 leading-none',
                    nestLabel ? 'items-stretch' : ''
                  )}
                >
                  <div className='flex min-w-0 flex-1 items-center gap-2'>
                    {!hideIndicator && (
                      <div
                        className={cn('box-border shrink-0 rounded-[2px]', {
                          'h-2.5 w-2.5 border border-solid':
                            indicator === 'dot',
                          'h-0.5 w-2.5': indicator === 'line',
                          'h-2.5 w-0 border-[1.5px] border-y-0 border-dashed border-solid bg-transparent':
                            indicator === 'dashed'
                        })}
                        style={
                          indicator === 'line'
                            ? { backgroundColor: indicatorColor }
                            : indicator === 'dashed'
                              ? {
                                  borderColor: indicatorColor,
                                  backgroundColor: 'transparent'
                                }
                              : {
                                  backgroundColor: indicatorColor,
                                  borderColor: indicatorColor
                                }
                        }
                      />
                    )}
                    <div
                      className={cn(
                        'grid min-w-0 flex-1 gap-1',
                        nestLabel ? 'text-left' : ''
                      )}
                    >
                      {nestLabel ? tooltipLabel : null}
                      {labelText != null ? (
                        <span className='text-muted-foreground truncate'>
                          {labelText}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {valueNode != null && (
                    <span className='text-foreground shrink-0 font-mono text-[0.8125rem] font-medium tabular-nums'>
                      {valueNode}
                    </span>
                  )}
                </div>
              );
            })}
        </div>
        {footerNode ? (
          <div className='border-border/50 mt-1 border-t pt-1.5'>
            {footerNode}
          </div>
        ) : null}
      </div>
    );
  }
);
ChartTooltipContent.displayName = 'ChartTooltipContent';

/** Prefer `dataKey` for ChartConfig lookup — Recharts `name` is often a localized legend label. */
function configLookupKeyFromPayloadItem(
  item: { dataKey?: unknown; name?: unknown },
  nameKey?: string
): string {
  const dk = item.dataKey;
  if (
    (typeof dk === 'string' || typeof dk === 'number') &&
    dk !== '' &&
    dk !== null
  ) {
    return String(dk);
  }
  if (nameKey) return nameKey;
  if (item.name !== undefined && item.name !== null && item.name !== '') {
    return String(item.name);
  }
  return 'value';
}

function resolveChartConfigColor(
  config: ChartConfig,
  dataKey: string | number | undefined
): string | undefined {
  if (dataKey === undefined || dataKey === null || dataKey === '') {
    return undefined;
  }
  const entry = config[String(dataKey)];
  if (!entry) return undefined;
  if ('color' in entry && entry.color) {
    return entry.color;
  }
  return undefined;
}

/** Area/gradients use `fill: url(#…)` — invalid on HTML; fall back to stroke or ChartConfig. */
function isRenderableCssColor(value: string): boolean {
  const v = value.trim();
  if (!v || v === 'none' || v === 'transparent') return false;
  if (v.toLowerCase().startsWith('url(')) return false;
  return true;
}

function pickTooltipSwatchColor(
  item: ChartPayloadItem,
  config: ChartConfig,
  override?: string
): string {
  const dataKeyForConfig =
    typeof item.dataKey === 'string' || typeof item.dataKey === 'number'
      ? item.dataKey
      : undefined;
  const fromConfig = resolveChartConfigColor(config, dataKeyForConfig);
  const candidates: Array<string | undefined> = [
    override,
    typeof item.color === 'string' ? item.color : undefined,
    typeof item.fill === 'string' ? item.fill : undefined,
    typeof item.stroke === 'string' ? item.stroke : undefined,
    fromConfig
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && isRenderableCssColor(c)) {
      return c;
    }
  }

  return 'var(--muted-foreground)';
}

function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string
) {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }

  const p = payload as Record<string, unknown>;
  const payloadPayload =
    'payload' in p && typeof p.payload === 'object' && p.payload !== null
      ? (p.payload as Record<string, unknown>)
      : undefined;

  let configLabelKey = key;

  if (key in p && typeof p[key] === 'string') {
    configLabelKey = p[key] as string;
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key] === 'string'
  ) {
    configLabelKey = payloadPayload[key] as string;
  }

  return configLabelKey in config
    ? config[configLabelKey]
    : config[key as keyof typeof config];
}

const ChartLegend = RechartsPrimitive.Legend;

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    /** Passed by Recharts when this component is used as <Legend content={...} /> (not on Legend props in v3). */
    payload?: readonly ChartPayloadItem[];
    verticalAlign?: 'top' | 'bottom' | 'middle';
    hideIcon?: boolean;
    nameKey?: string;
  }
>(
  (
    { className, hideIcon = false, payload, verticalAlign = 'bottom', nameKey },
    ref
  ) => {
    const { config } = useChart();

    if (!payload?.length) {
      return null;
    }

    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-wrap items-center justify-center gap-4',
          verticalAlign === 'top' ? 'pb-3' : 'pt-3',
          className
        )}
      >
        {payload
          .filter((item) => item.type !== 'none')
          .map((item, index) => {
            const key = configLookupKeyFromPayloadItem(item, nameKey);
            const itemConfig = getPayloadConfigFromPayload(config, item, key);
            const row = item as ChartPayloadItem;
            const legendKey = `${String(row.dataKey ?? 'series')}-${index}`;

            return (
              <div
                key={legendKey}
                className='[&>svg]:text-muted-foreground flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3'
              >
                {itemConfig?.icon && !hideIcon ? (
                  <itemConfig.icon />
                ) : (
                  <div
                    className='h-2 w-2 shrink-0 rounded-[2px]'
                    style={{ backgroundColor: item.color }}
                  />
                )}
                {itemConfig?.label}
              </div>
            );
          })}
      </div>
    );
  }
);
ChartLegendContent.displayName = 'ChartLegendContent';

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle
};
