import React, { useState } from 'react';
import { GLYPHS, pieceImg, pc, TIME_CONTROLS, fmtTime } from '../logic/gameLogic.js';

export default function GameScreen({
    pageS, gs, myColor, dispTimeW, dispTimeB,
    isMyTurn, flipped, ranks, files, fnames, SQ,
    myRole, theirRole, roomCode,
    dragGhost, dragOver, promo, boardRef,
    chatMessages, chatInput, setChatInput, sendChat,
    activeTab, setActiveTab, chatUnread, setChatUnread,
    histRef, chatBottomRef,
    handleClick, handlePieceMouseDown, handlePromo,
    requestRematch, acceptRematch, rejectRematch, leaveGame,
    offerDraw, acceptDraw, rejectDraw,
    sel, lm
}) {
    const oppColor = myColor === 'w' ? 'b' : 'w'

    const [showResignWarning, setShowResignWarning] = useState(false);

    const handleLeaveClick = () => {
        if (gs.status === 'playing' || gs.status === 'check') {
            setShowResignWarning(true);
        } else {
            leaveGame();
        }
    };

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
        if (gs.status === 'draw_agreement') return { t: 'Draw by Agreement', c: '#9a9a7a' }
        if (gs.status === 'check') return { t: `${gs.turn === 'w' ? 'White' : 'Black'} in check!`, c: '#f0c040' }
        if (isMyTurn) return { t: 'Your turn', c: '#81b64c' }
        return { t: "Opponent's turn…", c: '#6b6560' }
    }
    const { t: stT, c: stC } = stInfo()

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
            {!isMyTurn && (gs.status === 'playing' || gs.status === 'check') && (
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
            {isMyTurn && (gs.status === 'playing' || gs.status === 'check') && (
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#81b64c', marginLeft: 'auto', flexShrink: 0 }} />
            )}
        </div>
    )

    return (
        <div style={{ ...pageS, flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 12 }}>
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

            {/* Resign Warning Modal */}
            {showResignWarning && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: '#1a1715', border: '1px solid #3a3631', borderRadius: 10, padding: '28px 36px', textAlign: 'center', animation: 'fadein .2s ease', maxWidth: 320 }}>
                        <p style={{ color: '#e8e0d5', fontSize: 16, fontWeight: 600, marginBottom: 24, lineHeight: 1.4 }}>
                            Are you sure you want to resign?
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button
                                onClick={() => { setShowResignWarning(false); leaveGame(); }}
                                style={{
                                    flex: 1, padding: '12px 0',
                                    background: '#e05c5c', border: 'none', borderRadius: 8,
                                    color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                    transition: 'transform .1s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                Yes
                            </button>
                            <button
                                onClick={() => setShowResignWarning(false)}
                                style={{
                                    flex: 1, padding: '12px 0',
                                    background: '#3a3631', border: 'none', borderRadius: 8,
                                    color: '#e8e0d5', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                    transition: 'background .15s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#4a4541'}
                                onMouseLeave={e => e.currentTarget.style.background = '#3a3631'}
                            >
                                No
                            </button>
                        </div>
                    </div>
                </div>
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
            {(gs.status === 'checkmate' || gs.status === 'stalemate' || gs.status === 'draw_agreement') && (() => {
                const isTimeout = gs.timeW != null && (gs.timeW === 0 || gs.timeB === 0)
                const isDraw = gs.status === 'stalemate' || gs.status === 'draw_agreement'
                const iWon = !isDraw && gs.winner === myColor

                let emoji, headline, subline, accentColor, glowColor
                if (isDraw) {
                    emoji = '🤝'; headline = 'Draw!'; subline = gs.status === 'draw_agreement' ? 'By Agreement' : 'By Stalemate'
                    accentColor = '#9a9a7a'; glowColor = 'rgba(154,154,122,.25)'
                } else if (iWon) {
                    emoji = isTimeout ? '⏰' : '🏆'
                    headline = 'You Win!'
                    subline = isTimeout ? 'Win on Time' : 'By Checkmate'
                    accentColor = '#81b64c'; glowColor = 'rgba(129,182,76,.22)'
                } else {
                    emoji = isTimeout ? '⏰' : '💀'
                    headline = 'You Lose!'
                    subline = isTimeout ? 'Time ran out' : 'By Checkmate'
                    accentColor = '#e05c5c'; glowColor = 'rgba(224,92,92,.22)'
                }

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
                                    return (
                                        <p style={{
                                            color: '#6b6560', fontSize: 12, fontWeight: 600,
                                            textAlign: 'center', marginBottom: 14,
                                            padding: '8px 10px',
                                        }}>⏳ Waiting for opponent…</p>
                                    )
                                }

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
                borderLeft: !isMyTurn && (gs.status === 'playing' || gs.status === 'check') ? '3px solid #81b64c' : '3px solid transparent'
            }}>
                {renderOppBar()}
            </div>

            {/* ── MOBILE: Opponent clock (directly above board) ─────────────── */}
            <div className="mobile-clock-bar" style={{
                borderLeft: !isMyTurn && (gs.status === 'playing' || gs.status === 'check') ? '3px solid #81b64c' : '3px solid transparent'
            }}>
                <div className="mob-clock">
                    {(() => {
                        const oppTime = oppColor === 'w' ? dispTimeW : dispTimeB
                        const oppActive = !isMyTurn && (gs.status === 'playing' || gs.status === 'check')
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
                        const oppActive = !isMyTurn && (gs.status === 'playing' || gs.status === 'check')
                        const oppLow = oppTime != null && oppTime <= 10
                        return (
                            <div className={`clock${oppActive ? ' active' : ''}${oppActive && oppLow ? ' low' : ''}`}>
                                <span style={{ color: '#6b6560', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 2 }}>Opponent</span>
                                <span style={{ color: oppActive ? (oppLow ? '#e05c5c' : '#81b64c') : '#b0a89e', fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: 1 }}>{fmtTime(oppTime)}</span>
                            </div>
                        )
                    })()}

                    {/* Opponent card */}
                    <div style={{ padding: '10px 12px', background: '#1a1715', border: '1px solid #302c29', borderLeft: !isMyTurn && (gs.status === 'playing' || gs.status === 'check') ? '3px solid #81b64c' : '3px solid transparent', borderRadius: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: oppColor === 'w' ? '#e8e0d5' : '#1a1715', border: '2px solid #4a4541', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: 12 }}>{oppColor === 'w' ? '♚' : '♟'}</span>
                            </div>
                            <span style={{ color: '#b0a89e', fontSize: 12, fontWeight: 600 }}>
                                {oppColor === 'w' ? 'White' : 'Black'} (Opponent)
                            </span>
                            {!isMyTurn && (gs.status === 'playing' || gs.status === 'check') && (
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
                    {(gs.status === 'checkmate' || gs.status === 'stalemate' || gs.status === 'draw_agreement') && (() => {
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
                    {(gs.status === 'playing' || gs.status === 'check') && !gs.drawOffer && (
                        <button className="btn-ghost" style={{ marginBottom: 8 }} onClick={offerDraw}>
                            ½ Offer Draw
                        </button>
                    )}
                    <button className="btn-ghost" onClick={handleLeaveClick}>{(gs.status === 'playing' || gs.status === 'check') ? '⚑ Resign' : '← Leave Game'}</button>

                    {/* Me card */}
                    <div style={{ padding: '10px 12px', background: '#1a1715', border: '1px solid #302c29', borderLeft: isMyTurn && (gs.status === 'playing' || gs.status === 'check') ? '3px solid #81b64c' : '3px solid transparent', borderRadius: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: myColor === 'w' ? '#e8e0d5' : '#1a1715', border: '2px solid #4a4541', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: 12 }}>{myColor === 'w' ? '♙' : '♟'}</span>
                            </div>
                            <span style={{ color: '#81b64c', fontSize: 12, fontWeight: 600 }}>
                                {myColor === 'w' ? 'White' : 'Black'} (You)
                            </span>
                            {isMyTurn && (gs.status === 'playing' || gs.status === 'check') && (
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
                        const myActive = isMyTurn && (gs.status === 'playing' || gs.status === 'check')
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
                    <div style={{ display: 'flex' }}>

                        {/* Rank labels left */}
                        <div style={{ display: 'flex', flexDirection: 'column', width: 16, height: `calc(8 * ${SQ})`, justifyContent: 'space-around' }}>
                            {ranks.map(r => (
                                <div key={r} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', color: '#6b6560', fontSize: 10, fontWeight: 500 }}>
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
                                let bg = light ? '#F4E4B5' : '#27694D'
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

                    </div>
                    {/* File labels bottom */}
                    <div style={{ display: 'flex', paddingLeft: 16, width: `calc(8 * ${SQ} + 16px)` }}>
                        {files.map(c => (
                            <div key={c} style={{ flex: 1, textAlign: 'center', color: '#6b6560', fontSize: 10, fontWeight: 500, paddingTop: 3 }}>
                                {fnames[c]}
                            </div>
                        ))}
                    </div>

                    {/* ── Draw Offer UI (Below Board) ── */}
                    {(gs.status === 'playing' || gs.status === 'check') && gs.drawOffer === theirRole && (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 12,
                            background: '#1a1715', border: '1px solid #302c29', borderRadius: 8, padding: '8px 16px',
                            color: '#e8e0d5', fontSize: 13, fontWeight: 600, animation: 'fadein .2s ease'
                        }}>
                            <span>Draw?</span>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={acceptDraw} style={{ background: '#81b64c', border: 'none', borderRadius: 4, width: 28, height: 28, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✓</button>
                                <button onClick={rejectDraw} style={{ background: 'transparent', border: '1px solid #e05c5c', borderRadius: 4, width: 28, height: 28, color: '#e05c5c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✕</button>
                            </div>
                        </div>
                    )}
                    {(gs.status === 'playing' || gs.status === 'check') && gs.drawOffer === myRole && (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 12,
                            color: '#6b6560', fontSize: 12, fontWeight: 600, padding: '8px'
                        }}>
                            Draw offer sent…
                        </div>
                    )}
                </div>

                {/* ── MOBILE: My clock (directly below board) ────────────────── */}
                <div className="mobile-clock-bar" style={{
                    borderLeft: isMyTurn && (gs.status === 'playing' || gs.status === 'check') ? '3px solid #81b64c' : '3px solid transparent'
                }}>
                    <div className="mob-clock">
                        {(() => {
                            const myTime = myColor === 'w' ? dispTimeW : dispTimeB
                            const myActive = isMyTurn && (gs.status === 'playing' || gs.status === 'check')
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
                    borderLeft: isMyTurn && (gs.status === 'playing' || gs.status === 'check') ? '3px solid #81b64c' : '3px solid transparent'
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
                {(gs.status === 'checkmate' || gs.status === 'stalemate' || gs.status === 'draw_agreement') && (() => {
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
                {(gs.status === 'playing' || gs.status === 'check') && !gs.drawOffer && (
                    <button className="btn-ghost" style={{ flex: 1, padding: '10px 14px', marginBottom: 0 }} onClick={offerDraw}>½ Draw</button>
                )}
                <button className="btn-ghost" style={{ flex: (gs.status === 'playing' || gs.status === 'check') ? '1' : '0 0 auto', padding: '10px 14px', marginBottom: 0 }} onClick={handleLeaveClick}>{(gs.status === 'playing' || gs.status === 'check') ? '⚑ Resign' : '← Leave'}</button>
            </div>
        </div >
    );
}
