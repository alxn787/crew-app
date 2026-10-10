# FDTL Check

A personal app for cabin crew to check a roster against DGCA's Flight Duty Time Limitations for cabin crew
(CAR Section 7, Series J, Part I). Enter flights, standbys, training, leave and days off in a calendar. The app
flags anything that breaks a limit and shows, for each standby, whether crew control can legally call you out
and how late you could be kept flying.

Not an official Akasa or DGCA tool. Akasa's DGCA-approved FDTL scheme can be stricter than the CAR.

## Run

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # rules engine tests
```

Data is kept in the browser's localStorage on the device. Use Settings → Export backup to save a copy.

## Rule sets

- **Issue IV** (default) is the earlier 2018 cabin crew CAR. Use this unless Akasa has moved to Issue V.
- **Issue V** is the draft released 15 Oct 2025. Its text is on the DGCA site, but the dated and
  effective fields are blank.

Both are defined in `src/lib/fdtl/rules.ts`. The engine is in `src/lib/fdtl/engine.ts` and the standby what-if
solver is in `src/lib/fdtl/standby.ts`.

### Interpretations to be aware of

- **FDP tables are read as envelopes.** A duty is legal if it fits any row (flight time ≤ row max,
  landings ≤ row max) and its FDP is within that row's limit.
- **Night duty (Issue V)** means any part of the duty period falls between 00:00 and 06:00 IST. Night duty uses
  §6.1.4: max 10:00 FDP and 2 landings.
- **Cumulative limits** use IST calendar-day windows and are checked on every day that has a duty.
- **Standby rest.** A standby that later turns into a flight must have the flight rest requirement (§9.1)
  before the standby starts.
- **Missing history.** History before your first entry is assumed rested, so add your last weekly off for an
  accurate weekly-rest deadline.

### Placeholders to confirm from Akasa's scheme

Change these in Settings:
- Reporting time before STD: 60 min domestic, 75 min international.
- Start of the 8-hour local night: 22:00.

### Not modelled

- Augmented crew and ULR flights.
- Split duty.
- Rest after crossing time zones (Akasa's routes stay within 3 hours of IST).
- Extra rest when transport takes over 30 min.
- Extensions for unforeseen operational circumstances.
# crew-app
