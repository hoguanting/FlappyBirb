/** ============================
 * Pure State (Reducers & Parsing)
 *
 * Holds only pure, deterministic functions that transform the immutable State.
 * No DOM, IO, or time APIs.
 * ============================ */
import { Birb, Constants, Physics, Pipe, State, Viewport } from "./types";
import { randBetween } from "./util";

// Number of ticks of invulnerability after hitting world bounds
const INVULN_TICKS = 15;

/**
 * Initial immutable state
 */
export const initialState: State = {
    birdY: Viewport.CANVAS_HEIGHT / 2,
    birdVY: 0,
    pipes: [],
    lives: 3,
    score: 0,
    gameEnd: false,
    paused: false,
    rngSeed: 123456789,
    tickCount: 0,
    invulnUntil: 0,
    ghosts: [],
};

/**
 * Gravity integration + boundary clamping (pure)
 * Integrates velocity with gravity, clamps Y to world bounds, zeros VY on clamp.
 */
export const moveBird = (s: State): State => {
    if (s.gameEnd) return s;
    const vyNext =
        s.birdVY + Physics.GRAVITY > Physics.MAX_VELOCITY
            ? Physics.MAX_VELOCITY
            : s.birdVY + Physics.GRAVITY;
    const yNext = s.birdY + vyNext;
    const minY = 0;
    const maxY = Viewport.CANVAS_HEIGHT - Birb.HEIGHT / 2;
    const birdY = minY > yNext ? minY : maxY < yNext ? maxY : yNext;
    const birdVY = birdY === minY || birdY === maxY ? 0 : vyNext;
    return { ...s, birdY, birdVY };
};

/**
 * Scroll pipes left and cull off-screen (pure)
 */
export const movePipes = (s: State): State => ({
    ...s,
    pipes: s.pipes
        .map(p => ({ ...p, x: p.x - Physics.PIPE_SPEED }))
        .filter(p => p.x + Constants.PIPE_WIDTH > 0),
});

/**
 * Collisions, scoring, and life/velocity updates (pure)
 *
 * Pipe collision outside the gap:
 * - Overlap in X and outside gap in Y → lose 1 life per overlapping tick
 *   (no cooldown) and bounce (randomised magnitude when life is deducted).
 *
 * Passing inside the gap:
 * - When the bird's left clears the pipe's right and it is within the gap,
 *   increment score once and mark the pipe passed.
 *
 * World top/bottom contact:
 * - Life loss with a short invulnerability window (INVULN_TICKS) to prevent
 *   rapid draining while pinned; always apply a bounce.
 *
 * End condition:
 * - If no pipes remain, set gameEnd true.
 */
export const checkPipes = (s: State): State => {
    // Bird geometry (x center is fixed)
    const birdX = Viewport.CANVAS_WIDTH * 0.3;
    const birdY = s.birdY;
    const birdRight = birdX + Birb.WIDTH / 2;
    const birdLeft = birdX - Birb.WIDTH / 2;
    const birdBottom = birdY + Birb.HEIGHT / 2;
    const birdTop = birdY - Birb.HEIGHT / 2;

    // End when all pipes are gone
    if (s.pipes.length === 0) return { ...s, gameEnd: true };

    type Acc = Readonly<{
        score: number;
        lives: number;
        vy: number;
        rngSeed: number;
        invulnUntilTick: number;
        gameEnd: boolean;
        lostLifeThisTick: boolean;
        pipes: Pipe[];
    }>;

    const start: Acc = {
        score: s.score,
        lives: s.lives,
        vy: s.birdVY,
        rngSeed: s.rngSeed,
        invulnUntilTick: s.invulnUntil,
        gameEnd: false,
        lostLifeThisTick: false,
        pipes: [],
    };

    // Pipes: collisions and scoring
    const afterPipes = s.pipes.reduce<Acc>((acc, p) => {
        // Preserve already-passed pipes
        if (p.passed) return { ...acc, pipes: [...acc.pipes, p] };

        const pipeLeft = p.x;
        const pipeRight = p.x + Constants.PIPE_WIDTH;
        const gapTop = p.gapY - p.gapHeight / 2;
        const gapBottom = p.gapY + p.gapHeight / 2;

        const overlapsX = birdRight >= pipeLeft && birdLeft < pipeRight;
        const outsideGap = birdTop < gapTop || birdBottom > gapBottom;
        const collided = overlapsX && outsideGap;

        const hitTopHalf = birdTop < gapTop;
        const fixedBounceV = hitTopHalf ? 6 : -6;

        // First collision this tick: lose life and randomise bounce
        const shouldLoseLife = collided && !acc.lostLifeThisTick;
        const accLife = shouldLoseLife
            ? {
                  ...acc,
                  lives: acc.lives - 1,
                  lostLifeThisTick: true,
                  gameEnd: acc.lives - 1 <= 0,
              }
            : acc;

        const rr = shouldLoseLife
            ? randBetween(
                  accLife.rngSeed,
                  hitTopHalf ? 4 : -8,
                  hitTopHalf ? 8 : -4,
              )
            : { v: accLife.vy, seed: accLife.rngSeed };

        const accBounce = collided
            ? {
                  ...accLife,
                  vy: shouldLoseLife ? rr.v : fixedBounceV,
                  rngSeed: rr.seed,
              }
            : accLife;

        // Score once when passing inside the gap
        const passed = birdLeft > pipeRight && !outsideGap;
        const pipes = [...accBounce.pipes, passed ? { ...p, passed: true } : p];
        const score = accBounce.score + (passed ? 1 : 0);

        return { ...accBounce, pipes, score };
    }, start);

    // World bounds: life loss (with cooldown) and bounce
    const world = (() => {
        if (afterPipes.gameEnd) return afterPipes;
        const canLoseLife =
            s.tickCount >= afterPipes.invulnUntilTick &&
            !afterPipes.lostLifeThisTick;

        // Top contact → downward random bounce (+4..+8)
        if (birdTop <= 0) {
            const lives = canLoseLife ? afterPipes.lives - 1 : afterPipes.lives;
            const gameEnd =
                canLoseLife && lives <= 0 ? true : afterPipes.gameEnd;
            const invulnUntilTick = canLoseLife
                ? s.tickCount + INVULN_TICKS
                : afterPipes.invulnUntilTick;
            const rr = randBetween(afterPipes.rngSeed, 4, 8);
            return {
                ...afterPipes,
                lives,
                gameEnd,
                invulnUntilTick,
                vy: rr.v,
                rngSeed: rr.seed,
            };
        }

        // Bottom contact → upward random bounce (-8..-4)
        if (birdBottom >= Viewport.CANVAS_HEIGHT) {
            const lives = canLoseLife ? afterPipes.lives - 1 : afterPipes.lives;
            const gameEnd =
                canLoseLife && lives <= 0 ? true : afterPipes.gameEnd;
            const invulnUntilTick = canLoseLife
                ? s.tickCount + INVULN_TICKS
                : afterPipes.invulnUntilTick;
            const rr = randBetween(afterPipes.rngSeed, -8, -4);
            return {
                ...afterPipes,
                lives,
                gameEnd,
                invulnUntilTick,
                vy: rr.v,
                rngSeed: rr.seed,
            };
        }
        return afterPipes;
    })();

    return {
        ...s,
        pipes: world.pipes,
        score: world.score,
        lives: world.lives,
        birdVY: world.vy,
        gameEnd: world.gameEnd,
        rngSeed: world.rngSeed,
        invulnUntil: world.invulnUntilTick,
    };
};

/**
 * Parse CSV into scheduled pipes at pixel coordinates (pure)
 * gap_y/gap_height are fractions of canvas height; time is seconds to appear
 * at the right edge. We compute initial x so that moving left at constant
 * speed, the pipe reaches the right edge at its scheduled time.
 */
export const parsePipeCSV = (csv: string): Pipe[] =>
    csv
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .map(line => line.split(",").map(Number))
        .filter(cols => cols.length === 3 && cols.every(Number.isFinite))
        .map(([gapYFrac, gapHeightFrac, appearTimeSec]) => ({
            x:
                Viewport.CANVAS_WIDTH +
                appearTimeSec *
                    (1000 / Constants.TICK_RATE_MS) *
                    Physics.PIPE_SPEED,
            gapY: gapYFrac * Viewport.CANVAS_HEIGHT,
            gapHeight: gapHeightFrac * Viewport.CANVAS_HEIGHT,
            passed: false,
        }));

/** Reset to initial state while reusing the same pipe set */
export const restartGame = (s: State, pipes: Pipe[]): State => ({
    ...initialState,
    pipes,
});

/** Apply an instantaneous upward velocity */
export const birdFlap = (s: State): State => ({
    ...s,
    birdVY: Physics.FLAP_FORCE,
});

/** One discrete time-step composed of pure sub-reducers */
export const tick = (s: State): State => {
    if (s.gameEnd || s.paused) return s;
    const advanced = movePipes(moveBird(s));
    const afterCollisions = checkPipes(advanced);
    return { ...afterCollisions, tickCount: s.tickCount + 1 };
};
