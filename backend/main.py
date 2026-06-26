from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jee_data_base import DataBase, Filter
import traceback
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
print("Loading JEE Database...")
db = DataBase()
print("Database Loaded!")
@app.get("/")
def home():
    return {"message": "Prepify API Running"}
@app.get("/subjects")
def get_subjects():
    return [
        "mathematics",
        "physics",
        "chemistry"
    ]
@app.get("/chapters/{subject}")
def get_chapters(subject: str):
    chapters = []
    for chapter_name, chapter_obj in db.chapters_dict.items():
        if chapter_obj.parent_subject.lower() == subject.lower():
            chapters.append(chapter_name)
    return sorted(chapters)
def clean_options(options):
    if not isinstance(options, list):
        return []
    cleaned = []
    for idx, option in enumerate(options):
        identifier = getattr(option, "identifier", None)
        content = getattr(option, "content", None)
        if isinstance(option, dict):
            identifier = option.get("identifier", identifier)
            content = option.get("content", content)
        identifier = str(identifier or chr(65 + idx)).strip()
        content = str(content or "").strip()
        if identifier and content:
            cleaned.append({"identifier": identifier, "content": content})
    return cleaned
@app.get("/questions/{chapter}")
def get_questions(chapter: str):
    try:
        filter_obj = Filter(db.chapters_dict)
        questions = (
            filter_obj
            .by_chapter(chapter)
            .by_n_last_yrs(2)
            .get()
        )
        result = []
        for q in questions:
            try:
                question_text = str(getattr(q, "question", "") or "").strip()
                correct = (
                    getattr(q, "correct_options", None)
                    or getattr(q, "correct", None)
                    or getattr(q, "correct_value", None)
                    or getattr(q, "correct_answer", None)
                    or getattr(q, "numerical_value", None)
                    or getattr(q, "numeric_value", None)
                    or getattr(q, "answer", None)
                    or getattr(q, "value", None)
                    or []
                )
                if not isinstance(correct, list):
                    correct = [correct]
                correct = [str(c).strip() for c in correct if str(c).strip() != ""]
                # Only skip if the question text itself is missing. Numerical
                # questions without a stored answer should still be shown.
                if not question_text:
                    continue
                result.append({
                    "id": getattr(q, "question_id", None) or f"{chapter}-{len(result)}",
                    "question": question_text,
                    "options": clean_options(getattr(q, "options", [])),
                    "correct": correct,
                    "year": getattr(q, "year", "") or "",
                    "subject": getattr(q, "subject", "") or "",
                    "chapter": getattr(q, "chapter", chapter) or chapter,
                    "explanation": getattr(q, "explanation", None) or getattr(q, "expl", "") or "",
                })
            except Exception as item_error:
                print(f"Skipped one broken question in {chapter}: {item_error}")
                continue
        return result
    except Exception as e:
        print(f"Error fetching questions for {chapter}: {e}")
        traceback.print_exc()
        return JSONResponse(
            status_code=200,
            content={"error": "FAILED_TO_LOAD_QUESTIONS", "fallback": True},
        )