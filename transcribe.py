import argparse
import json
import os

from faster_whisper import WhisperModel


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio to word-level JSON")
    parser.add_argument("input", help="Path to input .wav file")
    parser.add_argument("output", help="Path to output .json file")
    parser.add_argument(
        "--model",
        default=os.environ.get("WHISPER_MODEL", "large"),
        help="Whisper model size (default: large)",
    )
    parser.add_argument(
        "--device",
        default=os.environ.get("WHISPER_DEVICE", "cpu"),
        help="Device (default: cpu)",
    )
    parser.add_argument(
        "--compute-type",
        default=os.environ.get("WHISPER_COMPUTE_TYPE", "int8"),
        help="Compute type (default: int8)",
    )
    args = parser.parse_args()

    print(f"Loading model '{args.model}' on {args.device}...")

    model = WhisperModel(
        args.model,
        device=args.device,
        compute_type=args.compute_type,
    )

    print(f"Transcribing {args.input}...")

    segments, _ = model.transcribe(
        args.input,
        beam_size=5,
        vad_filter=True,
        word_timestamps=True,
    )

    segments = list(segments)

    transcript = []

    for segment_id, seg in enumerate(segments, start=1):
        words = [
            {
                "text": w.word.strip(),
                "start": round(w.start, 3),
                "end": round(w.end, 3),
            }
            for w in seg.words
            if w.word.strip()
        ]

        sentence = " ".join(word["text"] for word in words)

        transcript.append(
            {
                "id": segment_id,
                "sentence": sentence,
                "words": words,
            }
        )

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(transcript, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(transcript)} segments -> {args.output}")


if __name__ == "__main__":
    main()
