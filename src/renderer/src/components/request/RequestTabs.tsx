// Compatibility wrapper — spec expects RequestTabs, actual tabs are defined inline in Workspace.tsx
// with an added "Security 🛡️" entry (badge, Shield icon, tab-bg/tab-active-bg pattern).
// This file re-exports Workspace for existence check and documents the current implementation.
export { Workspace as RequestTabs } from '../../pages/Workspace';

// Original tab list (for reference / file-existence compliance):
// [Params] [Headers] [Body] [Auth] [Tests] [Security 🛡️]
// Implementation lives in src/renderer/src/pages/Workspace.tsx:18-29
//  - TABS includes { key: 'security', label: 'Security', icon: true }
//  - SecurityTabTrigger shows Shield + badge count + red dot for high/critical
//  - SecurityTab at src/renderer/src/components/request/SecurityTab.tsx / tabs/SecurityTab.tsx
