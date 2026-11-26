import {
  ArrowUpRight,
  BookOpen,
  Code2,
  FileCode2,
  Flag,
  GitBranch,
  LockKeyhole,
  Settings2,
  Terminal,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import overview from '../../../docs/overview.md?raw';
import installation from '../../../docs/installation.md?raw';
import usage from '../../../docs/usage.md?raw';
import configuration from '../../../docs/configuration.md?raw';
import architecture from '../../../docs/architecture.md?raw';
import api from '../../../docs/api.md?raw';
import benchmarking from '../../../docs/benchmarking.md?raw';
import reproducibility from '../../../docs/reproducibility.md?raw';
import uciPitfalls from '../../../docs/uci-pitfalls.md?raw';
import contributing from '../../../CONTRIBUTING.md?raw';
import security from '../../../SECURITY.md?raw';
import development from '../../../docs/development.md?raw';
import publishing from '../../../docs/publishing.md?raw';
import roadmap from '../../../docs/roadmap.md?raw';
import maintenance from '../../../docs/maintenance.md?raw';
import migration from '../../../docs/migration-0.2.md?raw';
import migration05 from '../../../docs/migration-0.5.md?raw';
import migration04 from '../../../docs/migration-0.4.md?raw';
import migration03 from '../../../docs/migration-0.3.md?raw';
import agents from '../../../AGENTS.md?raw';
import verification from '../../../docs/verification.md?raw';
import previousVerification from '../../../docs/verification-0.1.0.md?raw';
import verification02 from '../../../docs/verification-0.2.0.md?raw';
import verification03 from '../../../docs/verification-0.3.0.md?raw';
import verification04 from '../../../docs/verification-0.4.0.md?raw';
import conduct from '../../../CODE_OF_CONDUCT.md?raw';
import notices from '../../../THIRD_PARTY_NOTICES.md?raw';
import license from '../../../LICENSE?raw';

const documents = [
  { id: 'overview', title: 'Welcome to the lab', icon: BookOpen, text: overview },
  { id: 'installation', title: 'Getting started', icon: Terminal, text: installation },
  { id: 'usage', title: 'Your analysis workspace', icon: Flag, text: usage },
  { id: 'configuration', title: 'Configuration & engines', icon: Settings2, text: configuration },
  { id: 'benchmarking', title: 'Benchmarking guide', icon: GitBranch, text: benchmarking },
  {
    id: 'reproducibility',
    title: 'Reproducible experiments',
    icon: GitBranch,
    text: reproducibility,
  },
  { id: 'uci-pitfalls', title: 'UCI pitfalls for engine authors', icon: Code2, text: uciPitfalls },
  { id: 'architecture', title: 'Under the hood', icon: Code2, text: architecture },
  { id: 'api', title: 'API reference', icon: FileCode2, text: api },
  { id: 'contributing', title: 'Contribute to the project', icon: GitBranch, text: contributing },
  { id: 'security', title: 'Security & privacy', icon: LockKeyhole, text: security },
  { id: 'development', title: 'Development guide', icon: Code2, text: development },
  { id: 'maintenance', title: 'Maintenance & updates', icon: Settings2, text: maintenance },
  { id: 'publishing', title: 'Publish & release', icon: GitBranch, text: publishing },
  { id: 'roadmap', title: 'Future directions', icon: Flag, text: roadmap },
  {
    id: 'migration-0.5',
    title: 'Migrating to 0.5',
    icon: FileCode2,
    text: migration05,
    secondary: true,
  },
  {
    id: 'migration-0.4',
    title: 'Migrating to 0.4',
    icon: FileCode2,
    text: migration04,
    secondary: true,
  },
  {
    id: 'migration-0.3',
    title: 'Migrating to 0.3',
    icon: FileCode2,
    text: migration03,
    secondary: true,
  },
  {
    id: 'migration-0.2',
    title: 'Migrating to 0.2',
    icon: FileCode2,
    text: migration,
    secondary: true,
  },
  { id: 'agents', title: 'Coding-agent guidance', icon: Code2, text: agents, secondary: true },
  {
    id: 'verification',
    title: 'Verification report',
    icon: FileCode2,
    text: verification,
    secondary: true,
  },
  {
    id: 'verification-0.4.0',
    title: '0.4 verification',
    icon: FileCode2,
    text: verification04,
    secondary: true,
  },
  {
    id: 'verification-0.3.0',
    title: '0.3 verification',
    icon: FileCode2,
    text: verification03,
    secondary: true,
  },
  {
    id: 'verification-0.2.0',
    title: '0.2 verification',
    icon: FileCode2,
    text: verification02,
    secondary: true,
  },
  {
    id: 'verification-0.1.0',
    title: 'Initial verification',
    icon: FileCode2,
    text: previousVerification,
    secondary: true,
  },
  {
    id: 'code_of_conduct',
    title: 'Code of Conduct',
    icon: BookOpen,
    text: conduct,
    secondary: true,
  },
  {
    id: 'third_party_notices',
    title: 'Third-party notices',
    icon: FileCode2,
    text: notices,
    secondary: true,
  },
  {
    id: 'license',
    title: 'MIT license',
    icon: FileCode2,
    text: `# License\n\n${license}`,
    secondary: true,
  },
];

export function Documentation({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (section: string) => void;
}) {
  const current = documents.find((doc) => doc.id === selected) ?? documents[0]!;
  return (
    <div className="documentation-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">KNOW YOUR WORKSPACE</div>
          <h1>A good place to get curious.</h1>
          <p>Everything you need to explore, experiment, and make OpenChessLab your own.</p>
        </div>
        <span className="outline-badge">
          <BookOpen size={14} />
          The field guide
        </span>
      </div>
      <div className="docs-layout">
        <nav className="docs-nav" aria-label="Documentation sections">
          <span className="sidebar-section-label">IN THIS GUIDE</span>
          {documents
            .filter((document) => !('secondary' in document))
            .map(({ id, title, icon: Icon }) => (
              <button
                className={current.id === id ? 'active' : ''}
                key={id}
                onClick={() => onSelect(id)}
              >
                <Icon size={16} />
                {title}
                {current.id === id && <ArrowUpRight size={13} />}
              </button>
            ))}
          <div className="docs-license">
            <Code2 size={19} />
            <strong>Yours to explore. Yours to improve.</strong>
            <p>
              Application code is MIT licensed. The separately executed Stockfish engine is GPL-3.0.
            </p>
          </div>
        </nav>
        <article className="card prose">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div
                  className="table-scroll docs-table"
                  tabIndex={0}
                  role="group"
                  aria-label="Scrollable documentation table"
                >
                  <table>{children}</table>
                </div>
              ),
              pre: ({ children }) => (
                <pre tabIndex={0} role="group" aria-label="Code example">
                  {children}
                </pre>
              ),
              a: ({ href, children }) => {
                if (href && !/^https?:/.test(href)) {
                  const key = href.split('/').pop()?.replace('.md', '').toLowerCase();
                  const mapped = key === 'readme' ? 'overview' : key;
                  if (documents.some((doc) => doc.id === mapped))
                    return (
                      <button className="inline-doc-link" onClick={() => onSelect(mapped!)}>
                        {children}
                      </button>
                    );
                  return <span>{children}</span>;
                }
                return (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                );
              },
            }}
          >
            {current.text}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
