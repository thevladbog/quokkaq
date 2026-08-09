import type {
  ConditionContext,
  ConditionField,
  ConditionNode,
  ConditionRule
} from '@quokkaq/shared-types';

export type ConditionDiagnosticCode = 'missing-value' | 'type-mismatch';

export type ConditionDiagnostic = {
  code: ConditionDiagnosticCode;
  field: ConditionField;
};

export type ConditionEvaluationResult = {
  matches: boolean;
  diagnostics: ConditionDiagnostic[];
};

type FieldResolver = {
  get: (context: ConditionContext) => unknown;
};

const fieldResolvers: Record<ConditionField, FieldResolver> = {
  'identity.isAuthenticated': {
    get: (context) => context.identity?.isAuthenticated
  },
  'identity.isEmployee': {
    get: (context) => context.identity?.isEmployee
  },
  'identity.groups': {
    get: (context) => context.identity?.groups
  },
  'live.queueLength': {
    get: (context) => context.live?.queueLength
  },
  'live.isOpen': {
    get: (context) => context.live?.isOpen
  },
  'live.isConnected': {
    get: (context) => context.live?.isConnected
  },
  'session.selectedServiceId': {
    get: (context) => context.session?.selectedServiceId
  }
};

function typeMismatch(field: ConditionField): ConditionEvaluationResult {
  return {
    matches: false,
    diagnostics: [{ code: 'type-mismatch', field }]
  };
}

function evaluateRule(
  rule: ConditionRule,
  context: ConditionContext
): ConditionEvaluationResult {
  const resolver = fieldResolvers[rule.field];
  const value = resolver.get(context);

  if (value === undefined || value === null) {
    return {
      matches: false,
      diagnostics: [{ code: 'missing-value', field: rule.field }]
    };
  }

  switch (rule.field) {
    case 'identity.isAuthenticated':
    case 'identity.isEmployee':
    case 'live.isOpen':
    case 'live.isConnected':
      if (typeof value !== 'boolean') return typeMismatch(rule.field);
      return {
        matches: rule.operator === 'is-true' ? value : !value,
        diagnostics: []
      };
    case 'identity.groups':
      if (
        !Array.isArray(value) ||
        value.some((item) => typeof item !== 'string')
      ) {
        return typeMismatch(rule.field);
      }
      return {
        matches:
          rule.operator === 'contains'
            ? value.includes(rule.value)
            : !value.includes(rule.value),
        diagnostics: []
      };
    case 'live.queueLength':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return typeMismatch(rule.field);
      }
      return {
        matches: compareNumbers(value, rule.operator, rule.value),
        diagnostics: []
      };
    case 'session.selectedServiceId':
      if (typeof value !== 'string') return typeMismatch(rule.field);
      return {
        matches:
          rule.operator === 'eq' ? value === rule.value : value !== rule.value,
        diagnostics: []
      };
  }
}

function compareNumbers(
  value: number,
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte',
  expected: number
) {
  switch (operator) {
    case 'eq':
      return value === expected;
    case 'ne':
      return value !== expected;
    case 'gt':
      return value > expected;
    case 'gte':
      return value >= expected;
    case 'lt':
      return value < expected;
    case 'lte':
      return value <= expected;
  }
}

export function evaluateConditionResult(
  node: ConditionNode,
  context: ConditionContext
): ConditionEvaluationResult {
  if (node.kind === 'rule') {
    return evaluateRule(node, context);
  }

  const children = node.children.map((child) =>
    evaluateConditionResult(child, context)
  );

  return {
    matches:
      node.combinator === 'and'
        ? children.every((child) => child.matches)
        : children.some((child) => child.matches),
    diagnostics: children.flatMap((child) => child.diagnostics)
  };
}

export function evaluateCondition(
  node: ConditionNode,
  context: ConditionContext
) {
  return evaluateConditionResult(node, context).matches;
}

type ConditionSummaryLocale = 'en' | 'ru';

const conditionSummaryLabels = {
  en: {
    fields: {
      'identity.isAuthenticated': 'Authenticated',
      'identity.isEmployee': 'Employee',
      'identity.groups': 'group',
      'live.queueLength': 'Queue length',
      'live.isOpen': 'Open',
      'live.isConnected': 'Connected',
      'session.selectedServiceId': 'Selected service'
    },
    and: 'and',
    or: 'or',
    isFalse: 'Not {field}',
    eq: '{field} equals {value}',
    ne: '{field} does not equal {value}',
    gt: '{field} is greater than {value}',
    gte: '{field} is at least {value}',
    lt: '{field} is less than {value}',
    lte: '{field} is at most {value}',
    contains: '{field} contains {value}',
    notContains: '{field} does not contain {value}'
  },
  ru: {
    fields: {
      'identity.isAuthenticated': 'Авторизован',
      'identity.isEmployee': 'Сотрудник',
      'identity.groups': 'группа',
      'live.queueLength': 'Длина очереди',
      'live.isOpen': 'Открыто',
      'live.isConnected': 'Подключено',
      'session.selectedServiceId': 'Выбранная услуга'
    },
    and: 'и',
    or: 'или',
    isFalse: 'Не {field}',
    eq: '{field} равно {value}',
    ne: '{field} не равно {value}',
    gt: '{field} больше {value}',
    gte: '{field} не меньше {value}',
    lt: '{field} меньше {value}',
    lte: '{field} не больше {value}',
    contains: '{field} содержит {value}',
    notContains: '{field} не содержит {value}'
  }
} as const;

function interpolate(template: string, field: string, value?: string | number) {
  return template
    .replace('{field}', field)
    .replace('{value}', value === undefined ? '' : String(value));
}

function summarizeRule(rule: ConditionRule, locale: ConditionSummaryLocale) {
  const labels = conditionSummaryLabels[locale];
  const field = labels.fields[rule.field];

  switch (rule.operator) {
    case 'is-true':
      return field;
    case 'is-false':
      return interpolate(labels.isFalse, field);
    case 'eq':
      return interpolate(labels.eq, field, rule.value);
    case 'ne':
      return interpolate(labels.ne, field, rule.value);
    case 'gt':
      return interpolate(labels.gt, field, rule.value);
    case 'gte':
      return interpolate(labels.gte, field, rule.value);
    case 'lt':
      return interpolate(labels.lt, field, rule.value);
    case 'lte':
      return interpolate(labels.lte, field, rule.value);
    case 'contains':
      return interpolate(labels.contains, field, rule.value);
    case 'not-contains':
      return interpolate(labels.notContains, field, rule.value);
  }
}

export function conditionSummary(
  node: ConditionNode,
  locale: ConditionSummaryLocale
): string {
  if (node.kind === 'rule') {
    return summarizeRule(node, locale);
  }

  const labels = conditionSummaryLabels[locale];
  return node.children
    .map((child) => conditionSummary(child, locale))
    .join(` ${node.combinator === 'and' ? labels.and : labels.or} `);
}
