/** ============================
 * View (DOM/SVG Renderer)
 *
 * Pure state in → side-effectful DOM updates out. All rendering logic
 * is contained here to preserve FRP purity elsewhere.
 * ============================ */
import { Birb, Constants, State, Viewport } from "./types";
import { createSvgElement, hide, show } from "./util";

export const render = (): ((s: State) => void) => {
    // Canvas elements
    const gameOver = document.querySelector("#gameOver") as SVGElement;
    const paused = document.querySelector("#paused") as SVGElement;
    const winner = document.querySelector("#winner") as SVGElement;

    // Text fields
    const livesText = document.querySelector("#livesText") as HTMLElement;
    const scoreText = document.querySelector("#scoreText") as HTMLElement;

    const svg = document.querySelector("#svgCanvas") as SVGSVGElement;

    const ghostGroup = createSvgElement(svg.namespaceURI, "g");
    const pipeGroup = createSvgElement(svg.namespaceURI, "g");
    svg.appendChild(ghostGroup);
    svg.appendChild(pipeGroup);

    svg.setAttribute(
        "viewBox",
        `0 0 ${Viewport.CANVAS_WIDTH} ${Viewport.CANVAS_HEIGHT}`,
    );

    const birdSpriteUrl =
        (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
            ? `${import.meta.env.BASE_URL}birb.png`
            : "birb.png");

    const birdImg = createSvgElement(svg.namespaceURI, "image", {
        href: birdSpriteUrl,
        x: `${Viewport.CANVAS_WIDTH * 0.3 - Birb.WIDTH / 2}`,
        y: `${Viewport.CANVAS_HEIGHT / 2 - Birb.HEIGHT / 2}`,
        width: `${Birb.WIDTH}`,
        height: `${Birb.HEIGHT}`,
    });
    svg.appendChild(birdImg);

    return (s: State) => {
        // Ghosts (prior runs)
        ghostGroup.innerHTML = "";
        s.ghosts
            .filter(g => g.active && g.y != null)
            .forEach(g => {
                const gImg = createSvgElement(svg.namespaceURI, "image", {
                    href: birdSpriteUrl,
                    x: `${Viewport.CANVAS_WIDTH * 0.3 - Birb.WIDTH / 2}`,
                    y: `${(g.y as number) - Birb.HEIGHT / 2}`,
                    width: `${Birb.WIDTH}`,
                    height: `${Birb.HEIGHT}`,
                    opacity: Birb.GHOST_TRANSPARENCY,
                });
                ghostGroup.appendChild(gImg);
            });

        // Player bird
        birdImg.setAttribute(
            "x",
            `${Viewport.CANVAS_WIDTH * 0.3 - Birb.WIDTH / 2}`,
        );
        birdImg.setAttribute("y", `${s.birdY - Birb.HEIGHT / 2}`);

        // Pipes
        pipeGroup.innerHTML = "";
        s.pipes.forEach(p => {
            const pipeTop = createSvgElement(svg.namespaceURI, "rect", {
                x: `${p.x}`,
                y: `0`,
                width: `${Constants.PIPE_WIDTH}`,
                height: `${p.gapY - p.gapHeight / 2}`,
                fill: "green",
            });
            const pipeBottom = createSvgElement(svg.namespaceURI, "rect", {
                x: `${p.x}`,
                y: `${p.gapY + p.gapHeight / 2}`,
                width: `${Constants.PIPE_WIDTH}`,
                height: `${Viewport.CANVAS_HEIGHT - (p.gapY + p.gapHeight / 2)}`,
                fill: "green",
            });
            pipeGroup.appendChild(pipeTop);
            pipeGroup.appendChild(pipeBottom);
        });

        // Overlays
        if (!s.gameEnd && s.paused) show(paused);
        else hide(paused);

        if (s.gameEnd) {
            const won = s.pipes.length === 0 && s.lives > 0;
            if (won) {
                show(winner);
                hide(gameOver);
            } else {
                show(gameOver);
                hide(winner);
            }
        } else {
            hide(gameOver);
            hide(winner);
        }

        // Sidebar UI
        if (livesText) livesText.innerText = `${s.lives}`;
        if (scoreText) scoreText.innerText = `${s.score}`;
    };
};
