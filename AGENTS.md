# AGENTS.md

## Project

This repository contains a public Next.js web app for the Optimal Velocity (OV) traffic-flow model simulator. The app visualizes cars on a circular road and reproduces analysis views inspired by Bando et al. 1995: velocity snapshots, space-time traces, headway and velocity distributions, Fourier mode growth, and the stability field.

## Source Privacy

- `private/` is not public source material and must not be committed.
- The Processing sketch and local PDF copies under `private/` are reference-only inputs.
- Do not copy large passages, images, or PDF pages from private papers into the app.
- Public citation text is allowed and should remain concise.

## Scientific Reference

Primary model reference:

M. Bando, K. Hasebe, A. Nakayama, A. Shibata, and Y. Sugiyama, "Dynamical model of traffic congestion and numerical simulation," Physical Review E 51, 1035-1042 (1995). DOI: 10.1103/PhysRevE.51.1035.

The simulator should continue to expose the citation in the web UI.

## Development

- Framework: Next.js App Router.
- Interactive simulation code lives in `components/OvSimulatorCockpit.tsx`.
- Model and numerical logic lives in `lib/ov-core.ts`.
- Global styling lives in `app/globals.css`.
- Keep the UI focused on the actual simulator, not a marketing landing page.
- Preserve accessibility labels for controls and canvases.

## Deployment

Deployment is intended to be automatic from GitHub to Vercel:

1. Push the repository to GitHub.
2. Import the GitHub repository in Vercel.
3. Use the detected Next.js framework settings.
4. Production deployments should track the default branch.

Do not commit `.vercel/` or Vercel tokens. No application environment variables are currently required.
