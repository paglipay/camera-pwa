import { useState, useMemo, useRef, useEffect } from 'react';
import schoolData from '../temp_r1.json';

const PROJECTS = [
  { label: 'IP Cam',         abbr: 'CAM' },
  { label: 'Intrusion Alarm', abbr: 'IA'  },
];

const LOCATION_TYPES = ['MDF', 'IDF', 'LDF', 'CLDF'];

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
  const [open, setOpen]                     = useState(false);
  const [schoolInput, setSchoolInput]       = useState('');
  const [selectedSchool, setSelectedSchool] = useState(null); // { site, locCode, schoolName }
  const [project, setProject]               = useState('');
  const [locationType, setLocationType]       = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const autocompleteRef = useRef(null);
  const touched = useRef(false); // guard against clearing customName on first render

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

  // Push concatenated name up whenever fields change (only after user has interacted)
  useEffect(() => {
    if (!touched.current) return;
    const schoolPart = selectedSchool
      ? `${selectedSchool.site}-${selectedSchool.locCode}`
      : schoolInput.trim();
    const projectPart = project
      ? (locationType ? `${project}_${locationType}` : `${project}01`)
      : '';
    if (!schoolPart && !projectPart) { onNameChange(''); return; }
    if (!schoolPart)  { onNameChange(projectPart); return; }
    if (!projectPart) { onNameChange(schoolPart);  return; }
    onNameChange(`${schoolPart}_${projectPart}`);
  }, [selectedSchool, schoolInput, project, locationType, onNameChange]);

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
    setLocationType('');
  };

  const handleLocationTypeChange = (type) => {
    touched.current = true;
    setLocationType(prev => (prev === type ? '' : type));
  };

  const handleClear = () => {
    touched.current = true;
    setSchoolInput('');
    setSelectedSchool(null);
    setProject('');
    setLocationType('');
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

          {/* ── Location Type (IP Cam only) ─────────────────────────── */}
          {project === 'CAM' && (
            <div className="fnhelper-field">
              <label className="fnhelper-label">Location Type</label>
              <div className="keep-alive-pills" role="group" aria-label="Location type">
                {LOCATION_TYPES.map(type => (
                  <button
                    key={type}
                    type="button"
                    className={`keep-alive-pill${locationType === type ? ' keep-alive-pill--active' : ''}`}
                    onClick={() => handleLocationTypeChange(type)}
                    aria-pressed={locationType === type}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          )}

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
