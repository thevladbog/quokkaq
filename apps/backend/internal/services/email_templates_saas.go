package services

// SaaS-related email templates

const TrialEndingEmailTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Пробный период заканчивается</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
        <h1 style="color: #2c3e50; margin-bottom: 20px;">Ваш пробный период заканчивается</h1>
        <p>Здравствуйте, {{company_name}}!</p>
        <p>Ваш пробный период подписки <strong>{{plan_name}}</strong> заканчивается <strong>{{trial_end_date}}</strong>.</p>
        <p>Чтобы продолжить использование QuokkaQ без перерывов, пожалуйста, добавьте способ оплаты.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{{billing_url}}" style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Настроить оплату</a>
        </div>
        <p style="color: #7f8c8d; font-size: 14px;">Если у вас есть вопросы, свяжитесь с нами по адресу support@quokkaq.com</p>
    </div>
</body>
</html>
`

const PaymentSucceededEmailTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Платеж успешно обработан</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
        <h1 style="color: #27ae60; margin-bottom: 20px;">✓ Платеж успешно обработан</h1>
        <p>Здравствуйте, {{company_name}}!</p>
        <p>Мы получили ваш платеж на сумму <strong>{{amount}} {{currency}}</strong> за подписку <strong>{{plan_name}}</strong>.</p>
        <div style="background-color: white; border-radius: 5px; padding: 20px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Счет:</strong> #{{invoice_id}}</p>
            <p style="margin: 5px 0;"><strong>Дата платежа:</strong> {{payment_date}}</p>
            <p style="margin: 5px 0;"><strong>Следующий платеж:</strong> {{next_billing_date}}</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{{invoice_url}}" style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Просмотреть счет</a>
        </div>
        <p style="color: #7f8c8d; font-size: 14px;">Спасибо за использование QuokkaQ!</p>
    </div>
</body>
</html>
`

const PaymentFailedEmailTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ошибка обработки платежа</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #fff5f5; border: 2px solid #e74c3c; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
        <h1 style="color: #e74c3c; margin-bottom: 20px;">⚠ Не удалось обработать платеж</h1>
        <p>Здравствуйте, {{company_name}}!</p>
        <p>К сожалению, мы не смогли обработать платеж на сумму <strong>{{amount}} {{currency}}</strong> для вашей подписки <strong>{{plan_name}}</strong>.</p>
        <div style="background-color: white; border-radius: 5px; padding: 20px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Причина:</strong> {{failure_reason}}</p>
            <p style="margin: 5px 0;"><strong>Попытка:</strong> {{retry_count}} из {{max_retries}}</p>
        </div>
        <p><strong>Что делать:</strong></p>
        <ul>
            <li>Проверьте данные вашей карты</li>
            <li>Убедитесь, что на счету достаточно средств</li>
            <li>Обновите способ оплаты, если необходимо</li>
        </ul>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{{billing_url}}" style="background-color: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Обновить способ оплаты</a>
        </div>
        <p style="color: #7f8c8d; font-size: 14px;">Если проблема сохраняется, свяжитесь с нами: support@quokkaq.com</p>
    </div>
</body>
</html>
`

const SubscriptionCanceledEmailTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Подписка отменена</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
        <h1 style="color: #2c3e50; margin-bottom: 20px;">Подписка отменена</h1>
        <p>Здравствуйте, {{company_name}}!</p>
        <p>Ваша подписка <strong>{{plan_name}}</strong> была отменена.</p>
        <p>Вы сможете продолжать использовать QuokkaQ до <strong>{{access_until_date}}</strong>.</p>
        <p>После этой даты ваш аккаунт будет переведен в режим ограниченного доступа.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{{reactivate_url}}" style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Возобновить подписку</a>
        </div>
        <p>Нам жаль, что вы уходите. Если у вас есть отзывы о нашем сервисе, мы будем рады их услышать.</p>
        <p style="color: #7f8c8d; font-size: 14px;">Свяжитесь с нами: support@quokkaq.com</p>
    </div>
</body>
</html>
`

const QuotaExceededEmailTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Превышение лимита</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #fff5e6; border: 2px solid #f39c12; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
        <h1 style="color: #f39c12; margin-bottom: 20px;">⚠ Превышение лимита</h1>
        <p>Здравствуйте, {{company_name}}!</p>
        <p>Вы достигли лимита по метрике <strong>{{metric_name}}</strong> в вашем тарифном плане <strong>{{plan_name}}</strong>.</p>
        <div style="background-color: white; border-radius: 5px; padding: 20px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Текущее использование:</strong> {{current_usage}}</p>
            <p style="margin: 5px 0;"><strong>Лимит тарифа:</strong> {{quota_limit}}</p>
            <p style="margin: 5px 0;"><strong>Превышение:</strong> {{exceeded_by}}</p>
        </div>
        <p><strong>Что это означает:</strong></p>
        <ul>
            <li>Некоторые функции могут быть ограничены</li>
            <li>Для снятия ограничений обновите тарифный план</li>
        </ul>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{{upgrade_url}}" style="background-color: #f39c12; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Обновить тариф</a>
        </div>
        <p style="color: #7f8c8d; font-size: 14px;">Вопросы? Напишите нам: support@quokkaq.com</p>
    </div>
</body>
</html>
`
