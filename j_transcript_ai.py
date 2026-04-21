"""
j_transcript_ai.py  —  jTranscript AI
Step 2: Real AssemblyAI transcription with speaker labels
"""

import tkinter as tk
from tkinter import filedialog, messagebox
import os
import threading
import assemblyai as aai


# ---------------------------------------------------------------------------
# Configuration — put your AssemblyAI API key here
# ---------------------------------------------------------------------------

ASSEMBLYAI_API_KEY = "f6b0d602a1164df6b1509d99c9bcb50f"



# ---------------------------------------------------------------------------
# Core transcription function
# ---------------------------------------------------------------------------

def transcribe(audio_path: str, status_callback) -> str:
    """
    Uploads audio to AssemblyAI, waits for transcription,
    and returns a formatted transcript string with speaker labels.
    """
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
    status_callback("Formatting transcript...")

    # Format utterances as: SPEAKER A:  text
    lines = []
    for utterance in transcript.utterances:
        speaker = f"SPEAKER {utterance.speaker}:"
        lines.append(f"{speaker}  {utterance.text}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# File output
# ---------------------------------------------------------------------------

def save_output(audio_path: str, text: str) -> str:
    """
    Saves the transcript text next to the audio file.
    Returns the path of the saved file.
    """
    base = os.path.splitext(audio_path)[0]
    output_path = base + "_transcript.txt"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(text)
    return output_path


# ---------------------------------------------------------------------------
# GUI
# ---------------------------------------------------------------------------

class App(tk.Tk):
    def __init__(self):
        super().__init__()

        self.title("jTranscript AI")
        self.resizable(False, False)
        self.configure(bg="#f0f0f0")

        # Give the window a reasonable fixed size and center it
        width, height = 500, 280
        screen_w = self.winfo_screenwidth()
        screen_h = self.winfo_screenheight()
        x = (screen_w - width) // 2
        y = (screen_h - height) // 2
        self.geometry(f"{width}x{height}+{x}+{y}")

        self._build_ui()
        self.audio_path = None

    def _build_ui(self):
        pad = {"padx": 20, "pady": 10}

        # Title
        tk.Label(
            self, text="jTranscript AI",
            font=("Segoe UI", 14, "bold"), bg="#f0f0f0"
        ).pack(pady=(20, 0))

        tk.Label(
            self, text="Select an audio file to transcribe",
            font=("Segoe UI", 9), fg="#555555", bg="#f0f0f0"
        ).pack(pady=(2, 10))

        # File selection row
        file_frame = tk.Frame(self, bg="#f0f0f0")
        file_frame.pack(fill="x", **pad)

        self.file_label = tk.Label(
            file_frame, text="No file selected",
            font=("Segoe UI", 9), fg="#888888", bg="white",
            anchor="w", relief="solid", bd=1,
            width=40, padx=6
        )
        self.file_label.pack(side="left", ipady=4, fill="x", expand=True)

        tk.Button(
            file_frame, text="Browse…",
            font=("Segoe UI", 9),
            command=self._browse,
            bg="#e0e0e0", relief="flat", padx=10
        ).pack(side="left", padx=(8, 0), ipady=4)

        # Transcribe button
        self.transcribe_btn = tk.Button(
            self, text="Transcribe",
            font=("Segoe UI", 11, "bold"),
            command=self._start_transcribe,
            bg="#2563eb", fg="white",
            relief="flat", padx=20,
            state="disabled"
        )
        self.transcribe_btn.pack(pady=10, ipady=6)

        # Status label
        self.status_label = tk.Label(
            self, text="",
            font=("Segoe UI", 9), fg="#555555", bg="#f0f0f0"
        )
        self.status_label.pack()

        # Output path label (shown after success)
        self.output_label = tk.Label(
            self, text="",
            font=("Segoe UI", 8), fg="#2563eb", bg="#f0f0f0",
            wraplength=460
        )
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
            self.audio_path = path
            # Show just the filename, not the full path
            self.file_label.config(
                text=os.path.basename(path),
                fg="#222222"
            )
            self.transcribe_btn.config(state="normal")
            self.status_label.config(text="")
            self.output_label.config(text="")

    def _set_status(self, msg: str):
        """Thread-safe status update."""
        self.after(0, lambda: self.status_label.config(text=msg))

    def _start_transcribe(self):
        """Run transcription in a background thread so the UI doesn't freeze."""
        self.transcribe_btn.config(state="disabled")
        self.output_label.config(text="")
        thread = threading.Thread(target=self._run_transcribe, daemon=True)
        thread.start()

    def _run_transcribe(self):
        try:
            text = transcribe(self.audio_path, self._set_status)
            output_path = save_output(self.audio_path, text)
            self.after(0, lambda: self._on_success(output_path))
        except Exception as e:
            err = str(e)  # capture before lambda to avoid Python scoping bug
            print(f"Error: {err}")
            self.after(0, lambda: self._on_error(err))

    def _on_success(self, output_path: str):
        self.status_label.config(text="✓ Transcript saved:", fg="#16a34a")
        self.output_label.config(text=output_path)
        self.transcribe_btn.config(state="normal")

    def _on_error(self, error_msg: str):
        self.status_label.config(text=f"Error: {error_msg}", fg="#dc2626")
        self.transcribe_btn.config(state="normal")
        messagebox.showerror("jTranscript AI — Error", error_msg)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app = App()
    app.mainloop()
