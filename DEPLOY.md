# Деплой фронта на сервер (обновления должны сразу отображаться)

## Почему в Network нет `index-D3csF0aq.js` и виден старый текст

После `npm run build` в `dist/` лежат:
- `index.html` — в нём прописано, какой именно JS грузить, например: `src="/assets/index-D3csF0aq.js"`.
- `assets/index-D3csF0aq.js` и `assets/index-BgG8guDO.css` — текущий билд.

Браузер запрашивает **только то, что указано в `index.html`**. Если на сервере лежит **старый** `index.html` (со ссылкой на `index-C2OCimPA.js` или другими файлами), то в Network будут именно эти старые файлы, а твой новый `index-D3csF0aq.js` не будет запрашиваться вообще.

Итог: на сервере должен быть **один актуальный билд** — и `index.html`, и все файлы из `dist/assets/` от **одной и той же** сборки. При каждом обновлении заменяй **весь** `dist`.

---

## Как правильно пушить обновления

### Вариант A: сборка на сервере (git pull + build)

1. На сервере:
   ```bash
   cd /path/to/taskflow-front   # твой репозиторий
   git pull
   npm ci --omit=dev            # или npm install, если без ci
   npm run build:clean          # очищает dist и собирает заново
   ```
2. Nginx должен смотреть в `root` на этот самый `dist` (например `.../taskflow-front/dist`).
3. В nginx для `index.html` должен быть заголовок без кэша (см. ниже), иначе пользователи ещё какое-то время будут получать старый `index.html`.

### Вариант B: сборка локально, выкладка на сервер

1. Локально:
   ```bash
   npm run build:clean
   ```
2. Залей на сервер **целиком** папку `dist` (и `index.html`, и всё из `dist/assets/`), например:
   ```bash
   rsync -av --delete dist/ user@server:/var/www/taskflow-front/dist/
   ```
   Важно: не копируй только один новый `.js` — копируй весь `dist`, чтобы на сервере не осталось старых `index-*.js` и чтобы `index.html` всегда соответствовал файлам в `assets/`.

---

## Nginx: не кэшировать index.html

Чтобы после каждого деплоя пользователи получали новый `index.html` (и соответственно новый скрипт), добавь в конфиг nginx блок для `index.html` с заголовком без кэша — пример уже добавлен в `IP_API_SETUP_PLAN.md` (location для `/index.html` с `Cache-Control: no-store, no-cache`). После правок:

```bash
nginx -t && systemctl reload nginx
```

---

## Краткий чеклист

- [ ] При деплое заменяется **весь** `dist` (и `index.html`, и все файлы в `assets/`).
- [ ] На сервере нет «смеси» старого и нового билда (один билд = один набор имён файлов).
- [ ] В nginx для `index.html` выставлен `Cache-Control: no-store, no-cache` (или аналог).
- [ ] После деплоя в браузере с «Disable cache» в DevTools виден один основной скрипт из текущего билда (например `index-D3csF0aq.js`) и актуальный текст (например «Sign in LOOOL»).
