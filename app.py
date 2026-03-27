# app.py — Flask API for Video Subtitles

import os
import json
from flask import Flask, render_template, request, jsonify, send_file, Response
from config import INPUT_DIR, OUTPUT_DIR, SUBTITLE_DIR, CAPTION_PRESETS

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max upload

# Ensure directories exist
os.makedirs(INPUT_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(SUBTITLE_DIR, exist_ok=True)


# ─── SRT Parser ───────────────────────────────────────────────
def parse_srt(srt_path):
    """Parse an SRT file and return a list of subtitle cues."""
    cues = []
    if not os.path.exists(srt_path):
        return cues

    with open(srt_path, 'r', encoding='utf-8') as f:
        content = f.read().strip()

    blocks = content.split('\n\n')
    for block in blocks:
        lines = block.strip().split('\n')
        if len(lines) >= 3:
            # Parse timestamp line
            time_line = lines[1]
            start_str, end_str = time_line.split(' --> ')
            start = srt_time_to_seconds(start_str.strip())
            end = srt_time_to_seconds(end_str.strip())
            text = ' '.join(lines[2:])
            cues.append({
                'index': int(lines[0]),
                'start': start,
                'end': end,
                'text': text
            })
    return cues


def srt_time_to_seconds(time_str):
    """Convert SRT timestamp (HH:MM:SS,mmm) to seconds."""
    time_str = time_str.replace(',', '.')
    parts = time_str.split(':')
    hours = int(parts[0])
    minutes = int(parts[1])
    seconds = float(parts[2])
    return hours * 3600 + minutes * 60 + seconds


# ─── Routes ───────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/videos')
def list_videos():
    """List all videos in input_videos directory."""
    videos = []
    for f in os.listdir(INPUT_DIR):
        if f.lower().endswith(('.mp4', '.webm', '.mkv', '.avi', '.mov')):
            filepath = os.path.join(INPUT_DIR, f)
            name = os.path.splitext(f)[0]
            srt_path = os.path.join(SUBTITLE_DIR, f"{name}.srt")
            has_subtitles = os.path.exists(srt_path)
            videos.append({
                'filename': f,
                'name': name,
                'size': os.path.getsize(filepath),
                'has_subtitles': has_subtitles
            })
    return jsonify(videos)


@app.route('/api/videos/<filename>')
def serve_video(filename):
    """Stream a video file."""
    filepath = os.path.join(INPUT_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'Video not found'}), 404

    # Support range requests for video seeking
    file_size = os.path.getsize(filepath)
    range_header = request.headers.get('Range')

    if range_header:
        byte_start = 0
        byte_end = file_size - 1

        range_match = range_header.replace('bytes=', '').split('-')
        byte_start = int(range_match[0])
        if range_match[1]:
            byte_end = int(range_match[1])

        content_length = byte_end - byte_start + 1

        def generate():
            with open(filepath, 'rb') as f:
                f.seek(byte_start)
                remaining = content_length
                while remaining > 0:
                    chunk_size = min(8192, remaining)
                    data = f.read(chunk_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        response = Response(
            generate(),
            status=206,
            mimetype='video/mp4',
            direct_passthrough=True
        )
        response.headers.add('Content-Range', f'bytes {byte_start}-{byte_end}/{file_size}')
        response.headers.add('Accept-Ranges', 'bytes')
        response.headers.add('Content-Length', str(content_length))
        return response

    return send_file(filepath, mimetype='video/mp4')


@app.route('/api/subtitles/<name>')
def get_subtitles(name):
    """Return parsed SRT as JSON for a video."""
    srt_path = os.path.join(SUBTITLE_DIR, f"{name}.srt")
    if not os.path.exists(srt_path):
        return jsonify({'error': 'Subtitles not found', 'cues': []}), 404

    cues = parse_srt(srt_path)
    return jsonify({'name': name, 'cues': cues})


@app.route('/api/presets')
def get_presets():
    """Return available caption presets."""
    return jsonify(CAPTION_PRESETS)


@app.route('/api/upload', methods=['POST'])
def upload_video():
    """Upload a video file."""
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400

    file = request.files['video']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    filename = file.filename
    filepath = os.path.join(INPUT_DIR, filename)
    file.save(filepath)

    return jsonify({'message': 'Upload successful', 'filename': filename})


@app.route('/api/process', methods=['POST'])
def process_video():
    """Transcribe a video using Whisper to generate SRT."""
    data = request.json
    filename = data.get('filename')

    if not filename:
        return jsonify({'error': 'No filename provided'}), 400

    filepath = os.path.join(INPUT_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'Video not found'}), 404

    name = os.path.splitext(filename)[0]
    srt_path = os.path.join(SUBTITLE_DIR, f"{name}.srt")

    # Import and run whisper
    import whisper
    from config import MODEL_SIZE, MAX_LINE_LENGTH
    from processor import split_text, format_time

    model = whisper.load_model(MODEL_SIZE)
    result = model.transcribe(filepath)

    with open(srt_path, "w", encoding="utf-8") as f:
        for i, seg in enumerate(result["segments"]):
            text = split_text(seg["text"], MAX_LINE_LENGTH)
            f.write(f"{i+1}\n")
            f.write(f"{format_time(seg['start'])} --> {format_time(seg['end'])}\n")
            f.write(f"{text}\n\n")

    cues = parse_srt(srt_path)
    return jsonify({'message': 'Transcription complete', 'name': name, 'cues': cues})


@app.route('/api/burn', methods=['POST'])
def burn_video():
    """Burn subtitles into video with given style and position."""
    data = request.json
    filename = data.get('filename')
    style = data.get('style', CAPTION_PRESETS['netflix'])
    position_y = data.get('position_y', 90)  # percentage from top

    if not filename:
        return jsonify({'error': 'No filename provided'}), 400

    filepath = os.path.join(INPUT_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'Video not found'}), 404

    name = os.path.splitext(filename)[0]
    srt_path = os.path.join(SUBTITLE_DIR, f"{name}.srt")
    output_path = os.path.join(OUTPUT_DIR, f"{name}_subtitled.mp4")

    if not os.path.exists(srt_path):
        return jsonify({'error': 'No subtitles found. Process the video first.'}), 400

    # Map Y position to alignment and margin
    if position_y < 33:
        style['alignment'] = 8  # top
        style['margin_v'] = int(position_y * 3)
    elif position_y < 66:
        style['alignment'] = 5  # middle
        style['margin_v'] = int((position_y - 33) * 3)
    else:
        style['alignment'] = 2  # bottom
        style['margin_v'] = int((100 - position_y) * 3)

    from processor import build_style_string
    import subprocess

    style_str = build_style_string(style)
    srt_ffmpeg = srt_path.replace("\\", "/")

    command = [
        "ffmpeg", "-y",
        "-i", filepath,
        "-vf", f"subtitles='{srt_ffmpeg}':force_style='{style_str}'",
        "-c:a", "copy",
        output_path
    ]

    subprocess.run(command)

    return jsonify({
        'message': 'Video processed successfully',
        'output': f"{name}_subtitled.mp4"
    })


@app.route('/api/output/<filename>')
def serve_output(filename):
    """Serve a processed output video."""
    filepath = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'Output video not found'}), 404
    return send_file(filepath, mimetype='video/mp4')


if __name__ == '__main__':
    app.run(debug=True, port=5000)
