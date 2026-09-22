import { describe, expect, it } from 'vitest';
import {
  TOOL_DESCRIPTIONS,
  RETIRED_MODEL_TOOLS,
  buildExposedTools,
  selectToolsFor,
  toolSkillLines,
} from '../src/agent-config/tools.js';
import { ALL_SKILLS } from '../src/agent-config/skills/index.js';
import { compromissosSkill } from '../src/agent-config/skills/compromissos.js';

/**
 * debt-pending-v1-v2-agent: V1 pending-operation tools are retired from the
 * model surface (they fail under the production v2Only composition).
 * debt-undo-confirmation-protocol: `undo_last_action` is retired as well —
 * undo is a separate DO-persisted proposal + authenticated RPC service, and
 * no model tool may execute it (see
 * tests/mutations/undo-confirmation-protocol.test.ts).
 */
const V1_RETIRED = [
  'get_pending_operation',
  'confirm_pending_operation',
  'cancel_pending_operation',
  'undo_last_action',
] as const;

const baseCtx = {
  delegatedToken: 'delegated-test-token',
  apiOrigin: 'https://api.example.test',
  workspaceId: 'ws-1',
  actorId: 'actor-1',
  intentionId: 'intent-1',
  lastUserMessage: 'tenho uma aprovação pendente?',
};

describe('pending V1 retirement (debt-pending-v1-v2-agent)', () => {
  it('removes V1 pending tools from the model tool catalog', () => {
    for (const name of V1_RETIRED) {
      expect(TOOL_DESCRIPTIONS[name], name).toBeUndefined();
    }
    const catalog = toolSkillLines().join('\n');
    for (const name of V1_RETIRED) {
      expect(catalog, name).not.toContain(name);
    }
  });

  it('keeps no skill referencing V1 pending tools', () => {
    expect(compromissosSkill.tools).not.toEqual(
      expect.arrayContaining([...V1_RETIRED]),
    );
    for (const skill of ALL_SKILLS) {
      for (const name of V1_RETIRED) {
        expect(skill.tools, `${skill.name}:${name}`).not.toContain(name);
      }
    }
  });

  it('never selects V1 pending tools for a turn', () => {
    const names = selectToolsFor(['compromissos']);
    for (const retired of V1_RETIRED) {
      expect(names, retired).not.toContain(retired);
    }
  });

  it('drops V1 pending tools even when explicitly requested', () => {
    const exposed = buildExposedTools([...V1_RETIRED], baseCtx);
    for (const retired of V1_RETIRED) {
      expect(exposed[retired], retired).toBeUndefined();
    }
  });

  it('retires undo from the model surface (separate proposal + RPC service)', () => {
    expect(TOOL_DESCRIPTIONS['undo_last_action']).toBeUndefined();
    expect(RETIRED_MODEL_TOOLS.has('undo_last_action')).toBe(true);
    expect(selectToolsFor(['registros'])).not.toContain('undo_last_action');
    const exposed = buildExposedTools(['undo_last_action'], baseCtx);
    expect(exposed['undo_last_action']).toBeUndefined();
    for (const skill of ALL_SKILLS) {
      expect(skill.tools, skill.name).not.toContain('undo_last_action');
    }
  });
});
