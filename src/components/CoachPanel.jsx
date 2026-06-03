import React, { useState, useRef, useEffect } from 'react'

const BACKEND_URL = import.meta.env.VITE_COACH_URL || 'http://localhost:8000'

// ─── CLASSIFICATION CONFIG ────────────────────────────────────────────────────
export const CLASSIFICATIONS = {
    Best:       { icon: '★',  color: '#1bada6', bg: 'rgba(27,173,166,.13)',  label: 'Best Move'  },
    Excellent:  { icon: '!!', color: '#81b64c', bg: 'rgba(129,182,76,.13)', label: 'Excellent'  },
    Good:       { icon: '!',  color: '#5b8dd9', bg: 'rgba(91,141,217,.11)', label: 'Good'       },
    Inaccuracy: { icon: '?!', color: '#f0c040', bg: 'rgba(240,192,64,.13)', label: 'Inaccuracy' },
    Mistake:    { icon: '?',  color: '#e88c2c', bg: 'rgba(232,140,44,.13)', label: 'Mistake'    },
    Blunder:    { icon: '??', color: '#e05c5c', bg: 'rgba(224,92,92,.13)',  label: 'Blunder'    },
}

// ─── CLASSIFY MOVE BY CP LOSS ─────────────────────────────────────────────────
export function classifyMove(evalBefore, evalAfter, playerColor, userMove, bestMove) {
    const norm = m => m?.replace(/[+#=]/g, '').trim()
    if (norm(userMove) === norm(bestMove)) return 'Best'
    if (evalBefore == null || evalAfter == null) return 'Good'

    // centipawn loss from the moving player's perspective
    const cpLoss = playerColor === 'w'
        ? evalBefore - evalAfter   // white wants eval to go up
        : evalAfter - evalBefore   // black wants eval to go down

    if (cpLoss <= 10)  return 'Excellent'
    if (cpLoss <= 30)  return 'Good'
    if (cpLoss <= 60)  return 'Inaccuracy'
    if (cpLoss <= 120) return 'Mistake'
    return 'Blunder'
}

// ─── API HELPERS ──────────────────────────────────────────────────────────────
export async function fetchAICoachExplanation(payload) {
    const res = await fetch(`${BACKEND_URL}/api/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Coach unavailable')
    }
    return res.json() // { explanation, suggestion, classification }
}

// ─── PERSONALITY CONFIG ────────────────────────────────────────────────────────
export const PERSONALITIES = [
    { id: 'default',     label: 'Coach',  icon: '🎓', desc: 'Balanced, encouraging'     },
    { id: 'beginner',    label: 'Beginner', icon: '🌱', desc: 'Simple fundamentals'       },
    { id: 'grandmaster', label: 'GM',     icon: '♟',  desc: 'Technical, no-nonsense'    },
    { id: 'hype',        label: 'Hype',   icon: '🔥', desc: 'Over-the-top enthusiasm'   },
]

export async function fetchGameSummary(moves, result, myColor) {
    const res = await fetch(`${BACKEND_URL}/api/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moves, result, my_color: myColor }),
    })
    if (!res.ok) throw new Error('Summary unavailable')
    return res.json() // { summary }
}

// ─── SHIMMER SKELETON ─────────────────────────────────────────────────────────
const skeletonCSS = `
@keyframes shimmer {
    0%   { background-position: -400px 0 }
    100% { background-position: calc(400px + 100%) 0 }
}
.coach-skeleton {
    background: linear-gradient(90deg, #252220 25%, #312d2a 50%, #252220 75%);
    background-size: 400px 100%;
    animation: shimmer 1.4s ease-in-out infinite;
    border-radius: 4px;
}
@keyframes coachFadeIn {
    from { opacity: 0; transform: translateY(5px) }
    to   { opacity: 1; transform: translateY(0) }
}
.coach-fade-in {
    animation: coachFadeIn .3s ease both;
}
`

function Skeleton() {
    return (
        <div className="coach-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div className="coach-skeleton" style={{ height: 11, width: '88%' }} />
            <div className="coach-skeleton" style={{ height: 11, width: '65%' }} />
            <div style={{ height: 5 }} />
            <div className="coach-skeleton" style={{ height: 11, width: '80%' }} />
            <div className="coach-skeleton" style={{ height: 11, width: '50%' }} />
        </div>
    )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function CoachPanel({
    fen,
    userMove,
    bestMove,
    evalBefore,
    evalAfter,
    moveNumber,
    playerColor,
    personality,
    onAdvice,
}) {
    const [phase, setPhase]   = useState('idle')
    const [result, setResult] = useState(null)
    const lastKeyRef          = useRef(null)
    const timerRef            = useRef(null)

    // Refs keep latest eval/bestMove without re-triggering the fetch
    const bestMoveRef   = useRef(bestMove)
    const evalBeforeRef = useRef(evalBefore)
    const evalAfterRef  = useRef(evalAfter)
    useEffect(() => { bestMoveRef.current   = bestMove   }, [bestMove])
    useEffect(() => { evalBeforeRef.current = evalBefore }, [evalBefore])
    useEffect(() => { evalAfterRef.current  = evalAfter  }, [evalAfter])

    // Key: only move+personality, not eval/bestMove — prevents re-fetch on every Stockfish depth update
    const key = `${fen}|${userMove}|${personality}`

    useEffect(() => {
        if (!userMove || !fen) return
        if (lastKeyRef.current === key) return
        lastKeyRef.current = key

        setPhase('idle')
        setResult(null)
        onAdvice?.(null)
        clearTimeout(timerRef.current)

        // Wait 650ms so rapid arrow-key navigation doesn't spam the API
        timerRef.current = setTimeout(async () => {
            const curBestMove   = bestMoveRef.current
            const curEvalBefore = evalBeforeRef.current
            const curEvalAfter  = evalAfterRef.current

            const classification = classifyMove(curEvalBefore, curEvalAfter, playerColor, userMove, curBestMove)

            if (classification === 'Best') {
                setResult({ classification })
                setPhase('done')
                return
            }

            if (!curBestMove) return  // engine hasn't provided a move yet

            setPhase('loading')
            try {
                const data = await fetchAICoachExplanation({
                    fen,
                    user_move:      userMove,
                    best_move:      curBestMove,
                    eval_before:    curEvalBefore ?? null,
                    eval_after:     curEvalAfter  ?? null,
                    move_number:    moveNumber ?? null,
                    classification,
                    personality:    personality || 'default',
                })
                setResult({ ...data, classification })
                setPhase('done')
                onAdvice?.(data.explanation)
            } catch {
                setPhase('error')
                onAdvice?.(null)
            }
        }, 650)

        return () => clearTimeout(timerRef.current)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])

    if (!userMove) return null

    // Derive classification optimistically even before API call finishes
    const classification = result?.classification
        ?? classifyMove(evalBefore, evalAfter, playerColor, userMove, bestMove)
    const cfg = CLASSIFICATIONS[classification] ?? CLASSIFICATIONS.Good

    return (
        <>
            <style>{skeletonCSS}</style>
            <div style={{
                background: '#1a1715',
                border: `1px solid ${cfg.color}44`,
                borderRadius: 10,
                overflow: 'hidden',
                transition: 'border-color .35s',
            }}>

                {/* ── Classification header ────────────────────────────── */}
                <div style={{
                    background: cfg.bg,
                    borderBottom: `1px solid ${cfg.color}22`,
                    padding: '8px 12px',
                    display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'background .35s',
                }}>
                    <span style={{
                        background: cfg.color,
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: 10,
                        padding: '2px 8px',
                        borderRadius: 20,
                        letterSpacing: .5,
                        fontFamily: 'monospace',
                        flexShrink: 0,
                        boxShadow: `0 2px 8px ${cfg.color}55`,
                    }}>{cfg.icon}</span>

                    <span style={{ color: cfg.color, fontSize: 12, fontWeight: 700 }}>
                        {cfg.label}
                    </span>

                    {phase === 'loading' && (
                        <span style={{
                            marginLeft: 'auto', color: '#4a4541',
                            fontSize: 10, fontWeight: 600,
                            animation: 'pulse 1.4s infinite',
                        }}>⏳ Analysing…</span>
                    )}

                    <span style={{ color: '#3a3631', fontSize: 10, marginLeft: phase === 'loading' ? 0 : 'auto' }}>
                        🎓 AI Coach
                    </span>
                </div>

                {/* ── Content area ─────────────────────────────────────── */}
                <div style={{ padding: '10px 12px' }}>

                    {phase === 'loading' && <Skeleton />}

                    {phase === 'error' && (
                        <p style={{ color: '#e05c5c', fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                            Coach unavailable — check your backend is running.
                        </p>
                    )}

                    {phase === 'done' && result && (
                        <div className="coach-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>

                            {/* Best move — short praise */}
                            {classification === 'Best' && (
                                <p style={{ color: '#1bada6', fontSize: 12, margin: 0, fontWeight: 600 }}>
                                    ✅ Engine agrees — this was the best move in the position!
                                </p>
                            )}

                            {/* Explanation */}
                            {result.explanation && (
                                <div>
                                    <span style={{
                                        color: '#4a4541', fontSize: 9, fontWeight: 700,
                                        textTransform: 'uppercase', letterSpacing: 1.2,
                                        display: 'block', marginBottom: 4,
                                    }}>Why</span>
                                    <p style={{ color: '#b0a89e', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
                                        {result.explanation}
                                    </p>
                                </div>
                            )}

                            {/* Best move suggestion */}
                            {result.suggestion && (
                                <div style={{
                                    background: 'rgba(129,182,76,.07)',
                                    border: '1px solid rgba(129,182,76,.22)',
                                    borderRadius: 7,
                                    padding: '8px 11px',
                                }}>
                                    <span style={{
                                        color: '#4a4541', fontSize: 9, fontWeight: 700,
                                        textTransform: 'uppercase', letterSpacing: 1.2,
                                        display: 'block', marginBottom: 4,
                                    }}>Better was</span>
                                    <p style={{ color: '#81b64c', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
                                        {result.suggestion}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}