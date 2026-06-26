from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from jee_data_base import DataBase, Filter
import traceback

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://prepify-blond.vercel.app"],
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

        cleaned.append({
            "identifier": str(identifier or chr(65 + idx)),
            "content": str(content or "")
        })

    return cleaned


@app.get("/questions/{chapter}")
def get_questions(chapter: str):
    try:
        print(f"===== REQUEST: {chapter} =====")

        filter_obj = Filter(db.chapters_dict)
        print("Filter created")

        questions = (
            filter_obj
            .by_chapter(chapter)
            .by_n_last_yrs(5)
            .get()
        )

        print(f"Questions fetched: {len(questions)}")

        if len(questions) == 0:
            return []

        q = questions[0]

        print("Returning first question")

        return [{
            "id": str(getattr(q, "question_id", "0")),
            "question": str(getattr(q, "question", "")),
            "options": clean_options(getattr(q, "options", [])),
            "correct": [],
            "year": str(getattr(q, "year", "")),
            "subject": str(getattr(q, "subject", "")),
            "chapter": chapter,
            "explanation": ""
        }]

    except Exception:
        traceback.print_exc()
        return {"error": traceback.format_exc()}
