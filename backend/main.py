from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Any
import os
import json
from dotenv import load_dotenv
from google import genai
from google.genai import types

def _check_quota_error(e: Exception):
    """Raise a 429 HTTPException if this is a Gemini quota/rate-limit error."""
    msg = str(e)
    if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "quota" in msg.lower():
        raise HTTPException(
            status_code=429,
            detail="Gemini API quota exceeded. You've hit the free tier limit — please wait a few minutes and try again, or enable billing at https://aistudio.google.com."
        )

load_dotenv()  # loads GEMINI_API_KEY from .env file

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

# ─── COACH PROMPTS ────────────────────────────────────────────────────────────
_COACH_JSON_SCHEMA = """
Respond ONLY with a valid JSON object in this EXACT format, no markdown, no extra text:
{
  "explanation": "<one sentence>",
  "suggestion": "<one sentence>"
}
Return ONLY the JSON object."""

COACH_SYSTEM_PROMPT = """You are an expert chess coach analyzing a move for an intermediate player.

You will receive:
- Position in FEN notation
- The move the player made
- The engine's best move
- The move classification (Blunder / Mistake / Inaccuracy / Good / Excellent)
- Eval change in centipawns (positive = good for white)
""" + _COACH_JSON_SCHEMA + """

Rules:
- Mention piece names and squares (e.g. 'your knight on f3', 'the rook on d1')
- Plain English — no notation sequences longer than 2 moves
- For Good/Excellent moves, explanation should briefly praise the idea
- For Inaccuracy/Mistake/Blunder, name the concrete problem (hanging piece, missed tactic, weakened king, etc.)
- Keep each sentence under 28 words
- Be honest but encouraging"""

COACH_BEGINNER_PROMPT = """You are a patient chess teacher coaching a complete beginner.

Focus ONLY on basic principles: moving pieces to the center, developing all pieces early, keeping the king safe, and not leaving pieces where they can be captured for free.
Ignore deep tactical lines or complex strategy — explain in the simplest possible English as if talking to a 10-year-old.
""" + _COACH_JSON_SCHEMA + """

Rules:
- No jargon. Say "middle of the board" not "center control". Say "you left your piece where it could be taken" not "hanging piece".
- Keep each sentence under 25 words.
- Be warm, encouraging, and never discouraging."""

COACH_GRANDMASTER_PROMPT = """You are a Grandmaster-level chess analyst giving blunt, technical feedback.

You will receive the position, the move played, and the engine's best move.
""" + _COACH_JSON_SCHEMA + """

Rules:
- Be concise and precise. Name the exact tactical or strategic motif (pin, fork, skewer, outpost, weak pawn, open file, etc.).
- Mention concrete piece coordinates.
- Zero fluff. No encouragement phrases. Just the chess truth.
- Each sentence under 25 words."""

COACH_HYPE_PROMPT = """You are the most enthusiastic, dramatic chess hype-man on the planet.

For good moves: lose your mind with excitement, cheer the player on like they just won a World Championship.
For bad moves: act devastated, as if witnessing the greatest tragedy in chess history — but keep it fun and never mean.
""" + _COACH_JSON_SCHEMA + """

Rules:
- Use exclamation marks, dramatic language, and emotional flair.
- Still mention the specific pieces and squares involved.
- Keep each sentence under 30 words.
- Be absurdly over-the-top but not offensive."""

PERSONALITY_PROMPTS = {
    'default':      COACH_SYSTEM_PROMPT,
    'beginner':     COACH_BEGINNER_PROMPT,
    'grandmaster':  COACH_GRANDMASTER_PROMPT,
    'hype':         COACH_HYPE_PROMPT,
}

# ─── SUMMARY PROMPT ───────────────────────────────────────────────────────────
SUMMARY_SYSTEM_PROMPT = """You are an expert chess coach writing a post-game summary for an intermediate player.

You will receive the full move list and result of a game.

Write a post-game summary in exactly 4 short paragraphs (no headers, no bullet points):
1. Overall game quality and character (sharp/positional/tactical?)
2. The key turning point or critical moment, with move number
3. One thing each player did well
4. One concrete improvement tip for the player you are reviewing

Keep total response under 130 words. Be specific with move numbers when relevant.
Use plain English. Be warm and constructive.
Return ONLY the summary text."""


# ─── MODELS ───────────────────────────────────────────────────────────────────
class CoachRequest(BaseModel):
    fen: str
    user_move: str
    best_move: str
    eval_before: Optional[float] = None
    eval_after: Optional[float] = None
    move_number: Optional[int] = None
    classification: Optional[str] = None
    personality: Optional[str] = 'default'   # 'default'|'beginner'|'grandmaster'|'hype'


class SummaryRequest(BaseModel):
    moves: List[str]          # flat list of move strings e.g. ["e4","e5","Nf3",...]
    result: str               # "White wins" | "Black wins" | "Draw" | "Unknown"
    my_color: Optional[str] = None  # "w" | "b"


class ReviewRequest(BaseModel):
    moves: List[str]            # flat list of algebraic move strings
    eval_swings: List[float]    # cp loss per half-move (positive = worse for the mover)
    result: str                 # "White wins" | "Black wins" | "Draw" | "Unknown"
    my_color: Optional[str] = None


# ─── COACH ENDPOINT ───────────────────────────────────────────────────────────
@app.post("/api/coach")
async def chess_coach(req: CoachRequest):
    try:
        eval_context = ""
        if req.eval_before is not None and req.eval_after is not None:
            diff = req.eval_after - req.eval_before
            eval_context = f"\nEval before: {req.eval_before:+.1f} cp, after: {req.eval_after:+.1f} cp (swing: {diff:+.1f} cp)"

        move_context = f"Move {req.move_number}: " if req.move_number else ""
        classification = req.classification or "Unknown"

        # Pick system prompt based on requested personality
        personality = (req.personality or 'default').lower()
        system_prompt = PERSONALITY_PROMPTS.get(personality, COACH_SYSTEM_PROMPT)
        temperature   = 0.5 if personality == 'hype' else 0.3

        user_prompt = (
            f"Position (FEN): {req.fen}\n"
            f"{move_context}Player played: {req.user_move}\n"
            f"Engine best move: {req.best_move}\n"
            f"Classification: {classification}"
            f"{eval_context}\n\n"
            f"Analyze this move and return the JSON."
        )

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                max_output_tokens=500,
                temperature=temperature,
            ),
        )

        text = response.text.strip()
        # Strip markdown fences if model wraps in ```json
        if text.startswith("```"):
            parts = text.split("```")
            text = parts[1] if len(parts) > 1 else text
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()

        data = json.loads(text)
        return {
            "explanation": data.get("explanation", ""),
            "suggestion":  data.get("suggestion", ""),
            "classification": classification,
        }

    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}\nRaw: {text}")
        raise HTTPException(status_code=500, detail="Coach returned invalid JSON")
    except Exception as e:
        print(f"ERROR /api/coach: {e}")
        _check_quota_error(e)
        raise HTTPException(status_code=500, detail=str(e))


# ─── SUMMARY ENDPOINT ─────────────────────────────────────────────────────────
@app.post("/api/summary")
async def game_summary(req: SummaryRequest):
    try:
        # Build PGN-style move string
        pairs = []
        for i in range(0, len(req.moves), 2):
            num = i // 2 + 1
            w = req.moves[i] if i < len(req.moves) else ""
            b = req.moves[i + 1] if i + 1 < len(req.moves) else ""
            pairs.append(f"{num}. {w} {b}".strip())
        moves_str = "  ".join(pairs)

        player_side = "White" if req.my_color == "w" else "Black"

        user_prompt = (
            f"Moves: {moves_str}\n"
            f"Result: {req.result}\n"
            f"Write the summary for the player who played as {player_side}."
        )

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SUMMARY_SYSTEM_PROMPT,
                max_output_tokens=600,
                temperature=0.5,
            ),
        )

        return {"summary": response.text.strip()}

    except Exception as e:
        print(f"ERROR /api/summary: {e}")
        _check_quota_error(e)
        raise HTTPException(status_code=500, detail=str(e))


# ─── GAME REVIEW SYSTEM PROMPT ───────────────────────────────────────────────
GAME_REVIEW_SYSTEM_PROMPT = """\
You are an expert chess analyst. Analyse a complete chess game and return ONLY a valid JSON object — no markdown, no extra text.

You will receive:
- Full move list (alternating White / Black)
- Centipawn (cp) loss per half-move (positive = error sized in centipawns for the side that moved)
- Game result

Classification thresholds (use eval_swings):
  Best Move  : cp_loss == 0 (same as engine top choice)
  Excellent  : cp_loss <= 10
  Good       : cp_loss <= 30
  Inaccuracy : cp_loss <= 100
  Mistake    : cp_loss <= 200
  Blunder    : cp_loss  > 200

Accuracy formula per side (0-100):
  accuracy = 100 - (average cp_loss of that side's moves / 10), clamped to [0, 100].
  Round to one decimal place.

Return EXACTLY this JSON structure:
{
  "opening": "<Opening name, e.g. Sicilian Defense, Najdorf Variation>",
  "eco": "<ECO code, e.g. B90 — best guess from moves>",
  "turning_point": "<One sentence: Move N – what happened and why it mattered>",
  "moves": [
    {
      "move_number": 1,
      "white": { "move": "e4", "classification": "Best Move", "explanation": null },
      "black": { "move": "c5", "classification": "Best Move", "explanation": null }
    }
    // … one entry per full move pair; only include explanation for Inaccuracy/Mistake/Blunder (1-2 sentences max)
  ],
  "summary": {
    "white_accuracy": 82.3,
    "black_accuracy": 74.1,
    "phase_winner": {
      "opening": "White",
      "middlegame": "Black",
      "endgame": "N/A"
    },
    "loser_learnings": [
      "<Concrete tip 1>",
      "<Concrete tip 2>",
      "<Concrete tip 3>"
    ],
    "winner_strengths": [
      "<Strength 1>",
      "<Strength 2>",
      "<Strength 3>"
    ]
  }
}"""


# ─── GAME REVIEW ENDPOINT ─────────────────────────────────────────────────────
@app.post("/api/review")
async def game_review(req: ReviewRequest):
    try:
        # Build annotated move list
        pairs = []
        for i in range(0, len(req.moves), 2):
            num = i // 2 + 1
            w_move  = req.moves[i] if i < len(req.moves) else ""
            b_move  = req.moves[i + 1] if i + 1 < len(req.moves) else ""
            w_loss  = req.eval_swings[i] if i < len(req.eval_swings) else 0
            b_loss  = req.eval_swings[i + 1] if i + 1 < len(req.eval_swings) else 0
            w_part  = f"{w_move}[loss={w_loss:.0f}cp]"
            b_part  = f"{b_move}[loss={b_loss:.0f}cp]" if b_move else ""
            pairs.append(f"{num}. {w_part} {b_part}".strip())
        moves_str = "  ".join(pairs)

        player_side = "White" if req.my_color == "w" else "Black"

        user_prompt = (
            f"Moves with centipawn loss:\n{moves_str}\n\n"
            f"Result: {req.result}\n"
            f"Reviewing for: {player_side}\n\n"
            f"Return the JSON review object."
        )

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=GAME_REVIEW_SYSTEM_PROMPT,
                max_output_tokens=4000,
                temperature=0.2,
            ),
        )

        text = response.text.strip()
        # Strip markdown fences if present
        if text.startswith("```"):
            parts = text.split("```")
            text = parts[1] if len(parts) > 1 else text
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()

        data = json.loads(text)
        return data

    except json.JSONDecodeError as e:
        print(f"JSON parse error in /api/review: {e}\nRaw: {text}")
        raise HTTPException(status_code=500, detail="Review returned invalid JSON")
    except Exception as e:
        print(f"ERROR /api/review: {e}")
        _check_quota_error(e)
        raise HTTPException(status_code=500, detail=str(e))