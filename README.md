# Flappy Birb: A Functional TypeScript Game

This project is a "Flappy Bird" style game built from scratch using TypeScript and Vite, with a strong emphasis on **functional programming principles**.

The core logic avoids mutation and side effects, managing the game's state through a series of pure functions and an immutable state object. This project was an exercise in applying functional concepts to build a real-time, interactive application.

-----

## 🚀 Live Demo

You can play the game live on Vercel: **[https://flappy-birb.vercel.app/](https://www.google.com/search?q=https://flappy-birb.vercel.app/)**

-----

## ✨ Features

  * **Pure Functional Game Loop:** The core game logic and state updates are managed with pure functions.
  * **Collision Detection:** Real-time detection for collisions with pipes and screen boundaries.
  * **Score Tracking:** The player's score is tracked and displayed as they successfully pass pipes.
  * **Infinite Pipe Generation:** A custom script (`npm run generate-pipes`) generates an endless, randomized map of pipes.

-----

## 🖥️ How to Run Locally

### 1\. Setup

First, install the required `node.js` dependencies.

```bash
> npm install
```

### 2\. Run the App

This command will start the Vite development server. You can then `ctrl-click` the URL in your console to open the game in your browser.

```bash
> npm run dev
```

### 3\. Run Tests

This project uses **Vitest** for testing. You can run the full test suite with:

```bash
> npm test
```

### Other Scripts

  * **Generate Pipe Map:** To generate a new set of pipes for the game:
    ```bash
    > npm run generate-pipes
    ```
  * **Code Formatting:** To format all code using Prettier (as per the original assignment guidelines):
    ```bash
    > npx prettier . --write
    ```

-----

## 🛠️ Tech Stack & Project Structure

This project was built using **Vite**, **TypeScript**, and **Vitest** for testing.

The core logic is contained in the `src/` directory.

```
src/
  main.ts       -- Main entry point and core game loop
  types.ts      -- Common types and type aliases
  state.ts      -- State processing and transformation
  view.ts       -- All rendering logic (DOM manipulation)
  observable.ts -- Functions to create Observable streams
  util.ts       -- General-purpose utility functions
```

-----

## 📜 Acknowledgements

This project was built as **Assignment 1** for the **FIT2102 Programming Paradigms** course at Monash University.

The original assignment skeleton and configuration were provided by the **FIT2102 Teaching Team**.
