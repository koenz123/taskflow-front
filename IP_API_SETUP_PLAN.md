# План: настроить обращения к API по IP (регистрация/вход/и т.д.)

Нужно разделить две вещи:

- **`root` в nginx** — это **папка со статикой фронта** (например, `.../dist`).
- **API** — это **HTTP-запросы** из браузера (например, `/auth/register`, `/goals`, `/videos`), они **не имеют отношения** к папке `root`.

Во фронте уже есть единая логика выбора базового URL API:

- В большинстве модулей используется \(упрощённо\): `import.meta.env.VITE_API_BASE ?? '/api'`
- То есть можно либо **задать IP в `VITE_API_BASE`**, либо оставить **`/api` и проксировать через nginx**.

## Какие API-роуты реально используются сейчас

По коду фронта запросы идут на такие пути:

- **Auth/регистрация/верификация**:
  - `POST /auth/send-verification`
  - `POST /auth/register`
  - `GET /auth/verify-email?token=...`
  - `GET /auth/is-verified?email=...`
  - `POST /auth/consume-pending`
- **Goals**:
  - `POST /goals` (передаётся заголовок `x-user-id`)
- **Works/видео/файлы**:
  - `GET /users/:userId/works`
  - `POST /videos` (multipart, иногда через `XMLHttpRequest`)
  - `DELETE /videos/:workId`
  - `PATCH /videos/:workId`
- **Translate**:
  - `POST /translate`

## Сначала уточни 1 вещь про бэк

Определи, как у бэка устроен префикс:

- **Вариант A**: эндпоинты доступны как `http://<IP>:<PORT>/auth/register` (БЕЗ `/api`)
- **Вариант B**: эндпоинты доступны как `http://<IP>:<PORT>/api/auth/register` (С `/api`)

От этого зависит, чему равен `VITE_API_BASE` или как писать `proxy_pass`.

Проверка (на сервере):

```bash
curl -i "http://<IP>:<PORT>/auth/is-verified?email=test@example.com"
curl -i "http://<IP>:<PORT>/api/auth/is-verified?email=test@example.com"
```

## Рекомендуемый способ (стабильный): nginx как reverse-proxy на IP бэка

Плюсы:

- **нет CORS-проблем** (всё с одного домена)
- фронт ходит на **`/api/...`**, а nginx проксирует на **IP:PORT**
- не нужно “вшивать” IP в сборку (можно оставить дефолт `/api`)

### Шаги

1) **Сборка и размещение статики**

- Собери фронт: `npm ci && npm run build`
- Скопируй `dist/` в папку, доступную nginx, например:
  - `/var/www/nativki/dist`

2) **nginx-конфиг: статика + прокси `/api/`**

Ниже шаблон. ВАЖНО: `location /api/` должен быть **выше**, чем `location /`.

```nginx
server {
    listen 80;
    server_name nativki.ru www.nativki.ru;

    root /var/www/nativki/dist;
    index index.html;

    # Для загрузки видео/файлов увеличь лимит под свои нужды
    client_max_body_size 200m;

    # API прокси (фронт вызывает /api/..., nginx гонит на IP:PORT бэка)
    location /api/ {
        # Вариант 1 (если бэк слушает БЕЗ /api): проксируем /api/* -> /*:
        # proxy_pass http://<BACKEND_IP>:<BACKEND_PORT>/;

        # Вариант 2 (если бэк слушает С /api): проксируем /api/* -> /api/*:
        proxy_pass http://<BACKEND_IP>:<BACKEND_PORT>/api/;

        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Если загрузки большие/долгие — полезно:
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        # proxy_request_buffering off; # включай, если нужно стримить upload без буферизации
    }

    # Важно: index.html не кэшировать — после каждого деплоя браузер должен
    # получить новый index.html со ссылками на актуальные index-XXXXX.js/css.
    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # SPA: все неизвестные пути отдаём на index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

3) **Настрой `VITE_API_BASE`**

Для прокси-способа в проде обычно **лучше НЕ задавать IP**, а оставить относительный путь:

- `VITE_API_BASE=/api`

Важно: `VITE_API_BASE` **вшивается на этапе сборки** (Vite). Если поменять `.env` после `npm run build`, фронт **не начнёт** автоматически ходить по новому адресу — нужно пересобрать.

4) **Проверка**

```bash
nginx -t && systemctl reload nginx

# фронт
curl -I "http://nativki.ru/"

# API через прокси (подставь реальный путь, который точно есть на бэке)
curl -i "http://nativki.ru/api/auth/is-verified?email=test@example.com"
```

Если в ответах API 404 — значит не угадали с вариантом `proxy_pass` (с `/api` или без).

## Альтернатива (не рекомендую): фронт напрямую ходит на IP бэка

Схема: фронт с домена делает запросы на `http://<IP>:<PORT>` (или `https://...`).

### Что нужно сделать

1) В `.env` (или `.env.production`) выставить:

- если бэк БЕЗ `/api`: `VITE_API_BASE=http://<IP>:<PORT>`
- если бэк С `/api`: `VITE_API_BASE=http://<IP>:<PORT>/api`

2) Пересобрать фронт: `npm run build`, заново задеплоить `dist`.

3) На бэке обязательно настроить **CORS**:

- `Access-Control-Allow-Origin: http(s)://nativki.ru` (не `*`, если есть куки/авторизация)
- разрешить методы: `GET,POST,PATCH,DELETE,OPTIONS`
- разрешить заголовки, которые используете (например `Content-Type`, `x-user-id`)

4) Если фронт будет по HTTPS, а API по HTTP-IP — браузер заблокирует запросы как **mixed content**. Тогда нужен либо HTTPS на бэке, либо прокси через nginx.

## Мини-чеклист “почему не работает регистрация/вход”

- nginx `root` указывает на правильную статику `.../dist` и nginx имеет права читать `/var/www/...`
- `VITE_API_BASE` соответствует реальному префиксу бэка (`/api` или без)
- если API не через прокси — CORS на бэке настроен
- если есть загрузки файлов — `client_max_body_size` достаточно большой
- при ошибках смотри: `/var/log/nginx/error.log`

