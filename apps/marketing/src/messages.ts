import { pricingRowLabelsEn, pricingRowLabelsRu } from './pricing-row-labels';

export const locales = ['en', 'ru'] as const;

export type AppLocale = (typeof locales)[number];

/** Stable key for use-case cards (industry tag + icon + colors). */
export type UseCaseSegment =
  | 'healthcare'
  | 'publicSector'
  | 'retailFinance'
  | 'hospitality'
  | 'services'
  | 'education';

export function isAppLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

export type HomeMessages = {
  /** Full headline for metadata / fallbacks */
  title: string;
  /** Hero H1: text before the orange accent */
  titleBefore: string;
  /** Hero H1: orange accent phrase (e.g. “one system.”) */
  titleAccent: string;
  description: string;
  docsCta: string;
  localeLabel: string;
  themeUseLight: string;
  themeUseDark: string;
  logoAlt: string;
  /** Hero pill main phrase (marketing); pair with disclaimer + * link. */
  heroEyebrowClaim: string;
  /** Footnote body for the * next to the claim (subjective opinion, not a study). */
  heroEyebrowDisclaimer: string;
  /** Short aria-label for the asterisk link to the footnote. */
  heroEyebrowNoteAriaLabel: string;
  secondaryCta: string;
  /** Sticky header anchor labels + primary CTA. */
  topNav: {
    features: string;
    howItWorks: string;
    benefits: string;
    interfaceShowcase: string;
    useCases: string;
    pricing: string;
    faq: string;
    primaryCta: string;
    openMenu: string;
    closeMenu: string;
  };
  pillarsHeading: string;
  pillars: {
    one: { title: string; body: string };
    two: { title: string; body: string };
    three: { title: string; body: string };
  };
  stats: {
    heading: string;
    industries: Array<{
      label: string;
      icon: 'healthcare' | 'publicSector' | 'retail' | 'services';
    }>;
  };
  howItWorks: {
    heading: string;
    subheading: string;
    steps: Array<{ title: string; body: string }>;
  };
  features: {
    heading: string;
    subheading: string;
    items: Array<{ title: string; body: string }>;
  };
  interfaceShowcase: {
    heading: string;
    subheading: string;
    items: Array<{ title: string; description: string }>;
  };
  useCases: {
    heading: string;
    subheading: string;
    items: Array<{
      title: string;
      body: string;
      industry: string;
      segment: UseCaseSegment;
    }>;
  };
  pricing: {
    heading: string;
    subheading: string;
    plans: Array<{
      name: string;
      price: string;
      period: string;
      description: string;
      features: string[];
      cta: string;
      recommended?: boolean;
      /** Custom / contact-sales tier: omit inline "/period" and show period as secondary line. */
      isCustom?: boolean;
    }>;
  };
  /** Copy when rendering plans from GET /subscriptions/plans (Orval). */
  pricingFromApi: {
    perMonth: string;
    perYear: string;
    /** Label for per-unit pricing model: "/ unit / mo". */
    perUnitPerMonth?: string;
    popularBadge: string;
    /** Top pill on enterprise (sales-led) when not the promoted plan. */
    enterpriseBadge: string;
    startTrial: string;
    /** CTA for a free plan (isFree=true). */
    startFree?: string;
    contactSales: string;
    customPricing: string;
    /** Label shown when isFree=true. */
    freePlan?: string;
    /** Strong CTA strip below plan cards (enterprise / custom deal). */
    customTermsEyebrow: string;
    customTermsTitle: string;
    customTermsBody: string;
    requestQuote: string;
    rowLabels: Record<string, string>;
  };
  /** Public lead / contact form (modal). */
  leadForm: {
    title: string;
    description: string;
    name: string;
    email: string;
    company: string;
    message: string;
    /** Text before the privacy policy link. */
    privacyConsentPrefix: string;
    /** Link text for the privacy policy. */
    privacyLinkLabel: string;
    /** Text after the privacy policy link. */
    privacyConsentSuffix: string;
    /** Shown when the user submits without checking consent. */
    privacyConsentRequired: string;
    submit: string;
    submitting: string;
    success: string;
    error: string;
    close: string;
  };
  faq: {
    heading: string;
    items: Array<{ question: string; answer: string }>;
  };
  footer: {
    title: string;
    body: string;
    /** Primary pill (trial / signup). */
    cta: string;
    /** Secondary outline pill (sales / contact). */
    ctaSecondary: string;
    privacy: string;
    terms: string;
    /** Reopens the cookie / analytics consent banner when GTM is configured. */
    cookieSettings: string;
    /** Company line after © year (e.g. “QuokkaQ Systems”). */
    copyrightBrand: string;
    /** “All rights reserved.” sentence fragment. */
    copyrightReserved: string;
  };
};

export type CookieConsentMessages = {
  title: string;
  description: string;
  acceptAll: string;
  rejectNonEssential: string;
  privacyLinkLabel: string;
};

export const messages: Record<
  AppLocale,
  { home: HomeMessages; cookieConsent: CookieConsentMessages }
> = {
  en: {
    home: {
      title: 'Queues in every branch—in one system.',
      titleBefore: 'Queues in every branch—',
      titleAccent: 'in one system.',
      description:
        'Kiosks, counters, public screens, and live analytics—built for multi-unit operations.',
      docsCta: 'Start 14-day trial →',
      localeLabel: 'Language & theme',
      themeUseLight: 'Use light theme',
      themeUseDark: 'Use dark theme',
      logoAlt: 'QuokkaQ',
      heroEyebrowClaim: 'The friendliest QMS on the market',
      heroEyebrowDisclaimer:
        'Subjective opinion of the QuokkaQ team, based on how we design the product and UX—not the outcome of independent consumer research or a market-wide benchmark.',
      heroEyebrowNoteAriaLabel: 'Read disclaimer about this marketing claim',
      secondaryCta: 'Book a Demo',
      topNav: {
        features: 'Features',
        howItWorks: 'How it works',
        benefits: 'Benefits',
        pricing: 'Pricing',
        interfaceShowcase: 'Interface',
        useCases: 'Use cases',
        faq: 'FAQ',
        primaryCta: 'Start free trial',
        openMenu: 'Open menu',
        closeMenu: 'Close menu'
      },
      pillarsHeading: 'Why QuokkaQ for daily operations',
      pillars: {
        one: {
          title: 'Built for busy service floors',
          body: 'Consistent layouts and clear states so frontline staff and supervisors spend less time guessing—so guests spend less time waiting.'
        },
        two: {
          title: 'Accessible on every device',
          body: 'Keyboard-first flows, visible focus, and strong contrast in light and dark mode—on counters, kiosks, and public displays.'
        },
        three: {
          title: 'Ready to grow with you',
          body: 'Add locations, queues, and staff roles with one admin model: shared rules and reports across sites, and releases you can plan for.'
        }
      },
      stats: {
        heading: 'Common deployment scenarios',
        industries: [
          { label: 'Healthcare', icon: 'healthcare' },
          { label: 'Public Sector', icon: 'publicSector' },
          { label: 'Retail', icon: 'retail' },
          { label: 'Services', icon: 'services' }
        ]
      },
      howItWorks: {
        heading: 'How it works',
        subheading: 'Three steps from ticket to insight',
        steps: [
          {
            title: 'Take a ticket',
            body: 'Guests join from kiosk or web; bookings and pre-registrations supported.'
          },
          {
            title: 'Serve with clarity',
            body: 'Staff call, transfer, and complete visits; visitor notes and tags stay auditable.'
          },
          {
            title: 'Measure what matters',
            body: 'SLA, volumes, surveys, and utilization—filtered by unit, zone, and operator where permitted.'
          }
        ]
      },
      features: {
        heading: 'Everything you need to manage queues',
        subheading:
          'Built for real-world operations with every detail considered',
        items: [
          {
            title: 'Multi-service queues',
            body: 'Separate queues for different services with custom ticket prefixes, colors, and priority rules.'
          },
          {
            title: 'Digital displays',
            body: 'Large-screen TVs show current tickets, wait times, and announcements. Fully customizable layouts.'
          },
          {
            title: 'Staff dashboard',
            body: 'Call customers, transfer tickets between counters, pause service, and view queue analytics in one place.'
          },
          {
            title: 'Mobile-friendly kiosks',
            body: 'Responsive check-in interface works on tablets, phones, or dedicated kiosk hardware.'
          },
          {
            title: 'Real-time sync',
            body: 'All devices stay synchronized instantly. No refresh needed. Works offline with local caching.'
          },
          {
            title: 'Detailed analytics',
            body: 'Export reports on wait times, service duration, peak hours, staff performance, and customer patterns.'
          }
        ]
      },
      interfaceShowcase: {
        heading: 'Designed for every role',
        subheading:
          'Consistent experience across customer kiosks, public displays, and staff tools',
        items: [
          {
            title: 'Check-in Kiosk',
            description:
              'Large buttons, clear categories, instant ticket printing. Accessible for all ages.'
          },
          {
            title: 'Public Display',
            description:
              'High-contrast design visible from distance. Shows current numbers and wait estimates.'
          },
          {
            title: 'Staff Dashboard',
            description:
              'Dense information layout with keyboard shortcuts. Built for speed and efficiency.'
          },
          {
            title: 'Admin Panel',
            description:
              'Configure services, manage locations, view analytics, and control system settings.'
          }
        ]
      },
      useCases: {
        heading: 'Solutions for every industry',
        subheading: 'Flexible queue management adapts to your specific needs',
        items: [
          {
            title: 'Healthcare clinics',
            body: 'Reduce lobby congestion. Patients check in digitally, receive wait time estimates, and get called when ready.',
            industry: 'Healthcare',
            segment: 'healthcare'
          },
          {
            title: 'Government offices',
            body: 'Manage high volumes with multiple service types. Priority queues for urgent cases and appointments.',
            industry: 'Public sector',
            segment: 'publicSector'
          },
          {
            title: 'Retail & banking',
            body: 'Smooth customer flow during peak hours. VIP queue support and service time tracking.',
            industry: 'Finance',
            segment: 'retailFinance'
          },
          {
            title: 'Restaurants & cafes',
            body: 'Digital waitlist with SMS or email alerts (additionally on request). Customers wait comfortably knowing their position.',
            industry: 'Hospitality',
            segment: 'hospitality'
          },
          {
            title: 'Service centers',
            body: 'Route customers to specialized counters. Transfer tickets between staff without losing context.',
            industry: 'Services',
            segment: 'services'
          },
          {
            title: 'Universities',
            body: 'Manage student services across departments. Appointment slots mixed with walk-in queues.',
            industry: 'Education',
            segment: 'education'
          }
        ]
      },
      pricing: {
        heading: 'Simple, transparent pricing',
        subheading: 'Choose the plan that fits your operation',
        plans: [
          {
            name: 'Starter',
            price: '$49',
            period: 'per location/month',
            description:
              'Perfect for single-location businesses starting with queue management',
            features: [
              'Up to 500 tickets/month',
              '1 service queue',
              '2 staff accounts',
              'Basic analytics',
              'Email support'
            ],
            cta: 'Start free trial'
          },
          {
            name: 'Professional',
            price: '$149',
            period: 'per location/month',
            description: 'Full-featured solution for growing businesses',
            features: [
              'Unlimited tickets',
              'Up to 10 service queues',
              'Unlimited staff accounts',
              'Advanced analytics & exports',
              'Priority support',
              'Custom branding',
              'API access'
            ],
            cta: 'Start free trial',
            recommended: true
          },
          {
            name: 'Enterprise',
            price: 'Custom',
            period: 'contact sales',
            isCustom: true,
            description:
              'For organizations with multiple locations and custom requirements',
            features: [
              'Everything in Professional',
              'Multi-location management',
              'Dedicated support',
              'Custom integrations',
              'SLA guarantee',
              'On-premise deployment option'
            ],
            cta: 'Contact sales'
          }
        ]
      },
      pricingFromApi: {
        perMonth: '/mo',
        perYear: '/yr',
        perUnitPerMonth: '/ unit / mo',
        popularBadge: 'Recommended',
        /** Shown on enterprise plan pill (product term, same in all locales). */
        enterpriseBadge: 'Enterprise',
        startTrial: 'Start free trial',
        startFree: 'Start for free',
        contactSales: 'Contact',
        customPricing: 'Custom',
        freePlan: 'Free',
        customTermsEyebrow: 'Multi-site & custom terms',
        customTermsTitle: 'Need terms that match your rollout?',
        customTermsBody:
          'Custom licensing, SLAs, integrations, and security reviews—we’ll reply with next steps, usually within one business day.',
        requestQuote: 'Get a tailored quote',
        rowLabels: pricingRowLabelsEn
      },
      leadForm: {
        title: 'Contact us',
        description:
          'Tell us about your organization and what you need. We will get back to you shortly.',
        name: 'Name',
        email: 'Work email',
        company: 'Company',
        message: 'How can we help?',
        privacyConsentPrefix:
          'I agree to the processing of my personal data as described in the ',
        privacyLinkLabel: 'Privacy Policy',
        privacyConsentSuffix: '.',
        privacyConsentRequired:
          'Please confirm that you agree to the processing of personal data.',
        submit: 'Send request',
        submitting: 'Sending…',
        success: 'Thank you — we received your request.',
        error: 'Something went wrong. Please try again or email us.',
        close: 'Close'
      },
      faq: {
        heading: 'Frequently asked questions',
        items: [
          {
            question: 'What hardware do I need?',
            answer:
              'QuokkaQ works on any modern device with a web browser. For kiosks, we recommend tablets (10" or larger). For displays, any TV or monitor with a browser. No special hardware required.'
          },
          {
            question: 'Can customers get notifications?',
            answer:
              'SMS or email updates about queue position and estimated wait time are available additionally on request (not included in the current product). Today customers follow their place via displays and the digital waitlist in the browser.'
          },
          {
            question: 'Does it work offline?',
            answer:
              "The system requires internet connection for real-time sync across devices. Each device caches data locally, so brief connection drops won't interrupt service."
          },
          {
            question: 'How long does setup take?',
            answer:
              'Most businesses are operational within 2-3 hours. This includes account setup, service configuration, staff training, and device installation.'
          },
          {
            question: 'Can I customize ticket formats?',
            answer:
              'Yes. Each service queue can have custom ticket prefixes (letters), numbering rules, colors, and priority levels.'
          },
          {
            question: 'Is there a free trial?',
            answer:
              'Yes. All paid plans include a 14-day free trial with full features. No credit card required to start.'
          },
          {
            question: 'What about peak hours?',
            answer:
              'The system handles high volumes smoothly. Analytics help you identify peak times so you can schedule staff accordingly and adjust queue priorities dynamically.'
          },
          {
            question: 'Can we integrate with existing systems?',
            answer:
              'Professional and Enterprise plans include API access for integration with scheduling systems, CRMs, and other business tools. Far from every possible integration is supported today—submit a request (contact form or sales) so we can discuss your systems, what is already feasible, and what would need a custom rollout.'
          }
        ]
      },
      footer: {
        title: 'Ready to tame your queues?',
        body: 'Join the growing number of businesses that trust QuokkaQ to deliver exceptional customer experiences.',
        cta: 'Start free trial',
        ctaSecondary: 'Contact us',
        privacy: 'Privacy Policy',
        terms: 'Terms of Service',
        cookieSettings: 'Cookie settings',
        copyrightBrand: 'Bogatyrev V.',
        copyrightReserved: 'All rights reserved.'
      }
    },
    cookieConsent: {
      title: 'Cookies and analytics',
      description:
        'We use cookies for essential site functions. If you agree, we also load Google Tag Manager so Google Analytics and Yandex Metrica can measure traffic. Read more in the Privacy Policy.',
      acceptAll: 'Accept all',
      rejectNonEssential: 'Only essential',
      privacyLinkLabel: 'Privacy Policy'
    }
  },
  ru: {
    home: {
      title: 'Очереди по всей сети филиалов — в одной системе.',
      titleBefore: 'Очереди по всей сети филиалов — ',
      titleAccent: 'в одной системе.',
      description:
        'Киоски, окна, публичные экраны и аналитика в реальном времени — для сетей и мультифилиальных операций.',
      docsCta: 'Пробный период 14 дней →',
      localeLabel: 'Язык и тема',
      themeUseLight: 'Светлая тема',
      themeUseDark: 'Тёмная тема',
      logoAlt: 'КвоккаКю',
      heroEyebrowClaim: 'Самая дружелюбная QMS на рынке',
      heroEyebrowDisclaimer:
        'Субъективное мнение команды КвоккаКю о том, как мы проектируем продукт и интерфейс; это не результат независимых исследований потребителей и не сравнение со всем рынком.',
      heroEyebrowNoteAriaLabel: 'Уточнение по этой маркетинговой формулировке',
      secondaryCta: 'Заказать демо',
      topNav: {
        features: 'Возможности',
        howItWorks: 'Как это работает',
        benefits: 'Преимущества',
        pricing: 'Тарифы',
        interfaceShowcase: 'Интерфейс',
        useCases: 'Сценарии',
        faq: 'FAQ',
        primaryCta: 'Начать пробный период',
        openMenu: 'Открыть меню',
        closeMenu: 'Закрыть меню'
      },
      pillarsHeading: 'Почему QuokkaQ в ежедневной работе',
      pillars: {
        one: {
          title: 'Интерфейс для плотного потока',
          body: 'Понятные экраны и согласованные состояния, чтобы сотрудники на линии и супервайзеры тратили меньше сил — а гостю было проще дождаться своей очереди.'
        },
        two: {
          title: 'Доступно на разных устройствах',
          body: 'Клавиатура, focus-visible и стабильный контраст в светлой и тёмной теме: на стойке, киоске и публичном табло.'
        },
        three: {
          title: 'Растёте вместе с сетью',
          body: 'Новые точки, очереди и роли в одной модели администрирования: общие правила и отчёты, предсказуемые релизы, к которым можно готовиться.'
        }
      },
      stats: {
        heading: 'Типовые сценарии, где продукт полезен',
        industries: [
          { label: 'Здравоохранение', icon: 'healthcare' },
          { label: 'Госсектор', icon: 'publicSector' },
          { label: 'Розница', icon: 'retail' },
          { label: 'Услуги', icon: 'services' }
        ]
      },
      howItWorks: {
        heading: 'Как это работает',
        subheading: 'Три шага от талона к аналитике',
        steps: [
          {
            title: 'Возьмите талон',
            body: 'Гости подключаются с киоска или веба; поддерживаются записи и предварительная регистрация.'
          },
          {
            title: 'Обслуживайте прозрачно',
            body: 'Персонал вызывает, переводит и завершает визиты; заметки и метки остаются в аудите.'
          },
          {
            title: 'Оценивайте важное',
            body: 'SLA, объёмы, опросы и загрузка — с фильтрами по подразделению, зоне и оператору там, где это разрешено.'
          }
        ]
      },
      features: {
        heading: 'Всё необходимое для управления очередями',
        subheading: 'Создано для реальных операций с вниманием к каждой детали',
        items: [
          {
            title: 'Множественные очереди',
            body: 'Отдельные очереди для разных услуг с настраиваемыми префиксами талонов, цветами и правилами приоритета.'
          },
          {
            title: 'Цифровые табло',
            body: 'Большие экраны показывают текущие талоны, время ожидания и объявления. Полностью настраиваемые макеты.'
          },
          {
            title: 'Панель персонала',
            body: 'Вызывайте клиентов, переводите талоны между окнами, приостанавливайте обслуживание и просматривайте аналитику в одном месте.'
          },
          {
            title: 'Мобильные киоски',
            body: 'Адаптивный интерфейс регистрации работает на планшетах, телефонах или специализированном оборудовании киосков.'
          },
          {
            title: 'Синхронизация в реальном времени',
            body: 'Все устройства синхронизируются мгновенно. Обновление не требуется. Работает офлайн с локальным кэшированием.'
          },
          {
            title: 'Детальная аналитика',
            body: 'Экспортируйте отчёты по времени ожидания, длительности обслуживания, пиковым часам, производительности персонала и паттернам клиентов.'
          }
        ]
      },
      interfaceShowcase: {
        heading: 'Создано для каждой роли',
        subheading:
          'Единообразный опыт на киосках для клиентов, публичных табло и инструментах персонала',
        items: [
          {
            title: 'Киоск регистрации',
            description:
              'Крупные кнопки, чёткие категории, мгновенная печать талонов. Доступно для всех возрастов.'
          },
          {
            title: 'Публичное табло',
            description:
              'Высококонтрастный дизайн, видимый издалека. Показывает текущие номера и оценку времени ожидания.'
          },
          {
            title: 'Панель персонала',
            description:
              'Плотная компоновка информации с клавиатурными сокращениями. Создана для скорости и эффективности.'
          },
          {
            title: 'Панель администратора',
            description:
              'Настройка услуг, управление точками, просмотр аналитики и контроль системных настроек.'
          }
        ]
      },
      useCases: {
        heading: 'Решения для каждой отрасли',
        subheading:
          'Гибкое управление очередями адаптируется под ваши специфичные нужды',
        items: [
          {
            title: 'Медицинские клиники',
            body: 'Сокращайте скопление в холле. Пациенты регистрируются цифрово, получают оценку времени ожидания и их вызывают, когда готово.',
            industry: 'Здравоохранение',
            segment: 'healthcare'
          },
          {
            title: 'Государственные учреждения',
            body: 'Управляйте высокими потоками с множественными типами услуг. Приоритетные очереди для срочных случаев и записей.',
            industry: 'Госсектор',
            segment: 'publicSector'
          },
          {
            title: 'Розница и банки',
            body: 'Плавный поток клиентов в пиковые часы. Поддержка VIP-очередей и отслеживание времени обслуживания.',
            industry: 'Финансы',
            segment: 'retailFinance'
          },
          {
            title: 'Рестораны и кафе',
            body: 'Цифровой лист ожидания с уведомлениями по SMS или email (дополнительно по запросу). Клиенты ждут комфортно, зная свою позицию.',
            industry: 'HoReCa',
            segment: 'hospitality'
          },
          {
            title: 'Сервисные центры',
            body: 'Направляйте клиентов к специализированным окнам. Передавайте талоны между сотрудниками без потери контекста.',
            industry: 'Услуги',
            segment: 'services'
          },
          {
            title: 'Университеты',
            body: 'Управляйте студенческими услугами через отделы. Слоты по записи смешаны с живыми очередями.',
            industry: 'Образование',
            segment: 'education'
          }
        ]
      },
      pricing: {
        heading: 'Простое, прозрачное ценообразование',
        subheading: 'Выберите план, подходящий вашим операциям',
        plans: [
          {
            name: 'Стартовый',
            price: '$49',
            period: 'за точку/месяц',
            description:
              'Идеально для бизнеса с одной точкой, начинающего управление очередями',
            features: [
              'До 500 талонов/месяц',
              '1 очередь услуг',
              '2 аккаунта персонала',
              'Базовая аналитика',
              'Поддержка по email'
            ],
            cta: 'Начать пробный период'
          },
          {
            name: 'Профессиональный',
            price: '$149',
            period: 'за точку/месяц',
            description: 'Полнофункциональное решение для растущего бизнеса',
            features: [
              'Неограниченные талоны',
              'До 10 очередей услуг',
              'Неограниченные аккаунты персонала',
              'Продвинутая аналитика и экспорт',
              'Приоритетная поддержка',
              'Кастомный брендинг',
              'API-доступ'
            ],
            cta: 'Начать пробный период',
            recommended: true
          },
          {
            name: 'Корпоративный',
            price: 'Индивидуально',
            period: 'свяжитесь с отделом продаж',
            isCustom: true,
            description:
              'Для организаций с множественными точками и кастомными требованиями',
            features: [
              'Всё из Профессионального',
              'Управление множеством точек',
              'Выделенная поддержка',
              'Кастомные интеграции',
              'Гарантия SLA',
              'Опция локального развёртывания'
            ],
            cta: 'Связаться с отделом продаж'
          }
        ]
      },
      pricingFromApi: {
        perMonth: '/мес',
        perYear: '/год',
        perUnitPerMonth: '/ подр. / мес',
        popularBadge: 'Рекомендуем',
        enterpriseBadge: 'Enterprise',
        startTrial: 'Начать пробный период',
        startFree: 'Начать бесплатно',
        contactSales: 'Связаться',
        customPricing: 'По запросу',
        freePlan: 'Бесплатно',
        customTermsEyebrow: 'Для сетей и особых условий',
        customTermsTitle: 'Нужны условия под ваш масштаб и процессы?',
        customTermsBody:
          'Лицензия, SLA, интеграции и требования ИБ — подготовим предложение и вернёмся с шагами, чаще всего в течение одного рабочего дня.',
        requestQuote: 'Получить предложение',
        rowLabels: pricingRowLabelsRu
      },
      leadForm: {
        title: 'Связаться с нами',
        description:
          'Расскажите об организации и задаче — мы свяжемся с вами в ближайшее время.',
        name: 'Имя',
        email: 'Рабочий email',
        company: 'Компания',
        message: 'Чем можем помочь?',
        privacyConsentPrefix:
          'Я согласен(а) на обработку персональных данных в соответствии с ',
        privacyLinkLabel: 'политикой конфиденциальности',
        privacyConsentSuffix: '.',
        privacyConsentRequired:
          'Подтвердите согласие на обработку персональных данных.',
        submit: 'Отправить запрос',
        submitting: 'Отправка…',
        success: 'Спасибо — мы получили ваш запрос.',
        error:
          'Не удалось отправить. Попробуйте ещё раз или напишите нам на почту.',
        close: 'Закрыть'
      },
      faq: {
        heading: 'Часто задаваемые вопросы',
        items: [
          {
            question: 'Какое оборудование требуется?',
            answer:
              'КвоккаКю работает на любом современном устройстве с веб-браузером. Для киосков рекомендуем планшеты (10" или больше). Для табло — любой телевизор или монитор с браузером. Специальное оборудование не требуется.'
          },
          {
            question: 'Могут ли клиенты получать уведомления?',
            answer:
              'Уведомления по SMS или email о позиции в очереди и примерном времени ожидания доступны дополнительно по запросу (в стандартной версии продукта пока не реализовано). Сейчас клиенты отслеживают очередь через табло и цифровой лист ожидания в браузере.'
          },
          {
            question: 'Работает ли офлайн?',
            answer:
              'Система требует интернет-соединения для синхронизации в реальном времени между устройствами. Каждое устройство кэширует данные локально, поэтому кратковременные отключения не прерывают обслуживание.'
          },
          {
            question: 'Сколько времени занимает настройка?',
            answer:
              'Большинство бизнесов начинают работу в течение 2-3 часов. Это включает настройку аккаунта, конфигурацию услуг, обучение персонала и установку устройств.'
          },
          {
            question: 'Можно ли настроить форматы талонов?',
            answer:
              'Да. Каждая очередь услуг может иметь кастомные префиксы талонов (буквы), правила нумерации, цвета и уровни приоритета.'
          },
          {
            question: 'Есть ли бесплатный пробный период?',
            answer:
              'Да. Все тарифы включают 14-дневный пробный период с полным функционалом. Кредитная карта для старта не требуется.'
          },
          {
            question: 'Как насчёт пиковых часов?',
            answer:
              'Система справляется с высокими нагрузками плавно. Аналитика помогает определить пиковые времена, чтобы вы могли планировать персонал соответственно и динамически настраивать приоритеты очередей.'
          },
          {
            question: 'Можем ли мы интегрироваться с существующими системами?',
            answer:
              'У тарифов Professional и Enterprise есть API-доступ для интеграции с системами записи, CRM и другими бизнес-инструментами. Сейчас поддержаны далеко не все возможные сценарии — оставьте заявку через контакты на сайте или с менеджером, чтобы обсудить вашу задачу, что уже доступно и что потребует отдельной проработки.'
          }
        ]
      },
      footer: {
        title: 'Готовы взять очереди под контроль?',
        body: 'К нам присоединяются компании, для которых важен сервис в очереди — доверьтесь КвоккаКю и вы.',
        cta: 'Начать пробный период',
        ctaSecondary: 'Связаться с нами',
        privacy: 'Политика конфиденциальности',
        terms: 'Условия использования',
        cookieSettings: 'Настройки cookie',
        copyrightBrand: 'Богатырев В.С.',
        copyrightReserved: 'Все права защищены.'
      }
    },
    cookieConsent: {
      title: 'Файлы cookie и аналитика',
      description:
        'Мы используем cookie для работы сайта. Если вы согласны, подключается Google Tag Manager и через него — Google Analytics и Яндекс Метрика для оценки трафика. Подробности — в Политике конфиденциальности.',
      acceptAll: 'Принять все',
      rejectNonEssential: 'Только необходимые',
      privacyLinkLabel: 'Политика конфиденциальности'
    }
  }
};
