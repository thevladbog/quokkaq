import type { AppLocale } from '@/src/messages';

export type LegalSection = {
  heading: string;
  paragraphs: string[];
};

export type LegalPageDefinition = {
  title: string;
  description: string;
  sections: LegalSection[];
};

export type LegalPagesCopy = {
  backToHome: string;
  lastUpdatedLabel: string;
  lastUpdatedDisplay: string;
  footerNote: string;
  privacy: LegalPageDefinition;
  terms: LegalPageDefinition;
};

export const legalPages: Record<AppLocale, LegalPagesCopy> = {
  en: {
    backToHome: 'Back to home',
    lastUpdatedLabel: 'Last updated',
    lastUpdatedDisplay: 'April 20, 2026',
    footerNote:
      'This document is for information only and may change as the product evolves. For legal questions, contact us using the details below.',
    privacy: {
      title: 'Privacy Policy',
      description:
        'How QuokkaQ collects, uses, and protects personal data when you use our website and services.',
      sections: [
        {
          heading: '1. Who we are',
          paragraphs: [
            'QuokkaQ (“we”, “us”) provides queue-management software and related services. This policy describes how we handle personal data in connection with our marketing site and, where applicable, our cloud product.'
          ]
        },
        {
          heading: '2. Data we collect',
          paragraphs: [
            'We may collect identifiers you provide (such as name, email, company) when you contact sales, sign up for a trial, or subscribe to updates.',
            'We also collect technical data automatically: IP address, browser type, device identifiers, approximate location, and usage events needed for security, analytics, and service improvement.',
            'Personal data processed in our cloud product is stored on servers located in the Russian Federation, unless we notify you otherwise for a specific service.'
          ]
        },
        {
          heading: '3. How we use your data',
          paragraphs: [
            'We use data to provide and improve the service, respond to requests, authenticate users, bill subscriptions, send transactional messages, comply with law, and protect our systems from abuse.'
          ]
        },
        {
          heading: '4. Cookies, Google Tag Manager, and analytics',
          paragraphs: [
            'We use cookies and local storage for essential functions of this site (for example language preference and theme). You can control cookies in your browser; some features may not work if you disable them.',
            'If you accept non-essential cookies via the banner on this site, we load Google Tag Manager (GTM). Through GTM we may run Google Analytics (GA4) and Yandex Metrica to measure traffic and improve the site. Those tools may set their own cookies or use similar storage; they receive technical data from your browser (such as a client identifier, page URL, and interaction events) in line with their documentation.',
            'Until you opt in, GTM and those analytics tags are not loaded; we still set a small cookie to remember your choice. You can change your mind by clearing site cookies for this domain; the banner may appear again on your next visit if no choice is stored.'
          ]
        },
        {
          heading: '5. Sharing',
          paragraphs: [
            'We use subprocessors (for example hosting, email, analytics) under contracts that require appropriate safeguards. We do not sell your personal data.',
            'When you consent to analytics on this marketing site, data is processed by Google (Google Tag Manager / Google Analytics) and Yandex (Yandex Metrica) as described in their policies. That processing is separate from storage of your product account data on our servers in the Russian Federation.',
            'We may disclose information if required by law or to protect the rights, safety, and security of QuokkaQ, our customers, or the public.'
          ]
        },
        {
          heading: '6. Retention',
          paragraphs: [
            'We retain personal data only as long as needed for the purposes above, including legal, accounting, and dispute-resolution requirements, then delete or anonymize it where possible.'
          ]
        },
        {
          heading: '7. Your rights',
          paragraphs: [
            'Depending on your location, you may have rights to access, correct, delete, or export your data, and to object to or restrict certain processing. Contact us to exercise these rights.'
          ]
        },
        {
          heading: '8. International transfers',
          paragraphs: [
            'Personal data stored for our product is hosted in the Russian Federation as stated above.',
            'Analytics and tag services loaded after your consent (Google Tag Manager, Google Analytics, Yandex Metrica) may involve processing outside Russia depending on the provider and your region; those providers describe their locations and safeguards in their own documentation. Where standard contractual clauses or other mechanisms apply, we rely on them where required by applicable law.'
          ]
        },
        {
          heading: '9. Children',
          paragraphs: [
            'Our services are not directed at children under 16, and we do not knowingly collect their personal data.'
          ]
        },
        {
          heading: '10. Changes',
          paragraphs: [
            'We may update this policy from time to time. We will post the revised version on this page and adjust the “Last updated” date.'
          ]
        },
        {
          heading: '11. Contact',
          paragraphs: [
            'For privacy questions: sales@quokkaq.com (or the contact channel shown on this site).'
          ]
        }
      ]
    },
    terms: {
      title: 'Terms of Service',
      description:
        'Terms that govern your use of the QuokkaQ website and related services.',
      sections: [
        {
          heading: '1. Agreement',
          paragraphs: [
            'By accessing or using our website or services, you agree to these Terms. If you use the product on behalf of an organization, you confirm you have authority to bind that organization.'
          ]
        },
        {
          heading: '2. The service',
          paragraphs: [
            'QuokkaQ provides software and related services as described in your order, agreement, or in-product documentation. Features may change as we ship improvements.'
          ]
        },
        {
          heading: '3. Accounts and security',
          paragraphs: [
            'You are responsible for safeguarding credentials and for activity under your account. Notify us promptly of any unauthorized use.'
          ]
        },
        {
          heading: '4. Acceptable use',
          paragraphs: [
            'You may not misuse the service (for example: unlawful activity, attempting to breach security, overloading systems, or interfering with other customers). We may suspend access for violations.'
          ]
        },
        {
          heading: '5. Customer data',
          paragraphs: [
            'You retain rights in data you submit to the service. You grant us a limited license to host, process, and display that data solely to provide and improve the service, as further described in agreements and our Privacy Policy.'
          ]
        },
        {
          heading: '6. Third-party services',
          paragraphs: [
            'Integrations or links to third parties are governed by their own terms. We are not responsible for third-party services you choose to enable.'
          ]
        },
        {
          heading: '7. Fees and trials',
          paragraphs: [
            'Paid plans are billed according to the pricing and billing terms presented at purchase. Trials may convert to paid subscriptions unless cancelled as instructed in-product or in your order.'
          ]
        },
        {
          heading: '8. Disclaimers',
          paragraphs: [
            'The service is provided on an “as is” basis to the maximum extent permitted by law. We disclaim implied warranties where allowed.'
          ]
        },
        {
          heading: '9. Limitation of liability',
          paragraphs: [
            'To the maximum extent permitted by law, our aggregate liability arising out of these Terms or the service will not exceed the amounts you paid us in the twelve months before the claim (or, if none, fifty USD).'
          ]
        },
        {
          heading: '10. Termination',
          paragraphs: [
            'You may stop using the service in line with your subscription terms. We may suspend or terminate access for breach, risk, or legal reasons, with notice where practicable.'
          ]
        },
        {
          heading: '11. Governing law',
          paragraphs: [
            'Unless otherwise agreed in writing, these Terms are governed by the laws applicable to your contracting entity as stated in your order, or otherwise the laws of the jurisdiction where QuokkaQ operates, excluding conflict-of-law rules.'
          ]
        },
        {
          heading: '12. Changes',
          paragraphs: [
            'We may update these Terms. For material changes, we will provide reasonable notice where required. Continued use after changes take effect constitutes acceptance.'
          ]
        },
        {
          heading: '13. Contact',
          paragraphs: [
            'Questions about these Terms: sales@quokkaq.com (or the contact channel shown on this site).'
          ]
        }
      ]
    }
  },
  ru: {
    backToHome: 'На главную',
    lastUpdatedLabel: 'Дата обновления',
    lastUpdatedDisplay: '20 апреля 2026 г.',
    footerNote:
      'Документ носит информационный характер и может обновляться по мере развития продукта. По юридическим вопросам свяжитесь с нами указанным ниже способом.',
    privacy: {
      title: 'Политика конфиденциальности',
      description:
        'Как КвоккаКю собирает, использует и защищает персональные данные при использовании сайта и сервисов.',
      sections: [
        {
          heading: '1. Кто мы',
          paragraphs: [
            'КвоккаКю («мы») предоставляет программное обеспечение для управления очередями и связанные сервисы. Настоящая политика описывает обработку персональных данных в связи с маркетинговым сайтом и, при применимости, облачным продуктом.'
          ]
        },
        {
          heading: '2. Какие данные мы собираем',
          paragraphs: [
            'Мы можем обрабатывать идентификаторы, которые вы указываете сами (например, имя, email, компания) при обращении в продажи, регистрации пробного периода или подписке на рассылку.',
            'Автоматически собираются технические данные: IP-адрес, тип браузера, идентификаторы устройства, приблизительное местоположение и события использования — для безопасности, аналитики и улучшения сервиса.',
            'Персональные данные, обрабатываемые в облачном продукте, хранятся на серверах, расположенных на территории Российской Федерации, если для отдельной услуги не указано иное.'
          ]
        },
        {
          heading: '3. Зачем мы используем данные',
          paragraphs: [
            'Данные используются для предоставления и улучшения сервиса, ответов на запросы, аутентификации, выставления счетов, транзакционных уведомлений, соблюдения закона и защиты наших систем от злоупотреблений.'
          ]
        },
        {
          heading: '4. Cookie, Google Tag Manager и аналитика',
          paragraphs: [
            'Мы используем cookie и локальное хранилище для работы сайта (например, язык и тема). Настройки cookie можно изменить в браузере; часть функций может стать недоступна при их отключении.',
            'Если вы соглашаетесь на необязательные cookie через плашку на этом сайте, подключается Google Tag Manager (GTM). Через GTM могут запускаться Google Analytics (GA4) и Яндекс Метрика для оценки трафика и улучшения сайта. Указанные инструменты могут устанавливать собственные cookie или использовать похожие технологии; в браузер передаются технические данные (в том числе идентификатор клиента, URL страницы, события взаимодействия) в соответствии с документацией соответствующих сервисов.',
            'Пока вы не дали согласие, GTM и перечисленные теги аналитики не загружаются; мы можем записать небольшой cookie, чтобы запомнить ваш выбор. Отозвать согласие можно, удалив cookie сайта для этого домена; при следующем визите плашка может снова отобразиться, если выбор не сохранён.'
          ]
        },
        {
          heading: '5. Передача третьим лицам',
          paragraphs: [
            'Мы привлекаем подрядчиков (хостинг, почта, аналитика) на условиях договоров с надлежащими гарантиями. Мы не продаём персональные данные.',
            'Если вы дали согласие на аналитику на маркетинговом сайте, обработка может осуществляться Google (Google Tag Manager / Google Analytics) и Яндексом (Яндекс Метрика) на условиях их политик. Это отдельно от хранения данных учётной записи продукта на наших серверах в Российской Федерации.',
            'Раскрытие информации возможно по требованию закона либо для защиты прав, безопасности КвоккаКю, клиентов или общества.'
          ]
        },
        {
          heading: '6. Хранение',
          paragraphs: [
            'Данные хранятся не дольше, чем нужно для указанных целей, включая требования закона, учёта и разрешения споров, после чего удаляются или обезличиваются, насколько это возможно.'
          ]
        },
        {
          heading: '7. Ваши права',
          paragraphs: [
            'В зависимости от применимого закона вы можете иметь право на доступ, исправление, удаление или выгрузку данных, а также на возражение или ограничение обработки. Для реализации прав свяжитесь с нами.'
          ]
        },
        {
          heading: '8. Трансграничная передача',
          paragraphs: [
            'Персональные данные, размещаемые в продукте, хранятся на серверах на территории Российской Федерации, как указано выше.',
            'Сервисы аналитики и тегов, подключаемые после вашего согласия (Google Tag Manager, Google Analytics, Яндекс Метрика), могут включать обработку за пределами России в зависимости от провайдера и региона; сведения о локализации и мерах приводятся в документации соответствующих сервисов. Где применимы стандартные договорные условия или иные механизмы, мы опираемся на них при необходимости по применимому праву.'
          ]
        },
        {
          heading: '9. Дети',
          paragraphs: [
            'Сервисы не предназначены для детей младше 16 лет; мы сознательно не собираем их персональные данные.'
          ]
        },
        {
          heading: '10. Изменения политики',
          paragraphs: [
            'Мы можем обновлять политику. Актуальная версия публикуется на этой странице; дата обновления указана выше.'
          ]
        },
        {
          heading: '11. Контакты',
          paragraphs: [
            'Вопросы по конфиденциальности: sales@quokkaq.com (или канал связи, указанный на сайте).'
          ]
        }
      ]
    },
    terms: {
      title: 'Условия использования',
      description: 'Условия использования сайта КвоккаКю и связанных сервисов.',
      sections: [
        {
          heading: '1. Согласие',
          paragraphs: [
            'Используя сайт или сервисы, вы принимаете настоящие Условия. Если вы действуете от имени организации, вы подтверждаете полномочия заключать договор от её имени.'
          ]
        },
        {
          heading: '2. Сервис',
          paragraphs: [
            'КвоккаКю предоставляет ПО и сопутствующие услуги в объёме, описанном в заказе, соглашении или документации в продукте. Функциональность может меняться по мере развития продукта.'
          ]
        },
        {
          heading: '3. Учётные записи и безопасность',
          paragraphs: [
            'Вы отвечаете за сохранность учётных данных и за действия в аккаунте. Сообщайте нам о несанкционированном доступе без промедления.'
          ]
        },
        {
          heading: '4. Допустимое использование',
          paragraphs: [
            'Запрещено злоупотреблять сервисом (незаконная деятельность, попытки взлома, перегрузка систем, вмешательство в работу других клиентов). При нарушениях доступ может быть приостановлен.'
          ]
        },
        {
          heading: '5. Данные клиента',
          paragraphs: [
            'Права на данные, которые вы передаёте в сервис, сохраняются за вами. Вы предоставляете нам ограниченную лицензию на хостинг, обработку и отображение этих данных исключительно для оказания и улучшения сервиса — в рамках договоров и Политики конфиденциальности.'
          ]
        },
        {
          heading: '6. Сторонние сервисы',
          paragraphs: [
            'Интеграции и ссылки на третьих лиц регулируются их условиями. Мы не отвечаем за сервисы третьих лиц, которые вы подключаете добровольно.'
          ]
        },
        {
          heading: '7. Оплата и пробные периоды',
          paragraphs: [
            'Платные тарифы оплачиваются на условиях, указанных при оформлении. Пробный период может перейти в платную подписку, если не отменён согласно инструкциям в продукте или в заказе.'
          ]
        },
        {
          heading: '8. Отказ от гарантий',
          paragraphs: [
            'Сервис предоставляется «как есть» в максимально допустимой законом степени; подразумеваемые гарантии исключаются там, где это разрешено.'
          ]
        },
        {
          heading: '9. Ограничение ответственности',
          paragraphs: [
            'В максимально допустимой законом степени совокупная ответственность по настоящим Условиям или сервису ограничивается суммой ваших платежей нам за двенадцать месяцев до претензии (либо, при отсутствии платежей, эквивалентом 50 USD).'
          ]
        },
        {
          heading: '10. Прекращение',
          paragraphs: [
            'Вы можете прекратить использование в соответствии с условиями подписки. Мы можем приостановить или прекратить доступ при нарушении, риске или по требованию закона — с уведомлением, где это возможно.'
          ]
        },
        {
          heading: '11. Применимое право',
          paragraphs: [
            'Если иное не согласовано в письменной форме, к Условиям применяется право юрисдикции, указанной в вашем заказе, либо право страны, в которой действует КвоккаКю, без коллизионных норм.'
          ]
        },
        {
          heading: '12. Изменения',
          paragraphs: [
            'Мы можем обновлять Условия. О существенных изменениях сообщим разумным способом, если это требуется. Продолжение использования после вступления изменений означает согласие.'
          ]
        },
        {
          heading: '13. Контакты',
          paragraphs: [
            'Вопросы по Условиям: sales@quokkaq.com (или канал связи на сайте).'
          ]
        }
      ]
    }
  }
};
