"""
j_transcript_ai.py  —  jTranscript AI
Step 4: Expand button for full text, virtual scrolling for large transcripts
"""

import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog
import os
import threading
import assemblyai as aai
import pygame


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ASSEMBLYAI_API_KEY = "f6b0d602a1164df6b1509d99c9bcb50f"

SNIPPET_LEN = 80       # chars before truncation
ROW_HEIGHT  = 36       # estimated px per collapsed row (for virtual scroll)


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

class Utterance:
    def __init__(self, speaker: str, text: str, start_ms: int, end_ms: int):
        self.speaker      = speaker
        self.text         = text
        self.start_ms     = start_ms
        self.end_ms       = end_ms

    def timecode(self) -> str:
        total_sec = self.start_ms // 1000
        h = total_sec // 3600
        m = (total_sec % 3600) // 60
        s = total_sec % 60
        return f"{h:02d}:{m:02d}:{s:02d}"

    @property
    def needs_expand(self) -> bool:
        return len(self.text) > SNIPPET_LEN


# ---------------------------------------------------------------------------
# Transcription
# ---------------------------------------------------------------------------

def run_transcription(audio_path: str, status_callback) -> list:
    aai.settings.api_key = ASSEMBLYAI_API_KEY
    print(f"Starting transcription: {audio_path}")
    status_callback("Uploading audio...")

    config = aai.TranscriptionConfig(
        speaker_labels=True,
        speech_models=[aai.SpeechModel.universal]
    )
    transcriber = aai.Transcriber()
    print("Submitting to AssemblyAI...")
    status_callback("Transcribing... (this may take several minutes)")

    transcript = transcriber.transcribe(audio_path, config=config)
    print(f"Transcription status: {transcript.status}")

    if transcript.status == aai.TranscriptStatus.error:
        raise RuntimeError(f"AssemblyAI error: {transcript.error}")

    print(f"Got {len(transcript.utterances)} utterances")
    status_callback("Done.")

    return [
        Utterance(
            speaker=f"SPEAKER {u.speaker}",
            text=u.text,
            start_ms=u.start,
            end_ms=u.end
        )
        for u in transcript.utterances
    ]


def format_transcript(utterances: list) -> str:
    return "\n".join(f"{u.speaker}:  {u.text}" for u in utterances)


def save_output(audio_path: str, text: str) -> str:
    base = os.path.splitext(audio_path)[0]
    output_path = base + "_transcript.txt"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(text)
    return output_path


# ---------------------------------------------------------------------------
# Audio player
# ---------------------------------------------------------------------------

class AudioPlayer:
    def __init__(self):
        pygame.mixer.init()
        self._loaded_path = None

    def load(self, path: str):
        if self._loaded_path != path:
            pygame.mixer.music.load(path)
            self._loaded_path = path

    def play_from(self, path: str, start_ms: int):
        try:
            self.load(path)
            pygame.mixer.music.play(start=start_ms / 1000.0)
        except Exception as e:
            print(f"Audio playback error: {e}")
            messagebox.showerror("Playback error",
                f"Could not play audio:\n{e}\n\nMP3 files work best.")

    def stop(self):
        pygame.mixer.music.stop()


player = AudioPlayer()


# ---------------------------------------------------------------------------
# Review window  (virtual scrolling)
# ---------------------------------------------------------------------------

class ReviewWindow(tk.Toplevel):

    ROW_BG      = ["#ffffff", "#f7f7f7"]
    HEADER_BG   = "#2563eb"
    HEADER_FG   = "#ffffff"
    VISIBLE_PAD = 5      # extra rows to render above/below visible area

    def __init__(self, parent, utterances: list, audio_path: str):
        super().__init__(parent)
        self.title("jTranscript AI — Review")
        self.configure(bg="#f0f0f0")
        self.utterances  = utterances
        self.audio_path  = audio_path
        self._expanded   = set()      # indices of expanded rows
        self._row_frames = {}         # index -> Frame currently rendered
        self._row_tops   = []         # y-top of each row (recomputed on changes)

        self.geometry("960x650")
        self.minsize(700, 400)

        self._build_ui()
        self._compute_row_tops()
        self._render_visible()

    # ------------------------------------------------------------------ UI --

    def _build_ui(self):
        # Top bar
        top = tk.Frame(self, bg=self.HEADER_BG, pady=8)
        top.pack(fill="x")
        tk.Label(top, text="Review Transcript",
                 font=("Segoe UI", 12, "bold"),
                 bg=self.HEADER_BG, fg="white").pack(side="left", padx=16)
        tk.Button(top, text="💾  Save .txt", font=("Segoe UI", 9),
                  command=self._save,
                  bg="#1d4ed8", fg="white", relief="flat",
                  padx=12).pack(side="right", padx=8, pady=2)
        tk.Button(top, text="⏹  Stop audio", font=("Segoe UI", 9),
                  command=player.stop,
                  bg="#1d4ed8", fg="white", relief="flat",
                  padx=12).pack(side="right", padx=4, pady=2)

        # Column headers
        hdr = tk.Frame(self, bg=self.HEADER_BG)
        hdr.pack(fill="x")
        for text, width in [("Time", 8), ("Speaker", 18), ("Text", 0)]:
            kw = {"width": width} if width else {}
            tk.Label(hdr, text=text, font=("Segoe UI", 9, "bold"),
                     bg=self.HEADER_BG, fg=self.HEADER_FG,
                     anchor="w", padx=6, **kw).pack(side="left")
        tk.Label(hdr, text="", bg=self.HEADER_BG,
                 width=22).pack(side="right")

        # Canvas + scrollbar
        container = tk.Frame(self, bg="#f0f0f0")
        container.pack(fill="both", expand=True)

        self.canvas = tk.Canvas(container, bg="#f0f0f0",
                                highlightthickness=0)
        sb = tk.Scrollbar(container, orient="vertical",
                          command=self._on_scroll_command)
        self.canvas.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        self.canvas.pack(side="left", fill="both", expand=True)

        # Inner frame on canvas
        self.inner = tk.Frame(self.canvas, bg="#f0f0f0")
        self._inner_id = self.canvas.create_window(
            (0, 0), window=self.inner, anchor="nw")

        self.inner.bind("<Configure>", self._on_inner_configure)
        self.canvas.bind("<Configure>", self._on_canvas_configure)
        self.canvas.bind_all("<MouseWheel>", self._on_mousewheel)

    def _on_inner_configure(self, e):
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))

    def _on_canvas_configure(self, e):
        self.canvas.itemconfig(self._inner_id, width=e.width)
        self._render_visible()

    def _on_scroll_command(self, *args):
        self.canvas.yview(*args)
        self._render_visible()

    def _on_mousewheel(self, e):
        self.canvas.yview_scroll(-1 * (e.delta // 120), "units")
        self._render_visible()

    # ------------------------------------------------- virtual scroll ------

    def _compute_row_tops(self):
        """Compute y-top for each row based on collapsed/expanded state."""
        tops = []
        y = 0
        for i, utt in enumerate(self.utterances):
            tops.append(y)
            if i in self._expanded:
                # Estimate expanded height: wrap at ~100 chars per line
                lines = max(1, len(utt.text) // 100 + 1)
                y += ROW_HEIGHT + lines * 16
            else:
                y += ROW_HEIGHT
        self._row_tops = tops
        self._total_height = y
        # Update inner frame height so scrollbar is correct
        self.inner.configure(height=self._total_height)

    def _visible_range(self):
        """Return (first_index, last_index) of rows in the visible viewport."""
        if not self._row_tops:
            return 0, 0
        canvas_h = self.canvas.winfo_height()
        top_frac, bot_frac = self.canvas.yview()
        view_top = top_frac * self._total_height
        view_bot = bot_frac * self._total_height + canvas_h

        first = 0
        last  = len(self.utterances) - 1
        for i, y in enumerate(self._row_tops):
            if y <= view_top:
                first = max(0, i - self.VISIBLE_PAD)
            if y <= view_bot:
                last = min(len(self.utterances) - 1, i + self.VISIBLE_PAD)
        return first, last

    def _render_visible(self):
        """Render only the rows in the current viewport; destroy others."""
        first, last = self._visible_range()
        needed = set(range(first, last + 1))

        # Destroy rows no longer needed
        for idx in list(self._row_frames.keys()):
            if idx not in needed:
                self._row_frames[idx].place_forget()
                self._row_frames[idx].destroy()
                del self._row_frames[idx]

        # Build rows that are needed but not yet rendered
        for idx in needed:
            if idx not in self._row_frames:
                utt = self.utterances[idx]
                bg  = self.ROW_BG[idx % 2]
                frame = self._build_row(idx, utt, bg)
                self._row_frames[idx] = frame

            # Position the row
            frame = self._row_frames[idx]
            frame.place(x=0, y=self._row_tops[idx],
                        relwidth=1.0)

    def _refresh(self):
        """Recompute layout and re-render after a change."""
        # Destroy all rendered rows
        for frame in self._row_frames.values():
            frame.place_forget()
            frame.destroy()
        self._row_frames.clear()
        self._compute_row_tops()
        self._render_visible()

    # ---------------------------------------------------- row builder ------

    def _build_row(self, index: int, utt: Utterance, bg: str) -> tk.Frame:
        row = tk.Frame(self.inner, bg=bg, pady=4)

        # Timecode
        tk.Label(row, text=utt.timecode(), font=("Courier New", 9),
                 bg=bg, fg="#555555", width=8, anchor="w",
                 padx=6).pack(side="left")

        # Speaker (click = rename this one)
        spk = tk.Label(row, text=utt.speaker,
                       font=("Segoe UI", 9, "bold"),
                       bg=bg, fg="#2563eb", width=18, anchor="w",
                       cursor="hand2", padx=4)
        spk.pack(side="left")
        spk.bind("<Button-1>", lambda e, i=index: self._rename_one(i))

        # Buttons on the right (pack right-to-left)
        tk.Button(row, text="▶ Play", font=("Segoe UI", 8),
                  bg="#d1fae5", fg="#065f46", relief="flat", padx=6,
                  command=lambda u=utt: player.play_from(
                      self.audio_path, u.start_ms)
                  ).pack(side="right", padx=(2, 8))

        tk.Button(row, text="✎ All", font=("Segoe UI", 8),
                  bg="#e0e7ff", fg="#3730a3", relief="flat", padx=6,
                  command=lambda u=utt: self._rename_all(u.speaker)
                  ).pack(side="right", padx=2)

        # Expand/collapse button — only if text is long
        if utt.needs_expand:
            expanded = index in self._expanded
            toggle_text = "▲ Less" if expanded else "▼ More"
            tk.Button(row, text=toggle_text, font=("Segoe UI", 8),
                      bg="#fef9c3", fg="#713f12", relief="flat", padx=6,
                      command=lambda i=index: self._toggle_expand(i)
                      ).pack(side="right", padx=2)

        # Text area
        text_frame = tk.Frame(row, bg=bg)
        text_frame.pack(side="left", fill="x", expand=True, padx=4)

        if index in self._expanded:
            # Full text, wrapped
            tk.Label(text_frame, text=utt.text,
                     font=("Segoe UI", 9), bg=bg, fg="#222222",
                     anchor="nw", justify="left",
                     wraplength=500).pack(anchor="w")
        else:
            # Snippet
            snippet = (utt.text[:SNIPPET_LEN] + "…") if utt.needs_expand \
                      else utt.text
            tk.Label(text_frame, text=snippet,
                     font=("Segoe UI", 9), bg=bg, fg="#222222",
                     anchor="w").pack(anchor="w")

        return row

    # ------------------------------------------------------- actions -------

    def _toggle_expand(self, index: int):
        if index in self._expanded:
            self._expanded.discard(index)
        else:
            self._expanded.add(index)
        self._refresh()

    def _rename_one(self, index: int):
        utt = self.utterances[index]
        new_name = simpledialog.askstring(
            "Rename speaker",
            f"New name for this utterance only:",
            initialvalue=utt.speaker,
            parent=self
        )
        if new_name and new_name.strip():
            utt.speaker = new_name.strip().upper()
            self._refresh()

    def _rename_all(self, old_name: str):
        new_name = simpledialog.askstring(
            "Rename all",
            f'Rename ALL utterances labeled "{old_name}" to:',
            initialvalue=old_name,
            parent=self
        )
        if new_name and new_name.strip():
            new_name = new_name.strip().upper()
            for utt in self.utterances:
                if utt.speaker == old_name:
                    utt.speaker = new_name
            self._refresh()

    def _save(self):
        text = format_transcript(self.utterances)
        path = save_output(self.audio_path, text)
        messagebox.showinfo("Saved", f"Transcript saved to:\n{path}",
                            parent=self)


# ---------------------------------------------------------------------------
# Main window
# ---------------------------------------------------------------------------

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("jTranscript AI")
        self.resizable(False, False)
        self.configure(bg="#f0f0f0")

        width, height = 500, 310
        sw = self.winfo_screenwidth()
        sh = self.winfo_screenheight()
        self.geometry(f"{width}x{height}+{(sw-width)//2}+{(sh-height)//2}")

        self.audio_path  = None
        self.utterances  = None
        self._build_ui()

    def _build_ui(self):
        pad = {"padx": 20, "pady": 10}

        tk.Label(self, text="jTranscript AI",
                 font=("Segoe UI", 14, "bold"),
                 bg="#f0f0f0").pack(pady=(20, 0))

        tk.Label(self, text="Select an audio file to transcribe",
                 font=("Segoe UI", 9), fg="#555555",
                 bg="#f0f0f0").pack(pady=(2, 10))

        file_frame = tk.Frame(self, bg="#f0f0f0")
        file_frame.pack(fill="x", **pad)

        self.file_label = tk.Label(
            file_frame, text="No file selected",
            font=("Segoe UI", 9), fg="#888888", bg="white",
            anchor="w", relief="solid", bd=1, width=40, padx=6)
        self.file_label.pack(side="left", ipady=4, fill="x", expand=True)

        tk.Button(file_frame, text="Browse…", font=("Segoe UI", 9),
                  command=self._browse, bg="#e0e0e0",
                  relief="flat", padx=10
                  ).pack(side="left", padx=(8, 0), ipady=4)

        self.transcribe_btn = tk.Button(
            self, text="Transcribe",
            font=("Segoe UI", 11, "bold"),
            command=self._start_transcribe,
            bg="#2563eb", fg="white",
            relief="flat", padx=20, state="disabled")
        self.transcribe_btn.pack(pady=(10, 4), ipady=6)

        self.review_btn = tk.Button(
            self, text="Review & Edit Transcript",
            font=("Segoe UI", 10),
            command=self._open_review,
            bg="#059669", fg="white",
            relief="flat", padx=20, state="disabled")
        self.review_btn.pack(pady=(0, 6), ipady=5)

        self.status_label = tk.Label(self, text="",
                                      font=("Segoe UI", 9),
                                      fg="#555555", bg="#f0f0f0")
        self.status_label.pack()

        self.output_label = tk.Label(self, text="",
                                      font=("Segoe UI", 8),
                                      fg="#2563eb", bg="#f0f0f0",
                                      wraplength=460)
        self.output_label.pack(pady=(4, 0))

    def _browse(self):
        path = filedialog.askopenfilename(
            title="Select audio file",
            filetypes=[
                ("Audio files", "*.mp3 *.wav *.m4a *.mp4 *.aac *.flac *.ogg"),
                ("All files", "*.*")
            ]
        )
        if path:
            self.audio_path  = path
            self.utterances  = None
            self.file_label.config(text=os.path.basename(path), fg="#222222")
            self.transcribe_btn.config(state="normal")
            self.review_btn.config(state="disabled")
            self.status_label.config(text="")
            self.output_label.config(text="")

    def _set_status(self, msg: str):
        self.after(0, lambda: self.status_label.config(text=msg))

    def _start_transcribe(self):
        self.transcribe_btn.config(state="disabled")
        self.review_btn.config(state="disabled")
        self.output_label.config(text="")
        threading.Thread(target=self._run_transcribe, daemon=True).start()

    def _run_transcribe(self):
        try:
            utterances  = run_transcription(self.audio_path, self._set_status)
            self.utterances = utterances
            text        = format_transcript(utterances)
            output_path = save_output(self.audio_path, text)
            self.after(0, lambda: self._on_success(output_path))
        except Exception as e:
            err = str(e)
            print(f"Error: {err}")
            self.after(0, lambda: self._on_error(err))

    def _on_success(self, output_path: str):
        self.status_label.config(text="✓ Transcript saved:", fg="#16a34a")
        self.output_label.config(text=output_path)
        self.transcribe_btn.config(state="normal")
        self.review_btn.config(state="normal")

    def _on_error(self, error_msg: str):
        self.status_label.config(text=f"Error: {error_msg}", fg="#dc2626")
        self.transcribe_btn.config(state="normal")
        messagebox.showerror("jTranscript AI — Error", error_msg)

    def _open_review(self):
        if self.utterances:
            ReviewWindow(self, self.utterances, self.audio_path)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app = App()
    app.mainloop()