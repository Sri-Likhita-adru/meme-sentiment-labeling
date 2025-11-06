import os, csv, hashlib, time, random, math, json, shutil
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import pandas as pd

BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")   # index.html, styles.css, app.js
STATIC_DIR   = os.path.join(BASE_DIR, "static")     # static/images/...
IMAGES_DIR   = os.path.join(STATIC_DIR, "images")

DATA_DIR     = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(IMAGES_DIR, exist_ok=True)

STUDY_CSV    = os.path.join(DATA_DIR, "study_trials.csv")  # your prepared study rows
SUBMIT_CSV   = os.path.join(DATA_DIR, "submissions.csv")   # flat CSV log
SUBMIT_JSONL = os.path.join(DATA_DIR, "submissions.jsonl") # robust JSON log
CODES_CSV    = os.path.join(DATA_DIR, "codes.csv")         # survey_code ↔ uniqname/worker

# Try to ensure example image exists under /static/images
WIN_EXAMPLE = r"C:\Users\srili\Downloads\UM Courses\Fall 2025\CSE 594\Assignment 3\Website\static\images\image_808.jpg"
EXAMPLE_DST = os.path.join(IMAGES_DIR, "image_808.jpg")
try:
    if os.path.exists(WIN_EXAMPLE) and not os.path.exists(EXAMPLE_DST):
        shutil.copyfile(WIN_EXAMPLE, EXAMPLE_DST)
except Exception as _e:
    print("Warning: could not copy example image:", _e)

# ---------- load study data ----------
if not os.path.exists(STUDY_CSV):
    raise FileNotFoundError(f"Missing {STUDY_CSV}. Put your merged trials CSV there.")
df = pd.read_csv(STUDY_CSV)
print(f"Loaded {len(df)} rows from {STUDY_CSV}")

# Normalize image filename
if "img_filename" not in df.columns:
    if "img_path" in df.columns:
        df["img_filename"] = df["img_path"].apply(lambda p: os.path.basename(str(p)))
    elif "image_name" in df.columns:
        df["img_filename"] = df["image_name"].apply(lambda p: os.path.basename(str(p)))
    else:
        raise ValueError("CSV needs 'img_filename' or 'img_path'/'image_name'.")

# Required columns
required = ["id", "meme_text", "gold_sentiment", "img_filename"]
missing = [c for c in required if c not in df.columns]
if missing:
    raise ValueError(f"CSV missing required columns: {missing}")

# Optional AI columns
AI_COLS = ["mm_top1","mm_p1","mm_top2","mm_p2","mm_top3","mm_p3",
           "mm_p_neg","mm_p_neu","mm_p_pos",
           "text_rationale","neighbor_id_1","neighbor_id_2"]
for c in AI_COLS:
    if c not in df.columns:
        df[c] = None

app = Flask(__name__, static_folder=STATIC_DIR)
CORS(app)

def json_safe(value):
    """Replace NaN/NaT with None recursively."""
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [json_safe(v) for v in value]
    try:
        if pd.isna(value) or (isinstance(value, float) and math.isnan(value)):
            return None
    except Exception:
        pass
    return value

def survey_code(worker_id: str) -> str:
    return hashlib.md5(f"{worker_id}-{time.time()}".encode()).hexdigest()[:8].upper()

def pick_trials(n: int):
    return df.sample(n=min(n, len(df)), random_state=random.randint(1, 10_000)).copy()

def row_to_payload(row: pd.Series) -> dict:
    img_url = f"/static/images/{str(row['img_filename'])}"
    out = {
        "id":            row["id"],
        "meme_text":     row.get("meme_text", ""),
        "gold_sentiment":row.get("gold_sentiment", None),
        "img_url":       img_url,
        # AI passthrough
        "mm_top1":       row.get("mm_top1", None),
        "mm_p1":         row.get("mm_p1", None),
        "mm_top2":       row.get("mm_top2", None),
        "mm_p2":         row.get("mm_p2", None),
        "mm_top3":       row.get("mm_top3", None),
        "mm_p3":         row.get("mm_p3", None),
        "mm_p_neg":      row.get("mm_p_neg", None),
        "mm_p_neu":      row.get("mm_p_neu", None),
        "mm_p_pos":      row.get("mm_p_pos", None),
        "text_rationale":row.get("text_rationale", None),
        "neighbor_id_1": row.get("neighbor_id_1", None),
        "neighbor_id_2": row.get("neighbor_id_2", None),
    }
    return json_safe(out)

# -------------- Frontend files --------------
@app.get("/")
def root():
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.get("/<path:path>")
def any_frontend(path):
    return send_from_directory(FRONTEND_DIR, path)

# -------------- API: trials --------------
@app.get("/trials")
def api_trials():
    worker_id    = request.args.get("workerId", "local")
    assignmentId = request.args.get("assignmentId", "local")
    condition    = request.args.get("condition", "baseline")
    n            = int(request.args.get("n", "12"))

    sample = pick_trials(n)
    items = [row_to_payload(row) for _, row in sample.iterrows()]
    payload = {
        "workerId": worker_id,
        "assignmentId": assignmentId,
        "condition": condition,
        "n": len(items),
        "trials": items
    }
    return jsonify(json_safe(payload))

# -------------- API: submit --------------
@app.post("/submit")
def api_submit():
    data = request.get_json(silent=True) or {}
    now = datetime.utcnow().isoformat()

    # compute duration_ms
    duration_ms = None
    try:
        if isinstance(data.get("startedAt"), (int, float)) and isinstance(data.get("endedAt"), (int, float)):
            duration_ms = int(data["endedAt"] - data["startedAt"])
    except Exception:
        pass

    record = {
        "timestamp": now,
        **data,
    }
    if isinstance(data.get("total_ms"), (int, float)):
        record["duration_ms"] = int(data["total_ms"])
    elif duration_ms is not None:
        record["duration_ms"] = duration_ms

    # JSONL (canonical)
    with open(SUBMIT_JSONL, "a", encoding="utf-8") as f:
        f.write(json.dumps(json_safe(record), ensure_ascii=False) + "\n")

    # CSV (high level)
    header = [
        "timestamp","workerId","assignmentId","condition",
        "startedAt","endedAt","duration_ms","exit_early","num_trials","uniqname"
    ]
    write_header = not os.path.exists(SUBMIT_CSV)
    with open(SUBMIT_CSV, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if write_header: w.writerow(header)
        w.writerow([
            now,
            data.get("workerId"),
            data.get("assignmentId"),
            data.get("condition"),
            data.get("startedAt"),
            data.get("endedAt"),
            record.get("duration_ms"),
            data.get("exit_early"),
            len(data.get("trials") or []),
            data.get("uniqname"),
        ])

    # maintain mapping survey_code ↔ user identifiers
    code = survey_code(str(data.get("workerId","local")))
    code_header = ["timestamp","survey_code","uniqname","workerId","assignmentId","startedAt"]
    write_code_header = not os.path.exists(CODES_CSV)
    with open(CODES_CSV, "a", newline="", encoding="utf-8") as f:
        cw = csv.writer(f)
        if write_code_header:
            cw.writerow(code_header)
        cw.writerow([
            now,
            code,
            data.get("uniqname"),
            data.get("workerId"),
            data.get("assignmentId"),
            data.get("startedAt"),
        ])

    return jsonify({"ok": True, "survey_code": code})

@app.get("/download-data")
def download_data():
    import shutil, io
    from flask import send_file

    zip_path = os.path.join(BASE_DIR, "submissions_backup.zip")
    shutil.make_archive(zip_path.replace(".zip", ""), 'zip', DATA_DIR)
    return send_file(zip_path, as_attachment=True)

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False)
