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

/** Stable keys for integration logos + carousel (labels are localized). */
export type LandingIntegrationId =
  | 'googleCalendar'
  | 'twilio'
  | 'smsRu'
  | 'caldav'
  | 'oidcSaml'
  | 'yooKassa';

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
  /** Short risk reducers under primary trial CTAs (hero + footer). */
  ctaAssurances: {
    freeTrial: string;
    noCreditCard: string;
    cancelAnytime: string;
  };
  /** Accessible name for the ctaAssurances list. */
  ctaAssurancesAriaLabel: string;
  /** Sticky header anchor labels + primary CTA. */
  topNav: {
    /** Landmark label for header navigation (visible + overflow). */
    navAriaLabel: string;
    features: string;
    howItWorks: string;
    benefits: string;
    interfaceShowcase: string;
    useCases: string;
    pricing: string;
    faq: string;
    bookDemo: string;
    primaryCta: string;
    /** Compact header: overflow items behind this control. */
    moreNav: string;
    /** `aria-label` for the overflow dropdown listbox. */
    moreNavMenuAriaLabel: string;
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
    /** Four default product facts; first may be replaced by live org count from API. */
    facts: Array<{
      label: string;
      icon: 'clock' | 'plug' | 'globe' | 'calendarDays';
    }>;
    /** `{count}` is replaced with active company count when above the public threshold. */
    liveOrganizationsLabel: string;
  };
  integrations: {
    heading: string;
    /** One line clarifying what is a product integration vs protocol/standard. */
    subheading: string;
    items: Array<{ id: LandingIntegrationId; label: string }>;
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
    items: Array<{
      title: string;
      description: string;
      image: string;
      imageAlt: string;
    }>;
  };
  /** Optional product walkthrough video (first showcase card). */
  interfaceWalkthrough: {
    playLabel: string;
    dialogTitle: string;
    closeLabel: string;
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
  comparison: {
    /** Full title for accessibility (e.g. aria-label on the H2). */
    heading: string;
    /** Visible text before the wordmark in the section H2. */
    headingPrefix: string;
    subheading: string;
    /** Large gradient tag over the comparison table linking to `/roi`. */
    roiTableTag: {
      linkLabel: string;
      /** Appended in a screen-reader-only span after the visible label. */
      linkSrOnly: string;
    };
    beforeColumn: string;
    afterColumn: string;
    rows: Array<{ before: string; after: string }>;
  };
  bookDemo: {
    heading: string;
    body: string;
    embedTitle: string;
    openInNewTab: string;
    /** Shown when Cal.com embed URL is not configured. */
    embedFallback: string;
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
    /** Billing period toggle (shown when at least one plan has annual prepay). */
    billingToggleMonth: string;
    billingToggleAnnual: string;
    /** Accessible name for the billing period tablist (not the same as the "Monthly" tab label). */
    billingToggleGroupLabel: string;
    /** Secondary line under price when annual toggle is on (12-month prepay). */
    billedAnnuallyFootnote: string;
    /**
     * Pill on a plan card in annual mode; `{percent}` is the plan’s discount %
     * (explicit or equivalent from fixed effective monthly).
     */
    annualPrepayBubbleLabel: string;
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
  trust: {
    heading: string;
    items: Array<{ title: string }>;
  };
  faq: {
    heading: string;
    items: Array<{ question: string; answer: string }>;
  };
  /** Fixed bottom CTA on small screens (shown after scrolling past hero). */
  stickyMobileCta: {
    label: string;
    ariaLabel: string;
  };
  /** Shown only when `LandingTestimonials` receives non-empty `items`. */
  testimonials: {
    heading: string;
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
    /** Footer link to `/blog`. */
    blog: string;
    /** Footer link to `/roi`. */
    roi: string;
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

export type BlogMessages = {
  metaTitle: string;
  metaDescription: string;
  listHeading: string;
  listSubheading: string;
  readMore: string;
  publishedPrefix: string;
  listEmpty: string;
  postBackToBlog: string;
  postNotFoundTitle: string;
  postNotFoundBody: string;
};

export type RoiMessages = {
  metaTitle: string;
  metaDescription: string;
  /** Link above the page title (e.g. arrow + “Back to home”). */
  backToHome: string;
  heading: string;
  subheading: string;
  disclaimer: string;
  visitorsPerDay: string;
  waitMinutes: string;
  locations: string;
  aggregateWaitLabel: string;
  aggregateWaitHint: string;
  illustrativeStaffLabel: string;
  illustrativeStaffHint: string;
  methodology: string;
  /** Shown after large hour totals (e.g. `h`, `ч`). */
  hoursAbbrev: string;
  /** Shown after the wait slider value (e.g. `min`, `мин`). */
  minutesAbbrev: string;
};

export type ExitIntentMessages = {
  title: string;
  body: string;
  bookDemoCta: string;
  emailSalesCta: string;
  /** `aria-label` for the icon-only close control (localized). */
  closeAriaLabel: string;
  mailtoSubject: string;
};

export const messages: Record<
  AppLocale,
  {
    home: HomeMessages;
    blog: BlogMessages;
    roi: RoiMessages;
    exitIntent: ExitIntentMessages;
    cookieConsent: CookieConsentMessages;
  }
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
      ctaAssurances: {
        freeTrial: '14-day trial',
        noCreditCard: 'No credit card',
        cancelAnytime: 'Cancel anytime'
      },
      ctaAssurancesAriaLabel: 'Trial terms',
      topNav: {
        navAriaLabel: 'Main navigation',
        features: 'Features',
        howItWorks: 'How it works',
        benefits: 'Benefits',
        pricing: 'Pricing',
        interfaceShowcase: 'Interface',
        useCases: 'Use cases',
        faq: 'FAQ',
        bookDemo: 'Book demo',
        primaryCta: 'Start free trial',
        moreNav: 'More',
        moreNavMenuAriaLabel: 'Additional sections',
        openMenu: 'Open menu',
        closeMenu: 'Close menu'
      },
      pillarsHeading: 'Why day-to-day work is easier with QuokkaQ',
      pillars: {
        one: {
          title: 'Less guesswork on the floor',
          body: "The same clear steps on counter and kiosk—so staff move faster and visitors always know what's happening and how long to wait."
        },
        two: {
          title: 'One experience on every screen',
          body: 'Touch-friendly targets, solid contrast in light and dark, keyboard support where it matters—desks, kiosks, and public displays.'
        },
        three: {
          title: 'Multi-site without a second universe',
          body: 'Add branches, queues, and roles under one admin model: shared rules, network-wide reporting, and releases you can plan around.'
        }
      },
      stats: {
        heading: 'Why teams choose QuokkaQ',
        facts: [
          { label: 'Go live in 2–3 hours', icon: 'clock' },
          { label: '10+ ready integrations', icon: 'plug' },
          { label: '2 interface languages', icon: 'globe' },
          { label: '14-day free trial', icon: 'calendarDays' }
        ],
        liveOrganizationsLabel: '{count}+ organizations on the platform'
      },
      integrations: {
        heading: 'Integrations and open protocols',
        subheading:
          'CalDAV and OIDC / SAML are industry-standard ways to plug in calendars and sign-in. The rest are packaged connections to common external services.',
        items: [
          { id: 'caldav', label: 'CalDAV' },
          { id: 'oidcSaml', label: 'OIDC / SAML 2.0' },
          { id: 'googleCalendar', label: 'Google Calendar' },
          { id: 'twilio', label: 'Twilio' },
          { id: 'smsRu', label: 'SMS.ru' },
          { id: 'yooKassa', label: 'YooKassa' }
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
              'Self-service ticket kiosk with large touch-friendly buttons, clear service categories, and instant ticket printing. Multilingual interface accessible for all ages and abilities. Perfect for high-traffic environments like government offices, healthcare facilities, and retail locations.',
            image: '/kiosk.webp',
            imageAlt:
              'QuokkaQ self-service kiosk interface showing service selection screen with large buttons for taking tickets and arranging services'
          },
          {
            title: 'Public Display',
            description:
              'High-contrast digital queue display board visible from distance. Shows currently serving ticket numbers, wait time estimates, and real-time queue status. Optimized for TV screens and digital signage in waiting areas.',
            image: '/public_screen.webp',
            imageAlt:
              'QuokkaQ public display screen showing currently serving tickets with numbers, status, and queue information on a large digital board'
          },
          {
            title: 'Staff Dashboard',
            description:
              'Efficient employee workstation interface with keyboard shortcuts for calling tickets, transferring between counters, and managing queue flow. Dense information layout designed for speed and productivity during peak hours.',
            image: '/desk.webp',
            imageAlt:
              'QuokkaQ staff dashboard interface showing ticket queue management, call controls, and visitor service workflow for employees'
          },
          {
            title: 'Supervisor Panel',
            description:
              'Real-time monitoring and analytics dashboard for queue supervisors. View active workstations, service metrics, wait times, and staff performance. Configure services, manage multiple locations, and access detailed reporting.',
            image: '/supervisor.webp',
            imageAlt:
              'QuokkaQ supervisor panel showing real-time queue analytics, workstation monitoring, and management dashboard for administrators'
          }
        ]
      },
      interfaceWalkthrough: {
        playLabel: 'Watch overview',
        dialogTitle: 'Product walkthrough',
        closeLabel: 'Close'
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
      comparison: {
        heading: 'The usual approach vs. QuokkaQ',
        headingPrefix: 'The usual approach vs.',
        subheading: 'Clear contrast with how queues are run today',
        roiTableTag: {
          linkLabel: 'Estimate implementation',
          linkSrOnly:
            ' — waiting-time sketch on its own page, with sliders and the amber disclaimer.'
        },
        beforeColumn: 'Traditional approach',
        afterColumn: 'With QuokkaQ',
        rows: [
          {
            before: 'Paper tickets and manual tracking',
            after: 'Digital kiosk and automatic ticket accounting'
          },
          {
            before: 'No visibility into wait times',
            after: 'Live analytics and SLA-aware monitoring'
          },
          {
            before: 'Guests guess when they will be called',
            after: 'Displays, SMS options, and clearer expectations'
          },
          {
            before: 'Rollouts that take days or weeks',
            after: 'Most teams go live in 2–3 hours'
          },
          {
            before: 'Different tools per branch',
            after: 'One platform for the whole network'
          }
        ]
      },
      bookDemo: {
        heading: 'Book a live walkthrough',
        body: 'We will tailor the tour to your use case—about 30 minutes, no obligation.',
        embedTitle: 'Cal.com scheduling',
        openInNewTab: 'Open booking in a new tab',
        embedFallback:
          'Scheduling is not embedded on this preview build. Use Contact us or open the booking page when your team configures Cal.com.'
      },
      pricing: {
        heading: 'Simple, transparent pricing',
        subheading: 'Choose the plan that fits your operation',
        plans: [
          {
            name: 'Starter',
            price: '₽2 900',
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
            price: '₽9 900',
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
        billingToggleMonth: 'Monthly',
        billingToggleAnnual: '12 months',
        billingToggleGroupLabel: 'Billing period',
        billedAnnuallyFootnote: 'Billed annually (12 months)',
        annualPrepayBubbleLabel: '−{percent}% annual',
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
      trust: {
        heading: 'Security & data',
        items: [
          {
            title:
              'We follow GDPR expectations when they actually apply to your rollout'
          },
          {
            title:
              'Most teams run on infrastructure hosted in Russia—familiar for local ops'
          },
          {
            title:
              'For Russian organizations, our processes line up with what 152-FZ asks for'
          },
          {
            title:
              'Enterprise plans can include up to 99.9% availability in the SLA'
          },
          {
            title:
              'Traffic is encrypted in transit; stored data is handled with care'
          }
        ]
      },
      stickyMobileCta: {
        label: 'Start free',
        ariaLabel: 'Open product signup to start a free trial'
      },
      testimonials: {
        heading: 'What teams say'
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
              'API access and deeper integrations with scheduling, CRMs, and other tools are offered by arrangement—not every scenario ships out of the box, and scope is not guaranteed by a single catalog tier alone. Send a request (site contact form or sales) and we will review what is already feasible and what would need a custom rollout.'
          },
          {
            question: 'Is the product GDPR and 152-FZ compliant?',
            answer:
              'We design QuokkaQ for strong privacy and regional requirements. Typical deployments store data in Russia with processes aligned to 152-FZ. EU customers can discuss EU-region hosting and GDPR-aligned setups with our team. Details are in the Privacy Policy.'
          },
          {
            question: 'Can we export our data?',
            answer:
              'Yes—analytics, reports, and ticket history can be exported to CSV and PDF when your plan includes exports. After a subscription ends, data remains accessible for a grace period (see your agreement); contact support for retention specifics.'
          },
          {
            question: 'Do you help migrate from another system?',
            answer:
              'Yes—data import, configuration aligned with your process, and team onboarding are offered by arrangement, not as a fixed package. Scope and timing depend on your current stack; describe it in your request and we will propose options and next steps.'
          },
          {
            question: 'Which interface languages are supported?',
            answer:
              'Kiosks and staff tools are available in Russian and English today. Additional languages can be discussed as a custom rollout.'
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
        blog: 'Blog',
        roi: 'Waiting-time sketch',
        cookieSettings: 'Cookie settings',
        copyrightBrand: 'Bogatyrev V.',
        copyrightReserved: 'All rights reserved.'
      }
    },
    blog: {
      metaTitle: 'Blog',
      metaDescription:
        'Notes on queue operations, public-sector rollouts, and honest ROI framing for multi-branch teams.',
      listHeading: 'Blog',
      listSubheading:
        'Short articles for operations and IT—methodology, field notes, and clear ways to talk about impact.',
      readMore: 'Read article',
      publishedPrefix: 'Published',
      listEmpty: 'No articles yet.',
      postBackToBlog: 'Back to blog',
      postNotFoundTitle: 'Article not found',
      postNotFoundBody: 'This slug does not exist or was removed.'
    },
    roi: {
      metaTitle: 'Waiting-time sketch',
      metaDescription:
        'Three sliders, two ballpark totals, and a short amber note. A team sketch—not a savings promise or a budget line.',
      backToHome: 'Back to home',
      heading: 'Waiting-time sketch — for a grounded team conversation',
      subheading:
        'Pick visitors per day, how long the wait feels, and how many sites you want in the picture. The two totals below are rounded on purpose: visitor waiting hours per month, then a rough staff-side proxy (we hold six percent only as a talking point, not a labour forecast). Before anything reaches finance as “savings,” read the amber box under the numbers—it spells out what is assumed.',
      disclaimer:
        'This page is a working note, not a figure for an audited savings claim. It is not financial or legal advice, and QuokkaQ does not guarantee these numbers for your branches. What actually lands still depends on your processes, staffing, and rollout.',
      visitorsPerDay:
        'Roughly how many visitors does one site see in a day, on average?',
      waitMinutes:
        'About how long does the wait feel to someone in line today (minutes)?',
      locations: 'How many sites or branches are we sketching in?',
      aggregateWaitLabel: 'Ballpark visitor waiting hours each month',
      aggregateWaitHint:
        'We multiply visitors, wait minutes, and locations, turn minutes into hours, and multiply by about twenty-two working days. Think of it as a weather map for how full the waiting area feels—not a payroll clock.',
      illustrativeStaffLabel:
        'A very rough “what if some of that touches staff?” hours / month',
      illustrativeStaffHint:
        'Behind the scenes we borrow six percent of the crowd-hours above—just to give frontline leads and finance something to talk about, never to forecast labour savings.',
      methodology:
        'We left six percent as a placeholder. Stand next to the real week—rework, escalations, quiet fixes in spreadsheets—and let what you see suggest the number that should replace ours.',
      hoursAbbrev: 'h',
      minutesAbbrev: 'min'
    },
    exitIntent: {
      title: 'Heading out? Just a tiny hello',
      body: 'Totally your call—no pitch overload. If a calm walkthrough or a quick question would help, pick whatever feels easiest.',
      bookDemoCta: 'Book a relaxed demo',
      emailSalesCta: 'Drop us a line',
      closeAriaLabel: 'Close dialog',
      mailtoSubject: 'Question from the QuokkaQ marketing site'
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
      ctaAssurances: {
        freeTrial: '14 дней бесплатно',
        noCreditCard: 'Без банковской карты',
        cancelAnytime: 'Отмена в любой момент'
      },
      ctaAssurancesAriaLabel: 'Условия пробного периода',
      topNav: {
        navAriaLabel: 'Основная навигация',
        features: 'Возможности',
        howItWorks: 'Как это работает',
        benefits: 'Преимущества',
        pricing: 'Тарифы',
        interfaceShowcase: 'Интерфейс',
        useCases: 'Сценарии',
        faq: 'FAQ',
        bookDemo: 'Запись на демо',
        primaryCta: 'Начать пробный период',
        moreNav: 'Ещё',
        moreNavMenuAriaLabel: 'Дополнительные разделы',
        openMenu: 'Открыть меню',
        closeMenu: 'Закрыть меню'
      },
      pillarsHeading: 'Почему с КвоккаКю проще в повседневной работе',
      pillars: {
        one: {
          title: 'Меньше догадок на линии',
          body: 'Один и тот же понятный сценарий на стойке и киоске: сотруднику проще не ошибиться, гостю — сразу видно, что происходит и сколько ждать.'
        },
        two: {
          title: 'Один опыт на всех экранах',
          body: 'Крупные зоны нажатия, устойчивый контраст в светлой и тёмной теме, удобная работа с клавиатуры там, где это нужно: стойка, киоск, публичное табло.'
        },
        three: {
          title: 'Сеть без второй «вселенной»',
          body: 'Новые точки, очереди и роли в одной админке: общие правила, отчёты по сети и обновления с понятным графиком — без лишнего шума при росте.'
        }
      },
      stats: {
        heading: 'Почему команды выбирают КвоккаКю',
        facts: [
          { label: 'Запуск за 2–3 часа', icon: 'clock' },
          { label: '10+ готовых интеграций', icon: 'plug' },
          { label: '2 языка интерфейса', icon: 'globe' },
          { label: '14 дней бесплатно', icon: 'calendarDays' }
        ],
        liveOrganizationsLabel: 'Более {count} организаций на платформе'
      },
      integrations: {
        heading: 'Интеграции и открытые протоколы',
        subheading:
          'CalDAV и OIDC / SAML — общепринятые способы подключить календари и единый вход. Остальное — готовые связки с распространёнными внешними сервисами.',
        items: [
          { id: 'caldav', label: 'CalDAV' },
          { id: 'oidcSaml', label: 'OIDC / SAML 2.0' },
          { id: 'googleCalendar', label: 'Google Calendar' },
          { id: 'twilio', label: 'Twilio' },
          { id: 'smsRu', label: 'SMS.ru' },
          { id: 'yooKassa', label: 'ЮKassa' }
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
              'Киоск самообслуживания с крупными сенсорными кнопками, чёткими категориями услуг и мгновенной печатью талонов. Мультиязычный интерфейс доступен для всех возрастов и уровней подготовки. Идеально подходит для мест с высоким трафиком: государственных учреждений, медицинских центров и точек обслуживания клиентов.',
            image: '/kiosk.webp',
            imageAlt:
              'Интерфейс киоска самообслуживания КвоккаКю с экраном выбора услуг и крупными кнопками для получения талонов'
          },
          {
            title: 'Публичное табло',
            description:
              'Высококонтрастное цифровое табло очередей, видимое издалека. Показывает номера обслуживаемых талонов, оценку времени ожидания и статус очереди в реальном времени. Оптимизировано для телевизоров и цифровых вывесок в зонах ожидания.',
            image: '/public_screen.webp',
            imageAlt:
              'Публичное табло КвоккаКю, показывающее текущие обслуживаемые талоны с номерами, статусом и информацией об очереди на большом экране'
          },
          {
            title: 'Панель персонала',
            description:
              'Эффективный интерфейс рабочего места сотрудника с клавиатурными сокращениями для вызова талонов, перевода между окнами и управления потоком очереди. Плотная компоновка информации для скорости и продуктивности в часы пик.',
            image: '/desk.webp',
            imageAlt:
              'Рабочая панель персонала КвоккаКю с управлением очередью талонов, элементами вызова и процессом обслуживания посетителей'
          },
          {
            title: 'Панель супервайзера',
            description:
              'Дашборд мониторинга и аналитики очередей для супервайзеров в реальном времени. Просмотр активных рабочих мест, метрик обслуживания, времени ожидания и эффективности персонала. Настройка услуг, управление несколькими точками и доступ к детальным отчётам.',
            image: '/supervisor.webp',
            imageAlt:
              'Панель супервайзера КвоккаКю с аналитикой очередей в реальном времени, мониторингом рабочих мест и административной панелью'
          }
        ]
      },
      interfaceWalkthrough: {
        playLabel: 'Смотреть обзор',
        dialogTitle: 'Обзор продукта',
        closeLabel: 'Закрыть'
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
      comparison: {
        heading: 'Привычный подход и КвоккаКю',
        headingPrefix: 'Привычный подход и',
        subheading: 'Наглядное сравнение с привычным способом вести очередь',
        roiTableTag: {
          linkLabel: 'Оценить внедрение',
          linkSrOnly:
            ' — черновик оценки ожидания на отдельной странице, с ползунками и жёлтым напоминанием.'
        },
        beforeColumn: 'Традиционный подход',
        afterColumn: 'С КвоккаКю',
        rows: [
          {
            before: 'Бумажные талоны и ручной учёт',
            after: 'Цифровой киоск и автоматический учёт талонов'
          },
          {
            before: 'Нет данных о времени ожидания',
            after: 'Аналитика в реальном времени и контроль SLA'
          },
          {
            before: 'Клиент не знает, когда его вызовут',
            after: 'Табло, SMS по запросу и понятные ожидания'
          },
          {
            before: 'Настройка занимает дни или недели',
            after: 'Запуск за 2–3 часа у большинства команд'
          },
          {
            before: 'Разные инструменты в разных филиалах',
            after: 'Единая платформа для всей сети'
          }
        ]
      },
      bookDemo: {
        heading: 'Запишитесь на живую демонстрацию',
        body: 'Покажем систему под ваши задачи — около 30 минут, без обязательств.',
        embedTitle: 'Запись через Cal.com',
        openInNewTab: 'Открыть запись в новой вкладке',
        embedFallback:
          'Встроенное расписание не настроено на этом стенде. Напишите через форму контакта или откройте страницу записи, когда команда подключит Cal.com.'
      },
      pricing: {
        heading: 'Простое, прозрачное ценообразование',
        subheading: 'Выберите план, подходящий вашим операциям',
        plans: [
          {
            name: 'Стартовый',
            price: '₽2 900',
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
            price: '₽9 900',
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
        billingToggleMonth: 'Месяц',
        billingToggleAnnual: '12 месяцев',
        billingToggleGroupLabel: 'Период оплаты',
        billedAnnuallyFootnote: 'Оплата за 12 месяцев',
        annualPrepayBubbleLabel: '−{percent}% за год',
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
      trust: {
        heading: 'Безопасность и данные',
        items: [
          {
            title:
              'С GDPR разбираемся там, где он реально касается вашего проекта'
          },
          {
            title:
              'В типовых сценариях сервис крутится на инфраструктуре в России — привычно для локальных команд'
          },
          {
            title:
              'Для российских организаций в процессах заложено то, что от вас ждёт 152-ФЗ'
          },
          {
            title:
              'На тарифе Enterprise в договоре можно зафиксировать до 99,9% доступности'
          },
          {
            title:
              'Данные идут по защищённым каналам, а храним их так, чтобы спать спокойнее'
          }
        ]
      },
      stickyMobileCta: {
        label: 'Начать бесплатно',
        ariaLabel: 'Открыть регистрацию для пробного периода'
      },
      testimonials: {
        heading: 'Что говорят команды'
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
              'API и более глубокие связки с системами записи, CRM и другими инструментами — по договорённости, без привязки к конкретному тарифу на сайте; далеко не каждый сценарий доступен «из коробки». Оставьте заявку через контакты на сайте или с менеджером — разберём, что уже можно подключить, а что потребует отдельной проработки.'
          },
          {
            question: 'Соответствует ли продукт GDPR и 152-ФЗ?',
            answer:
              'Мы проектируем КвоккаКю с учётом приватности и региональных требований. В типовых развёртываниях данные обрабатываются на инфраструктуре в России с процессами под 152-ФЗ. Для клиентов из ЕС возможны варианты хостинга и настроек под GDPR — обсудите с командой. Подробности — в Политике конфиденциальности.'
          },
          {
            question: 'Можно ли экспортировать данные?',
            answer:
              'Да — аналитика, отчёты и история талонов доступны для экспорта в CSV и PDF там, где это предусмотрено тарифом. После завершения подписки данные доступны в течение оговорённого периода; уточните детали у поддержки.'
          },
          {
            question: 'Есть ли помощь с переходом с другой системы?',
            answer:
              'Да: импорт данных, настройка под ваши процессы и обучение команды — по договорённости, не как фиксированный пакет в тарифе. Объём и сроки зависят от того, что у вас уже стоит; опишите это в заявке — предложим вариант и шаги.'
          },
          {
            question: 'Какие языки интерфейса поддерживаются?',
            answer:
              'Киоск и рабочие панели доступны на русском и английском. Дополнительные языки — по запросу и согласованию.'
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
        blog: 'Блог',
        roi: 'Оценка ожидания',
        cookieSettings: 'Настройки cookie',
        copyrightBrand: 'Богатырев В.С.',
        copyrightReserved: 'Все права защищены.'
      }
    },
    blog: {
      metaTitle: 'Блог',
      metaDescription:
        'Заметки про эксплуатацию очередей, госсектор и честную постановку ROI для сетей филиалов.',
      listHeading: 'Блог',
      listSubheading:
        'Короткие материалы для эксплуатации и ИТ — методология, заметки с площадок и понятные рамки для разговора об эффекте.',
      readMore: 'Читать статью',
      publishedPrefix: 'Опубликовано',
      listEmpty: 'Пока нет статей.',
      postBackToBlog: 'К списку статей',
      postNotFoundTitle: 'Статья не найдена',
      postNotFoundBody: 'Такого адреса нет или материал снят с публикации.'
    },
    roi: {
      metaTitle: 'Оценка ожидания «на салфетке»',
      metaDescription:
        'Три ползунка, два ориентира по часам и короткое жёлтое пояснение. Черновик для команды, а не обещание экономии в бюджете.',
      backToHome: 'На главную',
      heading: 'Оценка ожидания — черновик для разговора в команде',
      subheading:
        'Задайте посетителей в день, минуты ожидания и число точек. Ниже появятся два ориентира: суммарные часы ожидания гостей в месяц и условные часы нагрузки на людей — мы берём шесть процентов только как зацепку для беседы, не как прогноз по ФОТ. Цифры специально округлые. Перед тем как переносить их в бюджет, прочитайте вместе с финансами и эксплуатацией жёлтый блок под цифрами: там сказано, что считаем допущением.',
      disclaimer:
        'Это рабочая пометка для своих, а не строка для отчёта об «гарантированной экономии». Здесь нет инвестиционной рекомендации и нет гарантии от КвоккаКю. Результат по-прежнему определяют ваши процессы, люди на линии и то, как вы внедряете систему.',
      visitorsPerDay:
        'Сколько посетителей в среднем приходит на одну точку за день?',
      waitMinutes:
        'Сколько минут ожидания обычно ощущает человек в очереди сейчас?',
      locations: 'Сколько точек или филиалов берём в расчёт?',
      aggregateWaitLabel:
        'Ориентир по суммарным часам ожидания гостей за месяц',
      aggregateWaitHint:
        'Умножаем посетителей, минуты ожидания и число точек, переводим минуты в часы и берём примерно двадцать два рабочих дня в месяц. Это скорее снимок «насколько полна зона ожидания», а не табель «потерянного» персонала.',
      illustrativeStaffLabel:
        'Условные часы про нагрузку на людей — в месяц, для разговора',
      illustrativeStaffHint:
        'Мы специально берём шесть процентов от суммы часов ожидания выше — лишь чтобы завести беседу с руководителем линии, а не строить прогноз по фонду оплаты труда.',
      methodology:
        'Шесть процентов оставили как шпаргалку. Проведите рядом обычную неделю — сверки, срочные звонки, возвраты на круг. То, что заметите глазами, и подскажет своё число вместо нашего наброска.',
      hoursAbbrev: 'ч',
      minutesAbbrev: 'мин'
    },
    exitIntent: {
      title: 'Уже спешите? Совсем на пару слов',
      body: 'Мы не будем вас уговаривать. Если хочется спокойно посмотреть продукт или просто спросить — выберите, что удобнее: демо или письмо.',
      bookDemoCta: 'Записаться на демо',
      emailSalesCta: 'Написать нам',
      closeAriaLabel: 'Закрыть окно',
      mailtoSubject: 'Вопрос с сайта КвоккаКю'
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
