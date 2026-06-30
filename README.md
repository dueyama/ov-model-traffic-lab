# Traffic Jam Phase Lab

An interactive Next.js simulator for the Optimal Velocity traffic-flow model on a circular road. It lets you change density, sensitivity, perturbation, and the optimal-velocity curve, then watch spontaneous congestion emerge.

The app includes live views corresponding to the analysis in Bando et al. 1995:

- circular-road car animation
- fundamental diagram page at `/fundamental-diagram`
- space-time trace
- velocity snapshots
- headway and velocity distributions
- Fourier mode amplitudes
- stability field for `V'(h) <= a / 2`

The fundamental diagram page plots density `rho = N/L` against flow `q`. It includes the uniform-flow curve `q(rho)=rho V(1/rho)` and two stateful fixed-`N` sweeps:

- density-up sweep: decrease `L` step by step
- density-down sweep: increase `L` step by step

Those two sweep traces are intentionally drawn separately so possible hysteresis can be inspected.

## Presets

| Preset | Purpose | Source |
| --- | --- | --- |
| Bando 1995 | Recreates the baseline realistic-model setup `N=100`, `L=200`, `a=1`, with a small perturbation that develops into congestion clusters. | Bando et al. 1995, Sec. III B, Eq. (24), Figs. 5-10. |
| Free flow | Low-density comparison case where perturbations decay and cars return toward uniform flow. | App-derived preset using the OV model and stability criterion in Bando et al. 1995, Sec. II B. |
| Dense jam | High-density comparison case that makes stop-and-go clusters easier to see. | App-derived density variant of the Bando realistic model, based on Sec. III B. |
| Slow reaction | Lower-sensitivity case showing how weaker response makes `V'(b) <= a / 2` harder to satisfy. | App-derived sensitivity variant using the linear stability criterion in Sec. II B. |
| Simple model | Uses `V(h)=tanh(h)` to show the paper's simple-model instability, which can produce negative velocities instead of realistic congestion. | Bando et al. 1995, Sec. III A, Eq. (16), Eqs. (22)-(23), Fig. 4. |

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
