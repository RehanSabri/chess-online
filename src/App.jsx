import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from './firebase.js'
import { ref, set, onValue, off, get, push, update } from 'firebase/database'

import {
    GLYPHS, pieceImg, pc, pt,
    inCheck, legalMoves, pseudoMoves, premovePseudoMoves, hasLegal, applyMove, toAlg, genCode,
    TIME_CONTROLS, fmtTime,
    encodeGs, decodeGs, FRESH_STATE
} from './logic/gameLogic.js'

import LobbyScreen from './components/LobbyScreen.jsx';
import WaitingScreen from './components/WaitingScreen.jsx';
import GameScreen from './components/GameScreen.jsx';
import AnalysisScreen from './components/AnalysisScreen.jsx';

// ─── STYLES ───────────────────────────────────────────────────────────────────

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
    // Screens: 'lobby' | 'color-pick' | 'waiting' | 'game' | 'analysis'
    const [screen, setScreen] = useState('lobby')
    const [analysisHistory, setAnalysisHistory] = useState(null)
    const [analysisMyColor, setAnalysisMyColor] = useState(null)
    const [analysisResult, setAnalysisResult] = useState(null)

    // ── Premove state ─────────────────────────────────────────────────────────
    const [premoveEnabled, setPremoveEnabled] = useState(true)
    const [premoveMode, setPremoveMode] = useState('single')   // 'single' | 'multiple'
    const [premoveQueue, setPremoveQueue] = useState([])       // [{fr,fc,tr,tc,promo}]
    const premoveQueueRef = useRef([])
    const premoveModeRef = useRef('single')
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
    const premoveFiredSeqRef = useRef(-1)

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

    // Keep premoveQueueRef and premoveModeRef always fresh — sync immediately on every render too
    premoveQueueRef.current = premoveQueue
    premoveModeRef.current = premoveMode



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
        if (g.timeW == null || (g.status !== 'playing' && g.status !== 'check')) {
            setDispTimeW(g.timeW)
            setDispTimeB(g.timeB)
            return
        }
        // Compute elapsed since last move
        const tick = () => {
            const cur = gsRef.current
            if (!cur || (cur.status !== 'playing' && cur.status !== 'check') || cur.timeW == null) return
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

    // ── Premove execution effect ───────────────────────────────────────────────
    // Fires whenever gs.seq changes (any move lands). Executes queued premoves
    // if it's our turn. Using a useEffect (instead of inline in the Firebase
    // callback) means premoves fire correctly even if they were queued after
    // the Firebase callback already ran.
    useEffect(() => {
        // Guard: only fire once per seq, and only when it's our turn
        if (premoveFiredSeqRef.current === gs.seq) return
        if (premoveQueueRef.current.length === 0) return
        if (gs.turn !== myColorRef.current) return
        if (gs.status !== 'playing' && gs.status !== 'check') return

        premoveFiredSeqRef.current = gs.seq  // mark this seq as handled

        let currentGs = gs
        let remainingQueue = [...premoveQueueRef.current]
        let executedCount = 0

        while (remainingQueue.length > 0) {
            const next = remainingQueue[0]
            if (currentGs.turn !== myColorRef.current) break
            if (currentGs.status !== 'playing' && currentGs.status !== 'check') break

            const legal = legalMoves(currentGs.board, next.fr, next.fc, currentGs.cr, currentGs.ep)
            const isLegal = legal.some(([r, c]) => r === next.tr && c === next.tc)
            if (!isLegal) { remainingQueue = []; break }

            const { nb, newCR, newEP, cap } = applyMove(
                currentGs.board, next.fr, next.fc, next.tr, next.tc, next.promo, currentGs.cr, currentGs.ep
            )
            const note = toAlg(currentGs.board, next.fr, next.fc, next.tr, next.tc, next.promo)
            const nextTurn = currentGs.turn === 'w' ? 'b' : 'w'
            const newCap = { w: [...currentGs.captured.w], b: [...currentGs.captured.b] }
            if (cap) newCap[currentGs.turn].push(cap)
            const isChk = inCheck(nb, nextTurn)
            const hasL = hasLegal(nb, nextTurn, newCR, newEP)
            let ns = 'playing'
            if (!hasL) ns = isChk ? 'checkmate' : 'stalemate'
            else if (isChk) ns = 'check'
            const finalNote = note + (ns === 'checkmate' ? '#' : ns === 'check' ? '+' : '')
            const newSeq2 = (currentGs.seq || 0) + 1
            const now = getNow()
            let newTimeW = currentGs.timeW, newTimeB = currentGs.timeB
            if (currentGs.timeW != null && currentGs.lastMoveTs) {
                const elapsed = (now - currentGs.lastMoveTs) / 1000
                if (currentGs.turn === 'w') newTimeW = Math.max(0, currentGs.timeW - elapsed)
                else newTimeB = Math.max(0, currentGs.timeB - elapsed)
            }
            currentGs = {
                board: nb, turn: nextTurn, cr: newCR, ep: newEP, status: ns,
                history: [...currentGs.history, { n: finalNote, color: currentGs.turn }],
                captured: newCap,
                lastMove: { fr: next.fr, fc: next.fc, tr: next.tr, tc: next.tc },
                winner: ns === 'checkmate' ? currentGs.turn : null,
                seq: newSeq2, rematchReq: null, drawOffer: null,
                timeW: newTimeW, timeB: newTimeB,
                lastMoveTs: ns === 'playing' || ns === 'check' ? now : null,
                timeControl: currentGs.timeControl,
            }
            seqRef.current = newSeq2
            remainingQueue = premoveModeRef.current === 'multiple' ? remainingQueue.slice(1) : []
            executedCount++
            if (premoveModeRef.current === 'single') break
        }

        if (executedCount > 0) {
            premoveQueueRef.current = remainingQueue
            setPremoveQueue(remainingQueue)
            setGs(currentGs); setSel(null); setLm([]); setPromo(null)
            update(ref(db, 'rooms/' + roomRef.current), encodeGs(currentGs, {
                hostColor: hostColorRef.current, guestJoined: true,
            }))
        } else {
            premoveQueueRef.current = []
            setPremoveQueue([])
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gs.seq, premoveQueue.length])

    // ── Timeout handler ───────────────────────────────────────────────────
    const handleTimeout = useCallback((losingColor) => {
        const cur = gsRef.current
        if (!cur || (cur.status !== 'playing' && cur.status !== 'check')) return
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
                const newGs = decodeGs(d)

                // No premove block here — handled by the premove useEffect below
                setGs(newGs)
                setSel(null); setLm([]); setPromo(null)
            } else {
                // Even without a seq change, sync rematchReq and drawOffer
                const incoming = d.rematchReq || null
                const incomingDraw = d.drawOffer || null
                setGs(prev => {
                    if (prev.rematchReq === incoming && prev.drawOffer === incomingDraw) return prev
                    return { ...prev, rematchReq: incoming, drawOffer: incomingDraw }
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
            drawOffer: null,
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
            gs.status === 'checkmate' || gs.status === 'stalemate' || gs.status === 'draw_agreement' || gs.status === 'resigned' ||
            promo
        ) return
        if (dragStateRef.current?._wasDrag) { dragStateRef.current._wasDrag = false; return }

        const isMyTurn = gs.turn === myColorRef.current
        const piece = gs.board[row][col]

        // ── Build virtual board applying all queued premoves ──────────────────
        const buildVirtualBoard = (queue) => {
            let vb = gs.board.map(r => [...r])
            for (const pm of queue) {
                const p = vb[pm.fr][pm.fc]
                if (p) { vb[pm.tr][pm.tc] = p; vb[pm.fr][pm.fc] = null }
            }
            return vb
        }

        // ── Premove queuing (opponent's turn) ─────────────────────────────────
        if (!isMyTurn) {
            if (!premoveEnabled) return
            const queue = premoveQueueRef.current
            const vBoard = buildVirtualBoard(queue)
            const vPiece = vBoard[row][col]

            if (sel) {
                const [sr, sc] = sel
                const selPiece = vBoard[sr][sc]
                if (!selPiece || pc(selPiece) !== myColorRef.current) { setSel(null); setLm([]); return }
                const pMoves = premovePseudoMoves(vBoard, sr, sc, gs.cr, gs.ep)
                const isValid = pMoves.some(([r, c]) => r === row && c === col)
                if (isValid) {
                    const newPremove = { fr: sr, fc: sc, tr: row, tc: col, promo: null }
                    const newQueue = premoveModeRef.current === 'single'
                        ? [newPremove]
                        : [...premoveQueueRef.current, newPremove]
                    premoveQueueRef.current = newQueue  // sync immediately — Firebase may fire before next render
                    setPremoveQueue(newQueue)
                    setSel(null); setLm([])
                } else if (vPiece && pc(vPiece) === myColorRef.current) {
                    setSel([row, col])
                    setLm(premovePseudoMoves(vBoard, row, col, gs.cr, gs.ep))
                } else { setSel(null); setLm([]) }
            } else {
                if (vPiece && pc(vPiece) === myColorRef.current) {
                    setSel([row, col])
                    setLm(premovePseudoMoves(vBoard, row, col, gs.cr, gs.ep))
                }
            }
            return
        }

        // ── Normal move (my turn) ─────────────────────────────────────────────
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
    }, [gs, sel, lm, execMove, promo, premoveEnabled, premoveMode])

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
        if (gs.status === 'checkmate' || gs.status === 'stalemate' || gs.status === 'draw_agreement' || gs.status === 'resigned') return
        if (promo) return
        if (pc(piece) !== myColorRef.current) return

        const isMyTurn = gs.turn === myColorRef.current
        // Allow drag during opponent's turn only if premove is enabled
        if (!isMyTurn && !premoveEnabled) return

        e.preventDefault()
        e.stopPropagation()

        // Use virtual board (after queued premoves) for calculating pseudo moves
        const vBoard = (() => {
            let vb = gs.board.map(r => [...r])
            for (const pm of premoveQueueRef.current) {
                const p = vb[pm.fr][pm.fc]
                if (p) { vb[pm.tr][pm.tc] = p; vb[pm.fr][pm.fc] = null }
            }
            return vb
        })()

        const moves = isMyTurn
            ? legalMoves(gs.board, row, col, gs.cr, gs.ep)
            : premovePseudoMoves(vBoard, row, col, gs.cr, gs.ep)

        dragStateRef.current = { fr: row, fc: col, piece, legalSquares: moves, _wasDrag: false, _moved: false, isMyTurn }

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
            if (!ds || !ds._moved) return

            dragStateRef.current._wasDrag = true
            const { x, y } = getXY(me)
            const sq = pixelToSquare(x, y)
            if (!sq) return
            const [tr, tc] = sq
            const { fr, fc, legalSquares } = ds
            const isValid = legalSquares.some(([r, c]) => r === tr && c === tc)

            if (!ds.isMyTurn) {
                // Queue premove
                if (isValid) {
                    const newPremove = { fr, fc, tr, tc, promo: null }
                    const newQueue = premoveModeRef.current === 'single'
                        ? [newPremove]
                        : [...premoveQueueRef.current, newPremove]
                    premoveQueueRef.current = newQueue  // sync immediately — Firebase may fire before next render
                    setPremoveQueue(newQueue)
                }
                setSel(null); setLm([])
            } else {
                // Execute normal move
                if (isValid) {
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
        }

        dragStateRef.current._gsSnapshot = gs
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        document.addEventListener('touchmove', onMove, { passive: false })
        document.addEventListener('touchend', onUp)
    }, [gs, promo, execMove, pixelToSquare, premoveEnabled, premoveMode])

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

    // ── Draw Offer ────────────────────────────────────────────────────────────
    const offerDraw = async () => {
        const myRole = myColorRef.current === hostColorRef.current ? 'host' : 'guest'
        await set(ref(db, 'rooms/' + roomRef.current + '/drawOffer'), myRole)
        setGs(prev => ({ ...prev, drawOffer: myRole }))
    }

    const acceptDraw = async () => {
        const cur = gsRef.current
        const newSeq = (cur.seq || 0) + 1
        seqRef.current = newSeq
        const newState = {
            ...cur,
            status: 'draw_agreement',
            winner: null,
            seq: newSeq,
            drawOffer: null,
            lastMoveTs: null,
        }
        setGs(newState); setSel(null); setLm([]); setPromo(null)
        await update(ref(db, 'rooms/' + roomRef.current), encodeGs(newState, {
            hostColor: hostColorRef.current,
            guestJoined: true,
        }))
    }

    const rejectDraw = async () => {
        await set(ref(db, 'rooms/' + roomRef.current + '/drawOffer'), null)
        setGs(prev => ({ ...prev, drawOffer: null }))
    }

    // ── Resign game ───────────────────────────────────────────────────────────
    const resignGame = () => {
        const cur = gsRef.current
        if (cur && (cur.status === 'playing' || cur.status === 'check')) {
            const losingColor = myColorRef.current
            const winner = losingColor === 'w' ? 'b' : 'w'
            const newSeq = (cur.seq || 0) + 1
            seqRef.current = newSeq
            const newState = {
                ...cur,
                status: 'resigned',
                winner,
                seq: newSeq,
                lastMoveTs: null,
            }
            update(ref(db, 'rooms/' + roomRef.current), encodeGs(newState, {
                hostColor: hostColorRef.current,
                guestJoined: true,
            })).catch(() => {})
        }
        leaveGame()
    }

    // ── Open Analysis ─────────────────────────────────────────────────────────
    const openAnalysis = useCallback(() => {
    const cur = gsRef.current
    let result = 'Unknown'
    if (cur.winner === 'w')      result = 'White wins'
    else if (cur.winner === 'b') result = 'Black wins'
    else if (cur.status === 'stalemate' || cur.status === 'draw_agreement') result = 'Draw'
    setAnalysisHistory([...cur.history])
    setAnalysisMyColor(myColorRef.current)
    setAnalysisResult(result)
    setScreen('analysis')
    }, [])

    // ── Cancel premoves ───────────────────────────────────────────────────────
    const cancelPremoves = useCallback(() => {
        premoveQueueRef.current = []  // sync immediately
        setPremoveQueue([])
        setSel(null); setLm([])
    }, [])

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
        setPremoveQueue([])
    }

    const copyCode = () => {
        navigator.clipboard.writeText(roomCode).catch(() => { })
        setCopied(true); setTimeout(() => setCopied(false), 2000)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── ANALYSIS SCREEN ───────────────────────────────────────────────────────
    if (screen === 'analysis') return (
    <AnalysisScreen
        history={analysisHistory || []}
        myColor={analysisMyColor}
        result={analysisResult}
        onBack={() => setScreen('game')}
    />
    )

    // ── LOBBY SCREEN ─────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════
    if (screen === 'lobby') return (
        <LobbyScreen
            pageS={pageS} cardS={cardS} divS={divS}
            TIME_CONTROLS={TIME_CONTROLS}
            pickedTime={pickedTime} setPickedTime={setPickedTime}
            pickedColor={pickedColor} setPickedColor={setPickedColor}
            createGame={createGame}
            joinInput={joinInput} setJoinInput={setJoinInput}
            joinError={joinError} setJoinError={setJoinError} joinGame={joinGame}
        />
    )

    // ══════════════════════════════════════════════════════════════════════════
    // ── WAITING SCREEN ────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════
    if (screen === 'waiting') return (
        <WaitingScreen
            pageS={pageS} cardS={cardS} divS={divS}
            myColor={myColor} roomCode={roomCode}
            copyCode={copyCode} copied={copied}
            gs={gs} TIME_CONTROLS={TIME_CONTROLS} leaveGame={leaveGame}
        />
    )

    // ══════════════════════════════════════════════════════════════════════════
    // ── GAME SCREEN ───────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════
    const isMyTurn = gs.turn === myColor
    const flipped = myColor === 'b'
    const ranks = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
    const files = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
    const fnames = 'abcdefgh'
    const SQ = 'min(76px, 15vw, calc((min(100vw, 560px) - 30px) / 8))'

    const myRole = myColor === hostColorRef.current ? 'host' : 'guest'
    const theirRole = myRole === 'host' ? 'guest' : 'host'

    return (
        <GameScreen
            pageS={pageS} gs={gs} myColor={myColor}
            dispTimeW={dispTimeW} dispTimeB={dispTimeB}
            isMyTurn={isMyTurn} flipped={flipped} ranks={ranks} files={files} fnames={fnames} SQ={SQ}
            myRole={myRole} theirRole={theirRole} roomCode={roomCode}
            dragGhost={dragGhost} dragOver={dragOver} promo={promo} boardRef={boardRef}
            chatMessages={chatMessages} chatInput={chatInput} setChatInput={setChatInput}
            sendChat={sendChat} activeTab={activeTab} setActiveTab={setActiveTab}
            chatUnread={chatUnread} setChatUnread={setChatUnread}
            histRef={histRef} chatBottomRef={chatBottomRef}
            handleClick={handleClick} handlePieceMouseDown={handlePieceMouseDown} handlePromo={handlePromo}
            requestRematch={requestRematch} acceptRematch={acceptRematch} rejectRematch={rejectRematch}
            offerDraw={offerDraw} acceptDraw={acceptDraw} rejectDraw={rejectDraw}
            leaveGame={leaveGame} resignGame={resignGame}
            openAnalysis={openAnalysis}
            premoveEnabled={premoveEnabled} setPremoveEnabled={setPremoveEnabled}
            premoveMode={premoveMode} setPremoveMode={setPremoveMode}
            premoveQueue={premoveQueue} cancelPremoves={cancelPremoves}
            sel={sel} lm={lm}
        />
    )
}