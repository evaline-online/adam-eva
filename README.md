# Adam & Eva

Модуль, в котором два AI — **Адам** и **Ева** — общаются между собой **текстом** и **голосом**, обсуждая темы, которые даёт человек.

- **Eva** — Lead Frontend Architect, Face of the Company & Global Brand Ambassador (frontend / UX / бренд / клиентская дипломатия).
- **Adam** — Chief Backend Architect, Head of EVA Production, CISO, Business Process & Development Lead (backend / производство / безопасность / стоимость).

Роли и правила персон взяты из корпоративной ролевой модели EvaLine (`evabot-backend` / `evaline-consilium`) дословно (см. `python/adam_eva/personas.py` — эталон, `src/personas.ts` — TS-порт).

Два режима работы:

- **`dialogue`** — свободный диалог: персоны поочерёдно отвечают друг другу за `rounds` раундов (первый ход — у ведущего персоны из `ordering`).
- **`interview`** — интервью: ведущий персона (из `ordering`, напр. `adam-eva` → Адам) задаёт вопросы, второй персона отвечает.

## Быстрый старт

```bash
npm install
npm run build        # tsc -p tsconfig.json → dist/
npm test             # unit-тесты через StubLlmClient (без сети)

# Простой текстовый диалог (3 раунда, русский язык, порядок по config.json)
npm run cli -- "Как вывести новый продукт EvaLine на рынок ЕС"

# Диалог: Ева открывает обсуждение
npm run cli -- "Что важнее для сайта — скорость или дизайн?" --mode dialogue --ordering eva-adam

# Интервью: Адам интервьюирует Еву
npm run cli -- "Как планируете удерживать клиентов в ЕС?" --mode interview --ordering adam-eva

# Каждый ответ сохраняется в MP3 (Edge-TTS, бесплатно)
npm run cli -- "Нужна ли EvaLine собственная LLM-инфраструктура?" --voice

# Живое озвучивание реплик сразу после генерации
npm run cli -- "Тема" --live

# Интерактивно (тему спросит после запуска)
npm run cli

# Настройки: язык, число раундов, без синтеза арбитра
npm run cli -- "Омнирут против OpenRouter" --rounds 5 --lang ru --no-synth
```

CLI принимает бинарные файлы напрямую через Node:
```bash
node --experimental-strip-types src/cli.ts "тема" --mode interview --ordering adam-eva --rounds 2
```

## Конфигурация

Файл `config.json`:

| Ключ | По умолчанию | Описание |
|---|---|---|
| `mode` | `dialogue` | Режим: `dialogue` или `interview` |
| `ordering` | `eva-adam` | Порядок: кто открывает диалог / кто интервьюер (`eva-adam`, `adam-eva`) |
| `language` | `ru` | Язык диалога (`ru`, `uk`, `en`, `pl`, `ro`, `de`) |
| `rounds` | `3` | Число раундов (1–9) |
| `llm.base_url` | `http://127.0.0.1:20128/v1` | OmniRoute LiteLLM daemon (free-модели) |
| `llm.api_key` | `omniroute-token` | Токен локального даймона |
| `llm.model_eva` | `omni/cf-mistral-small-3.1` | Модель Евы |
| `llm.model_adam` | `omni/cf-qwen2.5-coder-32b` | Модель Адама |
| `llm.model_synthesizer` | `omni/cf-llama-3.3-70b` | Модель совместного вывода |
| `voice.enabled` | `false` | Синтез речи |
| `voice.speak_live` | `false` | Воспроизведение реплик сразу |
| `voice.voices` | — | Голоса Edge-TTS по языкам (Eva — женские, Adam — мужские) |

Окружение: `ADAM_EVA_MODE`, `ADAM_EVA_ORDERING`, `ADAM_EVA_LANGUAGE`, `ADAM_EVA_ROUNDS`, `ADAM_EVA_MODEL_EVA`, `ADAM_EVA_MODEL_ADAM`, `ADAM_EVA_MODEL_SYNTH`, `ADAM_EVA_LLM_BASE_URL`, `ADAM_EVA_LLM_API_KEY`.

## Как это работает

1. Человек передаёт тему.
2. За `rounds` раундов Eva и Adam обмениваются репликами, оставаясь в своих ролях.
   - `dialogue`: ведущий персоны (из `ordering`) делает первый ход — `opening`.
   - `interview`: интервьюер задаёт вопрос (`question`), гость отвечает (`answer`).
3. Каждая реплика может быть озвучена через Microsoft Edge-TTS (Eva — женский голос, Adam — мужской, бесплатно и без ключей).
4. По умолчанию арбитр-модель формирует совместный вывод: консенсус, торговые офф-сеты и одну рекомендацию.
5. Стенограмма сохраняется в `transcripts/` (markdown), аудио — в `audio/`.

## Интеграция в evaline-chat (как провайдер агента)

Плагин самодостаточен и не зависит от хоста. Для подключения к `evaline-chat` используйте `AdamEvaProvider` — он структурно совместим с контрактом `AgentProvider`:

```ts
import { AdamEvaProvider } from 'adam-eva';
import { ProviderPlugin } from 'evaline-chat/core/ProviderPlugin';

const provider = new AdamEvaProvider({ defaultMode: 'interview', defaultOrdering: 'eva-adam', defaultRounds: 2 });
const plugin = new ProviderPlugin(provider);
// plugin → registerPlugin(engine)
```

`AdamEvaProvider.send({ sessionId, text, history? })` возвращает `{ content, mode, turns }`, где `content` — совместный вывод арбитра (или последняя реплика, если синтез отключён).

Альтернативно `AdamEvaPlugin` регистрирует команды (`/adam-eva`, `/adam`, `/interview`) и маршрут `POST /api/adam-eva`.

## LLM-бэкенд

По умолчанию модуль ходит на локальный **OmniRoute LiteLLM daemon** (`127.0.0.1:20128`, бесплатные модели). Если даймон недоступен, задайте любой OpenAI-совместимый эндпоинт в `llm.base_url` / `llm.api_key` (например, OpenRouter `https://openrouter.ai/api/v1` с вашим ключом).

Список доступных моделей даймона:

```bash
curl -s -H "Authorization: Bearer omniroute-token" http://127.0.0.1:20128/v1/models
```

## Структура

```
adam-eva/
├── package.json             # npm-пакет adam-eva v2.0.0
├── tsconfig.json            # зеркало evaline-consilium (NodeNext, strict)
├── config.json              # конфигурация по умолчанию (TS-плагин)
├── src/
│   ├── cli.ts               # точка входа CLI
│   ├── types.ts             # режимы, порядок, turn/result/prov контракты
│   ├── personas.ts          # личности, роли и правила Адама и Евы (дословный порт)
│   ├── llm.ts               # LlmClient / StubLlmClient / OmniRoute-клиент
│   ├── config.ts            # загрузчик конфига + env-overrides
│   ├── engine.ts            # AdamEvaEngine: dialogue + interview
│   ├── plugin-contract.ts   # самодостаточный контракт Plugin (как в evaline-consilium)
│   ├── plugin.ts            # AdamEvaPlugin: команды + POST /api/adam-eva
│   ├── provider.ts          # AdamEvaProvider (AgentProvider-совместимый)
│   ├── voice.ts             # голос (Edge-TTS через voice_bridge.py)
│   └── transcript.ts        # сохранение стенограмм (markdown)
├── voice_bridge.py          # python3-мост к edge_tts
├── tests/                   # unit-тесты (engine, plugin, provider)
├── python/                  # прежний Python-прототип (эталон, см. историю git)
│   ├── cli.py
│   ├── config.json
│   └── adam_eva/            # personas.py, dialogue.py, llm.py, voice.py, transcript.py, config.py
├── transcripts/             # стенограммы диалогов (markdown)
└── audio/                   # озвученные реплики (mp3)
```