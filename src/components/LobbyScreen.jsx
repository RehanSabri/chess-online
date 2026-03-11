import React from 'react';

export default function LobbyScreen({
    pageS, cardS, divS,
    TIME_CONTROLS, pickedTime, setPickedTime,
    pickedColor, setPickedColor,
    createGame, joinInput, setJoinInput,
    joinError, setJoinError, joinGame
}) {
    return (
        <div style={pageS}>
            <div style={cardS}>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <img src="/logo/Chess logo.png" alt="Chess Logo" style={{ width: 80, height: 80, objectFit: 'contain', marginBottom: 8 }} />
                    <h1 style={{ fontSize: 26, fontWeight: 700, color: '#e8e0d5', marginBottom: 4 }}>Chess Online</h1>
                    <p style={{ color: '#6b6560', fontSize: 13 }}>Real-time multiplayer with friends</p>
                </div>

                <div style={divS} />

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
                        <img src="/logo/white_king.png" alt="White King" style={{ width: 40, height: 40, objectFit: 'contain' }} />
                        <span>White</span>
                    </button>
                    <button
                        className={`btn-color${pickedColor === 'b' ? ' selected' : ''}`}
                        onClick={() => setPickedColor('b')}
                    >
                        <img src="/logo/black_king.png" alt="Black King" style={{ width: 40, height: 40, objectFit: 'contain' }} />
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
    );
}
