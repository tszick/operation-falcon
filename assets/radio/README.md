# English radio dialogue

36 pre-rendered synthetic English speech clips for Control, Falcon One, Falcon Two and the civilian pilot. Generated locally with installed Microsoft David Desktop, Mark and Zira Desktop voices. These are synthesized voices, not recordings of actors or real military personnel. No external speech service or runtime speech synthesis is required.

`script.json` is the editable source. `src/radioLines.js` contains the generated clip metadata. The shipped mono 22.05 kHz PCM WAVs are band-limited, softly compressed and lightly treated with static/squelch; Falcon One also uses a narrower oxygen-mask-like frequency response. Noise is deliberately short and quiet.

Rebuild from the project root on Windows with those English voices installed:

```powershell
./scripts/build-radio-voices.ps1 -RawDirectory "$env:TEMP/operation-falcon-radio-20261018"
python ./scripts/process_radio.py "$env:TEMP/operation-falcon-radio-20261018"
```

The director uses actual mission and combat state, one shared voice channel, expiration, attack cooldowns and high-priority interruption. No ejection is announced because the game does not currently simulate an ejection. Captions are emitted only when a buffer starts playing. M mutes voices together with the existing sound system; pause freezes playback; a successful debrief allows the welcome-home clip to finish.

Open `/tests/radio-preview.html` for a manual playback, interruption and caption check.

Entering an active hostile jamming zone triggers a masked pilot navigation-loss call. Re-entry announcements have a 45-second cooldown to avoid chatter along the boundary.

Sustained descending stalls and severe loss of control authority trigger urgent pilot calls before fatal structural failure or the external camera. Recovery cancels unplayed calls; brief stalls and ground roll do not trigger them.
