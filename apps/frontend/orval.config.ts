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

/** Server-side Orval client: direct backend URL + no auth (public endpoints). */
const publicBackendFetchOutput = {
  mode: 'single' as const,
  client: 'fetch' as const,
  httpClient: 'fetch' as const,
  baseUrl: '',
  override: {
    mutator: {
      path: './lib/public-backend-orval-mutator.ts',
      name: 'publicBackendOrvalMutator'
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
  quokkaqPublicSubscriptions: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['subscriptions']
      }
    },
    output: {
      ...publicBackendFetchOutput,
      target: './lib/api/generated/public-subscriptions.ts'
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
  quokkaqStatistics: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['statistics', 'operations']
      }
    },
    output: {
      ...reactQueryOutput,
      target: './lib/api/generated/statistics.ts'
    }
  },
  quokkaqGuestSurveyTerminal: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['guest-survey', 'counter-board']
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
  },
  quokkaqServices: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['services']
      }
    },
    output: {
      ...reactQueryOutput,
      target: './lib/api/generated/services.ts'
    }
  },
  quokkaqShift: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['shift']
      }
    },
    output: {
      ...reactQueryOutput,
      target: './lib/api/generated/shift.ts'
    }
  },
  quokkaqAuth: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['auth', 'companies']
      }
    },
    output: {
      ...reactQueryOutput,
      target: './lib/api/generated/auth.ts'
    }
  },
  quokkaqCalendarIntegration: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['calendar-integration']
      }
    },
    output: {
      ...reactQueryOutput,
      target: './lib/api/generated/calendar-integration.ts'
    }
  },
  quokkaqPreRegistrations: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['pre-registrations']
      }
    },
    output: {
      ...reactQueryOutput,
      target: './lib/api/generated/pre-registrations.ts'
    }
  },
  quokkaqSupport: {
    input: {
      target: '../backend/docs/swagger.json',
      filters: {
        mode: 'include',
        tags: ['support']
      }
    },
    output: {
      ...reactQueryOutput,
      target: './lib/api/generated/support.ts'
    }
  }
});
