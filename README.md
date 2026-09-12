# Adam & Eva

Модуль, в котором два AI — **Адам** и **Ева** — общаются между собой **текстом** и **голосом**, обсуждая темы, которые даёт человек.

- **Eva** — Lead Frontend Architect, Face of the Company & Global Brand Ambassador (frontend / UX / бренд / клиентская дипломатия).
- **Adam** — Chief Backend Architect, Head of EVA Production, CISO, Business Process & Development Lead (backend / производство / безопасность / стоимость).

Роли и правила персон взяты из корпоративной ролевой модели EvaLine (`evabot-backend` / `evaline-consilium`) и зафиксированы в `adam_eva/personas.py`.

## Быстрый старт

```bash
# Простой текстовый диалог (3 раунда, русский язык)
python3 cli.py "Как вывести новый продукт EvaLine на рынок ЕС"

# Пакетно-голосовой режим: каждый ответ сохраняется в MP3 (Edge-TTS, бесплатно)
python3 cli.py "Что важнее для сайта — скорость или дизайн?" --voice

# Живое озвучивание реплик сразу после генерации
python3 cli.py "Нужна ли EvaLine собственная LLM-инфраструктура?" --live

# Интерактивно (тему спросит после запуска)
python3 cli.py

# Настройки: язык, число раундов, синтез
python3 cli.py "Омнирут против OpenRouter" --lang ru --rounds 5 --no-synth
```

## Конфигурация

Файл `config.json`:

| Ключ | По умолчанию | Описание |
|---|---|---|
| `language` | `ru` | Язык диалога (`ru`, `uk`, `en`, `pl`, `ro`, `de`) |
| `rounds` | `3` | Число раундов (1–9) |
| `opener` | `eva` | Кто начинает (`eva` или `adam`) |
| `llm.base_url` | `http://127.0.0.1:20128/v1` | OmniRoute LiteLLM daemon (free-модели) |
| `llm.api_key` | `omniroute-token` | Токен локального даймона |
| `llm.model_eva` | `omni/cf-mistral-small-3.1` | Модель Евы |
| `llm.model_adam` | `omni/cf-qwen2.5-coder-32b` | Модель Адама |
| `llm.model_synthesizer` | `omni/cf-llama-3.3-70b` | Модель совместного вывода |
| `voice.enabled` | `false` | Синтез речи |
| `voice.speak_live` | `false` | Воспроизведение реплик сразу |
| `voice.voices` | — | Голоса Edge-TTS по языкам (Eva — женские, Adam — мужские) |

Окружение: `ADAM_EVA_LANGUAGE`, `ADAM_EVA_ROUNDS`, `ADAM_EVA_MODEL_EVA`, `ADAM_EVA_MODEL_ADAM`, `ADAM_EVA_MODEL_SYNTH`, `ADAM_EVA_LLM_BASE_URL`, `ADAM_EVA_LLM_API_KEY`.

## Как это работает

1. Человек передаёт тему.
2. За `rounds` раундов Eva и Adam поочерёдно отвечают друг другу, оставаясь в своих ролях (Ева открывает обсуждение по умолчанию).
3. Каждая реплика может быть озвучена через Microsoft Edge-TTS (Eva — женский голос, Adam — мужской, бесплатно и без ключей).
4. По умолчанию арбитр-модель формирует совместный вывод: консенсус, торговые офф-сеты и одну рекомендацию.
5. Стенограмма сохраняется в `transcripts/` (markdown), аудио — в `audio/`.

## LLM-бэкенд

По умолчанию модуль ходит на локальный **OmniRoute LiteLLM daemon** (`127.0.0.1:20128`, бесплатные модели). Если даймон недоступен, задайте любой OpenAI-совместимый эндпоинт в `llm.base_url` / `llm.api_key` (например, OpenRouter `https://openrouter.ai/api/v1` с вашим ключом).

Список доступных моделей даймона:

```bash
curl -s -H "Authorization: Bearer omniroute-token" http://127.0.0.1:20128/v1/models
```

## Структура

```
adam-eva/
├── cli.py                  # точка входа CLI
├── config.json             # конфигурация по умолчанию
├── adam_eva/
│   ├── personas.py         # личности, роли и правила Адама и Евы
│   ├── dialogue.py         # движок двустороннего диалога
│   ├── llm.py              # LLM-клиент (OmniRoute/OpenRouter-compatible)
│   ├── voice.py            # голос (Edge-TTS)
│   ├── transcript.py       # сохранение стенограмм (markdown)
│   └── config.py           # загрузчик конфига
├── transcripts/            # стенограммы диалогов (markdown)
└── audio/                  # озвученные реплики (mp3)
```