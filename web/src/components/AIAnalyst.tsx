"use client";

import { useState } from "react";
import { Badge, Card, SectionTitle, TextInput } from "@/components/ui";

/* AI Analyst (Website Plan §25; Master Plan §34-35).
   The MVP uses canned evidence-linked responses — the real LLM integration
   arrives in Phase 8 and must only interpret structured VCTanalyzer data. */

interface AiAnswer {
  headline: string;
  body: string;
  evidence: string;
  confidence: number;
  linkLabel: string;
}

const CANNED: { match: (q: string) => boolean; answer: AiAnswer }[] = [
  {
    match: (q) => q.toLowerCase().includes("lose") || q.toLowerCase().includes("round 12"),
    answer: {
      headline: "Round 12 was lost in the retake",
      body: "Team B converted a 4v3 post-plant into a retake loss: the rotation from B arrived after the defuse window opened, and both deaths happened in Market with no trade available.",
      evidence: "3 occurrences of this rotation pattern in the last 5 Ascent matches",
      confidence: 0.74,
      linkLabel: "View round 12 + 2 similar rounds",
    },
  },
  {
    match: (q) => q.toLowerCase().includes("jett"),
    answer: {
      headline: "Their Jett enters through A Main",
      body: "78% of their Jett's first contacts happen in A Main or A Site, with an average entry time of 00:41 and high early aggression on anti-eco rounds.",
      evidence: "84 analyzed attack rounds · 27 matches",
      confidence: 0.86,
      linkLabel: "View first-contact rounds",
    },
  },
  {
    match: (q) => q.toLowerCase().includes("execute") || q.toLowerCase().includes("a"),
    answer: {
      headline: "Mid pressure into A execute is their signature",
      body: "They frequently pressure Mid to force a rotation, then transition into an A execute within 15 seconds of the rotation being spotted.",
      evidence: "31 occurrences across 84 rounds · 27 matches",
      confidence: 0.81,
      linkLabel: "View supporting rounds",
    },
  },
];

const FALLBACK: AiAnswer = {
  headline: "Insufficient structured evidence",
  body: "I can only answer from VCTanalyzer's structured data (events, positions, rounds). No pattern in the current dataset strongly matches this question yet — analyze more matches to strengthen the evidence base.",
  evidence: "Dataset: 8 matches · 218 rounds analyzed",
  confidence: 0.2,
  linkLabel: "Browse patterns",
};

export function AIAnalyst() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [thinking, setThinking] = useState(false);

  const ask = () => {
    if (!question.trim()) return;
    setThinking(true);
    setAnswer(null);
    setTimeout(() => {
      const hit = CANNED.find((c) => c.match(question));
      setAnswer(hit ? hit.answer : FALLBACK);
      setThinking(false);
    }, 700);
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <SectionTitle>AI Analyst</SectionTitle>
        <Badge tone="accent">Evidence-based</Badge>
      </div>

      <div className="mt-3 flex gap-2">
        <TextInput
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask();
          }}
          placeholder="Ask anything about this match…"
        />
        <button
          onClick={ask}
          className="cursor-pointer rounded-md bg-accent px-4 text-[13px] font-semibold text-white transition-colors hover:bg-accent/85"
        >
          Ask
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {[
          "Why did we lose Round 12?",
          "Show me their common A executes.",
          "Where does their Jett usually enter?",
        ].map((q) => (
          <button
            key={q}
            onClick={() => setQuestion(q)}
            className="cursor-pointer rounded-full border border-line px-2.5 py-1 text-[11.5px] text-text-dim transition-colors hover:border-line-2 hover:text-text"
          >
            {q}
          </button>
        ))}
      </div>

      {thinking ? (
        <div className="mt-4 animate-pulse-dot text-[13px] text-text-dim">
          Querying structured match data…
        </div>
      ) : null}

      {answer && !thinking ? (
        <div className="mt-4 rounded-md border border-line bg-surface-2 p-3.5">
          <div className="text-[14px] font-semibold">{answer.headline}</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-dim">
            {answer.body}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <div className="text-[11.5px] text-text-faint">
              <div>Evidence: {answer.evidence}</div>
              <div className="tabular">
                Confidence: {Math.round(answer.confidence * 100)}%
              </div>
            </div>
            <Badge tone={answer.confidence > 0.7 ? "success" : "warning"}>
              {answer.confidence > 0.7 ? "Supported" : "Weak evidence"}
            </Badge>
          </div>
          <button className="mt-3 cursor-pointer text-[12px] font-medium text-info hover:underline">
            {answer.linkLabel} →
          </button>
        </div>
      ) : null}
    </Card>
  );
}
