import { useEffect, useRef, useState } from "react";
import { zipSync, strToU8 } from "fflate";
import {
  markdown,
  transcriptText,
  timeLabel,
  type Result,
} from "../shared/schema";
import { runPipeline, validateFile, type Stage } from "./api";

type Tab = "minutes" | "tasks" | "raw" | "refined";
const steps: { key: Stage; label: string; detail: string }[] = [
  {
    key: "transcription",
    label: "Transcribe",
    detail: "Capture what was said",
  },
  { key: "refinement", label: "Refine", detail: "Clear up terminology" },
  { key: "record", label: "Make it useful", detail: "Minutes & next steps" },
];
function Arrow() {
  return <span aria-hidden="true">↗</span>;
}
function download(name: string, content: string | Uint8Array, type: string) {
  const blob = new Blob(
    [
      typeof content === "string"
        ? content
        : (content.slice().buffer as ArrayBuffer),
    ],
    { type },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function App() {
  const [file, setFile] = useState<File>();
  const [url, setUrl] = useState("");
  const [glossary, setGlossary] = useState("");
  const [result, setResult] = useState<Result>();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage>();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("minutes");
  const [drag, setDrag] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [duration, setDuration] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const controller = useRef<AbortController | undefined>(undefined);
  const runId = useRef(0);
  const resultRef = useRef<Result | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  function choose(f?: File) {
    if (!f) return;
    controller.current?.abort();
    runId.current++;
    setBusy(false);
    setError("");
    setStatus("");
    setStage(undefined);
    setResult(undefined);
    resultRef.current = undefined;
    setDuration(0);
    setTab("minutes");
    try {
      validateFile(f);
      setFile(f);
    } catch (e) {
      setFile(undefined);
      setError((e as Error).message);
    }
  }
  async function sample() {
    setLoadingSample(true);
    setError("");
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}sample-meeting.wav`);
      if (!r.ok)
        throw new Error(
          "The sample could not be loaded. Please upload your own audio.",
        );
      choose(
        new File([await r.blob()], "sample-meeting.wav", { type: "audio/wav" }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingSample(false);
    }
  }
  async function start() {
    if (!file) return;
    const id = ++runId.current;
    const control = new AbortController();
    controller.current = control;
    setBusy(true);
    setError("");
    try {
      // Exact silence is checked locally where this browser can decode the format.
      if (!resultRef.current) {
        setStatus("Checking the audio…");
        let context: AudioContext | undefined;
        try {
          context = new AudioContext();
          const decoded = await context.decodeAudioData(
            await file.arrayBuffer(),
          );
          let peak = 0;
          for (let c = 0; c < decoded.numberOfChannels; c++) {
            const values = decoded.getChannelData(c);
            for (let i = 0; i < values.length; i += 16)
              peak = Math.max(peak, Math.abs(values[i]));
          }
          if (peak < 0.0001) throw new Error("SILENT_AUDIO");
        } catch (e) {
          if ((e as Error).message === "SILENT_AUDIO")
            throw new Error(
              "This recording appears silent. Choose a file with audible English speech.",
            );
        } finally {
          await context?.close();
        }
      }
      control.signal.throwIfAborted();
      await runPipeline(
        file,
        glossary,
        resultRef.current,
        control.signal,
        (r) => {
          if (id === runId.current && mounted.current) {
            resultRef.current = r;
            setResult(r);
          }
        },
        (s, m) => {
          if (id === runId.current && mounted.current) {
            setStage(s);
            setStatus(m);
          }
        },
      );
      if (id === runId.current) {
        setStatus("Your meeting record is ready.");
        setTab("minutes");
      }
    } catch (e) {
      if (id === runId.current) {
        if (control.signal.aborted)
          setStatus(
            "Paused. Completed stages are preserved; resume when you’re ready.",
          );
        else {
          setError((e as Error).message);
          setStatus(
            "This run needs attention. Completed results are available below.",
          );
        }
      }
    } finally {
      if (id === runId.current && mounted.current) setBusy(false);
    }
  }
  function seek(id: string) {
    const segment =
      result?.refined?.segments.find((s) => s.id === id) ||
      result?.raw.segments.find((s) => s.id === id);
    if (segment && audio.current) {
      audio.current.currentTime = segment.start;
      void audio.current.play().catch(() => {});
    }
  }
  function refs(ids: string[]) {
    return ids.length ? (
      <span className="references">
        {ids.map((id) => (
          <button
            key={id}
            onClick={() => seek(id)}
            title="Play this part of the recording"
          >
            ↗{" "}
            {timeLabel(
              result?.raw.segments.find((s) => s.id === id)?.start || 0,
            )}
          </button>
        ))}
      </span>
    ) : null;
  }
  function bundle() {
    if (!result) return;
    const files: Record<string, Uint8Array> = {
      "raw-transcript.txt": strToU8(transcriptText(result.raw)),
      "meeting-record.json": strToU8(JSON.stringify(result, null, 2)),
      "meeting-record.md": strToU8(markdown(result)),
    };
    if (result.refined)
      files["refined-transcript.txt"] = strToU8(transcriptText(result.refined));
    download("meeting-spitter-results.zip", zipSync(files), "application/zip");
  }
  const complete = !!result?.record;
  const active = steps.findIndex((s) => s.key === stage);
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-mark" aria-hidden="true">
            m<span>·</span>
          </span>
          meeting_spitter
        </a>
        <span className="top-note">
          <i /> Spill the meeting. Keep the receipts.
        </span>
        <a
          className="source-link"
          href="https://github.com/Choco-princess/meeting_spitter"
          target="_blank"
          rel="noreferrer"
        >
          View project <Arrow />
        </a>
      </header>
      <main>
        <section className="intro">
          <div className="eyebrow">
            <span /> LESS YAPPING. MORE HAPPENING.
          </div>
          <h1>
            This meeting could’ve
            <br />
            <em>been a to-do list.</em>
          </h1>
          <p>
            Drop the recording. Get the minutes, decisions and next steps.
            <br className="desktop-break" /> For everyone who nodded and then
            forgot what they agreed to.
          </p>
        </section>
        <div className="workspace">
          <section className="input-panel" aria-labelledby="upload-title">
            <div className="panel-heading">
              <span className="section-index">01</span>
              <div>
                <h2 id="upload-title">Drop the meeting</h2>
                <p>You did the talking. We’ll take notes.</p>
              </div>
            </div>
            <input
              ref={fileInput}
              data-testid="audio-upload"
              id="audio-upload"
              type="file"
              accept=".wav,.mp3,.m4a,.ogg,.webm,.flac"
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = "";
              }}
              disabled={busy || loadingSample}
              className="visually-hidden"
            />
            <button
              className={`dropzone ${drag ? "dragging" : ""} ${file ? "has-file" : ""}`}
              onClick={() => fileInput.current?.click()}
              disabled={busy || loadingSample}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (!busy && !loadingSample) choose(e.dataTransfer.files[0]);
              }}
            >
              <span className="upload-icon" aria-hidden="true">
                {file ? "♫" : "↑"}
              </span>
              <strong>{file ? file.name : "Drop your meeting here"}</strong>
              <span>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(1)} MB${duration ? ` · ${timeLabel(duration)}` : ""} · Click to replace`
                  : "or click to choose an audio file"}
              </span>
              <small>WAV, MP3, M4A, OGG, WebM, FLAC · up to 24 MB</small>
            </button>
            {url && (
              <audio
                ref={audio}
                src={url}
                controls
                onLoadedMetadata={(e) =>
                  setDuration(
                    Number.isFinite(e.currentTarget.duration)
                      ? e.currentTarget.duration
                      : 0,
                  )
                }
                aria-label="Meeting recording"
              />
            )}
            <div className="sample-row">
              <span>Synthetic demo · 1:40</span>
              <button disabled={busy || loadingSample} onClick={sample}>
                {loadingSample ? "Loading…" : "Try a sample meeting"} <Arrow />
              </button>
            </div>
            <label className="field-label" htmlFor="glossary">
              A little context <span>optional</span>
            </label>
            <textarea
              id="glossary"
              value={glossary}
              onChange={(e) => setGlossary(e.target.value)}
              disabled={busy || !!result?.refined}
              maxLength={2000}
              placeholder="Names, acronyms or technical terms. E.g. Kubernetes, PostgreSQL, p95 latency."
              rows={3}
            />
            <div className="start-row">
              <button
                className="primary"
                onClick={start}
                disabled={!file || busy || loadingSample || complete}
              >
                {busy ? (
                  <>
                    <span className="spinner" /> Working on it…
                  </>
                ) : complete ? (
                  <>
                    Record ready <span>✓</span>
                  </>
                ) : (
                  <>
                    {result ? "Resume processing" : "Spit the minutes"}{" "}
                    <span>→</span>
                  </>
                )}
              </button>
              {busy && (
                <button
                  className="cancel"
                  onClick={() => controller.current?.abort()}
                >
                  Cancel
                </button>
              )}
            </div>
            <p className="privacy">
              Your audio is processed through Cloudflare and Groq. No recording
              is saved by this app. English audio; short meetings work best.
              Current transcript limit: 14,000 characters.
            </p>
          </section>
          <section className="output-panel" aria-labelledby="output-title">
            <div className="panel-heading">
              <span className="section-index">02</span>
              <div>
                <h2 id="output-title">The minutes. The mission.</h2>
                <p>Who’s doing what? Start here.</p>
              </div>
              <span className={`status-pill ${complete ? "done" : ""}`}>
                {complete ? "READY" : busy ? "IN PROGRESS" : "YOUR WORKSPACE"}
              </span>
            </div>
            <div className="steps">
              {steps.map((s, i) => {
                const done =
                  i === 0
                    ? !!result?.raw
                    : i === 1
                      ? !!result?.refined
                      : !!result?.record;
                return (
                  <div
                    key={s.key}
                    className={`step ${done ? "finished" : ""} ${busy && active === i ? "active" : ""}`}
                  >
                    <span className="step-number">
                      {done ? "✓" : `0${i + 1}`}
                    </span>
                    <div>
                      <strong>{s.label}</strong>
                      <small>{s.detail}</small>
                    </div>
                  </div>
                );
              })}
            </div>
            <div
              role="status"
              aria-live="polite"
              className={`run-status ${status ? "visible" : ""}`}
            >
              {status}
            </div>
            {error && (
              <div role="alert" className="error-box">
                <strong>Let’s get this back on track.</strong>
                <p>{error}</p>
              </div>
            )}
            {!result ? (
              <div className="empty-state">
                <div className="paper-art" aria-hidden="true">
                  <span className="paper-top">
                    MEETING NOTES <i>✦</i>
                  </span>
                  <b />
                  <b />
                  <b />
                  <div className="paper-task">
                    <i>✓</i>
                    <b />
                  </div>
                  <div className="paper-task">
                    <i>✓</i>
                    <b />
                  </div>
                  <span className="paper-sticker">Keep the receipts.</span>
                </div>
                <h3>“Wait, what did we agree to?”</h3>
                <p>
                  Your future self would like some notes.
                  <br />
                  They’ll land right here.
                </p>
                <div className="empty-tags">
                  <span>Clear minutes</span>
                  <span>Actual decisions</span>
                  <span>Useful next steps</span>
                </div>
              </div>
            ) : (
              <>
                <nav className="tabs" aria-label="Meeting results">
                  {(
                    [
                      ["minutes", "Minutes"],
                      ["tasks", "Decisions & tasks"],
                      ["raw", "Raw transcript"],
                      ["refined", "Refined transcript"],
                    ] as [Tab, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      aria-pressed={tab === id}
                      className={tab === id ? "selected" : ""}
                      onClick={() => setTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                <div className="result-body">
                  {(tab === "minutes" || tab === "tasks") && !result.record ? (
                    <div className="waiting">
                      <h3>Your transcript is available.</h3>
                      <p>
                        {busy
                          ? "We’re preparing the rest of your record."
                          : "Resume processing to finish your minutes and action items."}
                      </p>
                      <button onClick={() => setTab("raw")}>
                        Read raw transcript →
                      </button>
                    </div>
                  ) : null}
                  {tab === "minutes" && result.record && (
                    <>
                      <div className="result-kicker">
                        THE MEETING, MADE CLEAR
                      </div>
                      <h3>{result.record.title}</h3>
                      <ul className="summary-list">
                        {result.record.summary.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                      <div className="divider" />
                      {result.record.minutes.map((m, i) => (
                        <section className="minute-topic" key={i}>
                          <h4>{m.topic}</h4>
                          <ul>
                            {m.points.map((p, j) => (
                              <li key={j}>{p}</li>
                            ))}
                          </ul>
                        </section>
                      ))}
                      {result.record.openQuestions.length > 0 && (
                        <section className="open-questions">
                          <h4>Still on the table</h4>
                          <ul>
                            {result.record.openQuestions.map((q, i) => (
                              <li key={i}>{q}</li>
                            ))}
                          </ul>
                        </section>
                      )}
                    </>
                  )}
                  {tab === "tasks" && result.record && (
                    <>
                      <div className="subheading">
                        <h3>Decisions</h3>
                        <span>{result.record.decisions.length} confirmed</span>
                      </div>
                      {!result.record.decisions.length && (
                        <p className="muted">
                          No confirmed decisions were identified.
                        </p>
                      )}
                      {result.record.decisions.map((d, i) => (
                        <div className="decision" key={i}>
                          <span className="decision-check">✓</span>
                          <div>
                            <p>{d.text}</p>
                            {refs(d.sourceIds)}
                          </div>
                        </div>
                      ))}
                      <div className="subheading task-heading">
                        <h3>Action items</h3>
                        <span>{result.record.tasks.length} next steps</span>
                      </div>
                      {!result.record.tasks.length && (
                        <p className="muted">
                          No confirmed action items were identified.
                        </p>
                      )}
                      {result.record.tasks.map((t, i) => (
                        <article className="task-card" key={i}>
                          <span className="task-index">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div>
                            <h4>{t.description}</h4>
                            <div className="task-meta">
                              <span>
                                Owner{" "}
                                <strong>{t.owner ?? "Unspecified"}</strong>
                              </span>
                              <span>
                                Due{" "}
                                <strong>{t.deadline ?? "Unspecified"}</strong>
                              </span>
                            </div>
                            {refs(t.sourceIds)}
                          </div>
                        </article>
                      ))}
                    </>
                  )}
                  {(tab === "raw" || tab === "refined") && (
                    <>
                      {tab === "refined" && !result.refined ? (
                        <p className="muted">
                          The refined transcript will appear after terminology
                          review.
                        </p>
                      ) : (
                        <>
                          <div className="subheading">
                            <h3>
                              {tab === "raw"
                                ? "As transcribed"
                                : "After terminology review"}
                            </h3>
                            <span>
                              {
                                (tab === "raw" ? result.raw : result.refined!)
                                  .segments.length
                              }{" "}
                              segments
                            </span>
                          </div>
                          <p className="transcript-hint">
                            Click a timestamp to listen. This version does not
                            identify or label speakers.
                          </p>
                          {(tab === "raw"
                            ? result.raw
                            : result.refined!
                          ).segments.map((s) => (
                            <div className="transcript-segment" key={s.id}>
                              <button onClick={() => seek(s.id)}>
                                {timeLabel(s.start)}
                              </button>
                              <p>{s.text}</p>
                            </div>
                          ))}
                        </>
                      )}
                      {tab === "refined" && result.refined && (
                        <details className="changes">
                          <summary>
                            Terminology changes (
                            {result.corrections.filter((c) => c.applied).length}{" "}
                            applied)
                          </summary>
                          {result.corrections.length ? (
                            result.corrections.map((c, i) => (
                              <div className="change" key={i}>
                                <p>
                                  <del>{c.original}</del> →{" "}
                                  <strong>{c.replacement}</strong>{" "}
                                  {!c.applied && <span> · Not applied</span>}
                                </p>
                                <small>{c.note || c.reason}</small>
                              </div>
                            ))
                          ) : (
                            <p>No terminology changes were needed.</p>
                          )}
                        </details>
                      )}
                    </>
                  )}
                </div>
                {result.warnings.length > 0 && (
                  <div className="review-notes">
                    {result.warnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                  </div>
                )}
                <footer className="downloads">
                  <div>
                    <strong>Take it with you.</strong>
                    <small>
                      Review important details against the recording.
                    </small>
                  </div>
                  <button className="download-all" onClick={bundle}>
                    Download all ↓
                  </button>
                  <div className="individual-downloads">
                    <button
                      onClick={() =>
                        download(
                          "raw-transcript.txt",
                          transcriptText(result.raw),
                          "text/plain",
                        )
                      }
                    >
                      Raw TXT
                    </button>
                    <button
                      disabled={!result.refined}
                      onClick={() =>
                        download(
                          "refined-transcript.txt",
                          transcriptText(result.refined!),
                          "text/plain",
                        )
                      }
                    >
                      Refined TXT
                    </button>
                    <button
                      disabled={!result.record}
                      onClick={() =>
                        download(
                          "meeting-record.md",
                          markdown(result),
                          "text/markdown",
                        )
                      }
                    >
                      Minutes MD
                    </button>
                    <button
                      onClick={() =>
                        download(
                          "meeting-record.json",
                          JSON.stringify(result, null, 2),
                          "application/json",
                        )
                      }
                    >
                      Record JSON
                    </button>
                  </div>
                </footer>
              </>
            )}
          </section>
        </div>
        <section className="principles">
          <div>
            <span>01 / LISTEN</span>
            <p>The original transcript stays intact.</p>
          </div>
          <div>
            <span>02 / CLARIFY</span>
            <p>Technical terms get a second look.</p>
          </div>
          <div>
            <span>03 / FOLLOW THROUGH</span>
            <p>Unstated owners and dates stay unspecified.</p>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span>
          meeting_spitter <span className="footer-dot">·</span> Built for the
          part after “great meeting, everyone.”
        </span>
        <span>Three model stages. One useful record.</span>
      </footer>
    </div>
  );
}
