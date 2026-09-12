/**
 * Adam & Eva — deliberation engine with two modes:
 *
 *  - dialogue  (eva-adam / adam-eva): both personas debate across `rounds`
 *    rounds, alternating replies. The leader (determined by ordering) opens.
 *  - interview (eva-adam / adam-eva): the leading persona interviews the other
 *    across `rounds` rounds, asking one sharp question per round and getting an
 *    in-character answer.
 *
 * Optionally a neutral arbiter synthesizes the transcript into a joint
 * conclusion (consensus / trade-offs / single recommendation).
 */

import { LlmError, StubLlmClient, defaultModelFor, defaultSynthesizerModel } from './llm.ts';
import type { LlmClient, LlmMessage } from './llm.ts';
import { DUAL_SYNTHESIZER_PROMPT, INTERVIEWER_RULE, personaFor } from './personas.ts';
import type { AdamEvaMode, AdamEvaOrdering, AdamEvaResult, AdamEvaRunOptions, PersonaId, Turn } from './types.ts';

const LANGUAGE_NAMES: Record<string, string> = {
  ru: 'Russian (русский)',
  uk: 'Ukrainian (українська)',
  en: 'English',
  pl: 'Polish (polski)',
  ro: 'Romanian (română)',
  de: 'German (Deutsch)',
};

export interface AdamEvaEngineDeps {
  llm?: LlmClient;
  defaultMode?: AdamEvaMode;
  defaultOrdering?: AdamEvaOrdering;
  defaultLanguage?: string;
  defaultModels?: AdamEvaRunOptions['models'];
  temperature?: number;
  maxTokens?: number;
  now?: () => number;
}

export class AdamEvaEngine {
  private readonly llm: LlmClient;
  private readonly defaultMode: AdamEvaMode;
  private readonly defaultOrdering: AdamEvaOrdering;
  private readonly defaultLanguage: string;
  private readonly defaultModels: NonNullable<AdamEvaRunOptions['models']>;
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly now: () => number;

  constructor(deps: AdamEvaEngineDeps = {}) {
    this.llm = deps.llm ?? new StubLlmClient();
    this.defaultMode = deps.defaultMode ?? 'dialogue';
    this.defaultOrdering = deps.defaultOrdering ?? 'eva-adam';
    this.defaultLanguage = deps.defaultLanguage ?? 'ru';
    this.defaultModels = deps.defaultModels ?? {};
    this.temperature = deps.temperature ?? 0.7;
    this.maxTokens = deps.maxTokens ?? 700;
    this.now = deps.now ?? (() => performance.now());
  }

  public async run(opts: AdamEvaRunOptions): Promise<AdamEvaResult> {
    const mode = sanitizeMode(opts.mode);
    const ordering = sanitizeOrdering(opts.ordering ?? this.defaultOrdering);
    const language = opts.language ?? this.defaultLanguage;
    const rounds = clampRounds(opts.rounds ?? 3);
    const started = this.now();

    const leadId: PersonaId = ordering === 'eva-adam' ? 'eva' : 'adam';
    const followId: PersonaId = leadId === 'eva' ? 'adam' : 'eva';
    const modelFor = (id: PersonaId) => opts.models?.[id] ?? this.defaultModels[id] ?? defaultModelFor(id);

    const turns: Turn[] = [];
    const pushTurn = (turn: Turn): void => {
      turns.push(turn);
      opts.onTurn?.(turn);
    };
    const recent = (personaId: PersonaId, fallback: string): string => {
      for (let i = turns.length - 1; i >= 0; i -= 1) {
        if (turns[i].personaId === personaId) return turns[i].content;
      }
      return fallback;
    };

    for (let round = 1; round <= rounds; round += 1) {
      if (mode === 'interview') {
        pushTurn(await this.questionTurn(round, leadId, followId, opts, language, modelFor(leadId), recent));
        pushTurn(await this.answerTurn(round, followId, leadId, opts, language, modelFor(followId), recent));
      } else if (round === 1) {
        pushTurn(await this.openingTurn(leadId, followId, opts, language, modelFor(leadId)));
        pushTurn(await this.replyTurn(round, followId, leadId, opts, language, modelFor(followId), recent));
      } else {
        pushTurn(await this.replyTurn(round, leadId, followId, opts, language, modelFor(leadId), recent));
        pushTurn(await this.replyTurn(round, followId, leadId, opts, language, modelFor(followId), recent));
      }
    }

    let synthesis: string | undefined;
    if (opts.withSynthesis !== false) {
      try {
        synthesis = await this.synthesize(turns, language, opts.models?.synthesizer ?? this.defaultModels.synthesizer ?? defaultSynthesizerModel(), opts);
      } catch (exc) {
        synthesis = `[Synthesis skipped: ${exc instanceof Error ? exc.message : String(exc)}]`;
      }
    }

    return {
      mode,
      ordering,
      prompt: opts.prompt,
      rounds,
      turns,
      synthesis,
      durationMs: Math.round(this.now() - started),
    };
  }

  private langDirective(language: string, id: PersonaId): string {
    const human = LANGUAGE_NAMES[language] ?? LANGUAGE_NAMES.ru;
    return (
      `Respond strictly in ${human}. Address your counterpart by name. No markdown headlines, ` +
      'no bullet lists — write flowing conversational prose of 2-4 short paragraphs, as in a live spoken ' +
      'debate between two AI colleagues. Keep your identity locked ' +
      `(${id === 'eva' ? 'female' : 'male'} first person as defined).`
    );
  }

  private synthDirective(language: string): string {
    const human = LANGUAGE_NAMES[language] ?? LANGUAGE_NAMES.ru;
    return (
      `Respond strictly in ${human}.\n` +
      'You are a NEUTRAL moderator — never impersonate Eva or Adam, never use first person. ' +
      'Refer to the debaters as \u201cEva\u201d and \u201cAdam\u201d in third person.\n' +
      'Use exactly three short sections:\n' +
      '**1. Consensus** — where Eva and Adam agreed.\n' +
      '**2. Trade-offs** — open disagreements and edge cases.\n' +
      '**3. Recommendation** — a single concrete proposal, with cost impact in USD ($) or EUR (\u20ac) where relevant.'
    );
  }

  private systemPrompt(language: string, id: PersonaId, extraRole: string): string {
    return `${personaFor(id).system_prompt}\n\n${this.langDirective(language, id)}\n\n${extraRole}`;
  }

  private async callModel(model: string, language: string, personaId: PersonaId, extraRole: string, userPrompt: string, opts: AdamEvaRunOptions): Promise<Turn> {
    const started = this.now();
    const messages: LlmMessage[] = [
      { role: 'system', content: this.systemPrompt(language, personaId, extraRole) },
      { role: 'user', content: userPrompt },
    ];
    const content = await this.llm.generateContent(model, messages, {
      temperature: opts.temperature ?? this.temperature,
      maxOutputTokens: opts.maxTokens ?? this.maxTokens,
      signal: opts.signal,
    });
    const persona = personaFor(personaId);
    return {
      round: 0,
      personaId,
      name: persona.name,
      title: persona.title,
      kind: 'reply',
      content,
      durationMs: Math.round(this.now() - started),
      model,
    };
  }

  private async openingTurn(leadId: PersonaId, followId: PersonaId, opts: AdamEvaRunOptions, language: string, model: string): Promise<Turn> {
    const lead = personaFor(leadId);
    const follow = personaFor(followId);
    const userPrompt = `Topic for discussion (given by a human):\n"${opts.prompt}"\n\n${lead.opening_rule}`;
    const turn = await this.callModel(model, language, leadId, `You are in a live dialogue with ${follow.name} (${follow.title}). You are the opening speaker — advance the discussion.`, userPrompt, opts);
    turn.round = 1;
    turn.kind = 'opening';
    return turn;
  }

  private async replyTurn(round: number, speakerId: PersonaId, otherId: PersonaId, opts: AdamEvaRunOptions, language: string, model: string, recent: (personaId: PersonaId, fallback: string) => string): Promise<Turn> {
    const speaker = personaFor(speakerId);
    const other = personaFor(otherId);
    const last = recent(otherId, '(still awaiting the first reply)');
    const userPrompt = `Topic for discussion (given by a human):\n"${opts.prompt}"\n\n${other.name} just said:\n${last}\n\nRespond directly to what ${other.name} said: sharpen the argument, agree or disagree with concrete reasoning, and advance the joint analysis. Do not repeat the full topic.`;
    const turn = await this.callModel(model, language, speakerId, `You are in a live dialogue with ${other.name} (${other.title}). Advance the discussion.`, userPrompt, opts);
    turn.round = round;
    turn.kind = 'reply';
    return turn;
  }

  private async questionTurn(round: number, interviewerId: PersonaId, guestId: PersonaId, opts: AdamEvaRunOptions, language: string, model: string, recent: (personaId: PersonaId, fallback: string) => string): Promise<Turn> {
    const interviewer = personaFor(interviewerId);
    const guest = personaFor(guestId);
    const userPrompt =
      round === 1
        ? `Interview topic (given by a human):\n"${opts.prompt}"\n\n${INTERVIEWER_RULE[interviewerId]}`
        : `Interview topic (given by a human):\n"${opts.prompt}"\n\n${guest.name} just answered:\n${recent(guestId, '(still awaiting the first answer)')}\n\nFollow up on that answer: challenge or probe the contradiction, then ask the next sharp question. Do not repeat the topic.`;
    const turn = await this.callModel(model, language, interviewerId, `You are conducting a professional interview with ${guest.name} (${guest.title}). Ask sharp, concrete questions.`, userPrompt, opts);
    turn.round = round;
    turn.kind = 'question';
    return turn;
  }

  private async answerTurn(round: number, guestId: PersonaId, interviewerId: PersonaId, opts: AdamEvaRunOptions, language: string, model: string, recent: (personaId: PersonaId, fallback: string) => string): Promise<Turn> {
    const guest = personaFor(guestId);
    const interviewer = personaFor(interviewerId);
    const userPrompt = `Interview topic (given by a human):\n"${opts.prompt}"\n\n${interviewer.name} (the interviewer) just asked:\n${recent(interviewerId, '(awaiting the first question)')}\n\nAnswer that question directly and in depth, from your professional role. Give a concrete position, quantify where useful, and stay in character.`;
    const turn = await this.callModel(model, language, guestId, `You are being interviewed by ${interviewer.name} (${interviewer.title}). Answer fully and stay in character.`, userPrompt, opts);
    turn.round = round;
    turn.kind = 'answer';
    return turn;
  }

  private async synthesize(turns: Turn[], language: string, model: string, opts: AdamEvaRunOptions): Promise<string> {
    const transcript = turns.map((t) => `[${t.name}]: ${t.content}`).join('\n\n');
    const messages: LlmMessage[] = [
      { role: 'system', content: `${DUAL_SYNTHESIZER_PROMPT}\n\n${this.synthDirective(language)}` },
      { role: 'user', content: transcript },
    ];
    return this.llm.generateContent(model, messages, {
      temperature: 0.3,
      maxOutputTokens: Math.max(opts.maxTokens ?? this.maxTokens, 500),
      signal: opts.signal,
    });
  }
}

export function sanitizeMode(value: AdamEvaMode): AdamEvaMode {
  return value === 'interview' ? 'interview' : 'dialogue';
}

export function sanitizeOrdering(value: AdamEvaOrdering): AdamEvaOrdering {
  return value === 'adam-eva' ? 'adam-eva' : 'eva-adam';
}

export function clampRounds(value: number): number {
  return Math.max(1, Math.min(Math.round(value), 9));
}

export { LlmError };