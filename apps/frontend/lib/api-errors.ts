/**
 * Non-OK HTTP response. `message` is a short user-facing summary (never the raw response body).
 * Full body is in `rawBody` when provided (for logging / debugging only).
 */
export class ApiHttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly rawBody?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
    rawBody?: string
  ) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.code = code;
    this.rawBody = rawBody;
  }
}

export function throwApiHttpErrorFromBody(
  status: number,
  errorData: string
): never {
  let parsedCode: string | undefined;
  try {
    const j = JSON.parse(errorData) as Record<string, unknown>;
    parsedCode = typeof j.code === 'string' ? j.code : undefined;
    const msg = typeof j.message === 'string' ? j.message.trim() : '';
    if (msg) {
      throw new ApiHttpError(msg, status, parsedCode, errorData);
    }
  } catch (e) {
    if (e instanceof ApiHttpError) {
      throw e;
    }
  }
  const summary = parsedCode
    ? `API Error: ${status} (${parsedCode})`
    : `API Error: ${status}`;
  throw new ApiHttpError(summary, status, parsedCode, errorData);
}
