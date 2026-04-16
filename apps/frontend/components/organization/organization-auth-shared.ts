import { z } from 'zod';
import type {
  ServicesCompanySSOGetResponse,
  ServicesCompanySSOPatch
} from '@/lib/api/generated/auth';

/** Matches backend `API_PUBLIC_URL` when provided by GET /companies/me. */
export function resolvePublicApiBase(serverUrl?: string | null): string {
  const trimmed = serverUrl?.trim();
  if (trimmed) {
    return trimmed.replace(/\/$/, '');
  }
  const u = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
  return u && u.length > 0 ? u : 'http://localhost:3001';
}

/** Matches backend `PUBLIC_APP_URL` / `APP_BASE_URL` when provided by GET /companies/me. */
export function resolvePublicAppBase(serverUrl?: string | null): string {
  const trimmed = serverUrl?.trim();
  if (trimmed) {
    return trimmed.replace(/\/$/, '');
  }
  const u = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  return u && u.length > 0 ? u : 'http://localhost:3000';
}

export const RESERVED_TENANT_SLUGS = new Set([
  'www',
  'api',
  'admin',
  'login',
  'auth',
  'static',
  'health',
  'swagger',
  'docs',
  'ws',
  'system',
  'en',
  'ru',
  't'
]);

/** Mirrors `tenantslug.Normalize` for client-side validation. */
export function normalizeTenantSlug(raw: string): string {
  const s = raw.trim().toLowerCase();
  let out = '';
  let prevDash = false;
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
      out += ch;
      prevDash = false;
    } else if (ch === ' ' || ch === '-' || ch === '_') {
      if (out.length > 0 && !prevDash) {
        out += '-';
        prevDash = true;
      }
    }
  }
  out = out.replace(/^-+|-+$/g, '');
  while (out.includes('--')) {
    out = out.replace(/--/g, '-');
  }
  return out;
}

export function isValidHttpUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseEmailDomains(emailDomainsStr: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emailDomainsStr.split(/[,;\s]+/)) {
    const x = raw.trim().toLowerCase();
    if (!x || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

const slugPartRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const slugFormSchema = z.object({
  slug: z.string().superRefine((val, ctx) => {
    const n = normalizeTenantSlug(val);
    if (n.length < 3 || n.length > 63) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'slug length must be between 3 and 63'
      });
      return;
    }
    if (!slugPartRe.test(n)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'invalid slug format'
      });
      return;
    }
    if (RESERVED_TENANT_SLUGS.has(n)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'slug is reserved'
      });
    }
  })
});

export type SlugFormValues = z.infer<typeof slugFormSchema>;

export type SsoSchemaOpts = {
  hasPersistedSlug: boolean;
  invalidUrl: string;
  samlNeedsSlug: string;
};

export function createSsoFormSchema(opts: SsoSchemaOpts) {
  return z
    .object({
      enabled: z.boolean(),
      protocol: z.enum(['oidc', 'saml']),
      issuerUrl: z.string(),
      clientId: z.string(),
      clientSecret: z.string(),
      scopes: z.string(),
      samlIdpMetadataUrl: z.string(),
      emailDomainsStr: z.string()
    })
    .superRefine((data, ctx) => {
      if (data.protocol === 'saml' && !opts.hasPersistedSlug) {
        ctx.addIssue({
          code: 'custom',
          message: opts.samlNeedsSlug,
          path: ['protocol']
        });
      }
      if (data.protocol === 'oidc') {
        const issuer = data.issuerUrl.trim();
        if (issuer && !isValidHttpUrl(issuer)) {
          ctx.addIssue({
            code: 'custom',
            message: opts.invalidUrl,
            path: ['issuerUrl']
          });
        }
      }
      if (data.protocol === 'saml') {
        const meta = data.samlIdpMetadataUrl.trim();
        if (meta && !isValidHttpUrl(meta)) {
          ctx.addIssue({
            code: 'custom',
            message: opts.invalidUrl,
            path: ['samlIdpMetadataUrl']
          });
        }
      }
    });
}

export type SsoFormValues = z.infer<ReturnType<typeof createSsoFormSchema>>;

export function ssoDefaultsFromServer(
  sso: ServicesCompanySSOGetResponse
): SsoFormValues {
  return {
    enabled: !!sso.enabled,
    protocol: sso.ssoProtocol === 'saml' ? 'saml' : 'oidc',
    issuerUrl: sso.issuerUrl ?? '',
    clientId: sso.clientId ?? '',
    clientSecret: '',
    scopes: sso.scopes ?? 'openid email profile',
    samlIdpMetadataUrl: sso.samlIdpMetadataUrl ?? '',
    emailDomainsStr: (sso.emailDomains ?? []).join(', ')
  };
}

export function ssoServerFingerprint(
  sso: ServicesCompanySSOGetResponse
): string {
  return JSON.stringify({
    enabled: sso.enabled,
    ssoProtocol: sso.ssoProtocol,
    issuerUrl: sso.issuerUrl ?? '',
    clientId: sso.clientId ?? '',
    samlIdpMetadataUrl: sso.samlIdpMetadataUrl ?? '',
    scopes: sso.scopes ?? '',
    emailDomains: sso.emailDomains ?? [],
    clientSecretSet: sso.clientSecretSet
  });
}

export function buildSsoPatchBody(
  values: SsoFormValues
): ServicesCompanySSOPatch {
  const domains = parseEmailDomains(values.emailDomainsStr);
  const body: ServicesCompanySSOPatch = {
    enabled: values.enabled,
    ssoProtocol: values.protocol,
    emailDomains: domains.length > 0 ? domains : undefined
  };
  if (values.protocol === 'oidc') {
    body.issuerUrl = values.issuerUrl.trim() || undefined;
    body.clientId = values.clientId.trim() || undefined;
    body.scopes = values.scopes.trim() || undefined;
    if (values.clientSecret.trim() !== '') {
      body.clientSecret = values.clientSecret.trim();
    }
  } else {
    body.samlIdpMetadataUrl = values.samlIdpMetadataUrl.trim() || undefined;
  }
  return body;
}
