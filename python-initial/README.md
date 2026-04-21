# Court Transcript Tool — Developer Notes

## What this is
A simple Windows GUI app. Your colleague browses to an audio file,
clicks Transcribe, and gets a .txt file back in the same folder.

---

## Step 1 — Set up your dev environment (once)

You need Python 3.9+ installed on your machine.

```
pip install pyinstaller
```

That's it. No other dependencies yet (tkinter is built into Python).

---

## Step 2 — Test it before packaging

```
python transcriber.py
```

You should see the window. Browse to any file, click Transcribe,
and a hello_world .txt should appear next to it.

---

## Step 3 — Build the .exe

```
pyinstaller --onefile --windowed --name "Court Transcript Tool" transcriber.py
```

Flags explained:
  --onefile     bundles everything into a single .exe (easier to distribute)
  --windowed    no black console window behind the GUI
  --name        sets the .exe filename

The output lands in:  dist/Court Transcript Tool.exe

Build takes 30-60 seconds. The .exe will be around 10-15 MB.

---

## Step 4 — Distribute to your colleague

Just send them:   dist/Court Transcript Tool.exe

They do NOT need Python installed. Double-click and it runs.

---

## Future steps (not yet implemented)

The transcribe() function in transcriber.py is the only thing
that needs to change when we add real functionality:

  - Swap in AssemblyAI API call
  - Add speaker name mapping
  - Add LLM formatting step
  - Add prompt/examples config file

Everything else (GUI, file handling, threading) stays the same.

---

## Troubleshooting

"Windows protected your PC" warning on first run:
  → Click "More info" then "Run anyway"
  → This is normal for unsigned .exe files

Antivirus flags the .exe:
  → Common with PyInstaller builds, it's a false positive
  → You can code-sign the .exe if this becomes a problem
