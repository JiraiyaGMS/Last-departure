# audio

Deliberately empty. Every sound in the game is synthesised at load time in
`src/audio.js` — the fluorescent hum, the Attendant's keyring, footsteps, the PA
voice, the jukebox, the diesel at Bay 9, the hole punch.

If you later want real recordings, load them into `AudioEngine.buffers` under the
same keys and the rest of the engine will use them unchanged.
