# Meme Sentiment Labeling (Baseline vs With-AI)

A full-stack web app for studying how humans label memes’ sentiment **with and without AI assistance**.  
Built with **Flask (Python)** and **vanilla JavaScript**, this app supports randomized trials, per-user tracking, AI suggestion display, and structured data logging.

---

## Purpose

This application is designed for research on **human-AI collaboration** in sentiment analysis tasks.  
Participants are shown a series of memes and asked to label their **sentiment** *(Negative, Neutral, Positive, Unsure)*, rate their **confidence**, and optionally provide reasoning.

### Experiment Modes

- **Baseline:** Users label memes independently.  
- **With-AI:** Users can view model-generated predictions and rationales before making their final decision.

---

## Features

- **Randomized trial selection** (configurable via `study_trials.csv`)  
- **UM uniqname capture** + automatic survey code generation  
- **Light/Dark theme toggle**  
- **“Skip (broken image)” safeguard**  
- **Session timer** (total duration logged)  
- **AI suggestion panel** with top-3 predictions + rationale  
- **Structured data export:**
  - `data/submissions.jsonl` — detailed per-trial logs  
  - `data/submissions.csv` — summary per participant  
  - `data/codes.csv` — survey code ↔ uniqname mapping  
- **Optional post-study Google Form** (for confidence, trust, workload)

---

## Run Locally

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
