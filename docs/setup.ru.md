# Proof of Build

Честные хакатоны на Solana (devnet): призы и залоги лежат в контракте, каждый день с коммитом = «огонёк» on-chain.

```
programs/proof_of_build/   Anchor-программа (Rust)
tests/                     тесты контракта (bankrun, 36 шт., включая атаки)
idl/                       IDL + TS-типы + README для фронтенда
backend/                    Fastify + Prisma + PostgreSQL (оракул, GitHub, письма, REST API)
frontend/                       Vite + React + TypeScript + Tailwind (фронтенд)
```

## 1. Контракт

Нужны Rust, Agave CLI 2.1.x, Anchor CLI 0.31.1.

```bash
anchor build
npx ts-mocha -p ./tsconfig.json -t 1000000 'tests/**/*.ts'   # или: npm test
```

`Cargo.lock` закоммичен и пинит зависимости под rustc 1.79 из platform-tools (blake3 1.5.5 и др.).
Не удаляй его: иначе сборка упадёт на пакетах с `edition2024`.

### Деплой в devnet (~2.3 SOL на аренду программы + комиссии)

```bash
solana config set --url devnet
solana address                     # пополнить через https://faucet.solana.com (вход через GitHub даёт больше)
anchor deploy --provider.cluster devnet
```

Program ID: `8GYmgRJ9iRNE9kmBf5HkAfMu23Fdh6ES8XvXMbNdYvJw` (ключ в `target/deploy/proof_of_build-keypair.json`, сохрани его).

## 2. Сервер

> **Сервер должен быть запущен всё время, пока работает сайт.** Вход через GitHub, списки хакатонов,
> команды и огоньки идут через него. Локально это терминал с `npm run dev`: закрыл его, и сайт
> показывает «The server at http://localhost:3000 is not responding». Для демо сервер
> деплоится на хостинг (раздел 4).

### Шаг 1. `.env`

`backend/.env` уже создан. Сгенерированы `JWT_SECRET`, `GITHUB_ID_SALT`, `GITHUB_WEBHOOK_SECRET`, а ключ оракула
лежит в `backend/oracle.json` (в `.gitignore`, не коммитить). На новой машине: `cp .env.example .env`
и сгенерировать секреты через `openssl rand -hex 32`.

Заполнить вручную нужно пять значений, без них сервер не стартует:

| Переменная | Откуда |
|---|---|
| `DATABASE_URL` | supabase.com → проект → **Connect → ORMs → Prisma**: строка с портом 6543 и `?pgbouncer=true`, подставить пароль |
| `DIRECT_URL` | там же, строка с портом 5432 (для миграций), подставить пароль. Локально = `DATABASE_URL` |
| `GITHUB_APP_ID`, `GITHUB_CLIENT_ID` | страница GitHub App (шаг 2) |
| `GITHUB_CLIENT_SECRET` | страница GitHub App → Generate a new client secret |
| `GITHUB_APP_PRIVATE_KEY` | страница GitHub App → Generate a private key → `npm run set-github-key -- ~/Downloads/<имя>.private-key.pem` |
| `RESEND_API_KEY` | необязательно, resend.com. Без ключа письма только хешируются и записываются в сеть. |

Оракул платит аренду за каждый огонёк: пополни его адрес (`solana-keygen pubkey oracle.json`) на ~0.5 SOL через faucet.solana.com.

### Шаг 2. GitHub App

github.com → Settings → Developer settings → GitHub Apps → **New GitHub App**:

| Поле | Значение (локально) |
|---|---|
| Homepage URL | `http://localhost:5173` |
| Callback URL | `http://localhost:3000/auth/github/callback` |
| Webhook URL | `{PUBLIC_URL}/webhooks/github` (локально через туннель, см. ниже) |
| Webhook secret | `GITHUB_WEBHOOK_SECRET` из `.env` |
| Repository permissions | Contents: Read-only, Metadata: Read-only |
| Account permissions | Email addresses: Read-only |
| Subscribe to events | Push |

GitHub не достучится до `localhost`, поэтому для огоньков локально нужен туннель: `npx smee-client`
или `cloudflared tunnel --url http://localhost:3000`. Его адрес указывается в Webhook URL.
Вход через GitHub работает и без туннеля.

### Шаг 3. Запуск

```bash
cd backend
npm install
npx prisma migrate deploy   # создать таблицы (один раз и после обновлений схемы)
npm run dev                 # http://localhost:3000/health, держать терминал открытым
npm test                    # 27 тестов (без БД и сети)
```

### Демо-хакатон

```bash
cd backend
npm run devnet:setup -- --days 3 --fires 2 --deposit 10 --prize 1000
```

Создаёт тестовый USDC-mint (организатор может минтить) и хакатон (регистрация по умолчанию 24 ч, `--registration-hours N`). Дальше организатор вызывает `POST /hackathons { address, title }`.

Раздать тестовые токены кошелькам (например, Phantom организатора и участников), не создавая хакатон:

```bash
npm run devnet:setup -- --mint <mint> --fund <кошелёк1,кошелёк2> --amount 5000 --no-hackathon
```

## 3. Фронтенд

```bash
cd frontend
cp .env.example .env      # VITE_API_URL — адрес сервера, VITE_DEFAULT_MINT — mint из devnet:setup
npm install --legacy-peer-deps
npm run dev               # http://localhost:5173 (FRONTEND_URL сервера должен совпадать)
npm run build             # статика в frontend/dist → Vercel / Netlify / любой хостинг
```

Страницы: `/` лендинг, `/hackathons` список с фильтрами, `/hackathons/:id` детали и вступление,
`/create` создание хакатона (перевод приза в vault), `/dashboard` командный дашборд
(огоньки, коммиты, команда, сертификаты, claim), `/hackathons/:id/admin` админка
(метки, победители, finalize), `/verify/:hash` проверка письма, `/account` GitHub + кошелёк.

При хостинге SPA все пути должны отдавать `index.html` (на Vercel это делается автоматически через rewrites, на Netlify через `_redirects`).

## 4. Деплой для работы 24/7

| Что | Где | Настройки |
|---|---|---|
| База | Supabase | уже есть после шага 1 |
| Сервер | Railway или Render | Root: `server` · Build: `npm ci && npx prisma generate && npm run build` · Start: `npx prisma migrate deploy && npm start` · переменные из `.env` в разделе Variables/Environment |
| Сайт | Vercel | Root: `web` · Install: `npm install --legacy-peer-deps` · `VITE_API_URL=https://<адрес сервера>` |

После деплоя:
1. В `.env` на хостинге: `PUBLIC_URL=https://<адрес сервера>`, `FRONTEND_URL=https://<адрес сайта>`.
2. В GitHub App: Homepage, Callback и Webhook URL заменить на новые адреса.

Бесплатный Render засыпает после 15 минут простоя: первый запрос ждёт ~30 с, а вебхуки в это время могут
потеряться. Для демо лучше Railway или платный тариф. Контракт от сервера не зависит: даже если
сервер лежит, деньги остаются в vault, а `claim` работает.

## Открыть с телефона (временный публичный адрес)

Сайт проксирует `/api` на сервер (`frontend/vite.config.ts`), поэтому хватает одного туннеля:

```bash
cloudflared tunnel --url http://localhost:5173     # выдаст https://<имя>.trycloudflare.com = F
```

1. `frontend/.env`: `VITE_API_URL=/api`.
2. `backend/.env`: `FRONTEND_URL=F`, `PUBLIC_URL=F/api`. Перезапустить сервер и сайт.
3. GitHub App → Redirect URI: добавить `F/api/auth/github/callback`; Webhook URL: `F/api/webhooks/github`.
4. На телефоне открыть F **во встроенном браузере Phantom** (вкладка 🌐). В обычном мобильном браузере
   расширений нет, кошелёк не подключится (на Android Chrome работает Mobile Wallet Adapter).

Адрес меняется при каждом запуске туннеля. Постоянный адрес — деплой (см. выше).

**Как приложение (PWA).** Сайт устанавливается на главный экран: `frontend/public/manifest.webmanifest`, иконки в
`frontend/public/icons/` (исходник `app-icon.svg`), `frontend/public/sw.js` (без кэша: балансы всегда свежие). Кнопка
«Install app» на главной и в мобильном меню: на Android — системное окно установки, на iPhone — подсказка
«Поделиться → На экран Домой». Нужен HTTPS (туннель или хостинг). Кошелёк внутри приложения подключается
через «Open in Phantom».

## Частые ошибки

| Симптом | Причина | Что сделать |
|---|---|---|
| «The server at http://localhost:3000 is not responding» | сервер не запущен или упал при старте | `cd backend && npm run dev`, посмотреть ошибку в терминале |
| `Invalid environment: DATABASE_URL …` при старте | в `.env` пустые обязательные поля | заполнить (шаг 1) |
| GitHub: «redirect_uri is not associated with this application» | Callback URL в GitHub App не совпадает с `PUBLIC_URL` | указать `{PUBLIC_URL}/auth/github/callback` |
| «Invalid OAuth state» после входа | вход начат с одного адреса, а закончен на другом (`localhost` против `127.0.0.1`) | везде использовать один и тот же адрес |
| Ошибки Prisma `P1001` / `table does not exist` | неверный `DATABASE_URL` или не созданы таблицы | проверить URL, `npx prisma migrate deploy` |
| Коммиты не дают огоньков | вебхук не доходит, репозиторий не добавлен или автор коммита не совпадает с GitHub-аккаунтом | GitHub App → Advanced → Recent Deliveries; добавить репозиторий в дашборде; `git config user.email` — email, привязанный к GitHub |
| Нельзя вступить в хакатон: «Hackathon oracle must be …» | хакатон создан с другим оракулом | создавать хакатоны через сайт или `devnet:setup` с тем же `ORACLE_SECRET_KEY` |

## Сценарий целиком

1. `GET /auth/github` → редирект на `FRONTEND_URL/auth/callback#token=JWT`.
2. `POST /auth/wallet/nonce {wallet}` → `wallet.signMessage(message)` → `POST /auth/wallet {wallet, nonce, signature}`.
3. Капитан: `POST /hackathons/:id/register-tx {teamName}` → подписать кошельком и отправить → получить `inviteCode`.
4. Участники: `POST /hackathons/:id/join-tx {inviteCode}` → подписать и отправить.
5. Капитан ставит GitHub App на репозиторий → `POST /teams/:team/repos {fullName}`.
6. Каждый push → webhook → `record_fire` (не больше 1 огонька в день на участника).
7. После `end_ts`: организатор `set_winners`, кто угодно `finalize` (пачками), участники `claim`.
8. `POST /attestations {participant}` → письмо + хеш on-chain; `GET /verify/:hash`.

## API

| Метод | Путь | Доступ |
|---|---|---|
| GET | `/health` | все |
| GET | `/auth/github`, `/auth/github/callback` | все |
| GET | `/me` | JWT |
| POST | `/auth/wallet/nonce`, `/auth/wallet` | JWT |
| GET | `/hackathons`, `/hackathons/:id`, `/hackathons/:id/participants` | все |
| POST | `/hackathons` | JWT, кошелёк организатора |
| POST | `/hackathons/:id/register-tx`, `/hackathons/:id/join-tx` | JWT + кошелёк |
| GET | `/teams/:id` | все |
| POST | `/teams/:id/repos` | JWT, капитан |
| POST | `/teams/:id/invite` | JWT, капитан (новый инвайт-код) |
| GET | `/teams/:id/commits` | все |
| POST | `/participants/:id/disqualification` | JWT, организатор (текст причины после `disqualify`) |
| POST | `/webhooks/github` | подпись HMAC |
| POST | `/attestations` | JWT, сам участник или организатор; после конца, одно на участника |
| GET | `/verify/:hash` | все |

## Правила честности

**Контракт (деньги):**

| Правило | Что предотвращает |
|---|---|
| Регистрация закрывается в `registration_end_ts` | вступление в команду-победителя в последний момент |
| Организатор не может участвовать в своём хакатоне | «сам себе выбрал победителя» |
| Доля приза команды делится только между теми, кто набрал норму огоньков | приз тому, кто ничего не делал |
| Доли победителей в сумме строго 100%, у каждой команды-победителя есть хотя бы один выполнивший норму | организатор оставляет часть приза себе |
| Возврат залога не ждёт выбора победителей (только `finalize`, его может вызвать кто угодно) | залоги застревают, если организатор пропал |
| Если победители не выбраны через 7 дней после конца, приз делится поровну между всеми выполнившими норму | организатор не выплачивает приз |
| Огонёк по времени push от GitHub (`pushed_at`), принимается в течение 3 часов | потеря огонька из-за задержки вебхука или перезапуска сервера |
| `disqualify`: организатор исключает нарушителя, хеш причины записывается в сеть, залог уходит в призовой фонд (не организатору). Только до выбора победителей | метки ни на что не влияли |
| `sweep`: через 30 дней после конца организатор забирает то, что никто не забрал | копейки и невостребованные выплаты зависают навсегда |

Сроки (от `end_ts`): +3 ч открываются `set_winners` и `finalize` · +3 ч +7 дн срок выбора победителей · +3 ч +30 дн `sweep`.

**Сервер (огоньки):**
- Огонёк получает тот, кто сделал push (`sender`, аутентифицирован GitHub), и только за свой коммит. Коммит «от имени» сокомандника не засчитывается никому и получает метку.
- Merge-коммиты и коммиты меньше `MIN_FIRE_LINES` строк огонька не дают. `REQUIRE_VERIFIED_COMMITS=true` требует подписанные коммиты.
- Неудачные push-вебхуки (сервер лежал) автоматически запрашиваются у GitHub повторно: при старте и каждые 15 минут.
- Письмо-сертификат выдаётся одно на участника, только после конца хакатона. На все запросы действует лимит.
- Капитан может сменить утёкший инвайт-код.

### Метки обмана (в БД; основание для `disqualify`)

| Метка | Когда |
|---|---|
| `REPO_CREATED_BEFORE_START` | репозиторий создан до старта |
| `HUGE_COMMIT` | любой коммит > `HUGE_COMMIT_LINES` строк |
| `BULK_PUSH` | один push > `BULK_PUSH_LINES` строк суммарно (готовый код маленькими коммитами) |
| `COMMIT_DATE_SKEW` | дата коммита в git отличается от времени push > `COMMIT_SKEW_HOURS` |
| `FORCE_PUSH` | force-push в существующую ветку |
| `AUTHOR_MISMATCH` | коммит от имени участника запушил другой человек |
| `NEW_GITHUB_ACCOUNT` | GitHub-аккаунт моложе `NEW_ACCOUNT_DAYS` дней (одноразовый аккаунт) |
| `INACTIVE_MEMBER` | считается при чтении: 0 своих коммитов, а у сокомандников есть |

## Известные ограничения

Это нельзя закрыть кодом, только уменьшить. На демо стоит сказать об этом прямо:
- **Оракул централизован.** Сервер решает, кому дать огонёк; при утечке `ORACLE_SECRET_KEY` можно рисовать огоньки. Ключ хранится только в переменных окружения, деньгами оракул не управляет.
- **Один человек с несколькими GitHub-аккаунтами** — это несколько участников. Одноразовые аккаунты помечаются (`NEW_GITHUB_ACCOUNT`), но полной защиты нет.
- **Качество кода не проверяется.** Огонёк означает «в этот день был настоящий коммит», а не «код хороший». Для этого есть судьи и победители.
- **Организатор может сговориться с командой** (друзья). Контракт лишь не даёт ему ни участвовать самому, ни забрать приз себе.
- Хакатон ≤ 64 дней (`days_bitmap: u64`).
