import { defineConfig } from 'orval';

const marketingPublicFetchOutput = {
  mode: 'single' as const,
  client: 'fetch' as const,
  httpClient: 'fetch' as const,
  baseUrl: '',
  override: {
    mutator: {
      path: './lib/marketing-orval-mutator.ts',
      name: 'marketingOrvalMutator'
    }
  }
};

export default defineConfig({
  quokkaqMarketingSubscriptions: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['subscriptions']
      }
    },
    output: {
      ...marketingPublicFetchOutput,
      target: './lib/api/generated/subscriptions.ts'
    }
  }
});
