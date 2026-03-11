import React from 'react';

export default function WaitingScreen({
    pageS, cardS, divS,
    myColor, roomCode,
    copyCode, copied,
    gs, TIME_CONTROLS, leaveGame
}) {
    return (
        <div style={pageS}>
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
    );
}
