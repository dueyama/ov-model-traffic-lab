# Traffic Jam Phase Lab

An interactive Next.js simulator for the Optimal Velocity traffic-flow model on a circular road. It lets you change density, sensitivity, perturbation, and the optimal-velocity curve, then watch spontaneous congestion emerge.

The app includes live views corresponding to the analysis in Bando et al. 1995:

- circular-road car animation
- space-time trace
- velocity snapshots
- headway and velocity distributions
- Fourier mode amplitudes
- stability field for `V'(h) <= a / 2`

## Reference / CITE

M. Bando, K. Hasebe, A. Nakayama, A. Shibata, and Y. Sugiyama, "Dynamical model of traffic congestion and numerical simulation," *Physical Review E* 51, 1035-1042 (1995). DOI: [10.1103/PhysRevE.51.1035](https://doi.org/10.1103/PhysRevE.51.1035).

```bibtex
@article{Bando1995OV,
  author = {Bando, M. and Hasebe, K. and Nakayama, A. and Shibata, A. and Sugiyama, Y.},
  title = {Dynamical model of traffic congestion and numerical simulation},
  journal = {Physical Review E},
  volume = {51},
  pages = {1035--1042},
  year = {1995},
  doi = {10.1103/PhysRevE.51.1035}
}
```

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Checks

```bash
npm run check
npm run build
```

## GitHub to Vercel

This project is intended to deploy through Vercel's GitHub integration:

1. Push this repository to GitHub.
2. In Vercel, choose **Add New... > Project** and import the GitHub repo.
3. Keep the auto-detected Next.js settings.
4. Set production deployment to the default branch.

No environment variables are required. The local `private/` folder is ignored and must remain unpublished.
