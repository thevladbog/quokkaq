'use client';

import { cn } from '@/lib/cn';
import { buttonVariants } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { useDocBlockFeedbackOptional } from '@/components/feedback/doc-paragraph-provider';
import {
  actionResponse,
  blockFeedback,
  type BlockFeedback
} from '@/components/feedback/schema';
import { Check, MessageCircle } from 'lucide-react';
import { usePathname } from 'fumadocs-core/framework';
import {
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  useEffect,
  useEffectEvent,
  startTransition,
  type ComponentProps
} from 'react';
import { z } from 'zod/mini';

const blockResult = z.extend(blockFeedback, { response: actionResponse });

const copy = {
  en: {
    label: 'Comment on this paragraph',
    placeholder: 'What should we fix or clarify?',
    submit: 'Send',
    thanks: 'Thanks — we read every note.',
    openForm: 'Comment on this paragraph'
  },
  ru: {
    label: 'Комментарий к этому абзацу',
    placeholder: 'Что исправить или уточнить?',
    submit: 'Отправить',
    thanks: 'Спасибо — мы читаем такие отзывы.',
    openForm: 'Комментарий к этому абзацу'
  }
};

type PProps = ComponentProps<'p'>;

function isTriviallyEmpty(content: PProps['children']): boolean {
  if (content == null) return true;
  if (typeof content === 'string' || typeof content === 'number') {
    return String(content).replace(/\s/g, '') === '';
  }
  if (Array.isArray(content)) {
    return content.every(
      (c) => c == null || (typeof c === 'string' && c.replace(/\s/g, '') === '')
    );
  }
  return false;
}

export function DocParagraphWithFeedback({
  className,
  children,
  ...rest
}: PProps) {
  const ctx = useDocBlockFeedbackOptional();
  const pathname = usePathname() ?? '';
  const reactId = useId();
  const blockId = useMemo(
    () => `${pathname}::b${reactId.replaceAll(':', '')}`,
    [pathname, reactId]
  );
  const pRef = useRef<HTMLParagraphElement>(null);
  const storageKey = `docs-block-feedback-${blockId}`;

  const t = !ctx ? copy.en : ctx.locale === 'ru' ? copy.ru : copy.en;

  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [isPending, startT] = useTransition();

  const loadStored = useEffectEvent(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const parsed = blockResult.safeParse(JSON.parse(raw));
    if (parsed.success) startTransition(() => setDone(true));
  });

  useEffect(() => {
    loadStored();
  }, [storageKey]);

  function submit() {
    if (!ctx) return;
    const body = pRef.current?.textContent?.trim() ?? '';
    if (!message.trim() || !body) return;
    const payload: BlockFeedback = {
      url: pathname,
      blockId,
      blockBody: body.length > 2000 ? body.slice(0, 2000) + '…' : body,
      message: message.trim()
    };
    const send = ctx.onBlockFeedback;
    startT(() =>
      (async () => {
        const response = await send(payload);
        const toStore = { ...payload, response };
        localStorage.setItem(storageKey, JSON.stringify(toStore));
        setDone(true);
        setMessage('');
        setOpen(false);
      })()
    );
  }

  if (!ctx) {
    return (
      <p className={className} ref={pRef} {...rest}>
        {children}
      </p>
    );
  }

  if (isTriviallyEmpty(children)) {
    return (
      <p className={className} ref={pRef} {...rest}>
        {children}
      </p>
    );
  }

  if (done) {
    return (
      <div className='data-doc-para-wrap not-prose [break-inside:avoid] last:mb-0'>
        <p className={cn('relative m-0', className)} ref={pRef} {...rest}>
          {children}
          <span
            className='text-fd-muted-foreground/80 not-prose absolute end-0.5 top-0.5'
            title={t.thanks}
          >
            <Check
              className='text-fd-primary size-3.5'
              strokeWidth={2.5}
              aria-label={t.thanks}
              role='img'
            />
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className='data-doc-para-wrap not-prose group/para relative [break-inside:avoid] last:mb-0'>
      <p
        className={cn('relative m-0 pe-0 sm:pe-5', className)}
        ref={pRef}
        {...rest}
      >
        {children}
      </p>
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <button
            type='button'
            className={cn(
              'text-fd-muted-foreground not-prose hover:text-fd-primary',
              'absolute start-auto -end-0.5 top-0.5 rounded p-0.5',
              'opacity-40 transition-[opacity,colors] sm:top-1',
              'sm:opacity-0 sm:group-hover/para:opacity-100',
              'data-[state=open]:text-fd-primary data-[state=open]:opacity-100',
              'focus-visible:ring-fd-ring sm:focus-visible:ring-1'
            )}
            aria-label={t.openForm}
            title={t.openForm}
          >
            <MessageCircle className='size-3.5' strokeWidth={2.25} />
          </button>
        </PopoverTrigger>
        <PopoverContent align='end' className='space-y-2.5 p-3'>
          <p className='text-fd-foreground text-sm font-medium'>{t.label}</p>
          <textarea
            className='bg-fd-secondary text-fd-secondary-foreground border-fd-border focus-visible:ring-fd-ring placeholder:text-fd-muted-foreground min-h-[4.5rem] w-full resize-y rounded-md border p-2 text-sm focus-visible:ring-2 focus-visible:outline-none'
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t.placeholder}
          />
          <button
            className={cn(
              buttonVariants({ color: 'primary' }),
              'w-full text-sm'
            )}
            type='button'
            disabled={isPending || !message.trim()}
            onClick={() => void submit()}
          >
            {t.submit}
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
