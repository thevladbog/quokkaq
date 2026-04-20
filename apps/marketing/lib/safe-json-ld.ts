/** JSON-LD in <script> tags: escape `<` so payloads cannot break out of the script element. */
export function safeJsonLdStringify(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
