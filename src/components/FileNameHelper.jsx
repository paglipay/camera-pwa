import { useState, useMemo, useRef, useEffect } from 'react';
import schoolData from '../temp_r1.json';

const PROJECTS = [
  { label: 'IP Cam',         abbr: 'CAM' },
  { label: 'Intrusion Alarm', abbr: 'IA'  },
];

const NUMS_PER_PAGE = 30;
const SEQUENCE_LETTERS = ['A', 'B', 'C', 'D', '_INSTALL', '_VIDEO'];

const FNHELPER_STATE_KEY = 'camera-pwa:fnhelper-state';

function loadFnHelperState() {
  try {
    const raw = localStorage.getItem(FNHELPER_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveFnHelperState(state) {
  try { localStorage.setItem(FNHELPER_STATE_KEY, JSON.stringify(state)); } catch {}
}

// Deduplicate by Loc Code; keep only records that have both a School Name and Loc Code
const SCHOOLS = (() => {
  const seen = new Set();
  return schoolData
    .filter(r => r['School Name'] && r['Loc Code'])
    .filter(r => {
      const key = r['Loc Code'];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(r => ({ site: r['Site'], locCode: r['Loc Code'], schoolName: r['School Name'] }))
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName));
})();

export function FileNameHelper({ onNameChange }) {
  const saved = useMemo(() => loadFnHelperState(), []);

  const [open, setOpen]                     = useState(saved.open ?? false);
  const [schoolInput, setSchoolInput]       = useState(saved.schoolInput ?? '');
  const [selectedSchool, setSelectedSchool] = useState(saved.selectedSchool ?? null);
  const [project, setProject]               = useState(saved.project ?? '');
  const [sequenceNum, setSequenceNum]         = useState(saved.sequenceNum ?? '');
  const [sequenceLetter, setSequenceLetter]   = useState(saved.sequenceLetter ?? '');
  const [locCodeOnly, setLocCodeOnly]         = useState(saved.locCodeOnly ?? false);
  const [numPage, setNumPage]                 = useState(saved.numPage ?? 0);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const autocompleteRef = useRef(null);
  // Start as touched if we restored saved state, so the name is pushed up on mount
  const hasSaved = Boolean(saved.schoolInput || saved.selectedSchool || saved.project || saved.sequenceNum || saved.sequenceLetter);
  const touched = useRef(hasSaved);

  // Filter school list as user types
  const filtered = useMemo(() => {
    if (!schoolInput.trim()) return SCHOOLS;
    const q = schoolInput.toLowerCase();
    return SCHOOLS.filter(s =>
      s.schoolName.toLowerCase().includes(q) ||
      s.site.toLowerCase().includes(q) ||
      String(s.locCode).includes(q)
    );
  }, [schoolInput]);

  // Persist field state to localStorage whenever it changes
  useEffect(() => {
    saveFnHelperState({ open, schoolInput, selectedSchool, project, sequenceNum, sequenceLetter, locCodeOnly, numPage });
  }, [open, schoolInput, selectedSchool, project, sequenceNum, sequenceLetter, locCodeOnly, numPage]);

  // Push concatenated name up whenever fields change (only after user has interacted)
  useEffect(() => {
    if (!touched.current) return;
    const schoolPart = selectedSchool
      ? (locCodeOnly ? `${selectedSchool.locCode}` : `${selectedSchool.site}-${selectedSchool.locCode}`)
      : schoolInput.trim();
    const projectPart = project || '';
    const suffix = sequenceNum + sequenceLetter; // e.g. '01A', '01', 'A', ''
    const coreParts = [schoolPart, projectPart].filter(Boolean);
    const coreName  = coreParts.join('_');
    if (!coreName && !suffix) { onNameChange(''); return; }
    if (!coreName)  { onNameChange(suffix);   return; }
    if (!suffix)    { onNameChange(coreName); return; }
    onNameChange(`${coreName}${suffix}`);
  }, [selectedSchool, schoolInput, project, sequenceNum, sequenceLetter, locCodeOnly, onNameChange]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectSchool = (school) => {
    touched.current = true;
    setSelectedSchool(school);
    setSchoolInput(school.schoolName);
    setShowSuggestions(false);
  };

  const handleSchoolChange = (e) => {
    touched.current = true;
    setSchoolInput(e.target.value);
    setSelectedSchool(null);
    setShowSuggestions(true);
  };

  const handleProjectChange = (abbr) => {
    touched.current = true;
    setProject(prev => (prev === abbr ? '' : abbr));
  };

  const handleSequenceNumChange = (num) => {
    touched.current = true;
    setSequenceNum(prev => (prev === num ? '' : num));
  };

  const handleSequenceLetterChange = (letter) => {
    touched.current = true;
    setSequenceLetter(prev => (prev === letter ? '' : letter));
  };

  const handleLocCodeOnlyChange = () => {
    touched.current = true;
    setLocCodeOnly(prev => !prev);
  };

  const handleClear = () => {
    touched.current = true;
    setSchoolInput('');
    setSelectedSchool(null);
    setProject('');
    setSequenceNum('');
    setSequenceLetter('');
    setLocCodeOnly(false);
    localStorage.removeItem(FNHELPER_STATE_KEY);
    onNameChange('');
  };

  return (
    <div className="fnhelper">
      <button
        className={`fnhelper-header${open ? ' fnhelper-header--open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        type="button"
      >
        <span>File Name Helper</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="fnhelper-body">

          {/* ── School ─────────────────────────────────────────────── */}
          <div className="fnhelper-field" ref={autocompleteRef}>
            <label className="fnhelper-label" htmlFor="fnhelper-school">School</label>
            <div className="fnhelper-autocomplete">
              <input
                id="fnhelper-school"
                type="text"
                className="filename-input"
                placeholder="Type to search schools…"
                value={schoolInput}
                onChange={handleSchoolChange}
                onFocus={() => setShowSuggestions(true)}
                autoComplete="off"
                spellCheck={false}
              />
              {showSuggestions && filtered.length > 0 && (
                <ul className="fnhelper-suggestions" role="listbox" aria-label="School suggestions">
                  {filtered.slice(0, 10).map(s => (
                    <li
                      key={s.locCode}
                      className="fnhelper-suggestion"
                      role="option"
                      onMouseDown={() => selectSchool(s)}
                    >
                      <span className="fnhelper-suggestion-name">{s.schoolName}</span>
                      <span className="fnhelper-suggestion-meta">{s.site} · {s.locCode}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {selectedSchool && (
              <p className="fnhelper-selected-meta">
                Using: {selectedSchool.site} · {selectedSchool.locCode}
              </p>
            )}
          </div>

          {/* ── Loc code only toggle ────────────────────────────────── */}
          <div className="fnhelper-field fnhelper-field--row">
            <label className="fnhelper-toggle-label" htmlFor="fnhelper-loccode-only">
              Loc code only
              <span className="fnhelper-toggle-hint">Omit site prefix — use loc code only (e.g. 9545)</span>
            </label>
            <button
              id="fnhelper-loccode-only"
              type="button"
              role="switch"
              aria-checked={locCodeOnly}
              className={`toggle-switch${locCodeOnly ? ' toggle-switch--on' : ''}`}
              onClick={handleLocCodeOnlyChange}
              aria-label="Use loc code only"
            />
          </div>

          {/* ── Project ────────────────────────────────────────────── */}
          <div className="fnhelper-field">
            <label className="fnhelper-label">Project</label>
            <div className="keep-alive-pills" role="group" aria-label="Project type">
              {PROJECTS.map(p => (
                <button
                  key={p.abbr}
                  type="button"
                  className={`keep-alive-pill${project === p.abbr ? ' keep-alive-pill--active' : ''}`}
                  onClick={() => handleProjectChange(p.abbr)}
                  aria-pressed={project === p.abbr}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Sequence Number ─────────────────────────────────────── */}
          <div className="fnhelper-field">
            <div className="fnhelper-num-header">
              <label className="fnhelper-label">Number</label>
              <div className="fnhelper-num-pagination">
                <button
                  type="button"
                  className="fnhelper-page-btn"
                  onClick={() => setNumPage(p => Math.max(0, p - 1))}
                  disabled={numPage === 0}
                  aria-label="Previous page"
                >‹</button>
                <span className="fnhelper-page-range">
                  {String(numPage * NUMS_PER_PAGE + 1).padStart(2, '0')}–{String(numPage * NUMS_PER_PAGE + NUMS_PER_PAGE).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  className="fnhelper-page-btn"
                  onClick={() => setNumPage(p => p + 1)}
                  aria-label="Next page"
                >›</button>
              </div>
            </div>
            <div className="keep-alive-pills keep-alive-pills--wrap" role="group" aria-label="Sequence number">
              {Array.from({ length: NUMS_PER_PAGE }, (_, i) => String(numPage * NUMS_PER_PAGE + i + 1).padStart(2, '0')).map(n => (
                <button
                  key={n}
                  type="button"
                  className={`keep-alive-pill keep-alive-pill--compact${sequenceNum === n ? ' keep-alive-pill--active' : ''}`}
                  onClick={() => handleSequenceNumChange(n)}
                  aria-pressed={sequenceNum === n}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* ── Sequence Letter ─────────────────────────────────────── */}
          <div className="fnhelper-field">
            <label className="fnhelper-label">Letter</label>
            <div className="keep-alive-pills" role="group" aria-label="Sequence letter">
              {SEQUENCE_LETTERS.map(l => (
                <button
                  key={l}
                  type="button"
                  className={`keep-alive-pill${sequenceLetter === l ? ' keep-alive-pill--active' : ''}`}
                  onClick={() => handleSequenceLetterChange(l)}
                  aria-pressed={sequenceLetter === l}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <button type="button" className="fnhelper-clear" onClick={handleClear}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
    >
      <path d="M7 10l5 5 5-5z" />
    </svg>
  );
}
