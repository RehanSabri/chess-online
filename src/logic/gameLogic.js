// ─── CHESS ENGINE ──────────────────────────────────────────────────────────────

export const INIT_BOARD = [
    ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR'],
    ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP'],
    ['wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR'],
]

export const GLYPHS = {
    wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
    bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
}

// Map piece code → PNG path (wK → /pieces/wk.png)
export const pieceImg = (piece) => `/pieces/${piece.toLowerCase()}.png`

export const cloneB = b => b.map(r => [...r])
export const pc = p => p ? p[0] : null
export const pt = p => p ? p[1] : null

export function findKing(board, color) {
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (board[r][c] === color + 'K') return [r, c]
    return null
}

export function attacked(board, row, col, by) {
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

export function inCheck(board, color) {
    const k = findKing(board, color)
    return k ? attacked(board, k[0], k[1], color === 'w' ? 'b' : 'w') : false
}

export function pseudoMoves(board, r, c, cr, ep) {
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

// Like pseudoMoves but allows targeting own non-king pieces (for premoves).
// Premoves fire only when legal at execution time, so we let the player
// pre-aim at their own piece square (e.g., Queen → Knight square) anticipating
// the opponent will capture that piece first.
export function premovePseudoMoves(board, r, c, cr, ep) {
    const piece = board[r][c]; if (!piece) return []
    const color = pc(piece), type = pt(piece)
    const moves = []
    // canLand: any square that isn't our own King
    const canLand = (nr, nc) => {
        const t = board[nr][nc]
        return !t || pc(t) !== color || pt(t) !== 'K'
    }
    const slide = dirs => {
        for (const [dr, dc] of dirs) {
            let nr = r + dr, nc = c + dc
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const t = board[nr][nc]
                if (!t) { moves.push([nr, nc]) }
                else {
                    // own King — stop, don't add
                    if (pc(t) === color && pt(t) === 'K') break
                    // own non-king — add then stop (might be taken)
                    moves.push([nr, nc]); break
                }
                nr += dr; nc += dc
            }
        }
    }
    const step = dirs => {
        for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && canLand(nr, nc))
                moves.push([nr, nc])
        }
    }
    switch (type) {
        case 'P': {
            const d = color === 'w' ? -1 : 1, sr = color === 'w' ? 6 : 1
            // Forward moves (only if empty — same as normal)
            if (r + d >= 0 && r + d < 8 && !board[r + d][c]) {
                moves.push([r + d, c])
                if (r === sr && !board[r + 2 * d][c]) moves.push([r + 2 * d, c])
            }
            // Diagonal: allow targeting own non-king pieces too (may be captured)
            for (const dc of [-1, 1]) {
                const nr = r + d, nc = c + dc
                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                    const t = board[nr][nc]
                    // Allow if: opponent piece, own non-king piece, or en-passant square
                    if (t && pc(t) === color && pt(t) === 'K') continue  // skip own king
                    if (t || (ep && nr === ep[0] && nc === ep[1])) moves.push([nr, nc])
                }
            }
            break
        }
        case 'N': step([[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]); break
        case 'B': slide([[-1, -1], [-1, 1], [1, -1], [1, 1]]); break
        case 'R': slide([[-1, 0], [1, 0], [0, -1], [0, 1]]); break
        case 'Q': slide([[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]); break
        case 'K': step([[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]); break
    }
    return moves
}

export function legalMoves(board, r, c, cr, ep) {
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

export function hasLegal(board, color, cr, ep) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
        if (pc(board[r][c]) === color && legalMoves(board, r, c, cr, ep).length > 0) return true
    return false
}

export function applyMove(board, fr, fc, tr, tc, promo, cr, ep) {
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

export function toAlg(board, fr, fc, tr, tc, promo) {
    const files = 'abcdefgh', piece = board[fr][fc], type = pt(piece)
    const to = files[tc] + (8 - tr)
    if (type === 'P') { const base = board[tr][tc] ? files[fc] + 'x' + to : to; return base + (promo ? '=' + promo : '') }
    return type + (board[tr][tc] ? 'x' : '') + to
}

export const genCode = () => Math.random().toString(36).substring(2, 8).toUpperCase()

// ─── TIME CONTROLS ────────────────────────────────────────────────────────────
export const TIME_CONTROLS = [
    { id: 'bullet', label: 'Bullet', mins: 1, icon: '⚡', desc: '1 min' },
    { id: 'blitz', label: 'Blitz', mins: 3, icon: '🔥', desc: '3 min' },
    { id: 'rapid', label: 'Rapid', mins: 10, icon: '⏱', desc: '10 min' },
]
export const fmtTime = secs => {
    if (secs == null) return '--:--'
    const s = Math.max(0, Math.round(secs))
    const m = Math.floor(s / 60)
    const ss = s % 60
    return `${m}:${ss.toString().padStart(2, '0')}`
}

// ─── FIREBASE SERIALIZATION ────────────────────────────────────────────────────
// KEY DESIGN: Store EVERYTHING as flat strings/numbers — never store JS arrays
// in Firebase directly, because Firebase converts arrays to numbered objects.

export const encodeBoard = board =>
    board.map(row => row.map(c => c || '.').join(',')).join('|')

export const decodeBoard = s =>
    s.split('|').map(row => row.split(',').map(c => c === '.' ? null : c))

export const encodeCR = cr =>
    (cr.wK ? 'K' : '') + (cr.wQ ? 'Q' : '') + (cr.bK ? 'k' : '') + (cr.bQ ? 'q' : '')

export const decodeCR = s => ({
    wK: s.includes('K'), wQ: s.includes('Q'),
    bK: s.includes('k'), bQ: s.includes('q'),
})

export const encodeEP = ep => ep ? ep.join(',') : ''
export const decodeEP = s => s ? s.split(',').map(Number) : null

export const encodeHistory = h => h.map(x => x.n + ':' + x.color).join('|')
export const decodeHistory = s => !s ? [] : s.split('|').filter(Boolean).map(h => {
    const i = h.lastIndexOf(':'); return { n: h.slice(0, i), color: h.slice(i + 1) }
})

export const encodeCaptured = a => a.join(',')
export const decodeCaptured = s => s ? s.split(',').filter(Boolean) : []

export const encodeLastMove = lm => lm ? [lm.fr, lm.fc, lm.tr, lm.tc].join(',') : ''
export const decodeLastMove = s => {
    if (!s) return null
    const [fr, fc, tr, tc] = s.split(',').map(Number)
    return { fr, fc, tr, tc }
}

// Encode full game state to a Firebase-safe flat object
export function encodeGs(state, meta = {}) {
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
        drawOffer: state.drawOffer || null,
        ...meta,
    }
}

// Decode Firebase flat object back into JS game state
export function decodeGs(d) {
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
        drawOffer: d.drawOffer || null,
    }
}

export const FRESH_STATE = (tcMins = null) => ({
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
    drawOffer: null,
})
