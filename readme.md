🧠 Tech Stack

Python 3.10+
OpenAI Whisper (offline speech recognition)
FFmpeg (video processing)

📁 Project Structure
video_subtitles/
│
├── input_videos/        # Put input videos here
├── output_videos/       # Processed videos will be saved here
├── subtitles/           # Generated .srt files
├── processor.py         # Main processing script
├── config.py            # Configurations
├── requirements.txt
└── README.md


3️⃣ Setup Virtual Environment
python -m venv venv
venv\Scripts\activate
4️⃣ Install Dependencies
pip install openai-whisper
▶️ How to Run
Step 1: Add videos

Place your .mp4 files inside:

input_videos/
Step 2: Run script
python processor.py
📦 Output

After running:

output_videos/
  video1_subtitled.mp4

subtitles/
  video1.srt
🧠 How It Works
Whisper converts speech → text
Text is formatted into .srt
FFmpeg burns subtitles into video
Output video is saved
🎬 Subtitle Styling

Subtitles are styled using FFmpeg:

White text
Black outline
Bottom center alignment
Optimized font size

