'use client';

import { cn } from '../../lib/cn';
import { buttonVariants } from '../ui/button';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import {
  type SyntheticEvent,
  useEffect,
  useEffectEvent,
  useState,
  useTransition,
  startTransition
} from 'react';
import { Collapsible, CollapsibleContent } from '../ui/collapsible';
import { cva } from 'class-variance-authority';
import {
  actionResponse,
  pageFeedback,
  type ActionResponse,
  type PageFeedback
} from './schema';
import { z } from 'zod/mini';
import { usePathname } from 'fumadocs-core/framework';

const rateButtonVariants = cva(
  'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed [&_svg]:size-4',
  {
    variants: {
      active: {
        true: 'bg-fd-accent text-fd-accent-foreground [&_svg]:fill-current',
        false: 'text-fd-muted-foreground'
      }
    }
  }
);

const pageFeedbackResult = z.extend(pageFeedback, {
  response: actionResponse
});

export type PageFeedbackLabels = {
  title: string;
  good: string;
  bad: string;
  thanks: string;
  viewOnGithub: string;
  submitAgain: string;
  placeholder: string;
  submit: string;
};

const defaultEn: PageFeedbackLabels = {
  title: 'How is this page?',
  good: 'Helpful',
  bad: 'Not helpful',
  thanks: 'Thanks for the feedback!',
  viewOnGithub: 'View on GitHub',
  submitAgain: 'Submit again',
  placeholder: 'What could we improve?',
  submit: 'Submit'
};

const defaultRu: PageFeedbackLabels = {
  title: 'Насколько полезна эта страница?',
  good: 'Полезно',
  bad: 'Мало пользы',
  thanks: 'Спасибо за отклик!',
  viewOnGithub: 'На GitHub',
  submitAgain: 'Отправить снова',
  placeholder: 'Что стоит улучшить?',
  submit: 'Отправить'
};

/**
 * End-of-page feedback; see https://www.fumadocs.dev/docs/integrations/feedback
 */
export function Feedback({
  onSendAction,
  locale
}: {
  onSendAction: (feedback: PageFeedback) => Promise<ActionResponse>;
  /** `en` | `ru` — default copy; defaults to `en` */
  locale: string;
}) {
  const copy = locale === 'ru' ? defaultRu : defaultEn;
  const url = usePathname();
  const { previous, setPrevious } = useSubmissionStorage(url, (v) => {
    const result = pageFeedbackResult.safeParse(v);
    return result.success ? result.data : null;
  });
  const [opinion, setOpinion] = useState<'good' | 'bad' | null>(null);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function submit(e?: SyntheticEvent) {
    if (opinion == null) return;

    startTransition(async () => {
      const feedback: PageFeedback = {
        url: url ?? '',
        opinion,
        message
      };

      const response = await onSendAction(feedback);
      setPrevious({
        response,
        ...feedback
      });
      setMessage('');
      setOpinion(null);
    });

    e?.preventDefault();
  }

  const activeOpinion = previous?.opinion ?? opinion;
  const githubUrl = previous?.response?.githubUrl;

  return (
    <Collapsible
      open={opinion !== null || previous !== null}
      onOpenChange={(v) => {
        if (!v) setOpinion(null);
      }}
      className='border-fd-border border-y py-3'
    >
      <div className='flex flex-row flex-wrap items-center gap-2'>
        <p className='pe-2 text-sm font-medium'>{copy.title}</p>
        <button
          disabled={previous !== null}
          className={cn(
            rateButtonVariants({
              active: activeOpinion === 'good'
            })
          )}
          type='button'
          onClick={() => {
            setOpinion('good');
          }}
        >
          <ThumbsUp />
          {copy.good}
        </button>
        <button
          disabled={previous !== null}
          className={cn(
            rateButtonVariants({
              active: activeOpinion === 'bad'
            })
          )}
          type='button'
          onClick={() => {
            setOpinion('bad');
          }}
        >
          <ThumbsDown />
          {copy.bad}
        </button>
      </div>
      <CollapsibleContent className='mt-3'>
        {previous ? (
          <div className='bg-fd-card text-fd-muted-foreground flex flex-col items-center gap-3 rounded-xl px-3 py-6 text-center text-sm'>
            <p>{copy.thanks}</p>
            <div className='flex flex-row flex-wrap items-center justify-center gap-2'>
              {githubUrl ? (
                <a
                  className={cn(
                    buttonVariants({ color: 'primary' }),
                    'text-xs'
                  )}
                  href={githubUrl}
                  rel='noreferrer noopener'
                  target='_blank'
                >
                  {copy.viewOnGithub}
                </a>
              ) : null}
              <button
                className={cn(
                  buttonVariants({ color: 'secondary' }),
                  'text-xs'
                )}
                type='button'
                onClick={() => {
                  setOpinion(previous.opinion);
                  setPrevious(null);
                }}
              >
                {copy.submitAgain}
              </button>
            </div>
          </div>
        ) : (
          <form
            className='flex flex-col gap-3'
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <textarea
              required
              autoFocus
              className='bg-fd-secondary text-fd-secondary-foreground border-fd-border focus-visible:ring-fd-ring placeholder:text-fd-muted-foreground rounded-lg border p-3 focus-visible:ring-2 focus-visible:outline-none'
              placeholder={copy.placeholder}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (!e.shiftKey && e.key === 'Enter') {
                  void submit(e);
                }
              }}
            />
            <button
              className={cn(buttonVariants({ color: 'outline' }), 'w-fit px-3')}
              disabled={isPending}
              type='submit'
            >
              {copy.submit}
            </button>
          </form>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function useSubmissionStorage<Result>(
  blockId: string,
  validate: (v: unknown) => Result | null
) {
  const storageKey = `docs-feedback-${blockId}`;
  const [value, setValue] = useState<Result | null>(null);
  const validateCallback = useEffectEvent(validate);

  useEffect(() => {
    const item = localStorage.getItem(storageKey);
    if (item === null) return;
    const validated = validateCallback(JSON.parse(item));

    if (validated !== null) {
      startTransition(() => {
        setValue(validated);
      });
    }
  }, [storageKey]);

  return {
    previous: value,
    setPrevious(result: Result | null) {
      if (result) localStorage.setItem(storageKey, JSON.stringify(result));
      else localStorage.removeItem(storageKey);

      setValue(result);
    }
  };
}
