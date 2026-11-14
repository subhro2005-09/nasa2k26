import { createContext, useContext, useMemo, useState } from 'react';

const Ctx = createContext(null);
export const ROLES = [
  { id: 'crew', label: 'Crew', view: 'explorer', hint: 'Astronaut tablet: map, Go/No-Go, live traverse' },
  { id: 'science', label: 'Science', view: 'science', hint: 'Research portal: targets, spectra, sample plans' },
  { id: 'control', label: 'Control', view: 'overview', hint: 'Mission Control: hazards, approvals, telemetry' }
];

export function UiProvider({ children }) {
  const [view, setView] = useState('explorer');
  const [role, setRoleState] = useState('crew');
  const [palette, setPalette] = useState(false);
  const [brief, setBrief] = useState(false);
  const value = useMemo(() => ({
    view, setView, role, palette, setPalette, brief, setBrief,
    setRole: (r) => { setRoleState(r); setView(ROLES.find((x) => x.id === r).view); }
  }), [view, role, palette, brief]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useUi = () => useContext(Ctx);
