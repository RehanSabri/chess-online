import React, { useState, useEffect, useRef, useCallback } from 'react'
import { pieceImg, pc, pt, legalMoves, applyMove, toAlg, FRESH_STATE } from '../logic/gameLogic.js'
import CoachPanel, { fetchGameSummary, PERSONALITIES, CLASSIFICATIONS, classifyMove } from './CoachPanel.jsx'

const BACKEND_URL = import.meta.env.VITE_COACH_URL || 'http://localhost:8000'

async function fetchGameReview(moves, evalSwings, result, myColor) {
    const res = await fetch(`${BACKEND_URL}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moves, eval_swings: evalSwings, result, my_color: myColor }),
    })
    if (!res.ok) throw new Error('Review unavailable')
    return res.json()
}

// ─── FEN GENERATOR ────────────────────────────────────────────────────────────
function boardToFen(board, turn, cr, ep, halfMove = 0, fullMove = 1) {
    let fen = ''
    for (let r = 0; r < 8; r++) {
        let empty = 0
        for (let c = 0; c < 8; c++) {
            const p = board[r][c]
            if (!p) { empty++; continue }
            if (empty) { fen += empty; empty = 0 }
            const t = pt(p)
            const ch = t === 'N' ? 'n' : t.toLowerCase()
            fen += pc(p) === 'w' ? ch.toUpperCase() : ch
        }
        if (empty) fen += empty
        if (r < 7) fen += '/'
    }
    const castling =
        (cr.wK ? 'K' : '') + (cr.wQ ? 'Q' : '') +
        (cr.bK ? 'k' : '') + (cr.bQ ? 'q' : '') || '-'
    const epStr = ep ? 'abcdefgh'[ep[1]] + (8 - ep[0]) : '-'
    return `${fen} ${turn} ${castling} ${epStr} ${halfMove} ${fullMove}`
}

// ─── FIND MOVE FROM ALGEBRAIC NOTE ───────────────────────────────────────────
function findMoveFromNote(board, color, cr, ep, note) {
    const clean = note.replace(/[+#]/g, '')
    if (clean === 'O-O')   { const r = color === 'w' ? 7 : 0; return { fr: r, fc: 4, tr: r, tc: 6, promo: null } }
    if (clean === 'O-O-O') { const r = color === 'w' ? 7 : 0; return { fr: r, fc: 4, tr: r, tc: 2, promo: null } }
    for (let fr = 0; fr < 8; fr++) {
        for (let fc = 0; fc < 8; fc++) {
            if (pc(board[fr][fc]) !== color) continue
            for (const [tr, tc] of legalMoves(board, fr, fc, cr, ep)) {
                const promos = pt(board[fr][fc]) === 'P' && (tr === 0 || tr === 7)
                    ? ['Q', 'R', 'B', 'N'] : [null]
                for (const p of promos) {
                    const n = toAlg(board, fr, fc, tr, tc, p).replace(/[+#]/g, '')
                    if (n === clean) return { fr, fc, tr, tc, promo: p }
                }
            }
        }
    }
    return null
}

// ─── RECONSTRUCT ALL POSITIONS FROM HISTORY ──────────────────────────────────
function reconstructPositions(history) {
    const fresh = FRESH_STATE()
    let board = fresh.board.map(r => [...r])
    let turn = 'w', cr = { wK: true, wQ: true, bK: true, bQ: true }, ep = null
    let halfMove = 0, fullMove = 1
    const positions = [{
        board: board.map(r => [...r]), turn, cr: { ...cr }, ep,
        fen: boardToFen(board, turn, cr, ep),
        moveNote: null, moveColor: null,
        moveFr: null, moveFc: null, moveTr: null, moveTc: null,
    }]
    for (const move of history) {
        const found = findMoveFromNote(board, turn, cr, ep, move.n)
        if (!found) break
        const { fr, fc, tr, tc, promo } = found
        const isCapture = !!board[tr][tc]
        const isPawn = pt(board[fr][fc]) === 'P'
        const { nb, newCR, newEP } = applyMove(board, fr, fc, tr, tc, promo, cr, ep)
        halfMove = (isPawn || isCapture) ? 0 : halfMove + 1
        if (turn === 'b') fullMove++
        board = nb; turn = turn === 'w' ? 'b' : 'w'; cr = newCR; ep = newEP
        positions.push({
            board: board.map(r => [...r]), turn, cr: { ...cr }, ep,
            fen: boardToFen(board, turn, cr, ep, halfMove, fullMove),
            moveNote: move.n, moveColor: move.color,
            moveFr: fr, moveFc: fc, moveTr: tr, moveTc: tc,
        })
    }
    return positions
}

// ─── EVAL HELPERS ─────────────────────────────────────────────────────────────
function evalToWhitePercent(evalObj) {
    if (!evalObj) return 50
    if (evalObj.mate != null) return evalObj.mate > 0 ? 97 : 3
    const cp = Math.max(-1200, Math.min(1200, evalObj.cp))
    return 50 + 47 * (2 / (1 + Math.exp(-cp / 400)) - 1)
}

function formatEval(evalObj) {
    if (!evalObj) return '...'
    if (evalObj.mate != null)
        return evalObj.mate > 0 ? `+M${evalObj.mate}` : `-M${Math.abs(evalObj.mate)}`
    const v = evalObj.cp / 100
    return (v > 0 ? '+' : '') + v.toFixed(1)
}

// ─── ANALYSIS LOADING OVERLAY ─────────────────────────────────────────────────
function AnalysisLoadingOverlay({ percent = 0, text = 'Starting engine…' }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 900,
            background: '#262421',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 28,
            fontFamily: "'Inter',sans-serif",
        }}>
            <style>{`@keyframes spinRing{to{transform:rotate(360deg)}}`}</style>
            <div style={{
                width: 72, height: 72, flexShrink: 0,
                border: '3px solid #302c29',
                borderTop: '3px solid #81b64c',
                borderRadius: '50%',
                animation: 'spinRing 1s linear infinite',
            }} />
            <div style={{ textAlign: 'center', width: 300 }}>
                <p style={{ color: '#e8e0d5', fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
                    Analyzing your game…
                </p>
                <p style={{ color: '#6b6560', fontSize: 12, margin: '0 0 18px', minHeight: 18 }}>
                    {text}
                </p>
                <div style={{ height: 4, background: '#302c29', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                        height: '100%',
                        width: `${Math.min(100, percent)}%`,
                        background: 'linear-gradient(90deg,#81b64c,#5b8dd9)',
                        borderRadius: 4,
                        transition: 'width .4s ease',
                    }} />
                </div>
                <p style={{ color: '#3a3631', fontSize: 11, marginTop: 6 }}>
                    {Math.round(Math.min(100, percent))}%
                </p>
            </div>
        </div>
    )
}

// ─── SUMMARY MODAL ────────────────────────────────────────────────────────────
function SummaryModal({ summary, loading, error, onClose }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 600,
            background: 'rgba(0,0,0,.78)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
        }} onClick={onClose}>
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'linear-gradient(160deg,#1e1b18 60%,#252220)',
                    border: '1px solid #302c29',
                    borderRadius: 14,
                    padding: '28px 28px 24px',
                    maxWidth: 420, width: '100%',
                    boxShadow: '0 24px 64px rgba(0,0,0,.75)',
                    animation: 'resultpop .35s cubic-bezier(.34,1.56,.64,1) both',
                    fontFamily: "'Inter',sans-serif",
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                    <span style={{ fontSize: 22 }}>📊</span>
                    <div>
                        <p style={{ color: '#e8e0d5', fontSize: 16, fontWeight: 700, margin: 0 }}>Game Summary</p>
                        <p style={{ color: '#6b6560', fontSize: 11, margin: 0 }}>Powered by Gemini AI</p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            marginLeft: 'auto', background: 'transparent',
                            border: '1px solid #3a3631', borderRadius: 6,
                            padding: '4px 10px', color: '#6b6560',
                            fontSize: 13, cursor: 'pointer',
                        }}
                    >✕</button>
                </div>

                <div style={{ height: 1, background: '#302c29', marginBottom: 18 }} />

                {loading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[90, 75, 85, 60, 70].map((w, i) => (
                            <div key={i} style={{
                                height: 12, width: `${w}%`, borderRadius: 4,
                                background: 'linear-gradient(90deg,#252220 25%,#312d2a 50%,#252220 75%)',
                                backgroundSize: '400px 100%',
                                animation: 'shimmer 1.4s ease-in-out infinite',
                            }} />
                        ))}
                        <style>{`@keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:calc(400px + 100%) 0} }`}</style>
                    </div>
                )}

                {error && (
                    <p style={{ color: '#e05c5c', fontSize: 13, margin: 0 }}>
                        Summary unavailable — check your backend is running.
                    </p>
                )}

                {summary && (
                    <div style={{ animation: 'coachFadeIn .4s ease both' }}>
                        <style>{`@keyframes coachFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
                        {summary.split('\n\n').map((para, i) => (
                            <p key={i} style={{
                                color: i === 0 ? '#e8e0d5' : '#b0a89e',
                                fontSize: 13, lineHeight: 1.65, margin: 0,
                                marginBottom: i < summary.split('\n\n').length - 1 ? 12 : 0,
                            }}>
                                {para}
                            </p>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── ACCURACY RING ────────────────────────────────────────────────────────────
function AccuracyRing({ pct, color, label }) {
    const r = 36, circ = 2 * Math.PI * r
    const offset = circ * (1 - Math.min(100, Math.max(0, pct)) / 100)
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <svg width={90} height={90} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={45} cy={45} r={r} fill="none" stroke="#302c29" strokeWidth={7} />
                <circle cx={45} cy={45} r={r} fill="none" stroke={color} strokeWidth={7}
                    strokeDasharray={circ} strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 1s ease', strokeLinecap: 'round' }} />
            </svg>
            <div style={{ marginTop: -74, textAlign: 'center', pointerEvents: 'none' }}>
                <div style={{ color, fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{pct.toFixed(1)}</div>
                <div style={{ color: '#6b6560', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
            </div>
            <div style={{ height: 16 }} />
        </div>
    )
}

// ─── REVIEW MODAL ─────────────────────────────────────────────────────────────
function ReviewModal({ review, loading, error, onClose, onJumpToMove }) {
    const phaseColor = (w) => w === 'White' ? '#e0d8c8' : w === 'Black' ? '#81b64c' : '#6b6560'
    const shimmerStyle = {
        background: 'linear-gradient(90deg,#252220 25%,#312d2a 50%,#252220 75%)',
        backgroundSize: '400px 100%', animation: 'shimmer 1.4s ease-in-out infinite', borderRadius: 6,
    }
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 700,
            background: 'rgba(0,0,0,.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, overflowY: 'auto',
        }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{
                background: 'linear-gradient(160deg,#1e1b18 55%,#252220)',
                border: '1px solid #302c29', borderRadius: 16,
                padding: '28px 28px 24px', maxWidth: 520, width: '100%',
                boxShadow: '0 28px 72px rgba(0,0,0,.85)',
                animation: 'resultpop .35s cubic-bezier(.34,1.56,.64,1) both',
                fontFamily: "'Inter',sans-serif",
            }}>
                <style>{`@keyframes shimmer{0%{background-position:-400px 0}100%{background-position:calc(400px + 100%) 0}} @keyframes rfadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <span style={{ fontSize: 22 }}>📋</span>
                    <div>
                        <p style={{ color: '#e8e0d5', fontSize: 16, fontWeight: 700, margin: 0 }}>Game Review</p>
                        <p style={{ color: '#6b6560', fontSize: 11, margin: 0 }}>Powered by Stockfish + Gemini AI</p>
                    </div>
                    <button onClick={onClose} style={{
                        marginLeft: 'auto', background: 'transparent',
                        border: '1px solid #3a3631', borderRadius: 6,
                        padding: '4px 10px', color: '#6b6560', fontSize: 13, cursor: 'pointer',
                    }}>✕</button>
                </div>
                <div style={{ height: 1, background: '#302c29', marginBottom: 20 }} />

                {/* Loading skeleton */}
                {loading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
                            {[0,1].map(i => <div key={i} style={{ width: 90, height: 90, borderRadius: '50%', ...shimmerStyle }} />)}
                        </div>
                        {[80, 60, 90, 50, 70, 65].map((w, i) => (
                            <div key={i} style={{ height: 12, width: `${w}%`, ...shimmerStyle }} />
                        ))}
                    </div>
                )}

                {/* Error */}
                {error && (
                    <p style={{ color: '#e05c5c', fontSize: 13, margin: 0 }}>
                        Review unavailable — make sure the backend is running.
                    </p>
                )}

                {/* Content */}
                {review && !loading && (
                    <div style={{ animation: 'rfadeIn .4s ease both' }}>

                        {/* Accuracy rings */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 20 }}>
                            <AccuracyRing pct={review.summary?.white_accuracy ?? 0} color="#e0d8c8" label="White" />
                            <AccuracyRing pct={review.summary?.black_accuracy ?? 0} color="#81b64c" label="Black" />
                        </div>

                        {/* Opening */}
                        {review.opening && (
                            <div style={{
                                background: '#1a1715', border: '1px solid #302c29', borderRadius: 10,
                                padding: '10px 14px', marginBottom: 10,
                                display: 'flex', alignItems: 'center', gap: 10,
                            }}>
                                <span style={{ fontSize: 16 }}>📖</span>
                                <div>
                                    <div style={{ color: '#e8e0d5', fontSize: 13, fontWeight: 700 }}>{review.opening}</div>
                                    {review.eco && (
                                        <span style={{
                                            background: '#302c29', color: '#81b64c', fontSize: 10,
                                            fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                                            letterSpacing: 0.5, display: 'inline-block', marginTop: 3,
                                        }}>{review.eco}</span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Turning point */}
                        {review.turning_point && (
                            <div style={{
                                background: 'rgba(224,92,92,.08)', border: '1px solid rgba(224,92,92,.25)',
                                borderRadius: 10, padding: '10px 14px', marginBottom: 10,
                                display: 'flex', alignItems: 'flex-start', gap: 10,
                            }}>
                                <span style={{ fontSize: 16, flexShrink: 0 }}>⚡</span>
                                <div>
                                    <div style={{ color: '#6b6560', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Turning Point</div>
                                    <div style={{ color: '#c88f8f', fontSize: 12, lineHeight: 1.55 }}>{review.turning_point}</div>
                                </div>
                            </div>
                        )}

                        {/* Phase winners */}
                        {review.summary?.phase_winner && (
                            <div style={{
                                display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap',
                            }}>
                                {Object.entries(review.summary.phase_winner).map(([phase, winner]) => (
                                    <div key={phase} style={{
                                        flex: 1, minWidth: 80,
                                        background: '#1a1715', border: '1px solid #302c29', borderRadius: 8,
                                        padding: '8px 10px', textAlign: 'center',
                                    }}>
                                        <div style={{ color: '#4a4541', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{phase}</div>
                                        <div style={{ color: phaseColor(winner), fontSize: 12, fontWeight: 700 }}>{winner}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Learnings + Strengths */}
                        <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
                            {/* Loser learnings */}
                            {review.summary?.loser_learnings?.length > 0 && (
                                <div style={{ flex: 1, background: 'rgba(224,92,92,.06)', border: '1px solid rgba(224,92,92,.18)', borderRadius: 10, padding: '10px 12px' }}>
                                    <div style={{ color: '#e05c5c', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>📌 Improve On</div>
                                    {review.summary.loser_learnings.map((t, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 6 }}>
                                            <span style={{ color: '#e05c5c', fontSize: 11, flexShrink: 0 }}>•</span>
                                            <span style={{ color: '#b0a89e', fontSize: 11, lineHeight: 1.5 }}>{t}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {/* Winner strengths */}
                            {review.summary?.winner_strengths?.length > 0 && (
                                <div style={{ flex: 1, background: 'rgba(129,182,76,.06)', border: '1px solid rgba(129,182,76,.18)', borderRadius: 10, padding: '10px 12px' }}>
                                    <div style={{ color: '#81b64c', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>⭐ Strengths</div>
                                    {review.summary.winner_strengths.map((t, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 6 }}>
                                            <span style={{ color: '#81b64c', fontSize: 11, flexShrink: 0 }}>•</span>
                                            <span style={{ color: '#b0a89e', fontSize: 11, lineHeight: 1.5 }}>{t}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AnalysisScreen({ history, myColor, result, onBack }) {
    const [positions]  = useState(() => reconstructPositions(history))
    const [idx, setIdx]             = useState(0)
    const [evalInfo, setEvalInfo]   = useState(null)
    const [bestMove, setBestMove]   = useState(null)
    const [engineReady, setEngineReady] = useState(false)
    const [depth, setDepth]         = useState(0)
    const [flipped, setFlipped]     = useState(myColor === 'b')
    const [blunderHighlight, setBlunderHighlight] = useState(false)

    // ── Eval cache: stores {cp, mate} per position index ──────────────────────
    const evalCacheRef = useRef({})

    const [showSummary, setShowSummary]       = useState(false)
    const [summaryText, setSummaryText]       = useState(null)
    const [summaryLoading, setSummaryLoading] = useState(false)
    const [summaryError, setSummaryError]     = useState(false)
    const [personality, setPersonality]       = useState('default')
    const [analysisReady, setAnalysisReady]   = useState(false)

    // ── Review state ──────────────────────────────────────────────────────────
    const [showReview, setShowReview]         = useState(false)
    const [reviewData, setReviewData]         = useState(null)
    const [reviewLoading, setReviewLoading]   = useState(false)
    const [reviewError, setReviewError]       = useState(false)
    const [batchProgress, setBatchProgress]   = useState(0)   // 0‒100 %
    const batchEngineRef  = useRef(null)
    const batchEvalRef    = useRef([])   // cp loss per half-move index
    const batchIdxRef     = useRef(0)
    const batchRunningRef = useRef(false)

    const engineRef      = useRef(null)
    const currentTurnRef = useRef('w')
    const moveListRef    = useRef(null)

    const pos = positions[idx]

    // ── Cache eval whenever it updates ────────────────────────────────────────
    useEffect(() => {
        if (evalInfo) {
            evalCacheRef.current[idx] = evalInfo
        }
    }, [evalInfo, idx])

    // ── Init Stockfish ────────────────────────────────────────────────────────
    useEffect(() => {
        let worker
        try {
            worker = new Worker('/stockfish.js', { type: 'classic' })
            worker.onmessage = (e) => {
                const line = typeof e.data === 'string' ? e.data : ''
                if (!line) return
                if (line === 'uciok')    { worker.postMessage('isready'); return }
                if (line === 'readyok') { setEngineReady(true); setAnalysisReady(true); return }
                if (line.startsWith('info') && line.includes('depth') && line.includes('score')) {
                    const depthM = line.match(/depth (\d+)/)
                    const cpM    = line.match(/score cp (-?\d+)/)
                    const mateM  = line.match(/score mate (-?\d+)/)
                    const pvM    = line.match(/ pv ([a-h][1-8])([a-h][1-8])/)
                    if (depthM) setDepth(parseInt(depthM[1]))
                    if (cpM) {
                        const raw = parseInt(cpM[1])
                        const cp  = currentTurnRef.current === 'b' ? -raw : raw
                        setEvalInfo({ cp })
                    } else if (mateM) {
                        const raw  = parseInt(mateM[1])
                        const mate = currentTurnRef.current === 'b' ? -raw : raw
                        setEvalInfo({ mate })
                    }
                    if (pvM) {
                        const FILES = 'abcdefgh'
                        setBestMove({
                            fr: 8 - parseInt(pvM[1][1]), fc: FILES.indexOf(pvM[1][0]),
                            tr: 8 - parseInt(pvM[2][1]), tc: FILES.indexOf(pvM[2][0]),
                        })
                    }
                }
            }
            worker.onerror = err => console.error('Stockfish error:', err)
            worker.postMessage('uci')
            engineRef.current = worker
        } catch (err) {
            console.error('Failed to load Stockfish worker:', err)
        }
        return () => worker?.terminate()
    }, [])

    // ── Analyze current position (streaming) ───────────────────────────────
    useEffect(() => {
        if (!engineReady || !engineRef.current) return
        currentTurnRef.current = pos.turn
        setEvalInfo(null)
        setBestMove(null)
        setDepth(0)
        engineRef.current.postMessage('stop')
        const timer = setTimeout(() => {
            if (!engineRef.current) return
            engineRef.current.postMessage('ucinewgame')
            engineRef.current.postMessage(`position fen ${pos.fen}`)
            engineRef.current.postMessage('go depth 22')
        }, 150)
        return () => clearTimeout(timer)
    }, [idx, engineReady, pos.fen, pos.turn])

    // ── Navigation ────────────────────────────────────────────────────────────
    const goTo = useCallback((i) => {
        setIdx(Math.max(0, Math.min(positions.length - 1, i)))
        setBlunderHighlight(false)
    }, [positions.length])

    useEffect(() => {
        const onKey = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
            if (e.key === 'ArrowLeft')  goTo(idx - 1)
            if (e.key === 'ArrowRight') goTo(idx + 1)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [idx, goTo])

    // ── Auto-scroll move list ─────────────────────────────────────────────────
    useEffect(() => {
        if (moveListRef.current) {
            const el = moveListRef.current.querySelector('[data-active="true"]')
            if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
    }, [idx])

    // ── Batch Stockfish evaluation (background pass) ──────────────────────────
    useEffect(() => {
        if (!engineReady || batchRunningRef.current || positions.length < 2) return
        batchRunningRef.current = true
        batchEvalRef.current = []
        batchIdxRef.current = 0

        let batchWorker
        try {
            batchWorker = new Worker('/stockfish.js', { type: 'classic' })
            batchEngineRef.current = batchWorker
        } catch { return }

        const total = positions.length  // pos 0 = start, pos 1..N = after each move
        let cpResults = []  // raw cp (white POV) for each position index 0..N
        let resolvePos = null

        const analyseNext = (posIdx) => {
            if (posIdx >= total) {
                // Compute cp-loss per half-move (index 1..N-1 correspond to half-moves)
                const swings = []
                for (let i = 1; i < total; i++) {
                    const pos = positions[i]
                    const cpBefore = cpResults[i - 1] ?? 0
                    const cpAfter  = cpResults[i]  ?? 0
                    // Loss from mover's POV
                    const loss = pos.moveColor === 'w'
                        ? Math.max(0, cpBefore - cpAfter)
                        : Math.max(0, cpAfter  - cpBefore)
                    swings.push(Math.round(loss))
                }
                batchEvalRef.current = swings
                setBatchProgress(100)
                batchWorker.terminate()
                batchEngineRef.current = null
                return
            }
            const fen = positions[posIdx].fen
            let bestCp = null
            resolvePos = (cp) => {
                cpResults[posIdx] = cp
                setBatchProgress(Math.round((posIdx / total) * 100))
                analyseNext(posIdx + 1)
            }
            batchWorker.postMessage('stop')
            batchWorker.postMessage(`position fen ${fen}`)
            batchWorker.postMessage('go depth 16')
        }

        batchWorker.onmessage = (e) => {
            const line = typeof e.data === 'string' ? e.data : ''
            if (line === 'uciok')    { batchWorker.postMessage('isready'); return }
            if (line === 'readyok') { analyseNext(0); return }
            if (line.startsWith('bestmove') && resolvePos) {
                const pos_turn = positions[batchIdxRef.current]?.turn ?? 'w'
                resolvePos(lastBatchCpRef.current ?? 0)
                batchIdxRef.current++
                return
            }
            if (line.startsWith('info') && line.includes('score')) {
                const cpM   = line.match(/score cp (-?\d+)/)
                const mateM = line.match(/score mate (-?\d+)/)
                const posIdx = batchIdxRef.current
                const turn   = positions[posIdx]?.turn ?? 'w'
                if (cpM) {
                    const raw = parseInt(cpM[1])
                    lastBatchCpRef.current = turn === 'b' ? -raw : raw
                } else if (mateM) {
                    const raw = parseInt(mateM[1])
                    lastBatchCpRef.current = (turn === 'b' ? -raw : raw) > 0 ? 12000 : -12000
                }
            }
        }
        batchWorker.onerror = () => {}
        batchWorker.postMessage('uci')

        return () => { batchWorker?.terminate(); batchEngineRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [engineReady])

    const lastBatchCpRef = useRef(0)  // stable ref used inside closure above

    // ── Game Review ───────────────────────────────────────────────────────────
    const openReview = async () => {
        setShowReview(true)
        if (reviewData) return
        setReviewLoading(true)
        setReviewError(false)
        try {
            const moveStrings = history.map(m => m.n)
            const gameResult  = result || 'Unknown'
            const data = await fetchGameReview(moveStrings, batchEvalRef.current, gameResult, myColor)
            setReviewData(data)
        } catch {
            setReviewError(true)
        } finally {
            setReviewLoading(false)
        }
    }

    // ── Game Summary ──────────────────────────────────────────────────────────
    const openSummary = async () => {
        setShowSummary(true)
        if (summaryText) return  // already loaded
        setSummaryLoading(true)
        setSummaryError(false)
        try {
            const moveStrings = history.map(m => m.n)
            const gameResult  = result || 'Unknown'
            const data = await fetchGameSummary(moveStrings, gameResult, myColor)
            setSummaryText(data.summary)
        } catch {
            setSummaryError(true)
        } finally {
            setSummaryLoading(false)
        }
    }


    // ── Derived values ────────────────────────────────────────────────────────
    const ranks = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7]
    const files = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7]
    const SQ    = 'min(72px, 12vw, calc((min(100vw, 600px) - 80px) / 8))'
    const whitePercent = evalToWhitePercent(evalInfo)

    const evalColor = !evalInfo ? '#6b6560'
        : evalInfo.mate != null ? (evalInfo.mate > 0 ? '#81b64c' : '#e05c5c')
        : evalInfo.cp > 30 ? '#81b64c' : evalInfo.cp < -30 ? '#e05c5c' : '#b0a89e'

    // Eval before/after for CoachPanel — cp from white's POV
    const evalBeforeCP = evalCacheRef.current[idx - 1]?.cp ?? null
    const evalAfterCP  = evalCacheRef.current[idx]?.cp ?? evalInfo?.cp ?? null

    // Best move as algebraic string for CoachPanel
    const bestMoveAlg = bestMove
        ? `${'abcdefgh'[bestMove.fc]}${8 - bestMove.fr}${'abcdefgh'[bestMove.tc]}${8 - bestMove.tr}`
        : null

    const highlightCSS = `
        @keyframes blunderPulse {
            0%   { box-shadow: inset 0 0 0 4px rgba(224,92,92,.9); }
            50%  { box-shadow: inset 0 0 0 8px rgba(224,92,92,.3); }
            100% { box-shadow: inset 0 0 0 4px rgba(224,92,92,.9); }
        }
        .blunder-sq { animation: blunderPulse .9s ease-in-out infinite !important; }
    `

    return (
        <div style={{
            minHeight: '100vh', background: '#262421',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            fontFamily: "'Inter',sans-serif", padding: '12px',
            userSelect: 'none', boxSizing: 'border-box',
        }}>
            <style>{highlightCSS}</style>

            {/* Analysis loading overlay */}
            {!analysisReady && <AnalysisLoadingOverlay percent={0} text="Starting Stockfish engine…" />}

            {/* Summary Modal */}
            {showSummary && (
                <SummaryModal
                    summary={summaryText}
                    loading={summaryLoading}
                    error={summaryError}
                    onClose={() => setShowSummary(false)}
                />
            )}

            {/* Review Modal */}
            {showReview && (
                <ReviewModal
                    review={reviewData}
                    loading={reviewLoading}
                    error={reviewError}
                    onClose={() => setShowReview(false)}
                />
            )}

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div style={{
                width: '100%', maxWidth: 960,
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
                flexWrap: 'wrap',
            }}>
                <button onClick={onBack} style={{
                    background: 'transparent', border: '1px solid #3a3631', borderRadius: 8,
                    padding: '7px 14px', color: '#b0a89e', fontSize: 13, cursor: 'pointer',
                    fontWeight: 600, transition: 'border-color .15s, color .15s',
                }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#6b6560'; e.currentTarget.style.color = '#e8e0d5' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#3a3631'; e.currentTarget.style.color = '#b0a89e' }}
                >← Back</button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>♟</span>
                    <span style={{ color: '#e8e0d5', fontSize: 17, fontWeight: 700 }}>Game Analysis</span>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Game Review button */}
                    {history.length > 0 && (
                        <button
                            onClick={batchProgress === 100 ? openReview : undefined}
                            disabled={batchProgress < 100}
                            title={batchProgress < 100 ? `Collecting evals… ${batchProgress}%` : 'Full Game Review'}
                            style={{
                                background: batchProgress === 100 ? 'transparent' : '#1a1715',
                                border: `1px solid ${batchProgress === 100 ? '#8b5cf6' : '#302c29'}`,
                                borderRadius: 8,
                                padding: '7px 13px', color: batchProgress === 100 ? '#a78bfa' : '#4a4541',
                                fontSize: 12, cursor: batchProgress === 100 ? 'pointer' : 'not-allowed',
                                fontWeight: 600, transition: 'background .15s',
                                opacity: batchProgress === 100 ? 1 : 0.6,
                            }}
                            onMouseEnter={e => { if (batchProgress === 100) e.currentTarget.style.background = 'rgba(167,139,250,.1)' }}
                            onMouseLeave={e => { if (batchProgress === 100) e.currentTarget.style.background = 'transparent' }}
                        >
                            {batchProgress < 100 ? `⏳ ${batchProgress}%` : '📋 Game Review'}
                        </button>
                    )}
                    {/* Game Summary button */}
                    {history.length > 0 && (
                        <button onClick={openSummary} style={{
                            background: 'transparent',
                            border: '1px solid #4a7c9e', borderRadius: 8,
                            padding: '7px 13px', color: '#6aabcf',
                            fontSize: 12, cursor: 'pointer', fontWeight: 600,
                            transition: 'background .15s',
                        }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(106,171,207,.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >📊 Game Summary</button>
                    )}

                    {/* Personality picker */}
                    <div style={{ display: 'flex', gap: 4, background: '#1a1715', border: '1px solid #302c29', borderRadius: 10, padding: 3 }}>
                        {PERSONALITIES.map(p => {
                            const active = personality === p.id
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => setPersonality(p.id)}
                                    title={p.desc}
                                    style={{
                                        background: active ? '#302c29' : 'transparent',
                                        border: 'none',
                                        borderRadius: 7,
                                        padding: '5px 9px',
                                        color: active ? '#e8e0d5' : '#6b6560',
                                        fontSize: 11, fontWeight: active ? 700 : 500,
                                        cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        transition: 'background .15s, color .15s',
                                        whiteSpace: 'nowrap',
                                    }}
                                    onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#b0a89e' }}
                                    onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#6b6560' }}
                                >
                                    <span>{p.icon}</span>
                                    <span>{p.label}</span>
                                </button>
                            )
                        })}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: engineReady ? '#81b64c' : '#f0a040' }} />
                        <span style={{ color: engineReady ? '#81b64c' : '#f0a040', fontSize: 11, fontWeight: 600 }}>
                            {engineReady ? `Stockfish · d${depth}` : 'Loading engine…'}
                        </span>
                    </div>

                    <button onClick={() => setFlipped(f => !f)} style={{
                        background: 'transparent', border: '1px solid #3a3631', borderRadius: 8,
                        padding: '7px 12px', color: '#b0a89e', fontSize: 12, cursor: 'pointer',
                    }}>⇅ Flip</button>
                </div>
            </div>

            {/* ── Main layout ─────────────────────────────────────────────── */}
            <div style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                width: '100%', maxWidth: 960,
                flexWrap: 'wrap', justifyContent: 'center',
            }}>

                {/* ── Eval bar + Board ────────────────────────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch', gap: 6 }}>

                        {/* Eval bar */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                            <div style={{
                                height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: (evalInfo?.cp < -30 || (evalInfo?.mate != null && evalInfo.mate < 0)) ? '#e05c5c' : '#3a3631',
                                fontSize: 9, fontWeight: 700,
                            }}>
                                {evalInfo && (evalInfo.cp < -30 || (evalInfo.mate != null && evalInfo.mate < 0))
                                    ? formatEval(evalInfo) : ''}
                            </div>
                            <div style={{
                                width: 22, height: `calc(8 * ${SQ})`,
                                background: '#1a1715', border: '1px solid #302c29',
                                borderRadius: 6, overflow: 'hidden', position: 'relative',
                            }}>
                                <div style={{
                                    position: 'absolute', top: 0, left: 0, right: 0,
                                    height: `${100 - whitePercent}%`,
                                    background: '#302c29', transition: 'height .4s ease',
                                }} />
                                <div style={{
                                    position: 'absolute', bottom: 0, left: 0, right: 0,
                                    height: `${whitePercent}%`,
                                    background: '#e8e0d5', transition: 'height .4s ease',
                                }} />
                                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: '#4a4541', zIndex: 2 }} />
                            </div>
                            <div style={{
                                height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: evalColor, fontSize: 9, fontWeight: 700,
                            }}>
                                {evalInfo ? formatEval(evalInfo) : '...'}
                            </div>
                        </div>

                        {/* Board */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ height: 18 }} />
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(8, ${SQ})`,
                                gridTemplateRows: `repeat(8, ${SQ})`,
                                borderRadius: 4,
                                boxShadow: '0 8px 40px rgba(0,0,0,.75)',
                                overflow: 'hidden',
                            }}>
                                {ranks.flatMap(row => files.map(col => {
                                    const light      = (row + col) % 2 === 0
                                    const piece      = pos.board[row][col]
                                    const isLastFrom = idx > 0 && pos.moveFr === row && pos.moveFc === col
                                    const isLastTo   = idx > 0 && pos.moveTr === row && pos.moveTc === col
                                    const isBestFrom = bestMove?.fr === row && bestMove?.fc === col
                                    const isBestTo   = bestMove?.tr === row && bestMove?.tc === col
                                    const isBlunderSq = blunderHighlight && idx > 0 && (
                                        (pos.moveFr === row && pos.moveFc === col) ||
                                        (pos.moveTr === row && pos.moveTc === col)
                                    )

                                    let bg = light ? '#F4E4B5' : '#27694D'
                                    if (isLastFrom || isLastTo) bg = light ? '#cdd16a' : '#aaa23a'
                                    if (isBestFrom) bg = light ? '#f6f669' : '#caca3a'
                                    if (isBestTo)   bg = light ? '#b9df6a' : '#8fb93a'

                                    return (
                                        <div key={`${row}-${col}`} style={{
                                            width: SQ, height: SQ, background: bg,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            position: 'relative',
                                        }} className={isBlunderSq ? 'blunder-sq' : ''}>
                                            {col === files[0] && (
                                                <span style={{ position: 'absolute', top: 2, left: 3, fontSize: 9, fontWeight: 600, color: light ? '#27694D' : '#F4E4B5', lineHeight: 1, pointerEvents: 'none' }}>
                                                    {8 - row}
                                                </span>
                                            )}
                                            {row === ranks[7] && (
                                                <span style={{ position: 'absolute', bottom: 1, right: 3, fontSize: 9, fontWeight: 600, color: light ? '#27694D' : '#F4E4B5', lineHeight: 1, pointerEvents: 'none' }}>
                                                    {'abcdefgh'[col]}
                                                </span>
                                            )}
                                            {isBestTo && !piece && (
                                                <div style={{ width: '34%', height: '34%', borderRadius: '50%', background: 'rgba(0,0,0,.22)', pointerEvents: 'none' }} />
                                            )}
                                            {isBestTo && piece && (
                                                <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 4px rgba(0,0,0,.28)', pointerEvents: 'none', zIndex: 3 }} />
                                            )}
                                            {piece && (
                                                <img
                                                    src={pieceImg(piece)} alt={piece}
                                                    style={{ width: '82%', height: '82%', objectFit: 'contain', zIndex: 2, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.4))' }}
                                                    draggable={false}
                                                />
                                            )}
                                        </div>
                                    )
                                }))}
                            </div>
                            <div style={{ height: 18 }} />
                        </div>
                    </div>

                    {/* Navigation buttons */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'center' }}>
                        {[
                            { label: '⏮', title: 'First',       target: 0 },
                            { label: '◀', title: 'Prev (←)',     target: idx - 1 },
                            { label: '▶', title: 'Next (→)',     target: idx + 1 },
                            { label: '⏭', title: 'Last',        target: positions.length - 1 },
                        ].map(({ label, title, target }) => (
                            <button key={label} onClick={() => goTo(target)} title={title}
                                disabled={target < 0 || target >= positions.length}
                                style={{
                                    background: '#1a1715', border: '1px solid #302c29', borderRadius: 8,
                                    padding: '8px 18px', color: '#e8e0d5', fontSize: 14,
                                    cursor: target < 0 || target >= positions.length ? 'default' : 'pointer',
                                    fontWeight: 700,
                                    opacity: target < 0 || target >= positions.length ? 0.3 : 1,
                                    transition: 'background .1s',
                                }}
                                onMouseEnter={e => { if (target >= 0 && target < positions.length) e.currentTarget.style.background = '#252220' }}
                                onMouseLeave={e => e.currentTarget.style.background = '#1a1715'}
                            >{label}</button>
                        ))}
                    </div>
                    <div style={{ color: '#3a3631', fontSize: 11, marginTop: 5 }}>
                        {idx} / {positions.length - 1} · ← → keys to navigate
                    </div>
                </div>

                {/* ── Right panel ───────────────────────────────────────────── */}
                <div style={{ flex: 1, minWidth: 190, maxWidth: 230, display: 'flex', flexDirection: 'column', gap: 8 }}>

                    {/* Best move card */}
                    <div style={{
                        background: '#1a1715',
                        border: `1px solid ${bestMove ? '#81b64c44' : '#302c29'}`,
                        borderRadius: 8, padding: '10px 12px', transition: 'border-color .3s',
                    }}>
                        <div style={{ color: '#6b6560', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>
                            Best Move
                        </div>
                        {bestMove ? (
                            <div style={{ color: '#81b64c', fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>
                                {'abcdefgh'[bestMove.fc]}{8 - bestMove.fr}
                                <span style={{ color: '#4a4541', margin: '0 4px' }}>→</span>
                                {'abcdefgh'[bestMove.tc]}{8 - bestMove.tr}
                            </div>
                        ) : (
                            <div style={{ color: '#3a3631', fontSize: 12 }}>Calculating…</div>
                        )}
                        <div style={{ color: evalColor, fontSize: 12, fontWeight: 700, marginTop: 3 }}>
                            {evalInfo ? formatEval(evalInfo) : ''}
                        </div>
                    </div>

                    {/* AI Coach Panel — on-demand per move */}
                    {idx > 0 && pos.moveNote && bestMoveAlg && (
                        <CoachPanel
                            fen={positions[idx - 1].fen}
                            userMove={pos.moveNote}
                            bestMove={bestMoveAlg}
                            evalBefore={evalBeforeCP}
                            evalAfter={evalAfterCP}
                            moveNumber={Math.ceil(idx / 2)}
                            playerColor={pos.moveColor}
                            personality={personality}
                            onAdvice={(text) => setBlunderHighlight(!!text)}
                        />
                    )}

                    {/* Move list */}
                    <div style={{
                        background: '#1a1715', border: '1px solid #302c29', borderRadius: 8,
                        display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1,
                    }}>
                        <div style={{ padding: '8px 12px', borderBottom: '1px solid #302c29' }}>
                            <span style={{ color: '#6b6560', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2 }}>Moves</span>
                        </div>
                        <div ref={moveListRef} style={{ overflowY: 'auto', padding: '8px', flex: 1, maxHeight: 340 }}>
                            <div
                                data-active={idx === 0 ? 'true' : 'false'}
                                onClick={() => goTo(0)}
                                style={{
                                    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                                    marginBottom: 6, cursor: 'pointer',
                                    background: idx === 0 ? '#3a3631' : 'transparent',
                                    color: idx === 0 ? '#e8e0d5' : '#4a4541',
                                    fontSize: 11, fontWeight: idx === 0 ? 600 : 400,
                                }}>Start</div>

                            {Array.from({ length: Math.ceil(history.length / 2) }, (_, i) => {
                                const wMove = history[i * 2]
                                const bMove = history[i * 2 + 1]
                                const wIdx  = i * 2 + 1
                                const bIdx  = i * 2 + 2
                                // Look up classification from reviewData if available
                                const reviewPair  = reviewData?.moves?.find(m => m.move_number === i + 1)
                                const wClass  = reviewPair?.white?.classification ?? null
                                const bClass  = reviewPair?.black?.classification ?? null
                                const wCfg    = wClass ? (CLASSIFICATIONS[wClass] ?? null) : null
                                const bCfg    = bClass ? (CLASSIFICATIONS[bClass] ?? null) : null

                                const MoveBadge = ({ cfg }) => cfg ? (
                                    <span title={cfg.label} style={{
                                        color: cfg.color, fontSize: 9, fontWeight: 800,
                                        lineHeight: 1, flexShrink: 0, minWidth: 10, textAlign: 'center',
                                    }}>{cfg.icon}</span>
                                ) : null

                                return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 2 }}>
                                        <span style={{ color: '#3a3631', fontSize: 10, width: 22, flexShrink: 0, fontWeight: 500, textAlign: 'right', paddingRight: 2 }}>{i + 1}.</span>
                                        {wMove && (<>
                                            <span
                                                data-active={idx === wIdx ? 'true' : 'false'}
                                                onClick={() => goTo(wIdx)}
                                                style={{
                                                    color: idx === wIdx ? '#e8e0d5' : '#b0a89e',
                                                    fontSize: 12,
                                                    background: idx === wIdx ? '#3a3631' : 'transparent',
                                                    padding: '2px 6px', borderRadius: 4,
                                                    cursor: 'pointer', flex: 1,
                                                    fontWeight: idx === wIdx ? 600 : 400,
                                                    transition: 'background .1s',
                                                }}
                                                onMouseEnter={e => { if (idx !== wIdx) e.currentTarget.style.background = '#252220' }}
                                                onMouseLeave={e => { if (idx !== wIdx) e.currentTarget.style.background = 'transparent' }}
                                            >{wMove.n}</span>
                                            <MoveBadge cfg={wCfg} />
                                        </>)}
                                        {bMove ? (<>
                                            <span
                                                data-active={idx === bIdx ? 'true' : 'false'}
                                                onClick={() => goTo(bIdx)}
                                                style={{
                                                    color: idx === bIdx ? '#e8e0d5' : '#6b6560',
                                                    fontSize: 12,
                                                    background: idx === bIdx ? '#3a3631' : 'transparent',
                                                    padding: '2px 6px', borderRadius: 4,
                                                    cursor: 'pointer', flex: 1,
                                                    fontWeight: idx === bIdx ? 600 : 400,
                                                    transition: 'background .1s',
                                                }}
                                                onMouseEnter={e => { if (idx !== bIdx) e.currentTarget.style.background = '#252220' }}
                                                onMouseLeave={e => { if (idx !== bIdx) e.currentTarget.style.background = 'transparent' }}
                                            >{bMove.n}</span>
                                            <MoveBadge cfg={bCfg} />
                                        </>) : <span style={{ flex: 1 }} />}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}