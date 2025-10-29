/** ============================
 * Observable Wiring (state$)
 *
 * Stream composition only: maps inputs/time to pure reducers folded by scan
 * to produce the immutable State stream. No DOM here.
 * ============================ */
import {
    Observable,
    Subject,
    fromEvent,
    interval,
    merge,
    map,
    filter,
    scan,
    shareReplay,
    switchMap,
    withLatestFrom,
    takeWhile,
    concat,
    of,
    zip,
    ReplaySubject,
} from "rxjs";
import { Constants, State } from "./types";
import { birdFlap, parsePipeCSV, restartGame, tick } from "./state";

type Key = "Space" | "KeyP";

/**
 * flapR: Apply an upward impulse only during play.
 * (Ignores flaps once the game has ended.)
 */
const flapR = (s: State): State => (s.gameEnd ? s : birdFlap(s));

/** togglePauseR: Toggle the paused flag (tick() early-returns when paused) */
const togglePauseR = (s: State): State => ({ ...s, paused: !s.paused });

/** restartR: Reset to initial state while reusing the parsed pipe set */
const restartR =
    (pipes: ReturnType<typeof parsePipeCSV>) =>
    (s: State): State =>
        restartGame(s, pipes);

/** resetGhostsR: Clear all ghost actors */
const resetGhostsR = (s: State): State => ({ ...s, ghosts: [] });

/** activateGhostR: Ensure a ghost exists and mark it active, with y unset */
const activateGhostR =
    (id: number) =>
    (s: State): State => ({
        ...s,
        ghosts: s.ghosts.some(g => g.id === id)
            ? s.ghosts.map(g =>
                  g.id === id ? { ...g, active: true, y: null } : g,
              )
            : [...s.ghosts, { id, active: true, y: null }],
    });

/** ghostFrameR: Set the current frame Y for a particular ghost */
const ghostFrameR =
    (id: number, y: number | null) =>
    (s: State): State => ({
        ...s,
        ghosts: s.ghosts.map(g =>
            g.id === id ? { ...g, active: true, y } : g,
        ),
    });

/** deactivateGhostR: Mark a ghost inactive at the end of its replay */
const deactivateGhostR =
    (id: number) =>
    (s: State): State => ({
        ...s,
        ghosts: s.ghosts.map(g => (g.id === id ? { ...g, active: false } : g)),
    });

/** Create the State stream given CSV contents for pipes */
export const state$ = (csvContents: string): Observable<State> => {
    // Initial pipes + base state
    const initialPipes = parsePipeCSV(csvContents);
    const baseState: State = restartGame({} as State, initialPipes);

    // Key handling (support legacy 'Spacebar' and actual space character)
    const key$ = fromEvent<KeyboardEvent>(window, "keydown");
    const fromKey = (keyCode: Key) =>
        key$.pipe(
            filter(e => {
                if (e.code === keyCode) return true;
                if (keyCode === "Space")
                    return e.key === " " || e.key === "Spacebar";
                if (keyCode === "KeyP")
                    return (e.key || "").toLowerCase() === "p";
                return false;
            }),
        );

    // Timebase
    const tick$ = interval(Constants.TICK_RATE_MS);
    const pressSpace$ = fromKey("Space");
    const pressP$ = fromKey("KeyP");

    // Late-bound/dynamic reducers (ghost replay sequence only). This avoids
    // nested subscriptions while letting us inject a sequence of reducers
    // when we need to perform the replay choreography.
    const extraReducers$ = new Subject<(s: State) => State>();

    // Base + input reducers
    const baseReducers$ = tick$.pipe(map(() => (s: State) => tick(s)));
    const flapReducers$ = pressSpace$.pipe(map(() => flapR));
    const pauseReducers$ = pressP$.pipe(map(() => togglePauseR));

    // Unified reducer stream → State. All updates flow through a single
    // fold, preserving determinism and a single source of truth.
    const reducers$ = merge(
        baseReducers$,
        flapReducers$,
        pauseReducers$,
        extraReducers$,
    );

    const stateObs$ = reducers$.pipe(
        scan((s: State, reducer: (s: State) => State) => reducer(s), baseState),
    );

    const sharedState$ = stateObs$.pipe(
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    // Paused-aware tick: pause-aware pacing for recording and replay.
    const playTick$ = tick$.pipe(
        withLatestFrom(sharedState$),
        filter(([, s]) => !s.paused),
        map(() => void 0),
    );

    // =============== Ghost recording ================
    // Full-observable recorder: per-run ReplaySubject that receives y each
    // unpaused tick; on end, complete and store the subject.
    type RunRec = { id: number; subj: ReplaySubject<number> };
    type Acc = {
        runs: RunRec[];
        current: ReplaySubject<number> | null;
        nextId: number;
        prevEnded: boolean;
    };

    const runsAcc$ = playTick$.pipe(
        withLatestFrom(sharedState$),
        scan(
            (acc: Acc, [, s]) => {
                const endedThisTick = s.gameEnd && !acc.prevEnded;
                const runningThisTick = !s.gameEnd;

                const current = runningThisTick
                    ? (acc.current ?? new ReplaySubject<number>())
                    : acc.current;
                if (runningThisTick && current) current.next(s.birdY);

                const runs =
                    endedThisTick && acc.current
                        ? (() => {
                              acc.current!.complete();
                              return [
                                  ...acc.runs,
                                  { id: acc.nextId, subj: acc.current! },
                              ];
                          })()
                        : acc.runs;

                return {
                    runs,
                    current: endedThisTick ? null : current,
                    nextId: endedThisTick ? acc.nextId + 1 : acc.nextId,
                    prevEnded: s.gameEnd,
                };
            },
            {
                runs: [] as RunRec[],
                current: null as ReplaySubject<number> | null,
                nextId: 1,
                prevEnded: false,
            },
        ),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    // =============== Restart + Ghost replay ===============
    // On Space when ended: restart, immediate flap, clear ghosts, then replay all runs.
    // Each run: activate → per-frame Y (paced by playTick$) → deactivate.
    const restartAndGhostReducers$ = pressSpace$.pipe(
        withLatestFrom(sharedState$, runsAcc$),
        filter(([, s]) => s.gameEnd),
        switchMap(([, , acc]) => {
            const restart$ = of<(st: State) => State>(restartR(initialPipes));
            const flap$ = of<(st: State) => State>(flapR);
            const clearGhosts$ = of<(st: State) => State>(resetGhostsR);

            const ghostStreams = acc.runs.map(run => {
                const activate$ = of<(st: State) => State>(
                    activateGhostR(run.id),
                );
                // Play back frames in lockstep with unpaused ticks
                const frames$ = zip(run.subj, playTick$).pipe(
                    withLatestFrom(sharedState$),
                    takeWhile(([, s]) => !s.gameEnd),
                    map(([[y]]) => ghostFrameR(run.id, y ?? null)),
                );
                const end$ = of<(st: State) => State>(deactivateGhostR(run.id));
                return concat(activate$, frames$, end$);
            });

            return concat(
                restart$,
                flap$,
                clearGhosts$,
                merge(...ghostStreams),
            );
        }),
    );

    // Feed dynamic replay reducers into the bus
    restartAndGhostReducers$.subscribe(extraReducers$);

    return sharedState$;
};
