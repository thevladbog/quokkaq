import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';

import { isAppLocale, messages } from '@/src/messages';

export const size = { width: 1200, height: 630 };

export const contentType = 'image/png';

/** Keep OG text within a safe length for image layout and social previews. */
function clampOgText(text: string, maxChars: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= maxChars) {
    return t;
  }
  const cut = t.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

export default async function Image({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }

  const t = messages[raw].home;
  const ogDescription = clampOgText(t.description, 200);
  const brand = raw === 'ru' ? 'КвоккаКю' : 'QuokkaQ';
  const tagline =
    raw === 'ru'
      ? 'Управление очередями для сетей и филиалов'
      : 'Queue management for multi-branch teams';

  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        background:
          'linear-gradient(135deg, #fff8f3 0%, #fff0e8 42%, #fafafa 100%)',
        padding: 64
      }}
    >
      <div
        style={{
          fontSize: 52,
          fontWeight: 800,
          color: '#171717',
          lineHeight: 1.12,
          maxWidth: 920,
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}
      >
        <span>{t.titleBefore}</span>
        <span style={{ color: '#ff6b35' }}>{t.titleAccent}</span>
      </div>
      <div
        style={{
          marginTop: 28,
          fontSize: 24,
          color: '#525252',
          maxWidth: 900,
          lineHeight: 1.45
        }}
      >
        {ogDescription}
      </div>
      <div
        style={{
          marginTop: 36,
          fontSize: 20,
          fontWeight: 600,
          color: '#404040',
          letterSpacing: '-0.01em'
        }}
      >
        {tagline}
      </div>
      <div
        style={{
          marginTop: 20,
          fontSize: 22,
          fontWeight: 700,
          color: '#0a0a0a',
          letterSpacing: '-0.02em'
        }}
      >
        {brand}
      </div>
    </div>,
    {
      ...size
    }
  );
}
