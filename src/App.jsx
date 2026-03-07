import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from './firebase.js'
import { ref, set, onValue, off, get, push, update } from 'firebase/database'

// ─── CHESS ENGINE ──────────────────────────────────────────────────────────────

const INIT_BOARD = [
    ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR'],
    ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP'],
    ['wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR'],
]

const GLYPHS = {
    wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
    bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
}

// Map piece code → PNG path (wK → /pieces/wk.png)
const pieceImg = (piece) => `/pieces/${piece.toLowerCase()}.png`

const cloneB = b => b.map(r => [...r])
const pc = p => p ? p[0] : null
const pt = p => p ? p[1] : null

function findKing(board, color) {
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (board[r][c] === color + 'K') return [r, c]
    return null
}

function attacked(board, row, col, by) {
    const pDir = by === 'w' ? 1 : -1
    for (const dc of [-1, 1]) {
        const pr = row + pDir, pcc = col + dc
        if (pr >= 0 && pr < 8 && pcc >= 0 && pcc < 8 && board[pr][pcc] === by + 'P') return true
    }
    for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
        const nr = row + dr, nc = col + dc
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === by + 'N') return true
    }
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        let nr = row + dr, nc = col + dc
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const p = board[nr][nc]
            if (p) { if (pc(p) === by && (pt(p) === 'B' || pt(p) === 'Q')) return true; break }
            nr += dr; nc += dc
        }
    }
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        let nr = row + dr, nc = col + dc
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const p = board[nr][nc]
            if (p) { if (pc(p) === by && (pt(p) === 'R' || pt(p) === 'Q')) return true; break }
            nr += dr; nc += dc
        }
    }
    for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
        const nr = row + dr, nc = col + dc
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === by + 'K') return true
    }
    return false
}

function inCheck(board, color) {
    const k = findKing(board, color)
    return k ? attacked(board, k[0], k[1], color === 'w' ? 'b' : 'w') : false
}

function pseudoMoves(board, r, c, cr, ep) {
    const piece = board[r][c]; if (!piece) return []
    const color = pc(piece), type = pt(piece), opp = color === 'w' ? 'b' : 'w'
    const moves = []
    const slide = dirs => {
        for (const [dr, dc] of dirs) {
            let nr = r + dr, nc = c + dc
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const t = board[nr][nc]
                if (!t) { moves.push([nr, nc]) } else { if (pc(t) === opp) moves.push([nr, nc]); break }
                nr += dr; nc += dc
            }
        }
    }
    const step = dirs => {
        for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const t = board[nr][nc]
                if (!t || pc(t) === opp) moves.push([nr, nc])
            }
        }
    }
    switch (type) {
        case 'P': {
            const d = color === 'w' ? -1 : 1, sr = color === 'w' ? 6 : 1
            if (r + d >= 0 && r + d < 8 && !board[r + d][c]) {
                moves.push([r + d, c])
                if (r === sr && !board[r + 2 * d][c]) moves.push([r + 2 * d, c])
            }
            for (const dc of [-1, 1]) {
                const nr = r + d, nc = c + dc
                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                    if (board[nr][nc] && pc(board[nr][nc]) === opp) moves.push([nr, nc])
                    else if (ep && nr === ep[0] && nc === ep[1]) moves.push([nr, nc])
                }
            }
            break
        }
        case 'N': step([[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]); break
        case 'B': slide([[-1, -1], [-1, 1], [1, -1], [1, 1]]); break
        case 'R': slide([[-1, 0], [1, 0], [0, -1], [0, 1]]); break
        case 'Q': slide([[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]); break
        case 'K': {
            step([[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]])
            const ao = color === 'w' ? 'b' : 'w'
            if (color === 'w') {
                if (cr.wK && !board[7][5] && !board[7][6] && !attacked(board, 7, 4, ao) && !attacked(board, 7, 5, ao) && !attacked(board, 7, 6, ao)) moves.push([7, 6])
                if (cr.wQ && !board[7][3] && !board[7][2] && !board[7][1] && !attacked(board, 7, 4, ao) && !attacked(board, 7, 3, ao) && !attacked(board, 7, 2, ao)) moves.push([7, 2])
            } else {
                if (cr.bK && !board[0][5] && !board[0][6] && !attacked(board, 0, 4, ao) && !attacked(board, 0, 5, ao) && !attacked(board, 0, 6, ao)) moves.push([0, 6])
                if (cr.bQ && !board[0][3] && !board[0][2] && !board[0][1] && !attacked(board, 0, 4, ao) && !attacked(board, 0, 3, ao) && !attacked(board, 0, 2, ao)) moves.push([0, 2])
            }
            break
        }
    }
    return moves
}

function legalMoves(board, r, c, cr, ep) {
    const piece = board[r][c]; if (!piece) return []
    const color = pc(piece), type = pt(piece)
    return pseudoMoves(board, r, c, cr, ep).filter(([tr, tc]) => {
        const nb = cloneB(board)
        if (type === 'P' && ep && tr === ep[0] && tc === ep[1] && !board[tr][tc]) nb[color === 'w' ? tr + 1 : tr - 1][tc] = null
        if (type === 'K') {
            if (tc === c + 2) { nb[r][5] = nb[r][7]; nb[r][7] = null }
            else if (tc === c - 2) { nb[r][3] = nb[r][0]; nb[r][0] = null }
        }
        nb[tr][tc] = piece; nb[r][c] = null
        return !inCheck(nb, color)
    })
}

function hasLegal(board, color, cr, ep) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
        if (pc(board[r][c]) === color && legalMoves(board, r, c, cr, ep).length > 0) return true
    return false
}

function applyMove(board, fr, fc, tr, tc, promo, cr, ep) {
    const nb = cloneB(board), piece = nb[fr][fc]
    const color = pc(piece), type = pt(piece)
    let newEP = null, newCR = { ...cr }, cap = nb[tr][tc]
    if (type === 'P' && ep && tr === ep[0] && tc === ep[1] && !board[tr][tc]) {
        const capR = color === 'w' ? tr + 1 : tr - 1; cap = nb[capR][tc]; nb[capR][tc] = null
    }
    if (type === 'P' && Math.abs(tr - fr) === 2) newEP = [(fr + tr) / 2, tc]
    if (type === 'K') {
        if (tc === fc + 2) { nb[fr][5] = nb[fr][7]; nb[fr][7] = null }
        else if (tc === fc - 2) { nb[fr][3] = nb[fr][0]; nb[fr][0] = null }
        if (color === 'w') { newCR.wK = false; newCR.wQ = false }
        else { newCR.bK = false; newCR.bQ = false }
    }
    if (type === 'R') {
        if (fr === 7 && fc === 7) newCR.wK = false; if (fr === 7 && fc === 0) newCR.wQ = false
        if (fr === 0 && fc === 7) newCR.bK = false; if (fr === 0 && fc === 0) newCR.bQ = false
    }
    if (tr === 7 && tc === 7) newCR.wK = false; if (tr === 7 && tc === 0) newCR.wQ = false
    if (tr === 0 && tc === 7) newCR.bK = false; if (tr === 0 && tc === 0) newCR.bQ = false
    const mp = (type === 'P' && (tr === 0 || tr === 7)) ? color + (promo || 'Q') : piece
    nb[tr][tc] = mp; nb[fr][fc] = null
    return { nb, newCR, newEP, cap }
}

function toAlg(board, fr, fc, tr, tc, promo) {
    const files = 'abcdefgh', piece = board[fr][fc], type = pt(piece)
    const to = files[tc] + (8 - tr)
    if (type === 'P') { const base = board[tr][tc] ? files[fc] + 'x' + to : to; return base + (promo ? '=' + promo : '') }
    return type + (board[tr][tc] ? 'x' : '') + to
}

const genCode = () => Math.random().toString(36).substring(2, 8).toUpperCase()

// ─── TIME CONTROLS ────────────────────────────────────────────────────────────
const TIME_CONTROLS = [
    { id: 'bullet', label: 'Bullet', mins: 1, icon: '⚡', desc: '1 min' },
    { id: 'blitz', label: 'Blitz', mins: 3, icon: '🔥', desc: '3 min' },
    { id: 'rapid', label: 'Rapid', mins: 10, icon: '⏱', desc: '10 min' },
]
const fmtTime = secs => {
    if (secs == null) return '--:--'
    const s = Math.max(0, Math.round(secs))
    const m = Math.floor(s / 60)
    const ss = s % 60
    return `${m}:${ss.toString().padStart(2, '0')}`
}

// ─── FIREBASE SERIALIZATION ────────────────────────────────────────────────────
// KEY DESIGN: Store EVERYTHING as flat strings/numbers — never store JS arrays
// in Firebase directly, because Firebase converts arrays to numbered objects.

const encodeBoard = board =>
    board.map(row => row.map(c => c || '.').join(',')).join('|')

const decodeBoard = s =>
    s.split('|').map(row => row.split(',').map(c => c === '.' ? null : c))

const encodeCR = cr =>
    (cr.wK ? 'K' : '') + (cr.wQ ? 'Q' : '') + (cr.bK ? 'k' : '') + (cr.bQ ? 'q' : '')

const decodeCR = s => ({
    wK: s.includes('K'), wQ: s.includes('Q'),
    bK: s.includes('k'), bQ: s.includes('q'),
})

const encodeEP = ep => ep ? ep.join(',') : ''
const decodeEP = s => s ? s.split(',').map(Number) : null

const encodeHistory = h => h.map(x => x.n + ':' + x.color).join('|')
const decodeHistory = s => !s ? [] : s.split('|').filter(Boolean).map(h => {
    const i = h.lastIndexOf(':'); return { n: h.slice(0, i), color: h.slice(i + 1) }
})

const encodeCaptured = a => a.join(',')
const decodeCaptured = s => s ? s.split(',').filter(Boolean) : []

const encodeLastMove = lm => lm ? [lm.fr, lm.fc, lm.tr, lm.tc].join(',') : ''
const decodeLastMove = s => {
    if (!s) return null
    const [fr, fc, tr, tc] = s.split(',').map(Number)
    return { fr, fc, tr, tc }
}

// Encode full game state to a Firebase-safe flat object
function encodeGs(state, meta = {}) {
    return {
        board: encodeBoard(state.board),
        turn: state.turn,
        cr: encodeCR(state.cr),
        ep: encodeEP(state.ep),
        status: state.status,
        history: encodeHistory(state.history),
        captured_w: encodeCaptured(state.captured.w),
        captured_b: encodeCaptured(state.captured.b),
        lastMove: encodeLastMove(state.lastMove),
        winner: state.winner || '',
        seq: state.seq,
        rematchReq: state.rematchReq || '',
        timeW: state.timeW ?? null,
        timeB: state.timeB ?? null,
        lastMoveTs: state.lastMoveTs ?? null,
        timeControl: state.timeControl || null,
        ...meta,
    }
}

// Decode Firebase flat object back into JS game state
function decodeGs(d) {
    return {
        board: decodeBoard(d.board),
        turn: d.turn || 'w',
        cr: decodeCR(d.cr || 'KQkq'),
        ep: decodeEP(d.ep),
        status: d.status || 'playing',
        history: decodeHistory(d.history),
        captured: { w: decodeCaptured(d.captured_w), b: decodeCaptured(d.captured_b) },
        lastMove: decodeLastMove(d.lastMove),
        winner: d.winner || null,
        seq: d.seq || 0,
        rematchReq: d.rematchReq || null,
        timeW: d.timeW ?? null,
        timeB: d.timeB ?? null,
        lastMoveTs: d.lastMoveTs ?? null,
        timeControl: d.timeControl || null,
    }
}

const FRESH_STATE = (tcMins = null) => ({
    board: cloneB(INIT_BOARD),
    turn: 'w',
    cr: { wK: true, wQ: true, bK: true, bQ: true },
    ep: null,
    status: 'playing',
    history: [],
    captured: { w: [], b: [] },
    lastMove: null,
    winner: null,
    seq: 0,
    rematchReq: null,
    timeW: tcMins != null ? tcMins * 60 : null,
    timeB: tcMins != null ? tcMins * 60 : null,
    lastMoveTs: null,
    timeControl: tcMins,
})

// ─── STYLES ───────────────────────────────────────────────────────────────────

const FONT = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`

const CSS = `
*{box-sizing:border-box;}
.btn-green{width:100%;padding:12px 16px;background:#81b64c;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:14px;font-family:'Inter',sans-serif;font-weight:600;transition:background .15s,transform .1s;display:block;margin-bottom:8px;}
.btn-green:hover{background:#6da03c;transform:translateY(-1px);}
.btn-green:disabled{opacity:.4;cursor:default;transform:none;}
.btn-outline{width:100%;padding:11px 16px;background:transparent;border:1.5px solid #4a4541;color:#b0a89e;border-radius:6px;cursor:pointer;font-size:14px;font-family:'Inter',sans-serif;font-weight:500;transition:all .15s;display:block;margin-bottom:8px;}
.btn-outline:hover{border-color:#81b64c;color:#81b64c;}
.btn-outline:disabled{opacity:.3;cursor:default;}
.btn-ghost{width:100%;padding:9px 14px;background:transparent;border:1px solid #3a3631;color:#6b6560;border-radius:5px;cursor:pointer;font-size:13px;font-family:'Inter',sans-serif;transition:all .15s;display:block;}
.btn-ghost:hover{border-color:#555;color:#bbb;}
.btn-color{flex:1;padding:14px 10px;border:2px solid #3a3631;border-radius:8px;cursor:pointer;font-size:13px;font-family:'Inter',sans-serif;font-weight:600;transition:all .15s;background:#1e1b18;color:#b0a89e;display:flex;flex-direction:column;align-items:center;gap:6px;}
.btn-color:hover{border-color:#81b64c;color:#e8e0d5;}
.btn-color.selected{border-color:#81b64c;background:#1e2e18;color:#81b64c;}
.code-input{width:100%;padding:12px 16px;background:#1e1b18;border:1.5px solid #3a3631;border-radius:6px;color:#e8e0d5;font-size:20px;letter-spacing:6px;font-family:'Inter',sans-serif;text-align:center;text-transform:uppercase;outline:none;margin-bottom:10px;transition:border-color .2s;}
.code-input:focus{border-color:#81b64c;box-shadow:0 0 0 3px rgba(129,182,76,.13);}
.code-input::placeholder{color:#3a3631;letter-spacing:3px;font-size:14px;}
.code-box{background:#1e1b18;border:1.5px solid #81b64c;border-radius:6px;padding:14px 20px;color:#e8e0d5;font-size:24px;letter-spacing:10px;text-align:center;cursor:pointer;transition:background .15s;margin-bottom:8px;font-weight:700;}
.code-box:hover{background:#252220;}
.sq{transition:background .08s;touch-action:none;}
.sq:hover{filter:brightness(1.12);}
.pbtn{font-size:44px;background:#2a2522;border:1.5px solid #3a3631;border-radius:8px;padding:8px 12px;cursor:pointer;transition:all .15s;font-family:serif;}
.pbtn:hover{background:#81b64c;border-color:#81b64c;}
.piece-draggable{cursor:grab;transition:transform .05s;}
.piece-draggable:active{cursor:grabbing;}
.drag-ghost{position:fixed;pointer-events:none;z-index:9999;user-select:none;filter:drop-shadow(0 6px 16px rgba(0,0,0,.7));transform:translate(-50%,-50%);transition:none;will-change:transform;}
.sq.drag-over{filter:brightness(1.22) !important;}
@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
@keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes resultpop{0%{opacity:0;transform:scale(.88) translateY(24px)}60%{transform:scale(1.03) translateY(-4px)}100%{opacity:1;transform:scale(1) translateY(0)}}
.btn-time{flex:1;padding:12px 8px;border:2px solid #3a3631;border-radius:8px;cursor:pointer;font-size:12px;font-family:'Inter',sans-serif;font-weight:600;transition:all .15s;background:#1e1b18;color:#b0a89e;display:flex;flex-direction:column;align-items:center;gap:4px;}
.btn-time:hover{border-color:#81b64c;color:#e8e0d5;}
.btn-time.selected{border-color:#81b64c;background:#1e2e18;color:#81b64c;}
.clock{padding:8px 12px;border-radius:8px;border:2px solid #302c29;background:#1a1715;text-align:center;transition:background .3s,border-color .3s;}
.clock.active{border-color:#81b64c;background:#1a2515;}
.clock.low{border-color:#e05c5c !important;background:#2a1515 !important;animation:lowpulse .5s infinite;}
@keyframes lowpulse{0%,100%{opacity:1}50%{opacity:.7}}
.tab-btn{flex:1;padding:7px 4px;background:transparent;border:none;border-bottom:2px solid transparent;color:#6b6560;font-size:11px;font-family:'Inter',sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:1.2px;cursor:pointer;transition:color .15s,border-color .15s;}
.tab-btn.active{color:#81b64c;border-bottom-color:#81b64c;}
.tab-btn:hover:not(.active){color:#b0a89e;}
.chat-msg{animation:fadein .2s ease;}
.chat-input{width:100%;padding:8px 10px;background:#0d0b09;border:1px solid #302c29;border-radius:6px;color:#e8e0d5;font-size:12px;font-family:'Inter',sans-serif;outline:none;transition:border-color .2s;resize:none;line-height:1.4;}
.chat-input:focus{border-color:#81b64c;box-shadow:0 0 0 2px rgba(129,182,76,.12);}
.chat-input::placeholder{color:#4a4541;}
.chat-send{width:100%;padding:7px 0;margin-top:5px;background:#81b64c;border:none;border-radius:6px;color:#fff;font-size:12px;font-family:'Inter',sans-serif;font-weight:700;cursor:pointer;transition:background .15s,transform .1s;letter-spacing:.3px;}
.chat-send:hover{background:#6da03c;transform:translateY(-1px);}
.chat-send:disabled{opacity:.4;cursor:default;transform:none;}
.chat-unread{display:inline-block;background:#81b64c;color:#fff;font-size:9px;font-weight:700;border-radius:10px;padding:1px 5px;margin-left:4px;vertical-align:middle;animation:fadein .2s ease;}

/* ── MOBILE RESPONSIVE ─────────────────────────────────────────────────── */
/* Game layout: desktop = 3-col row, mobile = single column */
.game-layout{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;justify-content:center;width:100%;}
.game-left-panel{width:min(190px,30vw);min-width:140px;display:flex;flex-direction:column;gap:6px;}
.game-right-panel{width:min(210px,32vw);min-width:160px;display:flex;flex-direction:column;gap:6px;}
.game-board-col{display:flex;flex-direction:column;align-items:center;flex-shrink:0;}
.mobile-top-bar{display:none;}
.mobile-bottom-bar{display:none;}
.mobile-clock-bar{display:none;}
.mobile-clocks-row{display:none;}
.mobile-status-bar{display:none;}
.desktop-clocks{display:contents;}
@media(max-width:700px){
  html,body{overflow-x:hidden;}
  .game-layout{flex-direction:column;align-items:center;gap:0;padding:0 6px;}
  .game-left-panel{display:none !important;}
  .game-right-panel{width:100%;min-width:0;max-width:520px;}
  .game-board-col{width:100%;max-width:520px;}
  .mobile-top-bar{display:flex;width:100%;max-width:520px;align-items:center;justify-content:space-between;background:#1a1715;border:1px solid #302c29;border-radius:8px 8px 0 0;padding:8px 12px;gap:8px;border-bottom:none;}
  .mobile-clock-bar{display:flex;width:100%;max-width:520px;align-items:center;justify-content:stretch;background:#111;border:1px solid #302c29;padding:0;margin:0;}
  .mobile-clock-bar .mob-clock{flex:1;padding:7px 14px;text-align:center;}
  .mobile-bottom-bar{display:flex;width:100%;max-width:520px;align-items:center;justify-content:space-between;background:#1a1715;border:1px solid #302c29;border-radius:0 0 8px 8px;padding:8px 12px;gap:8px;border-top:none;margin:0;}
  .game-right-panel{margin-top:10px !important;}
  .mobile-clocks-row{display:flex;width:100%;max-width:520px;gap:6px;}
  .mobile-clocks-row .clock{flex:1;}
  .mobile-status-bar{display:flex;width:100%;max-width:520px;align-items:center;justify-content:center;background:#1a1715;border:1px solid #302c29;border-radius:8px;padding:7px 12px;}
  .btn-time{padding:10px 6px;}
  .btn-color{padding:12px 8px;}
  .code-input{font-size:18px;padding:10px 12px;}
}
@media(max-width:400px){
  .pbtn{font-size:36px;padding:6px 8px;}
}
`

const pageS = {
    minHeight: '100vh', background: '#262421',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Inter',sans-serif", padding: '16px 12px', userSelect: 'none',
}
const cardS = {
    background: '#1a1715', border: '1px solid #302c29',
    borderRadius: 10, padding: '28px 20px',
    maxWidth: 400, width: '100%',
    boxShadow: '0 8px 32px rgba(0,0,0,.6)',
}
const divS = { height: 1, background: '#302c29', margin: '18px 0' }

// ─── APP ──────────────────────────────────────────────────────────────────────

let serverOffset = 0
const getNow = () => Date.now() + serverOffset

export default function App() {
    // Screens: 'lobby' | 'color-pick' | 'waiting' | 'game'
    const [screen, setScreen] = useState('lobby')
    const [myColor, setMyColor] = useState(null)   // 'w' | 'b'
    const [pickedColor, setPickedColor] = useState('w') // color selection UI
    const [pickedTime, setPickedTime] = useState('blitz') // 'bullet'|'blitz'|'rapid'
    const [roomCode, setRoomCode] = useState('')
    const [joinInput, setJoinInput] = useState('')
    const [joinError, setJoinError] = useState('')
    const [copied, setCopied] = useState(false)

    const [gs, setGs] = useState(FRESH_STATE)
    const [sel, setSel] = useState(null)
    const [lm, setLm] = useState([])
    const [promo, setPromo] = useState(null)

    // ── Drag state ────────────────────────────────────────────────────────────
    const [dragGhost, setDragGhost] = useState(null)  // { piece, x, y }
    const [dragOver, setDragOver] = useState(null)     // [row, col] square cursor is over
    const dragStateRef = useRef(null)  // { fr, fc, piece, legalSquares }
    const boardRef = useRef(null)      // ref to the board grid DOM node

    // ── Timer display state (client-side ticking) ─────────────────────────
    const [dispTimeW, setDispTimeW] = useState(null)
    const [dispTimeB, setDispTimeB] = useState(null)
    const timerRef = useRef(null)
    const gsRef = useRef(null)  // always-fresh snapshot for timer interval
    const myColorRef = useRef(null)
    const hostColorRef = useRef(null)  // persisted for Firebase meta writes
    const roomRef = useRef('')
    const seqRef = useRef(0)
    const listenerRef = useRef(null)
    const histRef = useRef(null)

    // ── Chat state ────────────────────────────────────────────────────────────
    const [chatMessages, setChatMessages] = useState([])  // [{ id, sender:'me'|'opp', text, ts }]
    const [chatInput, setChatInput] = useState('')
    const [activeTab, setActiveTab] = useState('moves')   // 'moves' | 'chat'
    const [chatUnread, setChatUnread] = useState(0)
    const chatListenerRef = useRef(null)
    const chatBottomRef = useRef(null)
    const chatMyColorRef = useRef(null)  // snapshot of myColor for chat listener

    // Keep gsRef always fresh for use inside timer interval
    useEffect(() => { gsRef.current = gs }, [gs])

    useEffect(() => {
        const offsetRef = ref(db, '.info/serverTimeOffset')
        const unsub = onValue(offsetRef, snap => {
            serverOffset = snap.val() || 0
        })
        return () => unsub()
    }, [])

    // ── Client-side countdown timer ───────────────────────────────────────
    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current)
        const g = gs
        if (g.timeW == null || g.status !== 'playing') {
            setDispTimeW(g.timeW)
            setDispTimeB(g.timeB)
            return
        }
        // Compute elapsed since last move
        const tick = () => {
            const cur = gsRef.current
            if (!cur || cur.status !== 'playing' || cur.timeW == null) return
            const now = getNow()
            const elapsed = cur.lastMoveTs ? (now - cur.lastMoveTs) / 1000 : 0

            const twActual = cur.turn === 'w' ? cur.timeW - elapsed : cur.timeW
            const tbActual = cur.turn === 'b' ? cur.timeB - elapsed : cur.timeB

            const tw = Math.max(0, twActual)
            const tb = Math.max(0, tbActual)

            setDispTimeW(tw)
            setDispTimeB(tb)

            // Timeout check
            if (cur.turn === 'w') {
                if (myColorRef.current === 'w' && twActual <= 0) handleTimeout('w')
                else if (myColorRef.current === 'b' && twActual <= -3) handleTimeout('w')
            } else {
                if (myColorRef.current === 'b' && tbActual <= 0) handleTimeout('b')
                else if (myColorRef.current === 'w' && tbActual <= -3) handleTimeout('b')
            }
        }
        tick()
        timerRef.current = setInterval(tick, 100)
        return () => clearInterval(timerRef.current)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gs.seq, gs.status])

    useEffect(() => {
        if (histRef.current) histRef.current.scrollTop = histRef.current.scrollHeight
    }, [gs.history])

    // ── Timeout handler ───────────────────────────────────────────────────
    const handleTimeout = useCallback((losingColor) => {
        const cur = gsRef.current
        if (!cur || cur.status !== 'playing') return
        const winner = losingColor === 'w' ? 'b' : 'w'
        const newSeq = (cur.seq || 0) + 1
        seqRef.current = newSeq
        const newState = {
            ...cur,
            status: 'checkmate', // reuse checkmate result screen
            winner,
            seq: newSeq,
            timeW: losingColor === 'w' ? 0 : cur.timeW,
            timeB: losingColor === 'b' ? 0 : cur.timeB,
            lastMoveTs: null,
        }
        setGs(newState)
        update(ref(db, 'rooms/' + roomRef.current), encodeGs(newState, {
            hostColor: hostColorRef.current,
            guestJoined: true,
        }))
    }, [])

    // ── Firebase subscription ─────────────────────────────────────────────────
    const subscribe = useCallback((code) => {
        if (listenerRef.current) { off(listenerRef.current); listenerRef.current = null }
        const r = ref(db, 'rooms/' + code)
        listenerRef.current = r
        onValue(r, snap => {
            const d = snap.val()
            if (!d) return
            // Host: auto-transition to game once guest joins
            if (d.guestJoined === true && myColorRef.current !== null) {
                setScreen('game')
            }
            // Sync game state when a move happens (seq changes)
            if (typeof d.seq === 'number' && d.seq !== seqRef.current) {
                seqRef.current = d.seq
                setGs(decodeGs(d))
                setSel(null); setLm([]); setPromo(null)
            } else {
                // Even without a seq change, sync rematchReq so the
                // invited player sees the Accept/Reject UI in real-time
                const incoming = d.rematchReq || null
                setGs(prev => {
                    if (prev.rematchReq === incoming) return prev  // no-op if unchanged
                    return { ...prev, rematchReq: incoming }
                })
            }
        })
    }, [])

    const unsubscribe = useCallback(() => {
        if (listenerRef.current) { off(listenerRef.current); listenerRef.current = null }
    }, [])

    useEffect(() => () => unsubscribe(), [unsubscribe])

    // ── Chat: auto-scroll to bottom ───────────────────────────────────────────
    useEffect(() => {
        if (chatBottomRef.current) chatBottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }, [chatMessages])

    // ── Chat: subscribe to Firebase ───────────────────────────────────────────
    const subscribeChat = useCallback((code) => {
        if (chatListenerRef.current) { off(chatListenerRef.current); chatListenerRef.current = null }
        const r = ref(db, 'rooms/' + code + '/chat')
        chatListenerRef.current = r
        onValue(r, snap => {
            const val = snap.val()
            if (!val) { setChatMessages([]); return }
            const msgs = Object.entries(val)
                .map(([id, m]) => ({ id, sender: m.color === chatMyColorRef.current ? 'me' : 'opp', text: m.text, ts: m.ts }))
                .sort((a, b) => a.ts - b.ts)
            setChatMessages(msgs)
            // Increment unread badge when tab is 'moves'
            setActiveTab(tab => {
                if (tab !== 'chat') {
                    setChatUnread(prev => {
                        const last = msgs[msgs.length - 1]
                        if (last && last.sender === 'opp') return prev + 1
                        return prev
                    })
                }
                return tab
            })
        })
    }, [])

    const unsubscribeChat = useCallback(() => {
        if (chatListenerRef.current) { off(chatListenerRef.current); chatListenerRef.current = null }
    }, [])

    useEffect(() => () => unsubscribeChat(), [unsubscribeChat])

    // ── Chat: send message ────────────────────────────────────────────────────
    const sendChat = useCallback(async () => {
        const text = chatInput.trim()
        if (!text || !roomRef.current || !chatMyColorRef.current) return
        setChatInput('')
        await push(ref(db, 'rooms/' + roomRef.current + '/chat'), {
            color: chatMyColorRef.current,
            text,
            ts: getNow(),
        })
    }, [chatInput])

    // ── Create game ───────────────────────────────────────────────────────────
    const createGame = async () => {
        const chosenColor = pickedColor
        const tc = TIME_CONTROLS.find(t => t.id === pickedTime)
        const code = genCode()
        const fresh = FRESH_STATE(tc.mins)
        const data = {
            ...encodeGs(fresh),
            hostColor: chosenColor,
            guestJoined: false,
        }
        await set(ref(db, 'rooms/' + code), data)
        roomRef.current = code
        hostColorRef.current = chosenColor
        myColorRef.current = chosenColor
        chatMyColorRef.current = chosenColor
        seqRef.current = 0
        setRoomCode(code)
        setMyColor(chosenColor)
        setGs(fresh)
        setChatMessages([]); setChatInput(''); setActiveTab('moves'); setChatUnread(0)
        setScreen('waiting')
        subscribe(code)
        subscribeChat(code)
    }

    // ── Join game ─────────────────────────────────────────────────────────────
    const joinGame = async () => {
        setJoinError('')
        const code = joinInput.trim().toUpperCase()
        if (code.length < 4) { setJoinError('Enter a valid room code.'); return }
        let snap
        try { snap = await get(ref(db, 'rooms/' + code)) }
        catch { setJoinError('Network error. Try again.'); return }
        const d = snap.val()
        if (!d) { setJoinError('Room not found. Check the code.'); return }
        if (d.guestJoined) { setJoinError('Room is full.'); return }
        const guestColor = d.hostColor === 'w' ? 'b' : 'w'
        // Mark guest as joined — this triggers host's subscription to auto-start
        await set(ref(db, 'rooms/' + code + '/guestJoined'), true)
        roomRef.current = code
        hostColorRef.current = d.hostColor
        myColorRef.current = guestColor
        chatMyColorRef.current = guestColor
        seqRef.current = d.seq || 0
        setRoomCode(code)
        setMyColor(guestColor)
        setGs(FRESH_STATE(d.timeControl || null))  // match host's time control
        setChatMessages([]); setChatInput(''); setActiveTab('moves'); setChatUnread(0)
        setScreen('game')
        subscribe(code)
        subscribeChat(code)
    }

    // ── Execute move & push to Firebase ──────────────────────────────────────
    const execMove = useCallback((fr, fc, tr, tc, promoP, currentGs) => {
        const { nb, newCR, newEP, cap } = applyMove(
            currentGs.board, fr, fc, tr, tc, promoP, currentGs.cr, currentGs.ep
        )
        const note = toAlg(currentGs.board, fr, fc, tr, tc, promoP)
        const next = currentGs.turn === 'w' ? 'b' : 'w'
        const newCap = { w: [...currentGs.captured.w], b: [...currentGs.captured.b] }
        if (cap) newCap[currentGs.turn].push(cap)
        const isChk = inCheck(nb, next)
        const hasL = hasLegal(nb, next, newCR, newEP)
        let ns = 'playing'
        if (!hasL) ns = isChk ? 'checkmate' : 'stalemate'
        else if (isChk) ns = 'check'
        const finalNote = note + (ns === 'checkmate' ? '#' : ns === 'check' ? '+' : '')
        const newSeq = (currentGs.seq || 0) + 1
        seqRef.current = newSeq
        // ── Time accounting ──────────────────────────────────────────────
        const now = getNow()
        let newTimeW = currentGs.timeW, newTimeB = currentGs.timeB
        if (currentGs.timeW != null && currentGs.lastMoveTs) {
            const elapsed = (now - currentGs.lastMoveTs) / 1000
            if (currentGs.turn === 'w') newTimeW = Math.max(0, currentGs.timeW - elapsed)
            else newTimeB = Math.max(0, currentGs.timeB - elapsed)
        }
        const newState = {
            board: nb, turn: next, cr: newCR, ep: newEP, status: ns,
            history: [...currentGs.history, { n: finalNote, color: currentGs.turn }],
            captured: newCap,
            lastMove: { fr, fc, tr, tc },
            winner: ns === 'checkmate' ? currentGs.turn : null,
            seq: newSeq,
            rematchReq: null,
            timeW: newTimeW,
            timeB: newTimeB,
            lastMoveTs: ns === 'playing' || ns === 'check' ? now : null,
            timeControl: currentGs.timeControl,
        }
        setGs(newState); setSel(null); setLm([]); setPromo(null)
        update(ref(db, 'rooms/' + roomRef.current), encodeGs(newState, {
            hostColor: hostColorRef.current,
            guestJoined: true,
        }))
    }, [])

    // ── Board click ───────────────────────────────────────────────────────────
    const handleClick = useCallback((row, col) => {
        if (
            gs.status === 'checkmate' || gs.status === 'stalemate' ||
            promo || gs.turn !== myColorRef.current
        ) return
        // Ignore clicks that ended a drag
        if (dragStateRef.current?._wasDrag) { dragStateRef.current._wasDrag = false; return }
        const piece = gs.board[row][col]
        if (sel) {
            const [sr, sc] = sel
            const legal = lm.some(([r, c]) => r === row && c === col)
            if (legal) {
                if (pt(gs.board[sr][sc]) === 'P' && (row === 0 || row === 7)) {
                    setPromo({ fr: sr, fc: sc, tr: row, tc: col })
                } else {
                    execMove(sr, sc, row, col, null, gs)
                }
            } else if (piece && pc(piece) === myColorRef.current) {
                setSel([row, col]); setLm(legalMoves(gs.board, row, col, gs.cr, gs.ep))
            } else {
                setSel(null); setLm([])
            }
        } else {
            if (piece && pc(piece) === myColorRef.current) {
                setSel([row, col]); setLm(legalMoves(gs.board, row, col, gs.cr, gs.ep))
            }
        }
    }, [gs, sel, lm, execMove, promo])

    // ── Drag handlers ─────────────────────────────────────────────────────────
    // Convert pixel position to board [row, col], accounting for board flip
    const pixelToSquare = useCallback((clientX, clientY) => {
        if (!boardRef.current) return null
        const rect = boardRef.current.getBoundingClientRect()
        const relX = clientX - rect.left
        const relY = clientY - rect.top
        if (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height) return null
        const rawCol = Math.floor(relX / rect.width * 8)
        const rawRow = Math.floor(relY / rect.height * 8)
        // Apply board flip
        const flippedBoard = myColorRef.current === 'b'
        const col = flippedBoard ? 7 - rawCol : rawCol
        const row = flippedBoard ? 7 - rawRow : rawRow
        if (row < 0 || row > 7 || col < 0 || col > 7) return null
        return [row, col]
    }, [])

    const handlePieceMouseDown = useCallback((e, row, col, piece) => {
        if (gs.status === 'checkmate' || gs.status === 'stalemate') return
        if (promo) return
        if (pc(piece) !== myColorRef.current) return
        if (gs.turn !== myColorRef.current) return
        e.preventDefault()
        e.stopPropagation()

        const moves = legalMoves(gs.board, row, col, gs.cr, gs.ep)
        dragStateRef.current = { fr: row, fc: col, piece, legalSquares: moves, _wasDrag: false, _moved: false }

        // Show selection + legal moves immediately
        setSel([row, col])
        setLm(moves)
        const startX = e.touches ? e.touches[0].clientX : e.clientX
        const startY = e.touches ? e.touches[0].clientY : e.clientY
        setDragGhost({ piece, x: startX, y: startY })
        setDragOver(null)

        const getXY = (ev) => {
            if (ev.touches && ev.touches.length > 0) return { x: ev.touches[0].clientX, y: ev.touches[0].clientY }
            if (ev.changedTouches && ev.changedTouches.length > 0) return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY }
            return { x: ev.clientX, y: ev.clientY }
        }

        const onMove = (me) => {
            if (!dragStateRef.current) return
            dragStateRef.current._moved = true
            dragStateRef.current._wasDrag = true
            const { x, y } = getXY(me)
            setDragGhost({ piece: dragStateRef.current.piece, x, y })
            const sq = pixelToSquare(x, y)
            setDragOver(sq)
        }

        const onUp = (me) => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.removeEventListener('touchmove', onMove)
            document.removeEventListener('touchend', onUp)
            setDragGhost(null)
            setDragOver(null)

            const ds = dragStateRef.current
            if (!ds || !ds._moved) {
                // Treat as a regular click — keep selection
                return
            }
            dragStateRef.current._wasDrag = true

            const { x, y } = getXY(me)
            const sq = pixelToSquare(x, y)
            if (!sq) { /* dropped off board — keep selection */ return }
            const [tr, tc] = sq
            const { fr, fc, legalSquares } = ds
            const isLegal = legalSquares.some(([r, c]) => r === tr && c === tc)
            if (isLegal) {
                const gsSnapshot = ds._gsSnapshot
                if (pt(piece) === 'P' && (tr === 0 || tr === 7)) {
                    setPromo({ fr, fc, tr, tc })
                    setSel(null); setLm([])
                } else {
                    execMove(fr, fc, tr, tc, null, gsSnapshot)
                }
            } else {
                setSel(null); setLm([])
            }
        }

        // Snapshot the current gs for use in onUp closure
        dragStateRef.current._gsSnapshot = gs

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        document.addEventListener('touchmove', onMove, { passive: false })
        document.addEventListener('touchend', onUp)
    }, [gs, promo, execMove, pixelToSquare])

    const handlePromo = useCallback(t => {
        if (!promo) return
        execMove(promo.fr, promo.fc, promo.tr, promo.tc, t, gs)
    }, [promo, gs, execMove])

    // ── Rematch ───────────────────────────────────────────────────────────────
    const requestRematch = async () => {
        // Only send the request — never auto-accept on the requester's side
        const myRole = myColorRef.current === hostColorRef.current ? 'host' : 'guest'
        await set(ref(db, 'rooms/' + roomRef.current + '/rematchReq'), myRole)
        setGs(prev => ({ ...prev, rematchReq: myRole }))
    }

    const acceptRematch = async () => {
        const snap = await get(ref(db, 'rooms/' + roomRef.current))
        const d = snap.val(); if (!d) return
        const tcMins = d.timeControl || null
        const fresh = FRESH_STATE(tcMins)
        const newSeq = (d.seq || 0) + 1
        seqRef.current = newSeq
        await update(ref(db, 'rooms/' + roomRef.current), encodeGs(
            { ...fresh, seq: newSeq },
            { hostColor: hostColorRef.current, guestJoined: true }
        ))
        setGs(fresh); setSel(null); setLm([]); setPromo(null)
    }

    const rejectRematch = async () => {
        await set(ref(db, 'rooms/' + roomRef.current + '/rematchReq'), '')
        setGs(prev => ({ ...prev, rematchReq: null }))
    }

    // ── Leave game ────────────────────────────────────────────────────────────
    const leaveGame = () => {
        unsubscribe()
        unsubscribeChat()
        if (timerRef.current) clearInterval(timerRef.current)
        myColorRef.current = null; roomRef.current = ''; seqRef.current = 0
        hostColorRef.current = null; chatMyColorRef.current = null
        setScreen('lobby'); setMyColor(null); setRoomCode(''); setJoinInput('')
        setJoinError(''); setPickedColor('w'); setGs(FRESH_STATE())
        setSel(null); setLm([]); setPromo(null)
        setDispTimeW(null); setDispTimeB(null)
        setChatMessages([]); setChatInput(''); setActiveTab('moves'); setChatUnread(0)
    }

    const copyCode = () => {
        navigator.clipboard.writeText(roomCode).catch(() => { })
        setCopied(true); setTimeout(() => setCopied(false), 2000)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── LOBBY SCREEN ─────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════
    if (screen === 'lobby') return (
        <div style={pageS}>
            <style>{FONT + CSS}</style>
            <div style={cardS}>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <div style={{ fontSize: 48, marginBottom: 8 }}>♟</div>
                    <h1 style={{ fontSize: 26, fontWeight: 700, color: '#e8e0d5', marginBottom: 4 }}>Chess Online</h1>
                    <p style={{ color: '#6b6560', fontSize: 13 }}>Real-time multiplayer with friends</p>
                </div>

                <div style={divS} />

                {/* Color selection */}
                {/* Time control */}
                <p style={{ color: '#6b6560', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, textAlign: 'center' }}>
                    Time Control
                </p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    {TIME_CONTROLS.map(tc => (
                        <button
                            key={tc.id}
                            className={`btn-time${pickedTime === tc.id ? ' selected' : ''}`}
                            onClick={() => setPickedTime(tc.id)}
                        >
                            <span style={{ fontSize: 22 }}>{tc.icon}</span>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{tc.label}</span>
                            <span style={{ fontSize: 11, opacity: .75 }}>{tc.desc}</span>
                        </button>
                    ))}
                </div>

                {/* Color selection */}
                <p style={{ color: '#6b6560', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, textAlign: 'center' }}>
                    Play as
                </p>
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                    <button
                        className={`btn-color${pickedColor === 'w' ? ' selected' : ''}`}
                        onClick={() => setPickedColor('w')}
                    >
                        <span style={{ fontSize: 32 }}>♔</span>
                        <span>White</span>
                    </button>
                    <button
                        className={`btn-color${pickedColor === 'b' ? ' selected' : ''}`}
                        onClick={() => setPickedColor('b')}
                    >
                        <span style={{ fontSize: 32 }}>♚</span>
                        <span>Black</span>
                    </button>
                </div>
                <button className="btn-green" onClick={createGame}>
                    + Create New Game
                </button>

                <div style={divS} />

                <p style={{ color: '#6b6560', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, textAlign: 'center' }}>
                    Join with room code
                </p>
                <input
                    className="code-input"
                    maxLength={6}
                    placeholder="ENTER CODE"
                    value={joinInput}
                    onChange={e => { setJoinInput(e.target.value.toUpperCase()); setJoinError('') }}
                    onKeyDown={e => e.key === 'Enter' && joinGame()}
                />
                {joinError && (
                    <p style={{ color: '#e05c5c', fontSize: 12, marginBottom: 10, textAlign: 'center', fontWeight: 500 }}>
                        {joinError}
                    </p>
                )}
                <button className="btn-outline" onClick={joinGame} disabled={joinInput.length < 4}>
                    Join Game →
                </button>

                <p style={{ color: '#4a4541', fontSize: 12, marginTop: 16, textAlign: 'center' }}>
                    Share your room code with a friend to play online
                </p>
            </div>
        </div>
    )

    // ══════════════════════════════════════════════════════════════════════════
    // ── WAITING SCREEN ────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════
    if (screen === 'waiting') return (
        <div style={pageS}>
            <style>{FONT + CSS}</style>
            <div style={cardS}>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>⏳</div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e8e0d5', marginBottom: 4 }}>
                        Waiting for Opponent
                    </h1>
                    <p style={{ color: '#6b6560', fontSize: 13 }}>
                        You are playing as <strong style={{ color: myColor === 'w' ? '#e8e0d5' : '#b0a89e' }}>
                            {myColor === 'w' ? '♔ White' : '♚ Black'}
                        </strong>
                    </p>
                </div>

                <div style={divS} />

                <p style={{ color: '#6b6560', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, textAlign: 'center' }}>
                    Share this code with your opponent
                </p>
                <div className="code-box" onClick={copyCode}>{roomCode}</div>
                <p style={{ color: copied ? '#81b64c' : '#6b6560', fontSize: 13, textAlign: 'center', marginBottom: 20, transition: 'color .3s', fontWeight: 500 }}>
                    {copied ? '✓ Copied!' : 'Click to copy'}
                </p>

                <div style={divS} />

                <p style={{ color: '#6b6560', fontSize: 13, textAlign: 'center', animation: 'pulse 1.8s infinite', fontWeight: 500 }}>
                    ● Waiting for opponent to join…
                </p>
                {gs.timeControl != null && (() => {
                    const tc = TIME_CONTROLS.find(t => t.mins === gs.timeControl)
                    return tc ? (
                        <div style={{ textAlign: 'center', marginTop: 4 }}>
                            <span style={{ background: '#1e2e18', border: '1px solid #81b64c', borderRadius: 20, padding: '4px 14px', color: '#81b64c', fontSize: 12, fontWeight: 600 }}>
                                {tc.icon} {tc.label} · {tc.desc}
                            </span>
                        </div>
                    ) : null
                })()}

                <div style={divS} />
                <button className="btn-ghost" onClick={leaveGame}>← Cancel</button>
            </div>
        </div>
    )

    // ══════════════════════════════════════════════════════════════════════════
    // ── GAME SCREEN ───────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════
    const isMyTurn = gs.turn === myColor
    const flipped = myColor === 'b'
    const ranks = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
    const files = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
    const fnames = 'abcdefgh'
    // On mobile (<= 700px), fill ~96vw across 8 squares. On desktop, cap at 66px or 12vw.
    const SQ = 'min(66px, 12vw, calc((min(100vw, 520px) - 56px) / 8))'

    const stInfo = () => {
        const isTimeout = gs.status === 'checkmate' && gs.timeW != null &&
            (gs.timeW === 0 || gs.timeB === 0)
        if (gs.status === 'checkmate') {
            const winLabel = gs.winner === 'w' ? 'White' : 'Black'
            if (isTimeout) {
                return gs.winner === myColor
                    ? { t: '⏰ Win on time! You win!', c: '#81b64c' }
                    : { t: '⏰ Time\'s up — You lose!', c: '#e05c5c' }
            }
            return { t: `Checkmate — ${winLabel} wins!`, c: '#e05c5c' }
        }
        if (gs.status === 'stalemate') return { t: 'Stalemate — Draw', c: '#9a9a7a' }
        if (gs.status === 'check') return { t: `${gs.turn === 'w' ? 'White' : 'Black'} in check!`, c: '#f0c040' }
        if (isMyTurn) return { t: 'Your turn', c: '#81b64c' }
        return { t: "Opponent's turn…", c: '#6b6560' }
    }
    const { t: stT, c: stC } = stInfo()

    const myRole = myColor === hostColorRef.current ? 'host' : 'guest'
    const theirRole = myRole === 'host' ? 'guest' : 'host'
    const remMsg = gs.rematchReq
        ? (gs.rematchReq === myRole ? 'Waiting for opponent…' : 'Opponent wants a rematch!')
        : null

    const oppColor = myColor === 'w' ? 'b' : 'w'

    // Helper renderers for mobile player bars
    const renderOppBar = () => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: oppColor === 'w' ? '#e8e0d5' : '#1a1715', border: '2px solid #4a4541', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 13 }}>{oppColor === 'w' ? '♔' : '♚'}</span>
            </div>
            <div>
                <div style={{ color: '#b0a89e', fontSize: 12, fontWeight: 600, lineHeight: 1 }}>{oppColor === 'w' ? 'White' : 'Black'} <span style={{ color: '#4a4541', fontWeight: 400 }}>(Opp)</span></div>
                <div style={{ fontSize: 11, color: '#e8e0d5', marginTop: 2 }}>
                    {gs.captured[myColor === 'w' ? 'b' : 'w'].slice(0, 12).map((p, i) => <span key={i}>{GLYPHS[p]}</span>)}
                </div>
            </div>
            {!isMyTurn && gs.status === 'playing' && (
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#81b64c', marginLeft: 'auto', flexShrink: 0 }} />
            )}
        </div>
    )

    const renderMeBar = () => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: myColor === 'w' ? '#e8e0d5' : '#1a1715', border: '2px solid #81b64c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 13 }}>{myColor === 'w' ? '♔' : '♚'}</span>
            </div>
            <div>
                <div style={{ color: '#81b64c', fontSize: 12, fontWeight: 600, lineHeight: 1 }}>{myColor === 'w' ? 'White' : 'Black'} <span style={{ color: '#4a4541', fontWeight: 400 }}>(You)</span></div>
                <div style={{ fontSize: 11, color: '#e8e0d5', marginTop: 2 }}>
                    {gs.captured[myColor].slice(0, 12).map((p, i) => <span key={i}>{GLYPHS[p]}</span>)}
                </div>
            </div>
            {isMyTurn && gs.status === 'playing' && (
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#81b64c', marginLeft: 'auto', flexShrink: 0 }} />
            )}
        </div>
    )

    const renderMobileClock = (who) => {
        const isOpp = who === 'opp'
        const noTC = gs.timeControl == null
        const time = noTC ? null : (isOpp ? (oppColor === 'w' ? dispTimeW : dispTimeB) : (myColor === 'w' ? dispTimeW : dispTimeB))
        const active = !noTC && (isOpp ? (!isMyTurn && gs.status === 'playing') : (isMyTurn && gs.status === 'playing'))
        const low = time != null && time <= 10
        return (
            <div
                style={{
                    marginTop: 8,
                    padding: '6px 10px',
                    borderRadius: 7,
                    background: active ? (low ? '#2a1515' : '#1a2515') : '#0d0b09',
                    border: `1.5px solid ${active ? (low ? '#e05c5c' : '#81b64c') : '#302c29'}`,
                    textAlign: 'center',
                    transition: 'background .3s, border-color .3s',
                    animation: active && low ? 'lowpulse .5s infinite' : 'none',
                }}
            >
                <span style={{
                    color: noTC ? '#3a3631' : (active ? (low ? '#e05c5c' : '#81b64c') : '#b0a89e'),
                    fontSize: 26,
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: 2,
                    lineHeight: 1,
                }}>{fmtTime(time)}</span>
            </div>
        )
    }

    return (
        <div style={{ ...pageS, flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 12 }}>
            <style>{FONT + CSS}</style>

            {/* Drag ghost piece - floats under cursor */}
            {dragGhost && (
                <img
                    src={pieceImg(dragGhost.piece)}
                    alt="dragging"
                    className="drag-ghost"
                    style={{ left: dragGhost.x, top: dragGhost.y, width: `calc(${SQ} * 0.82)`, height: `calc(${SQ} * 0.82)` }}
                    draggable={false}
                />
            )}

            {/* Promotion modal */}
            {promo && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: '#1a1715', border: '1px solid #3a3631', borderRadius: 10, padding: '28px 36px', textAlign: 'center', animation: 'fadein .2s ease' }}>
                        <p style={{ color: '#b0a89e', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 18 }}>
                            Promote Pawn
                        </p>
                        <div style={{ display: 'flex', gap: 10 }}>
                            {['Q', 'R', 'B', 'N'].map(t => (
                                <button key={t} className="pbtn"
                                    onClick={() => handlePromo(t)}>
                                    <img src={pieceImg(myColor + t)} alt={myColor + t} style={{ width: 44, height: 44, objectFit: 'contain' }} />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── END-GAME RESULT OVERLAY ──────────────────────────────────── */}
            {(gs.status === 'checkmate' || gs.status === 'stalemate') && (() => {
                const isTimeout = gs.timeW != null && (gs.timeW === 0 || gs.timeB === 0)
                const isDraw = gs.status === 'stalemate'
                const iWon = !isDraw && gs.winner === myColor

                let emoji, headline, subline, accentColor, glowColor
                if (isDraw) {
                    emoji = '🤝'; headline = 'Draw!'; subline = 'Stalemate'
                    accentColor = '#9a9a7a'; glowColor = 'rgba(154,154,122,.25)'
                } else if (iWon) {
                    emoji = isTimeout ? '⏰' : '🏆'
                    headline = 'You Win!'
                    subline = isTimeout ? 'Win on Time' : 'Checkmate'
                    accentColor = '#81b64c'; glowColor = 'rgba(129,182,76,.22)'
                } else {
                    emoji = isTimeout ? '⏰' : '💀'
                    headline = 'You Lose!'
                    subline = isTimeout ? 'Time ran out' : 'Checkmate'
                    accentColor = '#e05c5c'; glowColor = 'rgba(224,92,92,.22)'
                }

                const myRole = myColor === hostColorRef.current ? 'host' : 'guest'
                const theirRole = myRole === 'host' ? 'guest' : 'host'
                const remMsg = gs.rematchReq
                    ? (gs.rematchReq === myRole ? '⏳ Waiting for opponent…' : '🔔 Opponent wants a rematch!')
                    : null

                return (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 400,
                        background: 'rgba(0,0,0,.72)',
                        backdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 16,
                    }}>
                        <div style={{
                            background: 'linear-gradient(160deg, #1e1b18 60%, #252220)',
                            border: '1px solid #302c29',
                            borderRadius: 16,
                            padding: '40px 36px 32px',
                            maxWidth: 340, width: '100%',
                            textAlign: 'center',
                            boxShadow: '0 20px 60px rgba(0,0,0,.75)',
                            animation: 'resultpop .45s cubic-bezier(.34,1.56,.64,1) both',
                            fontFamily: "'Inter',sans-serif",
                        }}>
                            {/* Big emoji */}
                            <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 16 }}>{emoji}</div>

                            {/* Win/Lose/Draw headline */}
                            <h2 style={{
                                fontSize: 34, fontWeight: 800, color: accentColor,
                                margin: '0 0 6px', letterSpacing: '-0.5px',
                                textShadow: `0 0 24px ${glowColor}`,
                            }}>{headline}</h2>

                            {/* Reason (Checkmate / Stalemate / Time) */}
                            <p style={{ color: '#b0a89e', fontSize: 13, fontWeight: 500, marginBottom: 28 }}>{subline}</p>

                            {/* Divider */}
                            <div style={{ height: 1, background: '#302c29', marginBottom: 22 }} />

                            {/* ── Rematch invitation / request area ── */}
                            {(() => {
                                const isIncoming = gs.rematchReq && gs.rematchReq === theirRole
                                const isOutgoing = gs.rematchReq && gs.rematchReq === myRole

                                if (isIncoming) {
                                    // We received a rematch invitation → show Accept + Reject
                                    return (
                                        <div style={{ marginBottom: 10 }}>
                                            <p style={{
                                                color: '#81b64c', fontSize: 13, fontWeight: 700,
                                                textAlign: 'center', marginBottom: 12,
                                                background: 'rgba(129,182,76,.1)',
                                                border: '1px solid rgba(129,182,76,.3)',
                                                borderRadius: 8, padding: '8px 12px',
                                            }}>🔔 Opponent wants a rematch!</p>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button
                                                    onClick={acceptRematch}
                                                    style={{
                                                        flex: 1, padding: '12px 0',
                                                        background: 'linear-gradient(135deg,#6da03c,#81b64c)',
                                                        border: 'none', borderRadius: 8,
                                                        color: '#fff', fontSize: 14, fontWeight: 700,
                                                        cursor: 'pointer',
                                                        boxShadow: '0 4px 14px rgba(129,182,76,.4)',
                                                        transition: 'transform .12s',
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                                    onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                                                >✓ Accept</button>
                                                <button
                                                    onClick={rejectRematch}
                                                    style={{
                                                        flex: 1, padding: '12px 0',
                                                        background: 'transparent',
                                                        border: '1.5px solid #e05c5c',
                                                        borderRadius: 8, color: '#e05c5c',
                                                        fontSize: 14, fontWeight: 700,
                                                        cursor: 'pointer',
                                                        transition: 'background .15s',
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(224,92,92,.12)' }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                                                >✕ Reject</button>
                                            </div>
                                        </div>
                                    )
                                }

                                if (isOutgoing) {
                                    // We sent the request → waiting
                                    return (
                                        <p style={{
                                            color: '#6b6560', fontSize: 12, fontWeight: 600,
                                            textAlign: 'center', marginBottom: 14,
                                            padding: '8px 10px',
                                        }}>⏳ Waiting for opponent…</p>
                                    )
                                }

                                // No active request → show Rematch button
                                return (
                                    <button
                                        onClick={requestRematch}
                                        style={{
                                            width: '100%', padding: '13px 0',
                                            background: '#81b64c',
                                            border: 'none', borderRadius: 8,
                                            color: '#fff', fontSize: 15, fontWeight: 700,
                                            cursor: 'pointer', marginBottom: 10,
                                            boxShadow: '0 4px 16px rgba(129,182,76,.35)',
                                            transition: 'transform .12s, box-shadow .12s',
                                            letterSpacing: '.3px',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 22px rgba(129,182,76,.45)' }}
                                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(129,182,76,.35)' }}
                                    >↺ Rematch</button>
                                )
                            })()}

                            {/* Leave button */}
                            <button
                                onClick={leaveGame}
                                style={{
                                    width: '100%', padding: '11px 0',
                                    background: 'transparent',
                                    border: '1.5px solid #3a3631',
                                    borderRadius: 8, color: '#6b6560',
                                    fontSize: 13, fontWeight: 500, cursor: 'pointer',
                                    transition: 'border-color .15s, color .15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#6b6560'; e.currentTarget.style.color = '#b0a89e' }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#3a3631'; e.currentTarget.style.color = '#6b6560' }}
                            >
                                ← Leave Game
                            </button>
                        </div>
                    </div>
                )
            })()}

            {/* ── MOBILE: Opponent info bar (top) ─────────────────────────── */}
            <div className="mobile-top-bar" style={{
                borderLeft: !isMyTurn && gs.status === 'playing' ? '3px solid #81b64c' : '3px solid transparent'
            }}>
                {renderOppBar()}
            </div>

            {/* ── MOBILE: Opponent clock (directly above board) ─────────────── */}
            <div className="mobile-clock-bar" style={{
                borderLeft: !isMyTurn && gs.status === 'playing' ? '3px solid #81b64c' : '3px solid transparent'
            }}>
                <div className="mob-clock">
                    {(() => {
                        const oppTime = oppColor === 'w' ? dispTimeW : dispTimeB
                        const oppActive = !isMyTurn && gs.status === 'playing'
                        const oppLow = oppTime != null && oppTime <= 10
                        const noTC = gs.timeControl == null
                        return (
                            <span style={{
                                color: noTC ? '#3a3631' : (oppActive ? (oppLow ? '#e05c5c' : '#81b64c') : '#b0a89e'),
                                fontSize: 28, fontWeight: 800,
                                fontVariantNumeric: 'tabular-nums',
                                letterSpacing: 2, lineHeight: 1,
                                animation: oppActive && oppLow ? 'lowpulse .5s infinite' : 'none',
                            }}>{fmtTime(noTC ? null : oppTime)}</span>
                        )
                    })()}
                </div>
            </div>

            {/* ── MOBILE: Status bar ────────────────────────────────────────── */}
            <div className="mobile-status-bar">
                <span style={{ color: stC, fontSize: 12, fontWeight: 600 }}>{stT}</span>
            </div>

            <div className="game-layout">

                {/* ── LEFT PANEL (desktop only) ─────────────────────────────────── */}
                <div className="game-left-panel">

                    {/* Logo */}
                    <div style={{ padding: '10px 12px', background: '#1a1715', border: '1px solid #302c29', borderRadius: 8, textAlign: 'center' }}>
                        <span style={{ color: '#e8e0d5', fontSize: 15, fontWeight: 700 }}>♟ Chess Online</span>
                    </div>

                    {/* Opponent clock */}
                    {gs.timeControl != null && (() => {
                        const oppTime = oppColor === 'w' ? dispTimeW : dispTimeB
                        const oppActive = !isMyTurn && gs.status === 'playing'
                        const oppLow = oppTime != null && oppTime <= 10
                        return (
                            <div className={`clock${oppActive ? ' active' : ''}${oppActive && oppLow ? ' low' : ''}`}>
                                <span style={{ color: '#6b6560', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 2 }}>Opponent</span>
                                <span style={{ color: oppActive ? (oppLow ? '#e05c5c' : '#81b64c') : '#b0a89e', fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: 1 }}>{fmtTime(oppTime)}</span>
                            </div>
                        )
                    })()}

                    {/* Opponent card */}
                    <div style={{ padding: '10px 12px', background: '#1a1715', border: '1px solid #302c29', borderLeft: !isMyTurn && gs.status === 'playing' ? '3px solid #81b64c' : '3px solid transparent', borderRadius: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: oppColor === 'w' ? '#e8e0d5' : '#1a1715', border: '2px solid #4a4541', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: 12 }}>{oppColor === 'w' ? '♚' : '♟'}</span>
                            </div>
                            <span style={{ color: '#b0a89e', fontSize: 12, fontWeight: 600 }}>
                                {oppColor === 'w' ? 'White' : 'Black'} (Opponent)
                            </span>
                            {!isMyTurn && gs.status === 'playing' && (
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#81b64c', marginLeft: 'auto', flexShrink: 0 }} />
                            )}
                        </div>
                        <div style={{ fontSize: 13, minHeight: 16, color: '#e8e0d5' }}>
                            {gs.captured[myColor === 'w' ? 'b' : 'w'].map((p, i) => <span key={i}>{GLYPHS[p]}</span>)}
                        </div>
                    </div>

                    {/* Status */}
                    <div style={{ padding: '10px 12px', background: gs.status === 'checkmate' ? '#2a1515' : gs.status === 'check' ? '#2a2010' : '#1a1715', border: `1px solid ${gs.status === 'checkmate' ? '#5a2020' : gs.status === 'check' ? '#5a4820' : '#302c29'}`, borderRadius: 8, textAlign: 'center' }}>
                        <p style={{ color: stC, fontSize: 12, fontWeight: 600, margin: 0 }}>{stT}</p>
                    </div>

                    {/* You badge */}
                    <div style={{ padding: '8px 12px', background: '#1a1715', border: '1px solid #302c29', borderRadius: 8, textAlign: 'center' }}>
                        <span style={{ color: '#6b6560', fontSize: 10, fontWeight: 500, display: 'block', marginBottom: 2 }}>You are playing</span>
                        <span style={{ color: '#e8e0d5', fontSize: 14, fontWeight: 700 }}>
                            {myColor === 'w' ? '♔ White' : '♚ Black'}
                        </span>
                    </div>

                    {/* Rematch — left panel (mirrors overlay logic) */}
                    {(gs.status === 'checkmate' || gs.status === 'stalemate') && (() => {
                        const isIncoming = gs.rematchReq && gs.rematchReq === theirRole
                        const isOutgoing = gs.rematchReq && gs.rematchReq === myRole
                        if (isIncoming) return (
                            <div>
                                <p style={{ color: '#81b64c', fontSize: 11, textAlign: 'center', marginBottom: 6, fontWeight: 600 }}>🔔 Rematch invite!</p>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button className="btn-green" style={{ fontSize: 12, padding: '8px 0', marginBottom: 0 }} onClick={acceptRematch}>✓ Accept</button>
                                    <button className="btn-outline" style={{ fontSize: 12, padding: '8px 0', color: '#e05c5c', borderColor: '#e05c5c', marginBottom: 0 }} onClick={rejectRematch}>✕ Reject</button>
                                </div>
                            </div>
                        )
                        if (isOutgoing) return (
                            <p style={{ color: '#6b6560', fontSize: 11, textAlign: 'center', marginBottom: 6, fontWeight: 500 }}>⏳ Waiting for opponent…</p>
                        )
                        return (
                            <button className="btn-green" style={{ fontSize: 13, padding: '10px 0' }} onClick={requestRematch}>↺ Rematch</button>
                        )
                    })()}

                    <div style={{ flex: 1 }} />
                    <button className="btn-ghost" onClick={leaveGame}>← Leave Game</button>

                    {/* Me card */}
                    <div style={{ padding: '10px 12px', background: '#1a1715', border: '1px solid #302c29', borderLeft: isMyTurn && gs.status === 'playing' ? '3px solid #81b64c' : '3px solid transparent', borderRadius: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: myColor === 'w' ? '#e8e0d5' : '#1a1715', border: '2px solid #4a4541', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: 12 }}>{myColor === 'w' ? '♙' : '♟'}</span>
                            </div>
                            <span style={{ color: '#81b64c', fontSize: 12, fontWeight: 600 }}>
                                {myColor === 'w' ? 'White' : 'Black'} (You)
                            </span>
                            {isMyTurn && gs.status === 'playing' && (
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#81b64c', marginLeft: 'auto', flexShrink: 0 }} />
                            )}
                        </div>
                        <div style={{ fontSize: 13, minHeight: 16, color: '#e8e0d5' }}>
                            {gs.captured[myColor].map((p, i) => <span key={i}>{GLYPHS[p]}</span>)}
                        </div>
                    </div>

                    {/* My clock */}
                    {gs.timeControl != null && (() => {
                        const myTime = myColor === 'w' ? dispTimeW : dispTimeB
                        const myActive = isMyTurn && gs.status === 'playing'
                        const myLow = myTime != null && myTime <= 10
                        return (
                            <div className={`clock${myActive ? ' active' : ''}${myActive && myLow ? ' low' : ''}`}>
                                <span style={{ color: '#6b6560', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 2 }}>You</span>
                                <span style={{ color: myActive ? (myLow ? '#e05c5c' : '#81b64c') : '#b0a89e', fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: 1 }}>{fmtTime(myTime)}</span>
                            </div>
                        )
                    })()}
                </div>

                {/* ── BOARD ──────────────────────────────────────────────────────── */}
                <div className="game-board-col">
                    {/* File labels top */}
                    <div style={{ display: 'flex', paddingLeft: 22, width: `calc(8 * ${SQ} + 44px)` }}>
                        {files.map(c => (
                            <div key={c} style={{ flex: 1, textAlign: 'center', color: '#6b6560', fontSize: 10, fontWeight: 500, paddingBottom: 3 }}>
                                {fnames[c]}
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex' }}>
                        {/* Rank labels left */}
                        <div style={{ display: 'flex', flexDirection: 'column', width: 22, height: `calc(8 * ${SQ})`, justifyContent: 'space-around' }}>
                            {ranks.map(r => (
                                <div key={r} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b6560', fontSize: 10, fontWeight: 500 }}>
                                    {8 - r}
                                </div>
                            ))}
                        </div>

                        {/* Board grid */}
                        <div
                            ref={boardRef}
                            style={{ display: 'grid', gridTemplateColumns: `repeat(8, ${SQ})`, gridTemplateRows: `repeat(8, ${SQ})`, borderRadius: 4, boxShadow: '0 8px 40px rgba(0,0,0,.7)', overflow: 'hidden' }}
                        >
                            {ranks.flatMap(row => files.map(col => {
                                const light = (row + col) % 2 === 0
                                const isSel = sel && sel[0] === row && sel[1] === col
                                const isLegal = lm.some(([r, c]) => r === row && c === col)
                                const isLast = gs.lastMove && (
                                    (gs.lastMove.fr === row && gs.lastMove.fc === col) ||
                                    (gs.lastMove.tr === row && gs.lastMove.tc === col)
                                )
                                const isDragTarget = dragOver && dragOver[0] === row && dragOver[1] === col && isLegal
                                const piece = gs.board[row][col]
                                const isCheckKing = gs.status === 'check' && piece && piece === gs.turn + 'K'
                                const isDragging = dragGhost && isSel
                                // chess.com board colors
                                let bg = light ? '#eedad1' : '#b58863'
                                if (isSel) bg = light ? '#f6f669' : '#caca3a'
                                else if (isLast) bg = light ? '#cdd16a' : '#aaa23a'
                                if (isCheckKing) bg = '#e84040'
                                if (isDragTarget) bg = light ? '#b9df6a' : '#8fb93a'
                                return (
                                    <div
                                        key={`${row}-${col}`}
                                        className={`sq${isDragTarget ? ' drag-over' : ''}`}
                                        onClick={() => handleClick(row, col)}
                                        style={{ width: SQ, height: SQ, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', cursor: piece && pc(piece) === myColor && gs.turn === myColor ? 'grab' : 'pointer' }}
                                    >
                                        {isLegal && !piece && (
                                            <div style={{ width: '32%', height: '32%', borderRadius: '50%', background: 'rgba(0,0,0,.18)', pointerEvents: 'none' }} />
                                        )}
                                        {isLegal && piece && isLegal && (
                                            <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 4px rgba(0,0,0,.28)', pointerEvents: 'none', zIndex: 1 }} />
                                        )}
                                        {piece && (
                                            <img
                                                src={pieceImg(piece)}
                                                alt={piece}
                                                onMouseDown={pc(piece) === myColor && gs.turn === myColor ? (e) => handlePieceMouseDown(e, row, col, piece) : undefined}
                                                onTouchStart={pc(piece) === myColor && gs.turn === myColor ? (e) => handlePieceMouseDown(e, row, col, piece) : undefined}
                                                style={{
                                                    width: '82%', height: '82%', objectFit: 'contain', zIndex: 2,
                                                    filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.4))',
                                                    opacity: isDragging ? 0.25 : 1,
                                                    cursor: pc(piece) === myColor && gs.turn === myColor ? 'grab' : 'default',
                                                    userSelect: 'none',
                                                    WebkitUserDrag: 'none',
                                                    transition: 'opacity .1s',
                                                }}
                                                draggable={false}
                                            />
                                        )}
                                    </div>
                                )
                            }))}
                        </div>

                        {/* Rank labels right */}
                        <div style={{ display: 'flex', flexDirection: 'column', width: 22, height: `calc(8 * ${SQ})`, justifyContent: 'space-around' }}>
                            {ranks.map(r => (
                                <div key={r} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b6560', fontSize: 10, fontWeight: 500 }}>
                                    {8 - r}
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* File labels bottom */}
                    <div style={{ display: 'flex', paddingLeft: 22, width: `calc(8 * ${SQ} + 44px)` }}>
                        {files.map(c => (
                            <div key={c} style={{ flex: 1, textAlign: 'center', color: '#6b6560', fontSize: 10, fontWeight: 500, paddingTop: 3 }}>
                                {fnames[c]}
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── MOBILE: My clock (directly below board) ────────────────── */}
                <div className="mobile-clock-bar" style={{
                    borderLeft: isMyTurn && gs.status === 'playing' ? '3px solid #81b64c' : '3px solid transparent'
                }}>
                    <div className="mob-clock">
                        {(() => {
                            const myTime = myColor === 'w' ? dispTimeW : dispTimeB
                            const myActive = isMyTurn && gs.status === 'playing'
                            const myLow = myTime != null && myTime <= 10
                            const noTC = gs.timeControl == null
                            return (
                                <span style={{
                                    color: noTC ? '#3a3631' : (myActive ? (myLow ? '#e05c5c' : '#81b64c') : '#b0a89e'),
                                    fontSize: 28, fontWeight: 800,
                                    fontVariantNumeric: 'tabular-nums',
                                    letterSpacing: 2, lineHeight: 1,
                                    animation: myActive && myLow ? 'lowpulse .5s infinite' : 'none',
                                }}>{fmtTime(noTC ? null : myTime)}</span>
                            )
                        })()}
                    </div>
                </div>

                {/* ── MOBILE: My info bar (bottom) ───────────────────────────────── */}
                <div className="mobile-bottom-bar" style={{
                    borderLeft: isMyTurn && gs.status === 'playing' ? '3px solid #81b64c' : '3px solid transparent'
                }}>
                    {renderMeBar()}
                </div>

                {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
                <div className="game-right-panel">

                    {/* Room code */}
                    <div style={{ padding: '10px 12px', background: '#1a1715', border: '1px solid #302c29', borderRadius: 8, textAlign: 'center' }}>
                        <span style={{ color: '#6b6560', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Room</span>
                        <span style={{ color: '#e8e0d5', fontSize: 16, fontWeight: 700, letterSpacing: 4 }}>{roomCode}</span>
                    </div>

                    {/* Online dot */}
                    <div style={{ padding: '7px 12px', background: '#1a1715', border: '1px solid #302c29', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#81b64c', flexShrink: 0 }} />
                        <span style={{ color: '#81b64c', fontSize: 12, fontWeight: 600 }}>Online</span>
                    </div>

                    {/* Tabbed: Moves / Chat */}
                    <div style={{ background: '#1a1715', border: '1px solid #302c29', borderRadius: 8, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                        {/* Tab bar */}
                        <div style={{ display: 'flex', borderBottom: '1px solid #302c29' }}>
                            <button
                                id="tab-moves"
                                className={`tab-btn${activeTab === 'moves' ? ' active' : ''}`}
                                onClick={() => setActiveTab('moves')}
                            >
                                Moves
                            </button>
                            <button
                                id="tab-chat"
                                className={`tab-btn${activeTab === 'chat' ? ' active' : ''}`}
                                onClick={() => { setActiveTab('chat'); setChatUnread(0) }}
                            >
                                Chat
                                {chatUnread > 0 && <span className="chat-unread">{chatUnread}</span>}
                            </button>
                        </div>

                        {/* Move history tab */}
                        {activeTab === 'moves' && (
                            <div ref={histRef} style={{ overflowY: 'auto', flex: 1, padding: '10px 12px', maxHeight: `calc(8 * ${SQ} - 56px)` }}>
                                {gs.history.length === 0 ? (
                                    <p style={{ color: '#4a4541', fontSize: 12, textAlign: 'center', marginTop: 10 }}>No moves yet</p>
                                ) : (
                                    Array.from({ length: Math.ceil(gs.history.length / 2) }, (_, i) => {
                                        const w = gs.history[i * 2], b = gs.history[i * 2 + 1]
                                        return (
                                            <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                                                <span style={{ color: '#4a4541', fontSize: 11, width: 18, flexShrink: 0, fontWeight: 500 }}>{i + 1}.</span>
                                                <span style={{ color: '#e8e0d5', fontSize: 12, background: '#252220', padding: '2px 5px', borderRadius: 4, flex: 1, textAlign: 'center', fontWeight: 500 }}>{w?.n}</span>
                                                {b && <span style={{ color: '#b0a89e', fontSize: 12, background: '#252220', padding: '2px 5px', borderRadius: 4, flex: 1, textAlign: 'center', fontWeight: 500 }}>{b?.n}</span>}
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        )}

                        {/* Chat tab */}
                        {activeTab === 'chat' && (
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                                {/* Messages list */}
                                <div style={{
                                    flex: 1, overflowY: 'auto', padding: '10px 10px 6px',
                                    display: 'flex', flexDirection: 'column', gap: 6,
                                    maxHeight: `calc(8 * ${SQ} - 100px)`,
                                }}>
                                    {chatMessages.length === 0 ? (
                                        <div style={{ textAlign: 'center', marginTop: 16 }}>
                                            <div style={{ fontSize: 22, marginBottom: 6 }}>💬</div>
                                            <p style={{ color: '#4a4541', fontSize: 11, lineHeight: 1.5 }}>No messages yet.<br />Say something!</p>
                                        </div>
                                    ) : chatMessages.map(msg => (
                                        <div key={msg.id} className="chat-msg" style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: msg.sender === 'me' ? 'flex-end' : 'flex-start',
                                        }}>
                                            <span style={{ color: '#4a4541', fontSize: 9, fontWeight: 600, marginBottom: 2, letterSpacing: .5 }}>
                                                {msg.sender === 'me' ? 'You' : 'Opponent'}
                                            </span>
                                            <div style={{
                                                background: msg.sender === 'me' ? '#1e2e18' : '#252220',
                                                border: msg.sender === 'me' ? '1px solid #81b64c44' : '1px solid #302c29',
                                                borderRadius: msg.sender === 'me' ? '10px 10px 3px 10px' : '10px 10px 10px 3px',
                                                padding: '6px 9px',
                                                maxWidth: '90%',
                                            }}>
                                                <p style={{ color: msg.sender === 'me' ? '#c5df9a' : '#e8e0d5', fontSize: 12, margin: 0, wordBreak: 'break-word', lineHeight: 1.45 }}>
                                                    {msg.text}
                                                </p>
                                            </div>
                                            <span style={{ color: '#3a3631', fontSize: 9, marginTop: 2 }}>
                                                {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    ))}
                                    <div ref={chatBottomRef} />
                                </div>

                                {/* Input area */}
                                <div style={{ padding: '6px 10px 10px', borderTop: '1px solid #302c29' }}>
                                    <textarea
                                        id="chat-input"
                                        className="chat-input"
                                        rows={2}
                                        maxLength={200}
                                        placeholder="Type a message…"
                                        value={chatInput}
                                        onChange={e => setChatInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault()
                                                sendChat()
                                            }
                                        }}
                                    />
                                    <button
                                        id="chat-send"
                                        className="chat-send"
                                        disabled={!chatInput.trim()}
                                        onClick={sendChat}
                                    >
                                        Send ↑
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>

            {/* ── MOBILE: Leave / Rematch strip ─────────────────────────────── */}
            <div className="mobile-top-bar" style={{ justifyContent: 'center', gap: 8 }}>
                {(gs.status === 'checkmate' || gs.status === 'stalemate') && (() => {
                    const isIncoming = gs.rematchReq && gs.rematchReq === theirRole
                    const isOutgoing = gs.rematchReq && gs.rematchReq === myRole
                    if (isIncoming) return (
                        <>
                            <button onClick={acceptRematch} style={{ flex: 1, padding: '10px 0', background: '#81b64c', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>✓ Accept</button>
                            <button onClick={rejectRematch} style={{ flex: 1, padding: '10px 0', background: 'transparent', border: '1.5px solid #e05c5c', borderRadius: 8, color: '#e05c5c', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>✕ Reject</button>
                        </>
                    )
                    if (isOutgoing) return <span style={{ color: '#6b6560', fontSize: 12, fontWeight: 500 }}>⏳ Waiting…</span>
                    return <button onClick={requestRematch} style={{ flex: 1, padding: '10px 0', background: '#81b64c', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>↺ Rematch</button>
                })()}
                <button className="btn-ghost" style={{ flex: gs.status === 'playing' ? '1' : '0 0 auto', padding: '10px 14px', marginBottom: 0 }} onClick={leaveGame}>← Leave</button>
            </div>
        </div>
    )
}
