// Capability model for external surfaces (plugins, extra panels, scripts).
//
// The loopback API stays open for the operator's own control panel and for
// existing Companion/MIDI setups — those run on the machine the operator
// controls, and gating them would break live workflows. This model exists for
// the *plugin bridge* (Phase 5): each plugin is issued a scoped grant (a token
// + a capability set), and the bridge checks the grant before forwarding a
// request to the WS snapshot or the command bus. A plugin can therefore be
// read-only, or allowed to send commands, but never more than it was granted.
//
// Pure data + predicates here; the store owns persistence, the bridge enforces.

import { nanoid } from 'nanoid';

export const CAPABILITIES = {
  // Receive the store snapshot / WS updates.
  STATE_READ: 'state:read',
  // Send canonical commands through the command bus (POST /api/command).
  COMMAND_SEND: 'command:send',
  // Read the plugin's own content data (bingo board, scores, …).
  DATA_READ: 'data:read',
  // Write the plugin's own content data (persisted + broadcast to its surfaces).
  DATA_WRITE: 'data:write',
  // Access the microphone (voice-control plugins). Relaxes the surface iframe.
  DEVICE_MICROPHONE: 'device:microphone',
  // Access the camera. Relaxes the surface iframe.
  DEVICE_CAMERA: 'device:camera',
};

export const ALL_CAPABILITIES = Object.values(CAPABILITIES);

export const normalizeCapabilities = (value) => {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  for (const cap of list) {
    if (ALL_CAPABILITIES.includes(cap) && !seen.has(cap)) {
      seen.add(cap);
      out.push(cap);
    }
  }
  return out;
};

// A fresh, unguessable token. Two nanoids = 42 chars of URL-safe entropy.
export const generateToken = () => `wtp_${nanoid()}${nanoid()}`;

export const normalizeGrant = (grant = {}) => {
  const source = grant && typeof grant === 'object' ? grant : {};
  const name = typeof source.name === 'string' && source.name.trim() ? source.name.trim() : 'Untitled grant';
  return {
    id: typeof source.id === 'string' && source.id ? source.id : nanoid(),
    name,
    token: typeof source.token === 'string' && source.token ? source.token : generateToken(),
    capabilities: normalizeCapabilities(source.capabilities),
    createdAt: typeof source.createdAt === 'number' ? source.createdAt : Date.now(),
    lastUsedAt: typeof source.lastUsedAt === 'number' ? source.lastUsedAt : null,
  };
};

export const normalizeAccess = (access) => {
  const grants = Array.isArray(access?.grants) ? access.grants.map(normalizeGrant) : [];
  return { grants };
};

export const hasCapability = (grant, capability) =>
  Boolean(grant) && Array.isArray(grant.capabilities) && grant.capabilities.includes(capability);

// A grant is safe to expose to UIs / other clients without its secret token.
export const publicGrant = (grant) => {
  if (!grant) return null;
  const { token, ...rest } = grant;
  return { ...rest, tokenPreview: token ? `${token.slice(0, 8)}…` : null };
};
