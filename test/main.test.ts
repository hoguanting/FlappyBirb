import { describe, it, expect } from "vitest";
import {
    Viewport,
    Constants,
    Physics,
    type Pipe,
    type State,
    initialState,
    moveBird,
    movePipes,
    checkPipes,
    parsePipeCSV,
    restartGame,
    tick,
    state$,
} from "../src/main";

// Helpers
const mkState = (over: Partial<State> = {}): State => ({
    ...initialState,
    ...over,
});

const mkPipe = (over: Partial<Pipe> = {}): Pipe => ({
    x: Viewport.CANVAS_WIDTH + 100,
    gapY: Viewport.CANVAS_HEIGHT / 2,
    gapHeight: 100,
    passed: false,
    ...over,
});

describe("state$ smoke", () => {
    it("is exported and is a function", () => {
        expect(state$).toBeTypeOf("function");
    });
});

describe("CSV parsing", () => {
    it("parses rows into pixel-coord pipes and schedules by time", () => {
        const csv = ["gap_y,gap_height,time", "0.5,0.25,2", "0.25,0.5,1"].join(
            "\n",
        );
        const pipes = parsePipeCSV(csv);
        expect(pipes.length).toBe(2);
        const framesPerSec = 1000 / Constants.TICK_RATE_MS;
        // pipe 0: time 2s
        expect(pipes[0].gapY).toBeCloseTo(0.5 * Viewport.CANVAS_HEIGHT, 6);
        expect(pipes[0].gapHeight).toBeCloseTo(
            0.25 * Viewport.CANVAS_HEIGHT,
            6,
        );
        const expectedX0 =
            Viewport.CANVAS_WIDTH + 2 * framesPerSec * Physics.PIPE_SPEED;
        expect(pipes[0].x).toBeCloseTo(expectedX0, 6);
        // pipe 1: time 1s
        const expectedX1 =
            Viewport.CANVAS_WIDTH + 1 * framesPerSec * Physics.PIPE_SPEED;
        expect(pipes[1].x).toBeCloseTo(expectedX1, 6);
    });
});

describe("moveBird (gravity and clamps)", () => {
    it("applies gravity and moves down", () => {
        const s0 = mkState({ birdY: 100, birdVY: 0 });
        const s1 = moveBird(s0);
        expect(s1.birdVY).toBeCloseTo(Physics.GRAVITY);
        expect(s1.birdY).toBeCloseTo(100 + Physics.GRAVITY);
    });
    it("clamps at top and zeroes vy", () => {
        const s0 = mkState({ birdY: 0, birdVY: -5 });
        const s1 = moveBird(s0);
        expect(s1.birdY).toBe(0);
        expect(s1.birdVY).toBe(0);
    });
    it("clamps at bottom and zeroes vy", () => {
        const s0 = mkState({ birdY: Viewport.CANVAS_HEIGHT, birdVY: 20 });
        const s1 = moveBird(s0);
        expect(s1.birdY).toBe(Viewport.CANVAS_HEIGHT - 15); // Birb.HEIGHT/2 = 15
        expect(s1.birdVY).toBe(0);
    });
    it("caps velocity at MAX_VELOCITY", () => {
        const s0 = mkState({ birdY: 50, birdVY: Physics.MAX_VELOCITY });
        const s1 = moveBird(s0);
        expect(s1.birdVY).toBe(Physics.MAX_VELOCITY); // stays capped
        expect(s1.birdY).toBeCloseTo(50 + Physics.MAX_VELOCITY);
    });
});

describe("movePipes (shift and cull)", () => {
    it("moves pipes left by pipeSpeed and removes offscreen", () => {
        const p0 = mkPipe({ x: 10 });
        const p1 = mkPipe({ x: -60 }); // offscreen after shift
        const s0 = mkState({ pipes: [p0, p1] });
        const s1 = movePipes(s0);
        expect(s1.pipes.some(p => p === p1)).toBe(false);
        expect(s1.pipes[0].x).toBeCloseTo(10 - Physics.PIPE_SPEED);
    });
});

describe("checkPipes (collisions and scoring)", () => {
    const birdX = Viewport.CANVAS_WIDTH * 0.3;
    const gapY = 200;
    const gapH = 100;

    it("loses a life and bounces on pipe collision outside gap (top half)", () => {
        const pipe = mkPipe({
            x: birdX - Constants.PIPE_WIDTH / 2,
            gapY,
            gapHeight: gapH,
        });
        const s0 = mkState({
            birdY: gapY - gapH / 2 - 5, // above gap -> collide top half
            birdVY: 0,
            pipes: [pipe],
            lives: 3,
            tickCount: 0,
            rngSeed: 123,
        });
        const s1 = checkPipes(s0);
        expect(s1.lives).toBe(2);
        // bounce down: positive vy in [4,8]
        expect(s1.birdVY).toBeGreaterThanOrEqual(4);
        expect(s1.birdVY).toBeLessThanOrEqual(8);
    });

    it("bounces up on bottom-half collision (negative vy)", () => {
        const pipe = mkPipe({
            x: birdX - Constants.PIPE_WIDTH / 2,
            gapY,
            gapHeight: gapH,
        });
        const s0 = mkState({
            birdY: gapY + gapH / 2 + 5, // below gap -> collide bottom half
            birdVY: 0,
            pipes: [pipe],
            lives: 3,
            tickCount: 0,
            rngSeed: 123,
        });
        const s1 = checkPipes(s0);
        expect(s1.lives).toBe(2);
        expect(s1.birdVY).toBeLessThanOrEqual(-4);
        expect(s1.birdVY).toBeGreaterThanOrEqual(-8);
    });

    it("increments score once when passing inside gap", () => {
        // place pipe to the left of bird so pass condition holds and inside gap
        const pipe = mkPipe({
            x: birdX - 100,
            gapY,
            gapHeight: gapH,
            passed: false,
        });
        const s0 = mkState({
            birdY: gapY,
            pipes: [pipe],
            score: 0,
        });
        const s1 = checkPipes(s0);
        expect(s1.score).toBe(1);
        expect(s1.pipes[0].passed).toBe(true);
    });

    it("only loses one life per tick even with multiple overlapping pipes", () => {
        const x = birdX - Constants.PIPE_WIDTH / 2;
        const pTop = mkPipe({ x, gapY: gapY, gapHeight: gapH });
        const pBottom = mkPipe({ x, gapY: gapY + 40, gapHeight: gapH });
        const s0 = mkState({
            birdY: gapY - gapH / 2 - 5, // collide top half
            pipes: [pTop, pBottom],
            lives: 3,
            rngSeed: 1,
        });
        const s1 = checkPipes(s0);
        expect(s1.lives).toBe(2); // not 1
    });

    it("ends the game when no pipes remain", () => {
        const s0 = mkState({ pipes: [] });
        const s1 = checkPipes(s0);
        expect(s1.gameEnd).toBe(true);
    });
});

describe("end conditions (world bounds)", () => {
    it("invulnerability window prevents repeated life loss within cooldown", () => {
        // First tick: hit bottom, lose a life and set invulnerability
        const s0 = mkState({
            birdY: Viewport.CANVAS_HEIGHT + 100, // beyond bottom
            birdVY: 10,
            lives: 3,
            tickCount: 10,
            invulnUntil: 0,
            pipes: [mkPipe()], // ensure game not ended by empty pipes
        });
        const s1 = checkPipes(s0);
        expect(s1.lives).toBe(2);
        const invEnd = s1.invulnUntil;
        // Next tick within invulnerability: still at bottom, should not lose another life
        const s2 = checkPipes({ ...s1, tickCount: s1.tickCount });
        expect(s2.lives).toBe(2);
        expect(invEnd).toBeGreaterThan(s1.tickCount);
    });
});

describe("deterministic RNG", () => {
    it("same seed and setup yields identical bounce", () => {
        const birdX = Viewport.CANVAS_WIDTH * 0.3;
        const pipe = mkPipe({
            x: birdX - Constants.PIPE_WIDTH / 2,
            gapY: 200,
            gapHeight: 100,
        });
        const base: Partial<State> = {
            birdY: 200 - 50 - 5, // collide top half
            birdVY: 0,
            pipes: [pipe],
            lives: 3,
            tickCount: 0,
            rngSeed: 424242,
        };
        const sA = checkPipes(mkState(base));
        const sB = checkPipes(mkState(base));
        expect(sA.birdVY).toBeCloseTo(sB.birdVY);
        expect(sA.rngSeed).toBe(sB.rngSeed);
    });
});

describe("restartGame", () => {
    it("preserves pipes and resets counters", () => {
        const pipes = [mkPipe(), mkPipe({ x: 123 })];
        const s0 = mkState({
            birdY: 123,
            birdVY: 5,
            pipes,
            lives: 1,
            score: 10,
            gameEnd: true,
            tickCount: 99,
        });
        const s1 = restartGame(s0, pipes);
        expect(s1.pipes).toEqual(pipes);
        expect(s1.score).toBe(0);
        expect(s1.lives).toBe(3);
        expect(s1.tickCount).toBe(0);
        expect(s1.gameEnd).toBe(false);
    });
});

describe("tick composition and guards", () => {
    it("tick early-returns when paused and does not change tickCount", () => {
        const s0 = mkState({ paused: true, tickCount: 5, pipes: [mkPipe()] });
        const s1 = tick(s0);
        expect(s1).toEqual(s0);
    });
    it("tick early-returns when game ended and does not change tickCount", () => {
        const s0 = mkState({ gameEnd: true, tickCount: 7 });
        const s1 = tick(s0);
        expect(s1).toEqual(s0);
    });
    it("tick moves, collides, and increments tickCount", () => {
        const p = mkPipe({ x: Viewport.CANVAS_WIDTH + 10 });
        const s0 = mkState({ pipes: [p], birdY: 100, birdVY: 0, tickCount: 0 });
        const s1 = tick(s0);
        expect(s1.tickCount).toBe(1);
        expect(s1.birdY).toBeGreaterThan(100); // gravity applied
        expect(s1.pipes[0].x).toBeLessThan(p.x); // pipes moved left
    });
});

describe("CSV parsing robustness", () => {
    it("ignores invalid lines and blanks", () => {
        const csv = [
            "gap_y,gap_height,time",
            "0.5,0.25,2",
            "bad,line,ignored",
            "",
            "0.25,0.5,1",
        ].join("\n");
        const pipes = parsePipeCSV(csv);
        expect(pipes.length).toBe(2);
    });
});
