import { defineConfig } from 'orval';

export default defineConfig({
  quokkaqPlatform: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['platform']
      }
    },
    output: {
      mode: 'single',
      target: './lib/api/generated/platform.ts',
      client: 'react-query',
      httpClient: 'fetch',
      baseUrl: '',
      override: {
        mutator: {
          path: './lib/orval-mutator.ts',
          name: 'orvalMutator'
        },
        query: {
          useQuery: true,
          useMutation: true,
          signal: true,
          version: 5
        }
      }
    }
  }
});
