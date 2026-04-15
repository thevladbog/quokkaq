'use client';

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Extra strings cmdk uses for filtering (e.g. company name + id). */
  keywords?: string[];
  disabled?: boolean;
  /** CSS color for a small swatch (e.g. chart segment color). */
  swatchColor?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  /** When false, selecting the current option again does not clear the value. */
  allowClear?: boolean;
  /** Popover alignment relative to the trigger (e.g. end for header-right controls). */
  popoverAlign?: 'center' | 'start' | 'end';
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  searchPlaceholder = 'Search...',
  emptyText = 'No option found.',
  className,
  disabled = false,
  id,
  allowClear = true,
  popoverAlign = 'start'
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selected = value
    ? options.find((option) => option.value === value)
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant='outline'
          role='combobox'
          aria-expanded={open}
          className={cn(
            'border-input w-full justify-between font-normal',
            className
          )}
          disabled={disabled}
        >
          <span className='flex min-w-0 flex-1 items-center gap-2 text-left'>
            {selected ? (
              <>
                {selected.swatchColor ? (
                  <span
                    className='inline-block size-2.5 shrink-0 rounded-sm'
                    style={{ backgroundColor: selected.swatchColor }}
                  />
                ) : null}
                <span className='truncate'>{selected.label}</span>
              </>
            ) : (
              <span className='text-muted-foreground'>{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className='w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-2rem,360px)] min-w-[220px] p-0'
        align={popoverAlign}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={option.keywords}
                  disabled={option.disabled}
                  onSelect={() => {
                    if (option.disabled) return;
                    if (allowClear && option.value === value) {
                      onChange('');
                    } else {
                      onChange(option.value);
                    }
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      value === option.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {option.swatchColor ? (
                    <span
                      className='mr-2 inline-block size-2.5 shrink-0 rounded-sm'
                      style={{ backgroundColor: option.swatchColor }}
                    />
                  ) : null}
                  <span className='truncate'>{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
