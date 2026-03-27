
INPUT_DIR = "input_videos"
OUTPUT_DIR = "output_videos"
SUBTITLE_DIR = "subtitles"

MODEL_SIZE = "base"   # base / medium / large
MAX_LINE_LENGTH = 40


CAPTION_PRESETS = {
    "netflix": {
        "font_size": 24,
        "font_color": "&Hffffff&",
        "outline_color": "&H000000&",
        "alignment": 8,
        "margin_v": 30,
        "outline": 2,
        "shadow": 0,
        "border_style": 3
    },
    "reels": {
        "font_size": 30,
        "font_color": "&H00ffff&",
        "outline_color": "&H000000&",
        "alignment": 5,
        "margin_v": 20,
        "outline": 1,
        "shadow": 0,
        "border_style": 3
    },
    "custom": {
    "font_size": 26,
    "font_color": "&Hffffff&",     # white
    "outline_color": "&H000000&",  # black
    "alignment": 2,                # 2=bottom, 8=top, 5=middle
    "margin_v": 30,
    "outline": 2,
    "shadow": 0,
    "border_style": 3              # 3 = boxed background
    }
}

ACTIVE_STYLE = CAPTION_PRESETS["netflix"]

