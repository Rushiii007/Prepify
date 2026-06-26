from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from jee_data_base import DataBase, Filter
import traceback

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Loading DB...")
db = DataBase()
print("Loaded!")

@app.get("/")
def home():
    return {"ok": True}

@app.get("/subjects")
def subjects():
    return ["physics","chemistry","mathematics"]

@app.get("/chapters/{subject}")
def chapters(subject: str):
    ans = []
    for name,obj in db.chapters_dict.items():
        if obj.parent_subject.lower()==subject.lower():
            ans.append(name)
    return sorted(ans)

@app.get("/questions/{chapter}")
def questions(chapter:str):

    print("REQUEST RECEIVED")
    print(chapter)

    try:

        filt = Filter(db.chapters_dict)

        qs = (
            filt
            .by_chapter(chapter)
            .by_n_last_yrs(5)
            .get()
        )

        print("Question Count:",len(qs))

        return {
            "count":len(qs)
        }

    except Exception:

        traceback.print_exc()

        return {
            "error":"failed"
        }
