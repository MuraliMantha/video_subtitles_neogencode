# processor.py

import os
import whisper
import subprocess
from config import INPUT_DIR, OUTPUT_DIR, SUBTITLE_DIR, MODEL_SIZE, MAX_LINE_LENGTH, ACTIVE_STYLE

model = whisper.load_model(MODEL_SIZE)


def format_time(seconds):
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hrs:02}:{mins:02}:{secs:02},{millis:03}"


def split_text(text, max_len=40):
    words = text.split()
    lines, current = [], ""

    for word in words:
        if len(current) + len(word) < max_len:
            current += " " + word
        else:
            lines.append(current.strip())
            current = word

    lines.append(current.strip())
    return "\n".join(lines)


def generate_srt(video_path, srt_path):
    result = model.transcribe(video_path)

    with open(srt_path, "w", encoding="utf-8") as f:
        for i, seg in enumerate(result["segments"]):
            text = split_text(seg["text"], MAX_LINE_LENGTH)

            f.write(f"{i+1}\n")
            f.write(f"{format_time(seg['start'])} --> {format_time(seg['end'])}\n")
            f.write(f"{text}\n\n")


def build_style_string(style_config):
    return (
        f"Fontsize={style_config['font_size']},"
        f"PrimaryColour={style_config['font_color']},"
        f"OutlineColour={style_config['outline_color']},"
        f"BorderStyle={style_config['border_style']},"
        f"Outline={style_config['outline']},"
        f"Shadow={style_config['shadow']},"
        f"Alignment={style_config['alignment']},"
        f"MarginV={style_config['margin_v']}"
    )

def burn_subtitles(video_path, srt_path, output_path):
    # Fix Windows path issue
    srt_path = srt_path.replace("\\", "/")

    # Build style from config
    style = build_style_string(ACTIVE_STYLE)

    command = [
        "ffmpeg",
        "-i", video_path,
        "-vf", f"subtitles='{srt_path}':force_style='{style}'",
        "-c:a", "copy",
        output_path
    ]

    subprocess.run(command)


def process_all_videos():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(SUBTITLE_DIR, exist_ok=True)

    for file in os.listdir(INPUT_DIR):
        if file.endswith(".mp4"):
            input_path = os.path.join(INPUT_DIR, file)
            name = os.path.splitext(file)[0]

            srt_path = os.path.join(SUBTITLE_DIR, f"{name}.srt")
            output_path = os.path.join(OUTPUT_DIR, f"{name}_subtitled.mp4")

            print(f"\n🎬 Processing: {file}")

            generate_srt(input_path, srt_path)
            print("✅ Subtitles generated")

            burn_subtitles(input_path, srt_path, output_path)
            print("🔥 Video created:", output_path)


if __name__ == "__main__":
    process_all_videos()