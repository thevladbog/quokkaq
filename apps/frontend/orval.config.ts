import { defineConfig } from 'orval';

const reactQueryOutput = {
  mode: 'single' as const,
  client: 'react-query' as const,
  httpClient: 'fetch' as const,
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
      version: 5 as const
    }
  }
};

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
      ...reactQueryOutput,
      target: './lib/api/generated/platform.ts'
    }
  },
  quokkaqTicketsCounters: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['tickets', 'counters']
      }
    },
    output: {
      ...reactQueryOutput,
      target: './lib/api/generated/tickets-counters.ts'
    }
  },
  quokkaqUnits: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['units']
      }
    },
    output: {
      ...reactQueryOutput,
      target: './lib/api/generated/units.ts'
    }
  },
  quokkaqTenantBilling: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['invoices', 'subscriptions']
      }
    },
    output: {
      ...reactQueryOutput,
      target: './lib/api/generated/tenant-billing.ts'
    }
  },
  quokkaqUpload: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['upload']
      }
    },
    output: {
      ...reactQueryOutput,
      target: './lib/api/generated/upload.ts'
    }
  },
  quokkaqSurveys: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['surveys']
      }
    },
    output: {
      ...reactQueryOutput,
      target: './lib/api/generated/surveys.ts'
    }
  },
  quokkaqGuestSurveyTerminal: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['guest-survey']
      }
    },
    output: {
      ...reactQueryOutput,
      target: './lib/api/generated/guest-survey-terminal.ts',
      override: {
        ...reactQueryOutput.override,
        mutator: {
          path: './lib/terminal-orval-mutator.ts',
          name: 'terminalOrvalMutator'
        }
      }
    }
  }
});
