# Changelog

Все заметные изменения в adam-eva будут задокументированы в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
проект придерживается [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Запланировано
- [ ] Больше голосовых провайдеров (помимо Azure Neural TTS)
- [ ] Стриминговая подача диалога в веб-интерфейс
- [ ] Экспорт транскриптов в дополнительные форматы

---

## [2.0.0] - 2026-09-12

### Добавлено
- **Модуль «Адам и Ева»** — два AI общаются между собой текстом и голосом, обсуждая темы, которые даёт человек:
  - **Eva** — Lead Frontend Architect, Face of the Company & Global Brand Ambassador (frontend / UX / бренд / клиентская дипломатия)
  - **Adam** — Chief Backend Architect, Head of EVA Production, CISO, Business Process & Development Lead (backend / производство / безопасность / стоимость)
- **Роли и правила персон** взяты из корпоративной ролевой модели EvaLine (`evabot-backend` / `evaline-consilium`) дословно — `python/adam_eva/personas.py` (эталон) и `src/personas.ts` (TS-порт).
- **Двухсторонний диалог** с синтезатором: `config.json` задаёт режим (`dialogue`), порядок высказываний (`eva-adam`), число раундов (3) и язык (`ru`).
- **LLM-конфигурация через OmniRoute** (`http://127.0.0.1:20128/v1`): `model_eva` (`omni/cf-mistral-small-3.1`), `model_adam` (`omni/cf-qwen2.5-coder-32b`), `model_synthesizer` (`omni/cf-llama-3.3-70b`), настраиваемые temperature/max_tokens.
- **Голосовой канал** (`voice.ts`, `voice_bridge.py`): Azure Neural TTS голоса по локалям — `ru-RU-SvetlanaNeural` / `ru-RU-DmitryNeural`, `uk-UA-PolinaNeural` / `uk-UA-OstapNeural`, `en-US-AriaNeural` / `en-US-GuyNeural`; live-озвучка, сохранение аудио, настройки скорости/громкости, каталоги `transcripts/` и `audio/`.
- **TS-модуль** (`src/`): `engine.ts`, `llm.ts`, `personas.ts`, `transcript.ts`, `voice.ts`, `provider.ts`, `config.ts`, `plugin.ts`, `plugin-contract.ts`, `types.ts`, CLI (`cli.ts`).
- **Python-режим стал самодостаточным TS-плагином** (`feat: convert Python mode to a self-contained TS plugin`) — единая реализация вместо двух языковых путей.
- Тесты, сборка `tsc` (strict), `tsconfig.json`; `typescript` в devDependencies.

---

**Формат:** [Keep a Changelog](https://keepachangelog.com/)  
**Версионирование:** [Semantic Versioning](https://semver.org/)  
**Статус:** Активная разработка