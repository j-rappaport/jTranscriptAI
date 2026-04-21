import assemblyai as aai

aai.settings.api_key = "f6b0d602a1164df6b1509d99c9bcb50f"

config = aai.TranscriptionConfig(
    speaker_labels=True,
    speech_models=[aai.SpeechModel.universal]
)

transcriber = aai.Transcriber()
transcript = transcriber.transcribe(
    "https://assembly.ai/wildfires.mp3",
    config=config
)

for utterance in transcript.utterances:
    print(f"Speaker {utterance.speaker}: {utterance.text}")