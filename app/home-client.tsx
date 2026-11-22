"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  Film, UploadCloud, Sun, Moon, FileVideo, Settings2, Sparkles,
  Clapperboard, ArrowUpRight, Clock3, ShieldCheck, X, CheckCircle2,
  LoaderCircle, AlertCircle, Download,
} from "lucide-react";

function apiUrl(path: string) {
  return path;
}

type Job = {
  id: string;
  status: "queued" | "analyzing" | "writing" | "rendering" | "completed" | "failed";
  progress: number;
  message?: string | null;
  output_url?: string | null;
};

function sizeLabel(n: number) {
  return n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB";
}

function statusLabel(status: Job["status"]) {
  const labels: Record<Job["status"], string> = {
    queued: "In the queue", analyzing: "Finding the story", writing: "Writing narration",
    rendering: "Creating your Short", completed: "Your Short is ready", failed: "Something went wrong",
  };
  return labels[status];
}

export default function HomeClient() {
  const input = useRef<HTMLInputElement>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  function choose(f?: File) {
    if (!f) return;
    const allowed = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"];
    if (!allowed.includes(f.type)) {
      setNotice("Please choose an MP4, MOV, WebM or MKV video.");
      return;
    }
    if (f.size > 45_000_000) {
      setNotice("The free plan allows videos up to 45 MB.");
      return;
    }
    setFile(f);
    setNotice("");
    setJob(null);
  }

  async function pollJob(jobId: string) {
    try {
      const response = await fetch(apiUrl(`/api/jobs/${jobId}`), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.detail || "Could not check processing status.");
      setJob(data);
      if (data.status === "completed" || data.status === "failed") {
        setBusy(false);
        return;
      }
      pollTimer.current = setTimeout(() => void pollJob(jobId), 4000);
    } catch (error) {
      setBusy(false);
      setNotice(error instanceof Error ? error.message : "Could not check processing status.");
    }
  }

  async function generate() {
    if (!file || busy) return;
    setBusy(true);
    setNotice("");
    setJob(null);
    let stage = "Connecting to TMC";
    try {
      stage = "Requesting a secure upload";
      const uploadResponse = await fetch(apiUrl("/api/uploads"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_name: file.name, content_type: file.type, size_bytes: file.size }),
      });
      const upload = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(upload.error || upload.detail || "Could not prepare the secure upload.");

      stage = "Uploading your video to secure storage";
      const storageResponse = await fetch(upload.upload_url, {
        method: upload.upload_method || "PUT",
        body: file,
      });
      if (!storageResponse.ok) throw new Error("The video upload failed. Please try again.");

      stage = "Starting video processing";
      const jobResponse = await fetch(apiUrl("/api/jobs"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_id: upload.upload_id, object_key: upload.object_key, file_name: file.name }),
      });
      const created = await jobResponse.json();
      if (!jobResponse.ok) throw new Error(created.error || created.detail || "Could not start your Short.");

      setJob({ id: created.id, status: created.status, progress: 0, message: "Your video is uploaded. TMC is preparing your Short." });
      setFile(null);
      stage = "Checking processing status";
      await pollJob(created.id);
    } catch (error) {
      setBusy(false);
      const detail = error instanceof Error ? error.message : "Unknown network error";
      setNotice(`${stage}: ${detail}`);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">T</div><span className="brand-name">tmc<span style={{ color: "var(--lime)" }}>.</span></span></div>
        <div className="nav-label">Workspace</div>
        <a className="nav-link active" href="#create"><Clapperboard size={17}/><span>Create Short</span></a>
        <a className="nav-link" href="#projects"><FileVideo size={17}/><span>Your Projects</span></a>
        <a className="nav-link" href="#settings"><Settings2 size={17}/><span>Settings</span></a>
        <div className="sidebar-note"><strong style={{ color: "var(--text)" }}>Made for the scroll.</strong><br/>Turn your best moments into the next great Short.</div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="eyebrow">Your creative workspace</div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={16}/> : <Moon size={16}/>}</button>
            <div className="avatar">A</div>
          </div>
        </header>
        <section className="hero" id="create">
          <div className="eyebrow">The AI Shorts Factory</div>
          <h1>One video in.<br/><span>One great Short out.</span></h1>
          <p>Drop in your video. TMC finds the story, writes the narration, adds the voice and captions, and prepares it for the vertical feed.</p>
        </section>
        <section className="upload-card">
          <div className={"dropzone " + (drag ? "dragging" : "")}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); choose(e.dataTransfer.files?.[0]); }}
            onClick={() => input.current?.click()} role="button" tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}>
            <input ref={input} hidden type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska" onChange={e => choose(e.target.files?.[0])}/>
            <div className="upload-icon"><UploadCloud size={23}/></div>
            <h3>Drop your video here</h3>
            <p>or <button className="browse" type="button" onClick={e => { e.stopPropagation(); input.current?.click(); }}>browse files</button> from your device</p>
            {file && <div className="file-chip" onClick={e => e.stopPropagation()}>
              <Film size={18} color="var(--lime)"/>
              <div><strong>{file.name}</strong><small>{sizeLabel(file.size)} · Ready to upload</small></div>
              <button className="icon-button" aria-label="Remove video" onClick={() => { setFile(null); setNotice(""); }}><X size={14}/></button>
            </div>}
          </div>
          <div className="generate-row">
            <div className="format-note"><Clock3 size={14}/>60 seconds · 9:16 vertical · 1080 × 1920</div>
            <button className="generate-button" disabled={!file || busy} onClick={generate}>
              {busy ? <LoaderCircle className="spin" size={15}/> : <Sparkles size={15}/>}
              {busy ? "Working..." : "Generate my Short"}<ArrowUpRight size={14}/>
            </button>
          </div>
        </section>
        {notice && <div className="toast error" role="alert"><AlertCircle size={16}/>{notice}</div>}
        <section id="projects">
          <div className="section-head"><h2>Your Projects</h2><span>Recent creations</span></div>
          {job ? (
            <div className="project-card">
              <div className="project-icon">{job.status === "completed" ? <CheckCircle2 size={18}/> : job.status === "failed" ? <AlertCircle size={18}/> : <LoaderCircle className="spin" size={18}/>}</div>
              <div className="project-details">
                <strong>{statusLabel(job.status)}</strong>
                <p>{job.message || "TMC is working on your video."}</p>
                {job.status !== "failed" && <div className="progress-track"><div className="progress-fill" style={{ width: `${job.progress}%` }}/></div>}
              </div>
              {job.status === "completed" && job.output_url && <a className="download-link" href={job.output_url} target="_blank" rel="noreferrer"><Download size={15}/>Download</a>}
            </div>
          ) : (
            <div className="empty-projects"><div className="empty-icon"><FileVideo size={18}/></div><div><strong>Your next Short starts here</strong><p>Your videos and their progress will show up here once you create a project.</p></div></div>
          )}
        </section>
        <section id="settings">
          <div className="section-head"><h2>Settings</h2><span>Preferences</span></div>
          <div className="empty-projects"><div className="empty-icon"><ShieldCheck size={18}/></div><div><strong>Everything in one simple place</strong><p>Voice, caption style and workflow preferences will live here.</p></div></div>
        </section>
        <div className="footer-note">TMC · Make something worth watching.</div>
      </main>
    </div>
  );
}
