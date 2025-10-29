/** ============================
 * Constants
 * ============================ */
export const Viewport = {
    CANVAS_WIDTH: 600,
    CANVAS_HEIGHT: 400,
} as const;

export const Birb = {
    WIDTH: 42,
    HEIGHT: 30,
    GHOST_TRANSPARENCY: "0.2",
} as const;

export const Constants = {
    PIPE_WIDTH: 50,
    TICK_RATE_MS: 20, // 50 fps
} as const;

export const Physics = {
    GRAVITY: 0.5,
    FLAP_FORCE: -5.5,
    MAX_VELOCITY: 10,
    PIPE_SPEED: 5,
} as const;

/** ============================
 * Core Game Types
 * ============================ */
/** Pipe: vertical obstacle with a gap */
export type Pipe = Readonly<{
    x: number;
    gapY: number;
    gapHeight: number;
    passed: boolean;
}>;

/** Ghost: per-run visual replay actor */
export type Ghost = Readonly<{
    id: number;
    y: number | null;
    active: boolean;
}>;

/** State: immutable game model */
export type State = Readonly<{
    birdY: number;
    birdVY: number;
    pipes: Pipe[];
    lives: number;
    score: number;
    gameEnd: boolean;
    paused: boolean;
    rngSeed: number;
    tickCount: number;
    invulnUntil: number; // tick index until which collisions don't cost lives
    ghosts: Ghost[]; // ghosts from previous runs
}>;
