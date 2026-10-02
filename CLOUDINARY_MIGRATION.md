# Pink Run — перенос квитанций из PostgreSQL в Cloudinary

## Что изменено

- Новые JPG/PNG/PDF квитанции загружаются в Cloudinary (`pinkrun/receipts`).
- PostgreSQL хранит только URL и служебные метаданные файла.
- `receipt_data` для новых загрузок всегда очищается (`NULL`).
- Старые квитанции, уже находящиеся в `receipt_data`, продолжают открываться.
- При повторной загрузке нового чека предыдущий Cloudinary-файл удаляется.
- Endpoint сайта не менялся:
  - `POST /api/payment-claim`
  - `GET /api/payment-claim/:participantId/receipt`

## Перед deploy

В Render у backend должна быть переменная `CLOUDINARY_URL` вида:

`cloudinary://API_KEY:API_SECRET@CLOUD_NAME`

Секрет нельзя хранить в GitHub.

## Проверка после deploy

1. Создать тестовую регистрацию.
2. Загрузить JPG/PNG/PDF чек.
3. Убедиться, что статус стал `payment_review`.
4. В Cloudinary → Media Library должен появиться файл в `pinkrun/receipts`.
5. Проверить открытие чека через существующий интерфейс организатора.
6. В PostgreSQL у новой записи `receipt_data` должен быть `NULL`, а `receipt_url` — заполнен.

## Важно

Старые бинарные чеки автоматически не удаляются из PostgreSQL, чтобы не потерять данные.
После успешной проверки новой схемы их можно отдельно перенести/очистить.
