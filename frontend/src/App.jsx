import { Component, useEffect, useRef, useState } from "react";
import parse from "html-react-parser";
import "katex/dist/katex.min.css";
import renderMathInElement from "katex/contrib/auto-render";
import "./App.css";
const API_BASE = "https://127.0.1:8000";
const LATEX_DELIMS = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "$", right: "$", display: false },
  { left: "\\(", right: "\\)", display: false },
];
const SUBJECT_META = {
  physics: { emoji: "⚛️", tag: "Physics" },
  chemistry: { emoji: "🧪", tag: "Chemistry" },
  mathematics: { emoji: "📐", tag: "Mathematics" },
};
function toText(value) {
  return value === null || value === undefined ? "" : String(value);
}
function normalizeCorrect(value) {
  const arr = Array.isArray(value) ? value : value ? [value] : [];
  return arr.map((item) => toText(item).trim()).filter(Boolean);
}
function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options
    .map((option, idx) => {
      if (typeof option === "string") {
        return { identifier: String.fromCharCode(65 + idx), content: option };
      }
      const identifier = toText(option?.identifier ?? option?.id ?? String.fromCharCode(65 + idx)).trim();
      const content = toText(option?.content ?? option?.text ?? option?.value).trim();
      if (!identifier || !content) return null;
      return { identifier, content };
    })
    .filter(Boolean);
}
function sanitizeQuestions(data) {
  if (!Array.isArray(data)) return [];
  return data
    .map((q, idx) => {
      const question = toText(q?.question).trim();
      const correct = normalizeCorrect(
        q?.correct ??
          q?.correct_options ??
          q?.correct_value ??
          q?.correct_answer ??
          q?.numerical_value ??
          q?.numeric_value ??
          q?.answer ??
          q?.value
      );
      const options = normalizeOptions(q?.options);
      // Only skip if question text itself is missing. Numerical questions
      // may not have a stored "correct" — still show them to the user.
      if (!question) return null;
      return {
        id: q?.id ?? q?.question_id ?? idx,
        question,
        options,
        correct,
        year: toText(q?.year),
        subject: toText(q?.subject),
        chapter: toText(q?.chapter),
        explanation: toText(q?.explanation ?? q?.expl),
      };
    })
    .filter(Boolean);
}
function MathHTML({ html }) {
  const ref = useRef(null);
  const safeHtml = toText(html);
  let parsed;
  try {
    parsed = parse(safeHtml);
  } catch (e) {
    console.warn("Skipped broken HTML inside question", e);
    parsed = <span>{safeHtml.replace(/<[^>]*>/g, "")}</span>;
  }
  useEffect(() => {
    if (!ref.current) return;
    try {
      renderMathInElement(ref.current, {
        delimiters: LATEX_DELIMS,
        throwOnError: false,
        errorColor: "inherit",
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
      });
    } catch (e) {
      console.warn("Skipped broken LaTeX inside question", e);
    }
  }, [safeHtml]);
  return <div ref={ref} className="math-html">{parsed}</div>;
}
class QuestionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    console.warn("Skipped one broken question render", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="card center-card">
          <h2>This question had a formatting issue</h2>
          <p className="muted">Skipping it keeps the quiz running.</p>
          <button className="btn btn-primary" onClick={this.props.onSkip}>Skip Question →</button>
        </div>
      );
    }
    return this.props.children;
  }
}
export default function App() {
  const [subject, setSubject] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [error, setError] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedOption, setSelectedOption] = useState("");
  const [numericAnswer, setNumericAnswer] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [answered, setAnswered] = useState({});
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const subjects = ["physics", "chemistry", "mathematics"];
  useEffect(() => {
    if (!subject) return;
    setLoadingChapters(true);
    setError("");
    fetch(`${API_BASE}/chapters/${encodeURIComponent(subject)}`)
      .then((r) => r.json())
      .then((data) => setChapters(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error(err);
        setChapters([]);
        setError("Couldn't load chapters. Please try again.");
      })
      .finally(() => setLoadingChapters(false));
  }, [subject]);
  const resetQuestionState = () => {
    setCurrentQuestion(0);
    setSelectedOption("");
    setNumericAnswer("");
    setShowResult(false);
    setAnswered({});
    setScore(0);
    setFinished(false);
  };
  const loadQuestions = (chapter) => {
    setLoadingQuestions(true);
    setSelectedChapter(chapter);
    setQuestions([]);
    setError("");
    resetQuestionState();
    fetch(`${API_BASE}/questions/${encodeURIComponent(chapter)}`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || data?.fallback) throw new Error("question-load-failed");
        const clean = sanitizeQuestions(data);
        setQuestions(clean);
        if (clean.length === 0) {
          setError("No usable questions found for this chapter.");
        }
      })
      .catch((err) => {
        console.error(err);
        setQuestions([]);
        setError("Couldn't load usable questions for this chapter. Please choose another chapter.");
      })
      .finally(() => setLoadingQuestions(false));
  };
  const resetAll = () => {
    setFinished(false);
    setSubject(null);
    setSelectedChapter(null);
    setQuestions([]);
    setCurrentQuestion(0);
    setSelectedOption("");
    setNumericAnswer("");
    setShowResult(false);
    setAnswered({});
    setScore(0);
    setError("");
  };
  if (finished) {
    const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;
    return (
      <div className="page">
        <Header />
        <div className="card center-card">
          <div className="result-emoji">{pct >= 70 ? "🏆" : pct >= 40 ? "💪" : "📚"}</div>
          <h2>Quiz Finished</h2>
          <div className="score-big">{score}<span>/{questions.length}</span></div>
          <div className="score-pct">{pct}% correct</div>
          <button className="btn btn-primary" onClick={resetAll}>Back to Home</button>
        </div>
      </div>
    );
  }
  if (selectedChapter && !loadingQuestions && questions.length === 0) {
    return (
      <div className="page">
        <Header subtitle={selectedChapter} />
        <div className="card center-card">
          <h2>Couldn’t show this chapter</h2>
          <p className="muted">{error || "Some questions had broken data, so they were skipped."}</p>
          <button className="btn btn-primary" onClick={() => setSelectedChapter(null)}>Back to Chapters</button>
        </div>
      </div>
    );
  }
  if (selectedChapter && questions.length > 0) {
    const question = questions[currentQuestion] || questions[0];
    const isMCQ = Array.isArray(question.options) && question.options.length > 0;
    const correct = Array.isArray(question.correct) ? question.correct : [];
    const userAnswer = isMCQ ? selectedOption : numericAnswer.trim();
    const isCorrect = isMCQ
      ? correct.includes(selectedOption)
      : correct.some((c) => toText(c).trim().toLowerCase() === userAnswer.toLowerCase());
    const answeredEntries = Object.values(answered);
    const solvedCount = answeredEntries.length;
    const correctCount = answeredEntries.filter((a) => a.correct).length;
    const wrongCount = solvedCount - correctCount;
    const solvedPct = questions.length ? (solvedCount / questions.length) * 100 : 0;
    const goTo = (idx) => {
      const saved = answered[idx];
      const targetQuestion = questions[idx];
      const targetIsMCQ = Array.isArray(targetQuestion?.options) && targetQuestion.options.length > 0;
      setCurrentQuestion(idx);
      setSelectedOption(saved?.picked && targetIsMCQ ? saved.picked : "");
      setNumericAnswer(saved?.picked && !targetIsMCQ ? saved.picked : "");
      setShowResult(!!saved);
    };
    const submit = () => {
      if (!userAnswer || answered[currentQuestion]) return;
      if (isCorrect) setScore((p) => p + 1);
      setAnswered({ ...answered, [currentQuestion]: { picked: userAnswer, correct: isCorrect } });
      setShowResult(true);
    };
    const next = () => {
      if (currentQuestion < questions.length - 1) goTo(currentQuestion + 1);
      else setFinished(true);
    };
    const prev = () => {
      if (currentQuestion > 0) goTo(currentQuestion - 1);
    };
    const skipBrokenQuestion = () => {
      setAnswered({ ...answered, [currentQuestion]: { picked: "Skipped", correct: false } });
      next();
    };
    return (
      <div className="page">
        <Header subtitle={selectedChapter} />
        <div className="toolbar">
          <button className="btn btn-ghost" onClick={() => {
            setSelectedChapter(null);
            setQuestions([]);
            setAnswered({});
            setCurrentQuestion(0);
            setSelectedOption("");
            setNumericAnswer("");
            setShowResult(false);
            setError("");
          }}>← Chapters</button>
          <div className="tracker">
            <span className="tracker-item">Solved: <strong>{solvedCount}</strong> / {questions.length}</span>
            <span className="tracker-item tracker-correct">✓ {correctCount}</span>
            <span className="tracker-item tracker-wrong">✗ {wrongCount}</span>
          </div>
        </div>
        <div className="tracker-bar">
          <div className="tracker-bar-fill" style={{ width: `${solvedPct}%` }} />
        </div>
        <QuestionErrorBoundary key={question.id ?? currentQuestion} onSkip={skipBrokenQuestion}>
          <div className="card">
            <div className="q-meta">
              <span className="chip">Q {currentQuestion + 1} / {questions.length}</span>
              {question.year && <span className="chip chip-muted">JEE {question.year}</span>}
              <span className="chip chip-muted">{isMCQ ? "MCQ" : "Numerical"}</span>
            </div>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${((currentQuestion + (showResult ? 1 : 0)) / questions.length) * 100}%` }} />
            </div>
            <div className="question-body"><MathHTML html={question.question} /></div>
            {isMCQ ? (
              <div className="options">
                {question.options.map((option, idx) => {
                  const picked = selectedOption === option.identifier;
                  const correctAns = showResult && correct.includes(option.identifier);
                  const wrongPick = showResult && picked && !correctAns;
                  const cls = [
                    "option",
                    picked && !showResult ? "option-picked" : "",
                    correctAns ? "option-correct" : "",
                    wrongPick ? "option-wrong" : "",
                  ].join(" ");
                  return (
                    <button
                      key={`${option.identifier}-${idx}`}
                      className={cls}
                      disabled={showResult}
                      onClick={() => setSelectedOption(option.identifier)}
                    >
                      <span className="option-id">{option.identifier}</span>
                      <span className="option-content"><MathHTML html={option.content} /></span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="numeric-block">
                <label className="muted" style={{ display: "block", marginBottom: 8 }}>Your answer</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="numeric-input"
                  placeholder="Type your answer…"
                  value={numericAnswer}
                  disabled={showResult}
                  onChange={(e) => setNumericAnswer(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !showResult) submit(); }}
                />
              </div>
            )}
            {!showResult ? (
              <div className="nav-row" style={{ borderTop: 0, paddingTop: 0 }}>
                <button className="btn btn-ghost" onClick={skipBrokenQuestion}>Skip</button>
                <button className="btn btn-primary" disabled={!userAnswer} onClick={submit}>Submit Answer</button>
              </div>
            ) : (
              <div className="result-block">
                <div className={isCorrect ? "verdict verdict-ok" : "verdict verdict-no"}>
                  {isCorrect ? "Correct ✅" : "Wrong ❌"}
                </div>
                <p className="muted">Correct answer: <strong>{correct.join(", ")}</strong></p>
                {question.explanation && (
                  <details className="explain">
                    <summary>Show explanation</summary>
                    <div className="explain-body"><MathHTML html={question.explanation} /></div>
                  </details>
                )}
              </div>
            )}
            <div className="nav-row">
              <button className="btn btn-ghost" onClick={prev} disabled={currentQuestion === 0}>← Previous</button>
              <button className="btn btn-primary" onClick={next}>
                {currentQuestion < questions.length - 1 ? "Next →" : "Finish"}
              </button>
            </div>
          </div>
        </QuestionErrorBoundary>
      </div>
    );
  }
  if (subject) {
    const meta = SUBJECT_META[subject];
    return (
      <div className="page">
        <Header subtitle={meta.tag} />
        <div className="toolbar">
          <button className="btn btn-ghost" onClick={() => { setSubject(null); setChapters([]); setError(""); }}>← Back</button>
          <span className="muted">{chapters.length} chapters</span>
        </div>
        {error && <div className="card center-card" style={{ marginBottom: 16 }}><p className="muted">{error}</p></div>}
        {loadingChapters ? (
          <div className="card center-card"><div className="spinner" />Loading chapters…</div>
        ) : (
          <div className="grid">
            {chapters.map((chapter) => (
              <button key={chapter} className="tile" onClick={() => loadQuestions(chapter)}>
                <span className="tile-title">{chapter}</span>
                <span className="tile-arrow">→</span>
              </button>
            ))}
          </div>
        )}
        {loadingQuestions && <div className="floating-loader">Loading questions…</div>}
      </div>
    );
  }
  return (
    <div className="page">
      <Header />
      <div className="hero-block">
        <p className="kicker">JEE Mains • Previous Year Questions</p>
        <h2 className="hero-title">Practice smarter. Score higher.</h2>
        <p className="muted">Pick a subject to practice every PYQ from the last 5 years, with live progress tracking.</p>
      </div>
      <div className="subject-grid">
        {subjects.map((sub) => {
          const m = SUBJECT_META[sub];
          return (
            <button key={sub} className={`subject-card subject-${sub}`} onClick={() => setSubject(sub)}>
              <div className="subject-emoji">{m.emoji}</div>
              <div className="subject-name">{m.tag}</div>
              <div className="subject-cta">Start →</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
function Header({ subtitle }) {
  return (
    <header className="app-header">
      <div className="logo">
        <span className="logo-dot" />
        <span className="logo-text">Prepify</span>
      </div>
      {subtitle && <div className="header-sub">{subtitle}</div>}
    </header>
  );
}
