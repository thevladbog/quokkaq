import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VisitorPhotoFrame } from './VisitorPhotoFrame';

const baseProps = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  ariaLabel: 'Visitor portrait'
};

afterEach(cleanup);

describe('VisitorPhotoFrame', () => {
  it('shows initials for an identified visitor without a photo', () => {
    render(<VisitorPhotoFrame {...baseProps} />);

    expect(screen.getByText('AL')).toBeVisible();
  });

  it('shows the User icon for an anonymous visitor', () => {
    render(<VisitorPhotoFrame {...baseProps} isAnonymous />);

    expect(document.querySelector('.lucide-user')).toBeVisible();
    expect(screen.queryByText('?')).not.toBeInTheDocument();
  });

  it('shows the Headphones icon while idle', () => {
    render(<VisitorPhotoFrame {...baseProps} variant='idle' />);

    expect(document.querySelector('.lucide-headphones')).toBeVisible();
  });

  it('keeps a valid photo decorative, cropped, and at the md dimensions', () => {
    const { container } = render(
      <VisitorPhotoFrame
        {...baseProps}
        photoUrl='https://example.com/ada.jpg'
      />
    );

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveClass('object-cover');
    expect(image.parentElement).toHaveClass(
      'h-[7.25rem]',
      'w-[5.5rem]',
      'sm:h-[8rem]',
      'sm:w-[6rem]'
    );
  });

  it('falls back to initials when the photo fails to load', () => {
    const { container } = render(
      <VisitorPhotoFrame
        {...baseProps}
        photoUrl='https://example.com/ada.jpg'
      />
    );

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    fireEvent.error(image!);

    expect(screen.getByText('AL')).toBeVisible();
  });

  it('uses a neutral unrotated frame at the preserved sm and md sizes', () => {
    const { rerender } = render(<VisitorPhotoFrame {...baseProps} size='sm' />);
    const smFrame = screen.getByTestId('visitor-photo-frame');

    expect(smFrame).toHaveClass(
      'border',
      'border-border/70',
      'bg-muted/40',
      'rounded-xl',
      'p-px'
    );
    expect(smFrame.className).not.toMatch(
      /(?:rotate|gradient|violet|fuchsia|amber|shadow)/
    );
    expect(smFrame).not.toHaveAttribute('style');

    rerender(<VisitorPhotoFrame {...baseProps} size='md' />);
    const mdFrame = screen.getByTestId('visitor-photo-frame');
    expect(mdFrame).toHaveClass('rounded-2xl', 'p-[2px]');
    expect(mdFrame.className).not.toMatch(
      /(?:rotate|gradient|violet|fuchsia|amber|shadow)/
    );
    expect(mdFrame).not.toHaveAttribute('style');
  });
});
