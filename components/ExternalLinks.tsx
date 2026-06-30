export const GITHUB_REPO_URL = "https://github.com/dueyama/ov-model-traffic-lab";
export const BANDO_PAPER_URL = "https://doi.org/10.1103/PhysRevE.51.1035";

type ExternalLinkProps = {
  label: string;
  text?: string;
};

export function GitHubLink({ label, text = "GitHub" }: ExternalLinkProps) {
  return (
    <a className="icon-link" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" aria-label={label} title={label}>
      <GitHubIcon />
      <span>{text}</span>
    </a>
  );
}

export function PaperLink({ label, text = "Paper" }: ExternalLinkProps) {
  return (
    <a className="icon-link paper-link" href={BANDO_PAPER_URL} target="_blank" rel="noreferrer" aria-label={label} title={label}>
      <PaperIcon />
      <span>{text}</span>
    </a>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2.2a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.7c-2.9.6-3.5-1.2-3.5-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.6 1.1 1.6 1.1.9 1.6 2.4 1.1 2.9.8.1-.7.4-1.1.7-1.3-2.3-.3-4.7-1.2-4.7-5A3.9 3.9 0 0 1 6.6 8c-.1-.3-.5-1.3.1-2.6 0 0 .9-.3 2.8 1.1a9.5 9.5 0 0 1 5.1 0c2-1.4 2.8-1.1 2.8-1.1.6 1.3.2 2.3.1 2.6a3.9 3.9 0 0 1 1.1 2.7c0 3.9-2.4 4.7-4.7 5 .4.3.7 1 .7 2v3.1c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.2Z"
      />
    </svg>
  );
}

function PaperIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 2.8h8.3L19 7.5v13.7H6V2.8Zm7.4 1.8v4h4L13.4 4.6ZM8.1 12h8v1.5h-8V12Zm0 3.3h8v1.5h-8v-1.5Zm0-6.6h4.2v1.5H8.1V8.7Z" />
    </svg>
  );
}
