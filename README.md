# VIZO OPTIC Booking

Одностраничный сайт с записью на проверку зрения, Node.js backend и PostgreSQL 17.

## Запуск в Docker

```bash
docker compose up --build
```

Сайт будет доступен по адресу:

```text
http://localhost:3000
```

## API

- `POST /api/bookings` - создать запись.
- `GET /api/slots?date=YYYY-MM-DD` - получить доступные слоты.

Запись работает с 09:00 до 18:30, шаг слота - 15 минут.
